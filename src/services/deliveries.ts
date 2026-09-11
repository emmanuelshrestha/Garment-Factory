/**
 * Deliveries: the moment finished garments leave the factory.
 *
 * This is the only place in the sales flow that writes `delivery_out` stock
 * movements, and it writes them exactly once per delivery line — enforced by
 * `delivery_lines.movement_id UNIQUE`, not merely by this code being careful.
 *
 * The two-step shape is deliberate. A draft delivery is a packing list: it
 * reserves nothing further, moves no stock, and can be corrected or thrown
 * away. Dispatching it is the physical event, and only then does the ledger
 * change. A delivery is re-checked against live stock at dispatch, because the
 * shelf can change between writing the list and loading the van.
 *
 * What happens to the reservation (D021): the delivered line's active
 * reservations are marked `consumed` — never deleted — and the order's
 * remaining outstanding quantity is re-reserved by `allocateOrder`. Consuming
 * the whole reservation and re-reserving the remainder keeps one code path for
 * reservation arithmetic instead of a second, subtly different one that splits
 * allocation rows.
 */

import type { Tx } from '../db/sqlite.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.ts';
import { assertDate, documentYear, nowTimestamp, today } from '../domain/dates.ts';
import {
  planDelivery,
  totalDeliveredQty,
  type DeliveryLinePlan,
  type DeliveryLineRequest,
} from '../domain/deliveries.ts';
import { fulfilmentStatus, assertOrderTransition, type OrderStatus } from '../domain/orders.ts';
import { assertPositiveQty } from '../domain/money.ts';
import { nextDocumentNumber } from './documentNumbers.ts';
import { allocateOrder, getOrder, type AllocationResult, type Order } from './orders.ts';
import { getAllocatedQty, getStockOnHand, recordStockMovement } from './stock.ts';
import { recordAudit } from './audit.ts';

export const DELIVERY_STATUSES = ['draft', 'dispatched', 'cancelled'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export type DeliveryLine = {
  id: number;
  orderLineId: number;
  variantId: number;
  sku: string;
  productName: string;
  colour: string;
  size: string;
  qty: number;
  /** The stock movement this line caused. NULL until dispatch. */
  movementId: number | null;
  /** What the order line still expects, counting every dispatched delivery. */
  qtyOrdered: number;
  qtyDeliveredOnOrderLine: number;
};

export type Delivery = {
  id: number;
  deliveryNo: string;
  orderId: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  deliveredAt: string;
  status: DeliveryStatus;
  notes: string | null;
  lines: DeliveryLine[];
  totalQty: number;
};

export type DeliveryLineInput = {
  orderLineId: number;
  qty: number;
};

export type CreateDeliveryInput = {
  orderId: number;
  /** Business date the goods go out, 'YYYY-MM-DD'. Defaults to today. */
  deliveredAt?: string;
  notes?: string | null;
  lines: DeliveryLineInput[];
  userId: number;
};

export type DispatchResult = {
  delivery: Delivery;
  order: Order;
  /** Present when the remainder was re-reserved, i.e. a partial delivery. */
  allocation: AllocationResult | null;
};

/* -------------------------------------------------------------- creation */

/**
 * Write a draft delivery — a packing list, checked against the order and
 * against stock, that has not yet moved anything.
 *
 * The delivery number is allocated here, inside the caller's transaction, so a
 * failed delivery gives its number back (D017).
 */
export function createDelivery(tx: Tx, input: CreateDeliveryInput): Delivery {
  const order = getOrder(tx, input.orderId);
  assertOrderIsDeliverable(order);

  const deliveredAt = assertDate(input.deliveredAt ?? today(), 'deliveredAt');
  const plans = planFromOrder(tx, order, input.lines);

  const deliveryNo = nextDocumentNumber(tx, 'DEL', documentYear(deliveredAt));
  const info = tx.db
    .prepare(
      `INSERT INTO deliveries
         (delivery_no, order_id, customer_id, delivered_at, status, notes, created_at, created_by)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
    .run(
      deliveryNo,
      order.id,
      order.customerId,
      deliveredAt,
      normaliseNotes(input.notes),
      nowTimestamp(),
      input.userId,
    );

  const deliveryId = Number(info.lastInsertRowid);
  const insertLine = tx.db.prepare(
    `INSERT INTO delivery_lines (delivery_id, order_line_id, variant_id, qty)
     VALUES (?, ?, ?, ?)`,
  );
  for (const plan of plans) {
    insertLine.run(deliveryId, plan.orderLineId, plan.variantId, plan.qty);
  }

  const delivery = getDelivery(tx, deliveryId);
  recordAudit(tx, {
    action: 'delivery_created',
    entityType: 'delivery',
    entityId: deliveryId,
    detail: { to: 'draft', deliveryNo, orderNo: order.orderNo, totalQty: delivery.totalQty },
    userId: input.userId,
  });

  return delivery;
}

/* ------------------------------------------------------------- dispatch */

/**
 * Send a draft delivery out: append one `delivery_out` movement per line,
 * consume the reservations it used, and move the order on.
 *
 * Everything is re-planned from live figures first. A draft written yesterday
 * may no longer be possible, and shipping against stale numbers is how a
 * ledger stops describing the shelf.
 */
export function dispatchDelivery(tx: Tx, deliveryId: number, userId: number): DispatchResult {
  const header = requireHeader(tx, deliveryId);
  if (header.status !== 'draft') {
    throw new BusinessRuleError(
      'delivery_not_dispatchable',
      `only a draft delivery can be dispatched; this one is ${header.status}`,
      { deliveryId, status: header.status },
    );
  }

  const order = getOrder(tx, Number(header.order_id));
  assertOrderIsDeliverable(order);

  const lineRows = readLineRows(tx, deliveryId);
  const plans = planFromOrder(
    tx,
    order,
    lineRows.map((row) => ({ orderLineId: Number(row.order_line_id), qty: Number(row.qty) })),
  );

  const setMovement = tx.db.prepare('UPDATE delivery_lines SET movement_id = ? WHERE id = ?');
  for (const plan of plans) {
    const movementId = recordStockMovement(tx, {
      variantId: plan.variantId,
      qty: plan.qty,
      movementType: 'delivery_out',
      refId: deliveryId,
      occurredAt: header.delivered_at,
      reason: `delivery ${header.delivery_no} for order ${order.orderNo}`,
      userId,
    });
    const row = lineRows.find((candidate) => Number(candidate.order_line_id) === plan.orderLineId);
    if (row === undefined) {
      // planFromOrder derives its plans from lineRows, so this cannot happen;
      // failing loudly beats writing a movement no delivery line points at.
      throw new Error(`delivery line for order line ${plan.orderLineId} vanished mid-dispatch`);
    }
    setMovement.run(movementId, Number(row.id));
  }

  consumeAllocations(tx, plans);

  // The delivered quantities are derived from dispatched deliveries, so the
  // delivery has to be dispatched before the order status is recomputed.
  tx.db.prepare("UPDATE deliveries SET status = 'dispatched' WHERE id = ?").run(deliveryId);

  const delivered = getOrder(tx, order.id);
  const nextStatus = fulfilmentStatus(delivered.lines);
  assertOrderTransition(order.status, nextStatus);
  tx.db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(nextStatus, order.id);

  // Re-reserve what is still outstanding. Only a part-delivered order has
  // anything left to reserve, and allocateOrder refuses a delivered one.
  const allocation = nextStatus === 'partially_delivered' ? allocateOrder(tx, order.id, userId) : null;

  const resultDelivery = getDelivery(tx, deliveryId);
  recordAudit(tx, {
    action: 'delivery_dispatched',
    entityType: 'delivery',
    entityId: deliveryId,
    detail: { from: 'draft', to: 'dispatched', deliveryNo: header.delivery_no, orderNo: order.orderNo, totalQty: resultDelivery.totalQty },
    userId,
  });

  return {
    delivery: resultDelivery,
    order: getOrder(tx, order.id),
    allocation,
  };
}

/** Create a draft and dispatch it in one step, for the common case. */
export function deliverNow(tx: Tx, input: CreateDeliveryInput): DispatchResult {
  const delivery = createDelivery(tx, input);
  return dispatchDelivery(tx, delivery.id, input.userId);
}

/* ------------------------------------------------------- cancel a draft */

/**
 * Cancel a draft delivery.
 *
 * A dispatched delivery is refused: the goods are with the customer, and
 * bringing them back is a goods return with its own stock movement and its own
 * effect on the invoice. That is a separate business decision (OPEN-7), and
 * quietly reversing the ledger here would be inventing it.
 */
export function cancelDelivery(tx: Tx, deliveryId: number, reason: string, userId: number): Delivery {
  const header = requireHeader(tx, deliveryId);
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  if (trimmed.length === 0) {
    throw new ValidationError('cancelling a delivery requires a reason', 'reason');
  }

  if (header.status === 'dispatched') {
    throw new BusinessRuleError(
      'dispatched_delivery_cannot_be_cancelled',
      `delivery ${header.delivery_no} has already gone out; record a goods return instead ` +
        'of cancelling it, so the stock that comes back is accounted for',
      { deliveryId, status: header.status },
    );
  }
  if (header.status === 'cancelled') {
    throw new BusinessRuleError(
      'delivery_already_cancelled',
      `delivery ${header.delivery_no} is already cancelled`,
      { deliveryId },
    );
  }

  const stamped = `cancelled ${today()} by user ${userId}: ${trimmed}`;
  tx.db
    .prepare(
      `UPDATE deliveries
          SET status = 'cancelled',
              notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || char(10) || ? END
        WHERE id = ?`,
    )
    .run(stamped, stamped, deliveryId);

  recordAudit(tx, {
    action: 'delivery_cancelled',
    entityType: 'delivery',
    entityId: deliveryId,
    detail: { from: header.status, to: 'cancelled', deliveryNo: header.delivery_no, reason: trimmed },
    userId,
  });

  return getDelivery(tx, deliveryId);
}

/* ---------------------------------------------------------------- reads */

export function getDelivery(tx: Tx, deliveryId: number): Delivery {
  const header = requireHeader(tx, deliveryId);
  const rows = readLineRows(tx, deliveryId);
  const lines: DeliveryLine[] = rows.map((row) => ({
    id: Number(row.id),
    orderLineId: Number(row.order_line_id),
    variantId: Number(row.variant_id),
    sku: row.sku,
    productName: row.product_name,
    colour: row.colour,
    size: row.size,
    qty: Number(row.qty),
    movementId: row.movement_id === null ? null : Number(row.movement_id),
    qtyOrdered: Number(row.qty_ordered),
    qtyDeliveredOnOrderLine: Number(row.qty_delivered),
  }));

  return {
    id: header.id,
    deliveryNo: header.delivery_no,
    orderId: Number(header.order_id),
    orderNo: header.order_no,
    customerId: Number(header.customer_id),
    customerName: header.customer_name,
    deliveredAt: header.delivered_at,
    status: header.status,
    notes: header.notes,
    lines,
    totalQty: lines.reduce((sum, line) => sum + line.qty, 0),
  };
}

export type ListDeliveriesFilter = {
  orderId?: number;
  customerId?: number;
  status?: DeliveryStatus;
  limit?: number;
};

export type DeliverySummary = {
  id: number;
  deliveryNo: string;
  orderId: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  deliveredAt: string;
  status: DeliveryStatus;
  lineCount: number;
  totalQty: number;
};

export function listDeliveries(tx: Tx, filter: ListDeliveriesFilter = {}): DeliverySummary[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.orderId !== undefined) {
    clauses.push('d.order_id = ?');
    params.push(filter.orderId);
  }
  if (filter.customerId !== undefined) {
    clauses.push('d.customer_id = ?');
    params.push(filter.customerId);
  }
  if (filter.status !== undefined) {
    clauses.push('d.status = ?');
    params.push(assertDeliveryStatus(filter.status));
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = filter.limit === undefined ? 200 : assertPositiveQty(filter.limit, 'limit');
  params.push(limit);

  const rows = tx.db
    .prepare(
      `SELECT d.id, d.delivery_no, d.order_id, o.order_no, d.customer_id, cu.name AS customer_name,
              d.delivered_at, d.status,
              (SELECT COUNT(*) FROM delivery_lines dl WHERE dl.delivery_id = d.id) AS line_count,
              COALESCE((SELECT SUM(dl.qty) FROM delivery_lines dl WHERE dl.delivery_id = d.id), 0) AS total_qty
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN customers cu ON cu.id = d.customer_id
         ${where}
        ORDER BY d.id DESC
        LIMIT ?`,
    )
    .all(...(params as never[])) as DeliveryRowSummary[];

  return rows.map((row) => ({
    id: Number(row.id),
    deliveryNo: row.delivery_no,
    orderId: Number(row.order_id),
    orderNo: row.order_no,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    deliveredAt: row.delivered_at,
    status: row.status,
    lineCount: Number(row.line_count),
    totalQty: Number(row.total_qty),
  }));
}

/* -------------------------------------------------------------- internals */

/**
 * Turn requested quantities into a checked plan using live order and stock
 * figures. Called at draft time and again at dispatch, so a delivery is
 * validated against the shelf as it is, not as it was.
 */
function planFromOrder(
  tx: Tx,
  order: Order,
  requested: readonly DeliveryLineInput[],
): DeliveryLinePlan[] {
  if (!Array.isArray(requested) || requested.length === 0) {
    throw new ValidationError('a delivery needs at least one line', 'lines');
  }

  const requests: DeliveryLineRequest[] = requested.map((input, index) => {
    const orderLineId = Number(input.orderLineId);
    const orderLine = order.lines.find((line) => line.id === orderLineId);
    if (orderLine === undefined) {
      throw new ValidationError(
        `order line ${input.orderLineId} is not part of order ${order.orderNo}`,
        `lines[${index}].orderLineId`,
      );
    }
    return {
      orderLineId,
      variantId: orderLine.variantId,
      qty: input.qty,
      qtyOrdered: orderLine.qtyOrdered,
      qtyDelivered: orderLine.qtyDelivered,
      qtyAllocatedForLine: orderLine.qtyAllocated,
      onHand: getStockOnHand(tx, orderLine.variantId),
      totalAllocatedForVariant: getAllocatedQty(tx, orderLine.variantId),
    };
  });

  const plans = planDelivery(requests);
  if (totalDeliveredQty(plans) === 0) {
    // planDelivery already refuses a zero quantity per line; this guards the
    // whole document against being an empty gesture.
    throw new ValidationError('a delivery must send at least one garment', 'lines');
  }
  return plans;
}

function assertOrderIsDeliverable(order: Order): void {
  if (order.status !== 'confirmed' && order.status !== 'partially_delivered') {
    throw new BusinessRuleError(
      'order_not_deliverable',
      `only a confirmed or part-delivered order can be delivered; ${order.orderNo} is ${order.status}`,
      { orderId: order.id, status: order.status },
    );
  }
}

/**
 * Mark the delivered lines' active reservations `consumed`.
 *
 * The rows are never deleted: why stock stopped being reserved is part of the
 * audit trail. `released_at` records when the reservation ended, whichever way
 * it ended.
 */
function consumeAllocations(tx: Tx, plans: readonly DeliveryLinePlan[]): void {
  if (plans.length === 0) {
    return;
  }
  const ids = plans.map((plan) => plan.orderLineId);
  const placeholders = ids.map(() => '?').join(', ');
  tx.db
    .prepare(
      `UPDATE stock_allocations
          SET status = 'consumed', released_at = ?
        WHERE status = 'active' AND order_line_id IN (${placeholders})`,
    )
    .run(nowTimestamp(), ...(ids as never[]));
}

function normaliseNotes(notes: string | null | undefined): string | null {
  if (typeof notes !== 'string') {
    return null;
  }
  const trimmed = notes.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === 'string' && (DELIVERY_STATUSES as readonly string[]).includes(value);
}

export function assertDeliveryStatus(value: unknown, field = 'status'): DeliveryStatus {
  if (!isDeliveryStatus(value)) {
    throw new ValidationError(
      `status must be one of ${DELIVERY_STATUSES.join(', ')}, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

type DeliveryHeaderRow = {
  id: number;
  delivery_no: string;
  order_id: number;
  order_no: string;
  customer_id: number;
  customer_name: string;
  delivered_at: string;
  status: DeliveryStatus;
  notes: string | null;
};

type DeliveryRowSummary = {
  id: number;
  delivery_no: string;
  order_id: number;
  order_no: string;
  customer_id: number;
  customer_name: string;
  delivered_at: string;
  status: DeliveryStatus;
  line_count: number;
  total_qty: number;
};

type DeliveryLineRow = {
  id: number;
  order_line_id: number;
  variant_id: number;
  sku: string;
  product_name: string;
  colour: string;
  size: string;
  qty: number;
  movement_id: number | null;
  qty_ordered: number;
  qty_delivered: number;
};

function requireHeader(tx: Tx, deliveryId: number): DeliveryHeaderRow {
  const row = tx.db
    .prepare(
      `SELECT d.id, d.delivery_no, d.order_id, o.order_no, d.customer_id, cu.name AS customer_name,
              d.delivered_at, d.status, d.notes
         FROM deliveries d
         JOIN orders o ON o.id = d.order_id
         JOIN customers cu ON cu.id = d.customer_id
        WHERE d.id = ?`,
    )
    .get(deliveryId) as DeliveryHeaderRow | undefined;
  if (row === undefined) {
    throw new NotFoundError('delivery', deliveryId);
  }
  return row;
}

function readLineRows(tx: Tx, deliveryId: number): DeliveryLineRow[] {
  return tx.db
    .prepare(
      `SELECT dl.id, dl.order_line_id, dl.variant_id, v.sku, p.name AS product_name,
              c.name AS colour, s.name AS size, dl.qty, dl.movement_id, l.qty_ordered,
              COALESCE((SELECT SUM(x.qty) FROM delivery_lines x
                          JOIN deliveries d2 ON d2.id = x.delivery_id
                         WHERE x.order_line_id = dl.order_line_id AND d2.status = 'dispatched'), 0)
                AS qty_delivered
         FROM delivery_lines dl
         JOIN order_lines l ON l.id = dl.order_line_id
         JOIN product_variants v ON v.id = dl.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN colours c ON c.id = v.colour_id
         JOIN sizes s ON s.id = v.size_id
        WHERE dl.delivery_id = ?
        ORDER BY dl.id`,
    )
    .all(deliveryId) as DeliveryLineRow[];
}

/** Re-exported so callers do not need two imports to read a status. */
export type { OrderStatus };

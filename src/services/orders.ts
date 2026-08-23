/**
 * Orders.
 *
 * An order is a promise to the customer, not a sale (business rule 7). It
 * reserves finished stock and reveals what has to be produced; nothing is
 * sold, moved or invoiced here.
 *
 * Two rules do most of the work in this file:
 *
 *   - a line's unit price is snapshotted when the line is written and frozen
 *     when the order is confirmed, so a price change tomorrow cannot reach
 *     back into it (D005, D009);
 *   - confirming reserves free stock but writes no stock movement (D004).
 */

import type { Tx } from '../db/sqlite.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.ts';
import { assertCurrency, assertNonNegativeMinor, assertPositiveQty, lineTotalMinor, type Currency } from '../domain/money.ts';
import { rateForNewDocument } from '../domain/fx.ts';
import { assertDate, documentYear, nowTimestamp, today } from '../domain/dates.ts';
import {
  assertOrderStatus,
  assertOrderTransition,
  isEditableStatus,
  orderTotalMinor,
  planAllocations,
  totalShortage,
  type AllocationPlan,
  type OrderStatus,
} from '../domain/orders.ts';
import { nextDocumentNumber } from './documentNumbers.ts';
import { getVariant, resolveVariantPrice } from './catalogue.ts';
import { getCustomer } from './customers.ts';
import { getAvailableQty } from './stock.ts';

export type OrderLine = {
  id: number;
  variantId: number;
  sku: string;
  productName: string;
  colour: string;
  size: string;
  qtyOrdered: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  qtyAllocated: number;
  qtyDelivered: number;
  /** Ordered minus allocated minus delivered: what production has to cover. */
  shortageQty: number;
  note: string | null;
};

export type Order = {
  id: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  orderDate: string;
  requiredDate: string | null;
  currency: Currency;
  fxRateToNpr: number;
  status: OrderStatus;
  notes: string | null;
  lines: OrderLine[];
  totalMinor: number;
  totalShortageQty: number;
};

export type OrderLineInput = {
  variantId: number;
  qtyOrdered: number;
  /**
   * Override the catalogue price for this order only (business rule 14).
   * Omit to snapshot the resolved catalogue price (D009).
   */
  unitPriceMinor?: number;
  note?: string | null;
};

export type CreateOrderInput = {
  customerId: number;
  orderDate?: string;
  requiredDate?: string | null;
  currency?: Currency;
  /** Required for a non-NPR order; NPR is pinned to 1.0 (D011). */
  fxRateToNpr?: number;
  notes?: string | null;
  lines: OrderLineInput[];
  userId: number;
};

/**
 * Create a draft order.
 *
 * The order number is allocated here, inside the caller's transaction, so a
 * rolled-back draft does not burn a number (D017). A cancelled order keeps its
 * number: a visible gap is an audit trail, a silently reused number is not.
 */
export function createOrder(tx: Tx, input: CreateOrderInput): number {
  const customer = getCustomer(tx, input.customerId);
  const orderDate = assertDate(input.orderDate ?? today(), 'orderDate');
  const requiredDate =
    input.requiredDate === null || input.requiredDate === undefined
      ? null
      : assertDate(input.requiredDate, 'requiredDate');
  if (requiredDate !== null && requiredDate < orderDate) {
    throw new ValidationError(
      `required date ${requiredDate} is before the order date ${orderDate}`,
      'requiredDate',
    );
  }
  const currency = assertCurrency(input.currency ?? customer.defaultCurrency);
  const fxRateToNpr = rateForNewDocument(currency, input.fxRateToNpr);

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new ValidationError('an order needs at least one line', 'lines');
  }

  const orderNo = nextDocumentNumber(tx, 'ORD', documentYear(orderDate));
  const orderId = Number(
    tx.db
      .prepare(
        `INSERT INTO orders
           (order_no, customer_id, order_date, required_date, currency, fx_rate_to_npr, status, notes, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      )
      .run(
        orderNo,
        customer.id,
        orderDate,
        requiredDate,
        currency,
        fxRateToNpr,
        input.notes ?? null,
        nowTimestamp(),
        input.userId,
      ).lastInsertRowid,
  );

  for (const line of input.lines) {
    addOrderLine(tx, orderId, line);
  }

  return orderId;
}

/**
 * Add a line to a draft order, snapshotting the price.
 *
 * The order's currency wins: a line cannot be priced in a currency the order
 * does not carry, because the two would silently add up.
 */
export function addOrderLine(tx: Tx, orderId: number, line: OrderLineInput): number {
  const header = requireEditableHeader(tx, orderId);
  const variant = getVariant(tx, line.variantId);
  const qtyOrdered = assertPositiveQty(line.qtyOrdered, 'qtyOrdered');

  if (!variant.isActive) {
    throw new BusinessRuleError(
      'variant_not_active',
      `${variant.sku} is no longer sold; reactivate it or choose another variant`,
      { variantId: variant.id, sku: variant.sku },
    );
  }

  const unitPriceMinor =
    line.unitPriceMinor === undefined
      ? priceForOrder(tx, variant.id, header.currency)
      : assertNonNegativeMinor(line.unitPriceMinor, 'unitPriceMinor');

  const existing = tx.db
    .prepare('SELECT id FROM order_lines WHERE order_id = ? AND variant_id = ?')
    .get(orderId, variant.id) as { id: number } | undefined;
  if (existing) {
    throw new ValidationError(
      `${variant.sku} is already on this order; change the quantity on the existing line instead`,
      'variantId',
    );
  }

  return Number(
    tx.db
      .prepare(
        `INSERT INTO order_lines (order_id, variant_id, qty_ordered, unit_price_minor, note)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(orderId, variant.id, qtyOrdered, unitPriceMinor, line.note ?? null).lastInsertRowid,
  );
}

export function updateOrderLine(
  tx: Tx,
  orderId: number,
  orderLineId: number,
  changes: { qtyOrdered?: number; unitPriceMinor?: number; note?: string | null },
): void {
  requireEditableHeader(tx, orderId);
  const line = tx.db
    .prepare('SELECT id, qty_ordered, unit_price_minor, note FROM order_lines WHERE id = ? AND order_id = ?')
    .get(orderLineId, orderId) as
    | { id: number; qty_ordered: number; unit_price_minor: number; note: string | null }
    | undefined;
  if (!line) {
    throw new NotFoundError('order line', orderLineId);
  }

  const qtyOrdered =
    changes.qtyOrdered === undefined
      ? Number(line.qty_ordered)
      : assertPositiveQty(changes.qtyOrdered, 'qtyOrdered');
  const unitPriceMinor =
    changes.unitPriceMinor === undefined
      ? Number(line.unit_price_minor)
      : assertNonNegativeMinor(changes.unitPriceMinor, 'unitPriceMinor');

  tx.db
    .prepare('UPDATE order_lines SET qty_ordered = ?, unit_price_minor = ?, note = ? WHERE id = ?')
    .run(qtyOrdered, unitPriceMinor, changes.note === undefined ? line.note : changes.note, orderLineId);
}

/**
 * Remove a line from a draft order.
 *
 * Only a draft can lose a line, and a draft has no allocations, deliveries or
 * invoices pointing at it — so nothing is orphaned. The last line cannot be
 * removed; delete or cancel the order instead.
 */
export function removeOrderLine(tx: Tx, orderId: number, orderLineId: number): void {
  requireEditableHeader(tx, orderId);
  const count = tx.db.prepare('SELECT COUNT(*) AS n FROM order_lines WHERE order_id = ?').get(orderId) as {
    n: number;
  };
  if (Number(count.n) <= 1) {
    throw new BusinessRuleError(
      'order_needs_a_line',
      'an order must keep at least one line; cancel the order instead',
      { orderId },
    );
  }
  const info = tx.db.prepare('DELETE FROM order_lines WHERE id = ? AND order_id = ?').run(orderLineId, orderId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('order line', orderLineId);
  }
}

/* ---------------------------------------------------------- confirmation */

export type AllocationResult = {
  orderId: number;
  status: OrderStatus;
  plans: AllocationPlan[];
  /** Pieces the factory has to produce or wait for. Zero means fully covered. */
  totalShortageQty: number;
};

/**
 * Confirm a draft: freeze the prices and reserve what is on the shelf.
 *
 * Writes no stock movement (D004). A shortage is reported, not an error — the
 * owner decides whether to produce (business rule 19).
 */
export function confirmOrder(tx: Tx, orderId: number, userId: number): AllocationResult {
  const header = requireHeader(tx, orderId);
  assertOrderTransition(header.status, 'confirmed');
  if (getLineCount(tx, orderId) === 0) {
    throw new BusinessRuleError('order_needs_a_line', 'an order cannot be confirmed with no lines', {
      orderId,
    });
  }

  tx.db.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ?").run(orderId);
  return allocateOrder(tx, orderId, userId);
}

/**
 * Reserve free stock against an order's outstanding lines.
 *
 * Called by `confirmOrder`, and safe to call again later: once production or a
 * stock adjustment has put pieces on the shelf, running it again tops up the
 * lines that were short. Re-running when nothing has changed reserves nothing.
 */
export function allocateOrder(tx: Tx, orderId: number, userId: number): AllocationResult {
  const header = requireHeader(tx, orderId);
  if (header.status !== 'confirmed' && header.status !== 'partially_delivered') {
    throw new BusinessRuleError(
      'order_not_allocatable',
      `only a confirmed or part-delivered order can reserve stock; this one is ${header.status}`,
      { orderId, status: header.status },
    );
  }

  const lines = readLineRows(tx, orderId);
  // Availability is read for every line before anything is reserved. Two lines
  // of one order can never share a variant (order_lines is UNIQUE on
  // order_id + variant_id), so no line can spend stock another line just took.
  const plans = planAllocations(
    lines.map((line) => ({
      orderLineId: line.id,
      variantId: line.variant_id,
      qtyOrdered: Number(line.qty_ordered),
      qtyAllocated: Number(line.qty_allocated),
      qtyDelivered: Number(line.qty_delivered),
      qtyAvailable: getAvailableQty(tx, line.variant_id),
    })),
  );

  const now = nowTimestamp();
  const insert = tx.db.prepare(
    `INSERT INTO stock_allocations (order_line_id, variant_id, qty, status, created_at, created_by)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  );
  for (const plan of plans) {
    if (plan.allocateQty > 0) {
      insert.run(plan.orderLineId, plan.variantId, plan.allocateQty, now, userId);
    }
  }

  return {
    orderId,
    status: header.status,
    plans,
    totalShortageQty: totalShortage(plans),
  };
}

/**
 * Release every active reservation on an order.
 *
 * The rows are marked `released`, never deleted: why stock stopped being
 * reserved is part of the audit trail. Returns the number of pieces freed.
 */
export function releaseOrderAllocations(tx: Tx, orderId: number): number {
  const freed = tx.db
    .prepare(
      `SELECT COALESCE(SUM(a.qty), 0) AS qty
         FROM stock_allocations a
         JOIN order_lines l ON l.id = a.order_line_id
        WHERE l.order_id = ? AND a.status = 'active'`,
    )
    .get(orderId) as { qty: number };

  tx.db
    .prepare(
      `UPDATE stock_allocations SET status = 'released', released_at = ?
        WHERE status = 'active'
          AND order_line_id IN (SELECT id FROM order_lines WHERE order_id = ?)`,
    )
    .run(nowTimestamp(), orderId);

  return Number(freed.qty);
}

/**
 * Cancel an order and free its reservations.
 *
 * A part-delivered order is refused: goods have already left the factory and
 * the accounting treatment of that is the owner's decision, not this
 * function's guess.
 */
export function cancelOrder(tx: Tx, orderId: number, reason: string): void {
  const header = requireHeader(tx, orderId);
  assertOrderTransition(header.status, 'cancelled');
  const note = String(reason ?? '').trim();
  if (note.length === 0) {
    throw new ValidationError('cancelling an order needs a reason', 'reason');
  }

  releaseOrderAllocations(tx, orderId);
  tx.db
    .prepare(
      `UPDATE orders SET status = 'cancelled',
              notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || char(10) || ? END
        WHERE id = ?`,
    )
    .run(`Cancelled: ${note}`, `Cancelled: ${note}`, orderId);
}

/** Mark a fully delivered order as closed: nothing further will happen on it. */
export function closeOrder(tx: Tx, orderId: number): void {
  const header = requireHeader(tx, orderId);
  assertOrderTransition(header.status, 'closed');
  tx.db.prepare("UPDATE orders SET status = 'closed' WHERE id = ?").run(orderId);
}

/* -------------------------------------------------------------- querying */

export function getOrder(tx: Tx, orderId: number): Order {
  const header = requireHeader(tx, orderId);
  const rows = readLineRows(tx, orderId);
  const lines: OrderLine[] = rows.map((row) => {
    const qtyOrdered = Number(row.qty_ordered);
    const qtyAllocated = Number(row.qty_allocated);
    const qtyDelivered = Number(row.qty_delivered);
    return {
      id: Number(row.id),
      variantId: Number(row.variant_id),
      sku: row.sku,
      productName: row.product_name,
      colour: row.colour,
      size: row.size,
      qtyOrdered,
      unitPriceMinor: Number(row.unit_price_minor),
      lineTotalMinor: lineTotalMinor(Number(row.unit_price_minor), qtyOrdered),
      qtyAllocated,
      qtyDelivered,
      shortageQty: Math.max(0, qtyOrdered - qtyAllocated - qtyDelivered),
      note: row.note,
    };
  });

  return {
    id: header.id,
    orderNo: header.order_no,
    customerId: Number(header.customer_id),
    customerName: header.customer_name,
    orderDate: header.order_date,
    requiredDate: header.required_date,
    currency: assertCurrency(header.currency),
    fxRateToNpr: Number(header.fx_rate_to_npr),
    status: header.status,
    notes: header.notes,
    lines,
    totalMinor: orderTotalMinor(
      lines.map((line) => ({ unitPriceMinor: line.unitPriceMinor, qtyOrdered: line.qtyOrdered })),
    ),
    totalShortageQty: lines.reduce((sum, line) => sum + line.shortageQty, 0),
  };
}

export type OrderSummary = {
  id: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  orderDate: string;
  requiredDate: string | null;
  currency: Currency;
  status: OrderStatus;
  totalMinor: number;
  totalShortageQty: number;
};

export function listOrders(
  tx: Tx,
  filter: { customerId?: number; status?: OrderStatus; openOnly?: boolean; limit?: number } = {},
): OrderSummary[] {
  const where: string[] = [];
  const params: (number | string)[] = [];
  if (filter.customerId !== undefined) {
    where.push('o.customer_id = ?');
    params.push(filter.customerId);
  }
  if (filter.status !== undefined) {
    where.push('o.status = ?');
    params.push(assertOrderStatus(filter.status));
  }
  if (filter.openOnly) {
    where.push("o.status IN ('draft', 'confirmed', 'partially_delivered')");
  }
  const limit = filter.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError(`limit must be a positive whole number, got ${limit}`, 'limit');
  }

  const rows = tx.db
    .prepare(
      `SELECT o.id, o.order_no, o.customer_id, c.name AS customer_name, o.order_date,
              o.required_date, o.currency, o.status,
              COALESCE((SELECT SUM(l.qty_ordered * l.unit_price_minor)
                          FROM order_lines l WHERE l.order_id = o.id), 0) AS total_minor,
              COALESCE((SELECT SUM(MAX(0,
                          l.qty_ordered
                          - COALESCE((SELECT SUM(a.qty) FROM stock_allocations a
                                       WHERE a.order_line_id = l.id AND a.status = 'active'), 0)
                          - COALESCE((SELECT SUM(dl.qty) FROM delivery_lines dl
                                        JOIN deliveries d ON d.id = dl.delivery_id
                                       WHERE dl.order_line_id = l.id AND d.status = 'dispatched'), 0)))
                          FROM order_lines l WHERE l.order_id = o.id), 0) AS shortage_qty
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY o.order_date DESC, o.id DESC
        LIMIT ?`,
    )
    .all(...params, limit) as {
    id: number;
    order_no: string;
    customer_id: number;
    customer_name: string;
    order_date: string;
    required_date: string | null;
    currency: string;
    status: string;
    total_minor: number;
    shortage_qty: number;
  }[];

  return rows.map((row) => ({
    id: Number(row.id),
    orderNo: row.order_no,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    orderDate: row.order_date,
    requiredDate: row.required_date,
    currency: assertCurrency(row.currency),
    status: assertOrderStatus(row.status),
    // Every line is a whole number of pieces at an integer unit price, so the
    // SQL sum is exact; there is no per-line rounding to preserve here (D018).
    totalMinor: Number(row.total_minor),
    totalShortageQty: Number(row.shortage_qty),
  }));
}

/**
 * What has to be produced across all open orders, worst first.
 *
 * This is the input to the production decision in slice 2; it makes no
 * decision itself.
 */
export type Shortage = {
  variantId: number;
  sku: string;
  productName: string;
  colour: string;
  size: string;
  shortageQty: number;
  orderCount: number;
  earliestRequiredDate: string | null;
};

export function listShortages(tx: Tx): Shortage[] {
  const rows = tx.db
    .prepare(
      `SELECT v.id AS variant_id, v.sku, p.name AS product_name, c.name AS colour, s.name AS size,
              SUM(MAX(0,
                l.qty_ordered
                - COALESCE((SELECT SUM(a.qty) FROM stock_allocations a
                             WHERE a.order_line_id = l.id AND a.status = 'active'), 0)
                - COALESCE((SELECT SUM(dl.qty) FROM delivery_lines dl
                              JOIN deliveries d ON d.id = dl.delivery_id
                             WHERE dl.order_line_id = l.id AND d.status = 'dispatched'), 0)
              )) AS shortage_qty,
              COUNT(DISTINCT o.id) AS order_count,
              MIN(o.required_date) AS earliest_required_date
         FROM order_lines l
         JOIN orders o ON o.id = l.order_id
         JOIN product_variants v ON v.id = l.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN colours c ON c.id = v.colour_id
         JOIN sizes s ON s.id = v.size_id
        WHERE o.status IN ('confirmed', 'partially_delivered')
        GROUP BY v.id
       HAVING shortage_qty > 0
        ORDER BY shortage_qty DESC, v.sku`,
    )
    .all() as {
    variant_id: number;
    sku: string;
    product_name: string;
    colour: string;
    size: string;
    shortage_qty: number;
    order_count: number;
    earliest_required_date: string | null;
  }[];

  return rows.map((row) => ({
    variantId: Number(row.variant_id),
    sku: row.sku,
    productName: row.product_name,
    colour: row.colour,
    size: row.size,
    shortageQty: Number(row.shortage_qty),
    orderCount: Number(row.order_count),
    earliestRequiredDate: row.earliest_required_date,
  }));
}

/* --------------------------------------------------------------- helpers */

type OrderHeaderRow = {
  id: number;
  order_no: string;
  customer_id: number;
  customer_name: string;
  order_date: string;
  required_date: string | null;
  currency: string;
  fx_rate_to_npr: number;
  status: OrderStatus;
  notes: string | null;
};

function requireHeader(tx: Tx, orderId: number): OrderHeaderRow {
  const row = tx.db
    .prepare(
      `SELECT o.id, o.order_no, o.customer_id, c.name AS customer_name, o.order_date, o.required_date,
              o.currency, o.fx_rate_to_npr, o.status, o.notes
         FROM orders o JOIN customers c ON c.id = o.customer_id
        WHERE o.id = ?`,
    )
    .get(orderId) as OrderHeaderRow | undefined;
  if (!row) {
    throw new NotFoundError('order', orderId);
  }
  return { ...row, id: Number(row.id), status: assertOrderStatus(row.status) };
}

function requireEditableHeader(tx: Tx, orderId: number): { id: number; currency: Currency } {
  const header = requireHeader(tx, orderId);
  if (!isEditableStatus(header.status)) {
    throw new BusinessRuleError(
      'order_not_editable',
      `order ${header.order_no} is ${header.status}; its lines and prices are frozen`,
      { orderId, status: header.status },
    );
  }
  return { id: header.id, currency: assertCurrency(header.currency) };
}

function getLineCount(tx: Tx, orderId: number): number {
  const row = tx.db.prepare('SELECT COUNT(*) AS n FROM order_lines WHERE order_id = ?').get(orderId) as {
    n: number;
  };
  return Number(row.n);
}

/**
 * The catalogue price for a variant, refusing a currency mismatch.
 *
 * A foreign-currency order is priced in its own currency (D011); the system
 * never converts an NPR price into one, because a converted figure is not the
 * price the customer agreed.
 */
function priceForOrder(tx: Tx, variantId: number, orderCurrency: Currency): number {
  const price = resolveVariantPrice(tx, variantId);
  if (price.currency !== orderCurrency) {
    throw new BusinessRuleError(
      'price_currency_mismatch',
      `this variant is priced in ${price.currency} but the order is in ${orderCurrency}; ` +
        `enter the ${orderCurrency} price on the line`,
      { variantId, priceCurrency: price.currency, orderCurrency },
    );
  }
  return price.priceMinor;
}

type OrderLineRow = {
  id: number;
  variant_id: number;
  sku: string;
  product_name: string;
  colour: string;
  size: string;
  qty_ordered: number;
  unit_price_minor: number;
  note: string | null;
  qty_allocated: number;
  qty_delivered: number;
};

/**
 * Order lines with their reserved and delivered quantities.
 *
 * Both figures are derived — from active allocations and from dispatched
 * delivery lines — so no counter can fall out of step with the records.
 */
function readLineRows(tx: Tx, orderId: number): OrderLineRow[] {
  return tx.db
    .prepare(
      `SELECT l.id, l.variant_id, v.sku, p.name AS product_name, c.name AS colour, s.name AS size,
              l.qty_ordered, l.unit_price_minor, l.note,
              COALESCE((SELECT SUM(a.qty) FROM stock_allocations a
                         WHERE a.order_line_id = l.id AND a.status = 'active'), 0) AS qty_allocated,
              COALESCE((SELECT SUM(dl.qty) FROM delivery_lines dl
                          JOIN deliveries d ON d.id = dl.delivery_id
                         WHERE dl.order_line_id = l.id AND d.status = 'dispatched'), 0) AS qty_delivered
         FROM order_lines l
         JOIN product_variants v ON v.id = l.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN colours c ON c.id = v.colour_id
         JOIN sizes s ON s.id = v.size_id
        WHERE l.order_id = ?
        ORDER BY l.id`,
    )
    .all(orderId) as OrderLineRow[];
}

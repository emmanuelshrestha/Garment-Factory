/**
 * Invoices: the moment delivered garments become money owed.
 *
 * An invoice bills *dispatched delivery lines*, never ordered quantities and
 * never stock. That is what makes partial delivery work: 200 of 500 jackets
 * have left, so 200 can be billed, and the other 300 cannot.
 *
 * Prices come from the order line's snapshot (D005). Today's price list is not
 * consulted, so raising a price next month cannot change what an old invoice
 * says — nor what a new invoice for an old order says.
 *
 * Immutability (D005): a draft can be voided and rebuilt, an issued invoice
 * cannot be touched at all. A correction is void-and-reissue, which works
 * because the database rule that stops the same delivered goods being billed
 * twice deliberately ignores voided invoices (D025, migration 002).
 *
 * Default shape (D023): one delivery, one invoice. `invoiceDelivery` is that
 * one-liner. Several deliveries can still go on one invoice by passing their
 * line ids, which is what D010 allows for.
 */

import type { Tx } from '../db/sqlite.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.ts';
import { assertDate, documentYear, nowTimestamp, today } from '../domain/dates.ts';
import { rateForNewDocument } from '../domain/fx.ts';
import {
  assertDueDate,
  assertInvoiceStatus,
  assertInvoiceTransition,
  buildInvoice,
  describeVariant,
  type InvoiceLineRequest,
  type InvoiceStatus,
} from '../domain/invoices.ts';
import { assertCurrency, type Currency } from '../domain/money.ts';
import { recordAudit } from './audit.ts';
import { nextDocumentNumber } from './documentNumbers.ts';

export { INVOICE_STATUSES, type InvoiceStatus } from '../domain/invoices.ts';

export type InvoiceLine = {
  id: number;
  deliveryLineId: number;
  deliveryId: number;
  deliveryNo: string;
  variantId: number;
  sku: string;
  description: string;
  qty: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type Invoice = {
  id: number;
  invoiceNo: string;
  customerId: number;
  customerName: string;
  /** Convenience only: the lines are the source of truth (D010). */
  orderId: number | null;
  orderNo: string | null;
  invoiceDate: string;
  dueDate: string | null;
  currency: Currency;
  fxRateToNpr: number;
  subtotalMinor: number;
  discountMinor: number;
  discountReason: string | null;
  totalMinor: number;
  status: InvoiceStatus;
  voidedAt: string | null;
  voidReason: string | null;
  lines: InvoiceLine[];
};

export type InvoiceSummary = {
  id: number;
  invoiceNo: string;
  customerId: number;
  customerName: string;
  orderId: number | null;
  orderNo: string | null;
  invoiceDate: string;
  dueDate: string | null;
  currency: Currency;
  totalMinor: number;
  status: InvoiceStatus;
  lineCount: number;
};

/** Delivered goods that no standing invoice covers yet. */
export type BillableLine = {
  deliveryLineId: number;
  deliveryId: number;
  deliveryNo: string;
  deliveredAt: string;
  orderId: number;
  orderNo: string;
  customerId: number;
  customerName: string;
  variantId: number;
  sku: string;
  description: string;
  qty: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: Currency;
};

export type CreateInvoiceInput = {
  /** Bill these delivered lines. Mutually exclusive with `deliveryId`. */
  deliveryLineIds?: readonly number[];
  /** Bill everything not yet billed on this dispatched delivery (D023). */
  deliveryId?: number;
  invoiceDate?: string;
  dueDate?: string | null;
  discountMinor?: number;
  discountReason?: string | null;
  fxRateToNpr?: number;
  userId: number;
};

/* ------------------------------------------------------------------ reading */

/**
 * What has been delivered and not yet billed.
 *
 * Dispatched deliveries only: a draft delivery has not left the factory, so
 * there is nothing to charge for. A line already on a standing invoice is
 * excluded, but a line whose only invoice was voided reappears here, ready to
 * be billed again.
 */
export function listBillableLines(
  tx: Tx,
  filter: { customerId?: number; deliveryId?: number; limit?: number } = {},
): BillableLine[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.customerId !== undefined) {
    clauses.push('d.customer_id = ?');
    params.push(filter.customerId);
  }
  if (filter.deliveryId !== undefined) {
    clauses.push('d.id = ?');
    params.push(filter.deliveryId);
  }
  const where = clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
  params.push(filter.limit ?? 500);

  const rows = tx.db
    .prepare(
      `SELECT dl.id AS delivery_line_id, d.id AS delivery_id, d.delivery_no, d.delivered_at,
              o.id AS order_id, o.order_no, o.currency,
              cu.id AS customer_id, cu.name AS customer_name,
              dl.variant_id, v.sku, p.name AS product_name, c.name AS colour, s.name AS size,
              dl.qty, ol.unit_price_minor
         FROM delivery_lines dl
         JOIN deliveries d ON d.id = dl.delivery_id
         JOIN orders o ON o.id = d.order_id
         JOIN customers cu ON cu.id = d.customer_id
         JOIN order_lines ol ON ol.id = dl.order_line_id
         JOIN product_variants v ON v.id = dl.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN colours c ON c.id = v.colour_id
         JOIN sizes s ON s.id = v.size_id
        WHERE d.status = 'dispatched'
          AND NOT EXISTS (
                SELECT 1 FROM invoice_lines il
                  JOIN invoices i ON i.id = il.invoice_id
                 WHERE il.delivery_line_id = dl.id AND i.status <> 'void'
              )
          ${where}
        ORDER BY d.delivered_at, d.id, dl.id
        LIMIT ?`,
    )
    .all(...(params as never[])) as BillableRow[];

  return rows.map(toBillableLine);
}

export function getInvoice(tx: Tx, invoiceId: number): Invoice {
  const header = tx.db
    .prepare(
      `SELECT i.id, i.invoice_no, i.customer_id, cu.name AS customer_name,
              i.order_id, o.order_no, i.invoice_date, i.due_date, i.currency, i.fx_rate_to_npr,
              i.subtotal_minor, i.discount_minor, i.discount_reason, i.total_minor,
              i.status, i.voided_at, i.void_reason
         FROM invoices i
         JOIN customers cu ON cu.id = i.customer_id
         LEFT JOIN orders o ON o.id = i.order_id
        WHERE i.id = ?`,
    )
    .get(invoiceId) as InvoiceHeaderRow | undefined;

  if (header === undefined) {
    throw new NotFoundError(`invoice ${invoiceId} does not exist`, 'invoice', invoiceId);
  }

  const lineRows = tx.db
    .prepare(
      `SELECT il.id, il.delivery_line_id, d.id AS delivery_id, d.delivery_no,
              il.variant_id, v.sku, il.description_snapshot, il.qty,
              il.unit_price_minor, il.line_total_minor
         FROM invoice_lines il
         JOIN delivery_lines dl ON dl.id = il.delivery_line_id
         JOIN deliveries d ON d.id = dl.delivery_id
         JOIN product_variants v ON v.id = il.variant_id
        WHERE il.invoice_id = ?
        ORDER BY il.id`,
    )
    .all(invoiceId) as InvoiceLineRow[];

  return {
    id: Number(header.id),
    invoiceNo: header.invoice_no,
    customerId: Number(header.customer_id),
    customerName: header.customer_name,
    orderId: header.order_id === null ? null : Number(header.order_id),
    orderNo: header.order_no,
    invoiceDate: header.invoice_date,
    dueDate: header.due_date,
    currency: assertCurrency(header.currency),
    fxRateToNpr: Number(header.fx_rate_to_npr),
    subtotalMinor: Number(header.subtotal_minor),
    discountMinor: Number(header.discount_minor),
    discountReason: header.discount_reason,
    totalMinor: Number(header.total_minor),
    status: assertInvoiceStatus(header.status),
    voidedAt: header.voided_at,
    voidReason: header.void_reason,
    lines: lineRows.map((row) => ({
      id: Number(row.id),
      deliveryLineId: Number(row.delivery_line_id),
      deliveryId: Number(row.delivery_id),
      deliveryNo: row.delivery_no,
      variantId: Number(row.variant_id),
      sku: row.sku,
      description: row.description_snapshot,
      qty: Number(row.qty),
      unitPriceMinor: Number(row.unit_price_minor),
      lineTotalMinor: Number(row.line_total_minor),
    })),
  };
}

export function listInvoices(
  tx: Tx,
  filter: { customerId?: number; orderId?: number; status?: InvoiceStatus; limit?: number } = {},
): InvoiceSummary[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.customerId !== undefined) {
    clauses.push('i.customer_id = ?');
    params.push(filter.customerId);
  }
  if (filter.orderId !== undefined) {
    clauses.push('i.order_id = ?');
    params.push(filter.orderId);
  }
  if (filter.status !== undefined) {
    clauses.push('i.status = ?');
    params.push(assertInvoiceStatus(filter.status));
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  const rows = tx.db
    .prepare(
      `SELECT i.id, i.invoice_no, i.customer_id, cu.name AS customer_name,
              i.order_id, o.order_no, i.invoice_date, i.due_date, i.currency,
              i.total_minor, i.status,
              (SELECT COUNT(*) FROM invoice_lines il WHERE il.invoice_id = i.id) AS line_count
         FROM invoices i
         JOIN customers cu ON cu.id = i.customer_id
         LEFT JOIN orders o ON o.id = i.order_id
         ${where}
        ORDER BY i.id DESC
        LIMIT ?`,
    )
    .all(...(params as never[])) as InvoiceSummaryRow[];

  return rows.map((row) => ({
    id: Number(row.id),
    invoiceNo: row.invoice_no,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    orderId: row.order_id === null ? null : Number(row.order_id),
    orderNo: row.order_no,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    currency: assertCurrency(row.currency),
    totalMinor: Number(row.total_minor),
    status: assertInvoiceStatus(row.status),
    lineCount: Number(row.line_count),
  }));
}

/* ------------------------------------------------------------------ writing */

export function createInvoice(tx: Tx, input: CreateInvoiceInput): Invoice {
  const billable = resolveBillableLines(tx, input);
  const first = billable[0]!;

  // One invoice, one customer and one currency. Mixing either would make the
  // total meaningless.
  for (const line of billable) {
    if (line.customerId !== first.customerId) {
      throw new BusinessRuleError(
        'invoice_spans_customers',
        `these delivered goods belong to different customers (${first.customerName} and ${line.customerName})`,
        { customerIds: [first.customerId, line.customerId] },
      );
    }
    if (line.currency !== first.currency) {
      throw new BusinessRuleError(
        'invoice_spans_currencies',
        `these delivered goods were sold in different currencies (${first.currency} and ${line.currency})`,
        { currencies: [first.currency, line.currency] },
      );
    }
  }

  const invoiceDate = assertDate(input.invoiceDate ?? today(), 'invoiceDate');
  const dueDate = assertDueDate(invoiceDate, input.dueDate ?? null);
  const currency = first.currency;
  const fxRateToNpr = rateForNewDocument(currency, input.fxRateToNpr);

  const requests: InvoiceLineRequest[] = billable.map((line) => ({
    deliveryLineId: line.deliveryLineId,
    variantId: line.variantId,
    descriptionSnapshot: line.description,
    qty: line.qty,
    unitPriceMinor: line.unitPriceMinor,
  }));
  const built = buildInvoice(requests, {
    minor: input.discountMinor,
    reason: input.discountReason,
  });

  // Every line of one order means the invoice can name it; a batch across
  // orders leaves it NULL and relies on the lines (D010).
  const orderIds = new Set(billable.map((line) => line.orderId));
  const orderId = orderIds.size === 1 ? first.orderId : null;

  const invoiceNo = nextDocumentNumber(tx, 'INV', documentYear(invoiceDate));
  const info = tx.db
    .prepare(
      `INSERT INTO invoices
         (invoice_no, customer_id, order_id, invoice_date, due_date, currency, fx_rate_to_npr,
          subtotal_minor, discount_minor, discount_reason, total_minor, status,
          created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    )
    .run(
      invoiceNo,
      first.customerId,
      orderId,
      invoiceDate,
      dueDate,
      currency,
      fxRateToNpr,
      built.subtotalMinor,
      built.discountMinor,
      built.discountMinor > 0 ? (input.discountReason ?? '').trim() : null,
      built.totalMinor,
      nowTimestamp(),
      input.userId,
    );

  const invoiceId = Number(info.lastInsertRowid);
  const insertLine = tx.db.prepare(
    `INSERT INTO invoice_lines
       (invoice_id, delivery_line_id, variant_id, description_snapshot, qty,
        unit_price_minor, line_total_minor)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const line of built.lines) {
    // The database trigger from migration 002 refuses a line already on a
    // standing invoice. Translate it so the owner reads a sentence, not SQL.
    try {
      insertLine.run(
        invoiceId,
        line.deliveryLineId,
        line.variantId,
        line.descriptionSnapshot,
        line.qty,
        line.unitPriceMinor,
        line.lineTotalMinor,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('already on a standing invoice')) {
        throw new BusinessRuleError(
          'goods_already_invoiced',
          `${line.descriptionSnapshot} on this delivery is already on an invoice; ` +
            'void that invoice first if it is wrong',
          { deliveryLineId: line.deliveryLineId },
        );
      }
      throw error;
    }
  }

  recordAudit(tx, {
    action: 'invoice_created',
    entityType: 'invoice',
    entityId: invoiceId,
    detail: { to: 'draft', invoiceNo, totalMinor: built.totalMinor, currency },
    userId: input.userId,
  });

  return getInvoice(tx, invoiceId);
}

/** D023's default: bill one dispatched delivery. */
export function invoiceDelivery(
  tx: Tx,
  deliveryId: number,
  input: Omit<CreateInvoiceInput, 'deliveryId' | 'deliveryLineIds'>,
): Invoice {
  return createInvoice(tx, { ...input, deliveryId });
}

/** Draft → issued. After this the invoice is frozen (D005). */
export function issueInvoice(tx: Tx, invoiceId: number, userId: number): Invoice {
  const before = getInvoice(tx, invoiceId);
  assertInvoiceTransition(before.status, 'issued');

  tx.db.prepare(`UPDATE invoices SET status = 'issued' WHERE id = ?`).run(invoiceId);
  recordAudit(tx, {
    action: 'invoice_issued',
    entityType: 'invoice',
    entityId: invoiceId,
    detail: { from: before.status, to: 'issued', invoiceNo: before.invoiceNo, totalMinor: before.totalMinor },
    userId,
  });

  return getInvoice(tx, invoiceId);
}

/**
 * Void an invoice, keeping every line for the record.
 *
 * This is the only correction path for an issued invoice (D005). The goods it
 * billed become billable again, because the D025 trigger ignores voided
 * invoices — so the corrected invoice can cover exactly the same delivery
 * lines.
 */
export function voidInvoice(tx: Tx, invoiceId: number, reason: string, userId: number): Invoice {
  const before = getInvoice(tx, invoiceId);
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new ValidationError('voiding an invoice needs a reason', 'reason');
  }
  assertInvoiceTransition(before.status, 'void');

  tx.db
    .prepare(`UPDATE invoices SET status = 'void', voided_at = ?, void_reason = ? WHERE id = ?`)
    .run(nowTimestamp(), reason.trim(), invoiceId);
  recordAudit(tx, {
    action: 'invoice_voided',
    entityType: 'invoice',
    entityId: invoiceId,
    detail: { from: before.status, to: 'void', invoiceNo: before.invoiceNo, reason: reason.trim() },
    userId,
  });

  return getInvoice(tx, invoiceId);
}

/* ------------------------------------------------------------------ helpers */

function resolveBillableLines(tx: Tx, input: CreateInvoiceInput): BillableLine[] {
  const hasIds = input.deliveryLineIds !== undefined;
  const hasDelivery = input.deliveryId !== undefined;
  if (hasIds === hasDelivery) {
    throw new ValidationError(
      'name either a delivery to bill or the delivery lines to bill, not both and not neither',
      'deliveryId',
    );
  }

  if (hasDelivery) {
    const deliveryId = input.deliveryId!;
    const delivery = tx.db
      .prepare(`SELECT id, delivery_no, status FROM deliveries WHERE id = ?`)
      .get(deliveryId) as { id: number; delivery_no: string; status: string } | undefined;
    if (delivery === undefined) {
      throw new NotFoundError(`delivery ${deliveryId} does not exist`, 'delivery', deliveryId);
    }
    if (delivery.status !== 'dispatched') {
      throw new BusinessRuleError(
        'delivery_not_dispatched',
        `${delivery.delivery_no} has not been dispatched, so there is nothing to bill yet`,
        { deliveryId, status: delivery.status },
      );
    }
    const lines = listBillableLines(tx, { deliveryId });
    if (lines.length === 0) {
      throw new BusinessRuleError(
        'nothing_left_to_invoice',
        `everything on ${delivery.delivery_no} is already invoiced`,
        { deliveryId },
      );
    }
    return lines;
  }

  const ids = input.deliveryLineIds!;
  if (ids.length === 0) {
    throw new ValidationError('an invoice needs at least one delivered line', 'deliveryLineIds');
  }
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new ValidationError('the same delivered line is listed twice', 'deliveryLineIds');
  }

  const placeholders = ids.map(() => '?').join(', ');
  const rows = tx.db
    .prepare(
      `SELECT dl.id AS delivery_line_id, d.id AS delivery_id, d.delivery_no, d.delivered_at,
              d.status AS delivery_status,
              o.id AS order_id, o.order_no, o.currency,
              cu.id AS customer_id, cu.name AS customer_name,
              dl.variant_id, v.sku, p.name AS product_name, c.name AS colour, s.name AS size,
              dl.qty, ol.unit_price_minor
         FROM delivery_lines dl
         JOIN deliveries d ON d.id = dl.delivery_id
         JOIN orders o ON o.id = d.order_id
         JOIN customers cu ON cu.id = d.customer_id
         JOIN order_lines ol ON ol.id = dl.order_line_id
         JOIN product_variants v ON v.id = dl.variant_id
         JOIN products p ON p.id = v.product_id
         JOIN colours c ON c.id = v.colour_id
         JOIN sizes s ON s.id = v.size_id
        WHERE dl.id IN (${placeholders})
        ORDER BY d.delivered_at, d.id, dl.id`,
    )
    .all(...(ids as readonly number[] as never[])) as Array<BillableRow & { delivery_status: string }>;

  const found = new Set(rows.map((row) => Number(row.delivery_line_id)));
  for (const id of ids) {
    if (!found.has(id)) {
      throw new NotFoundError(`delivered line ${id} does not exist`, 'delivery_line', id);
    }
  }
  for (const row of rows) {
    if (row.delivery_status !== 'dispatched') {
      throw new BusinessRuleError(
        'delivery_not_dispatched',
        `${row.delivery_no} has not been dispatched, so there is nothing to bill yet`,
        { deliveryLineId: Number(row.delivery_line_id), status: row.delivery_status },
      );
    }
  }

  return rows.map(toBillableLine);
}

type BillableRow = {
  delivery_line_id: number;
  delivery_id: number;
  delivery_no: string;
  delivered_at: string;
  order_id: number;
  order_no: string;
  currency: string;
  customer_id: number;
  customer_name: string;
  variant_id: number;
  sku: string;
  product_name: string;
  colour: string;
  size: string;
  qty: number;
  unit_price_minor: number;
};

function toBillableLine(row: BillableRow): BillableLine {
  const qty = Number(row.qty);
  const unitPriceMinor = Number(row.unit_price_minor);
  return {
    deliveryLineId: Number(row.delivery_line_id),
    deliveryId: Number(row.delivery_id),
    deliveryNo: row.delivery_no,
    deliveredAt: row.delivered_at,
    orderId: Number(row.order_id),
    orderNo: row.order_no,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    variantId: Number(row.variant_id),
    sku: row.sku,
    description: describeVariant({
      productName: row.product_name,
      colour: row.colour,
      size: row.size,
    }),
    qty,
    unitPriceMinor,
    lineTotalMinor: unitPriceMinor * qty,
    currency: assertCurrency(row.currency),
  };
}

type InvoiceHeaderRow = {
  id: number;
  invoice_no: string;
  customer_id: number;
  customer_name: string;
  order_id: number | null;
  order_no: string | null;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  fx_rate_to_npr: number;
  subtotal_minor: number;
  discount_minor: number;
  discount_reason: string | null;
  total_minor: number;
  status: string;
  voided_at: string | null;
  void_reason: string | null;
};

type InvoiceLineRow = {
  id: number;
  delivery_line_id: number;
  delivery_id: number;
  delivery_no: string;
  variant_id: number;
  sku: string;
  description_snapshot: string;
  qty: number;
  unit_price_minor: number;
  line_total_minor: number;
};

type InvoiceSummaryRow = {
  id: number;
  invoice_no: string;
  customer_id: number;
  customer_name: string;
  order_id: number | null;
  order_no: string | null;
  invoice_date: string;
  due_date: string | null;
  currency: string;
  total_minor: number;
  status: string;
  line_count: number;
};

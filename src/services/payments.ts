/**
 * Payments: money arriving, and what it settles.
 *
 * The rule that governs this whole file is that **a payment row is not money
 * until it is cleared**. Cash and a bank transfer are cleared the moment they
 * are recorded. A cheque is recorded as pending, and only the owner saying the
 * bank credited it moves it to cleared. Until then it changes no balance
 * (CLAUDE.md, D028).
 *
 * Nothing here is deleted or overwritten. `payment_allocations` is append-only,
 * so a bounce does not remove the rows that applied the money — it changes the
 * payment's status, and every balance query stops counting those rows because
 * they no longer belong to a cleared payment. That is what makes "a bounced
 * cheque restores the outstanding balance while preserving history" true rather
 * than aspirational.
 *
 * The owner chooses what each payment settles (D026). Nothing is applied
 * automatically, and the remainder is held as an advance rather than refused
 * (D027).
 *
 * No stock is touched anywhere in this file. Payment is money, not goods.
 */

import type { Tx } from '../db/sqlite.ts';
import { NotFoundError, ValidationError } from '../domain/errors.ts';
import { assertDate, documentYear, nowTimestamp, today } from '../domain/dates.ts';
import { rateForNewDocument } from '../domain/fx.ts';
import { assertInvoiceStatus, type InvoiceStatus } from '../domain/invoices.ts';
import { assertCurrency, assertMinor, type Currency } from '../domain/money.ts';
import {
  assertBankEventApplies,
  assertChequeDetails,
  assertClearingDate,
  assertPaymentMethod,
  assertPaymentStatus,
  assertPaymentTransition,
  assertReason,
  computeBalance,
  isPostDatedCheque,
  openingStatus,
  planAllocation,
  type AllocationRequest,
  type Balance,
  type PaymentMethod,
  type PaymentStatus,
} from '../domain/payments.ts';
import { recordAudit } from './audit.ts';
import { nextDocumentNumber } from './documentNumbers.ts';

export {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  type PaymentMethod,
  type PaymentStatus,
} from '../domain/payments.ts';

export type PaymentAllocation = {
  id: number;
  invoiceId: number;
  invoiceNo: string;
  invoiceDate: string;
  invoiceTotalMinor: number;
  invoiceStatus: InvoiceStatus;
  amountMinor: number;
  createdAt: string;
};

export type Payment = {
  id: number;
  paymentNo: string;
  customerId: number;
  customerName: string;
  receivedAt: string;
  method: PaymentMethod;
  amountMinor: number;
  currency: Currency;
  fxRateToNpr: number;
  status: PaymentStatus;
  chequeNo: string | null;
  chequeDate: string | null;
  /** True while a cheque is dated in the future, so it cannot be banked yet. */
  postDated: boolean;
  clearedAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  note: string | null;
  /**
   * What this payment has been applied to, including allocations to invoices
   * that were later voided — the row is history and is never removed.
   */
  allocations: PaymentAllocation[];
  /**
   * Applied to bills that still stand. An allocation to a voided invoice stops
   * counting, so the money returns to the advance and can settle the reissued
   * invoice instead.
   */
  appliedMinor: number;
  /**
   * Everything this payment was ever applied to, voided invoices included. Kept
   * separate from `appliedMinor` so a void is visible rather than looking like
   * money that went missing.
   */
  historicAppliedMinor: number;
  /** Money received and not yet applied. Zero unless the payment is cleared. */
  unappliedMinor: number;
};

export type PaymentSummary = {
  id: number;
  paymentNo: string;
  customerId: number;
  customerName: string;
  receivedAt: string;
  method: PaymentMethod;
  amountMinor: number;
  currency: Currency;
  status: PaymentStatus;
  chequeNo: string | null;
  chequeDate: string | null;
  postDated: boolean;
  appliedMinor: number;
  unappliedMinor: number;
};

export type RecordPaymentInput = {
  customerId: number;
  amountMinor: number;
  method: PaymentMethod;
  currency?: Currency;
  fxRateToNpr?: number;
  receivedAt?: string;
  chequeNo?: string | null;
  chequeDate?: string | null;
  note?: string | null;
  /**
   * Optional: apply it to bills in the same call. Omit to hold the money as an
   * advance and decide later (D026, D027).
   */
  allocations?: readonly { invoiceId: number; amountMinor: number }[];
  userId: number;
};

/** What one invoice still owes, after cleared payments only. */
export type InvoiceReceivable = {
  invoiceId: number;
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string | null;
  status: InvoiceStatus;
  currency: Currency;
  totalMinor: number;
  settledMinor: number;
  outstandingMinor: number;
};

export type CustomerBalance = Balance & {
  currency: Currency;
  invoiceCount: number;
};

export type CustomerStatement = {
  customerId: number;
  customerName: string;
  balances: CustomerBalance[];
  invoices: InvoiceReceivable[];
  payments: PaymentSummary[];
};

type PaymentRow = {
  id: number;
  payment_no: string;
  customer_id: number;
  customer_name: string;
  received_at: string;
  method: string;
  amount_minor: number;
  currency: string;
  fx_rate_to_npr: number;
  status: string;
  cheque_no: string | null;
  cheque_date: string | null;
  cleared_at: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  note: string | null;
  applied_minor: number;
  historic_applied_minor: number;
};

/**
 * The two halves of the one rule that decides every balance in this file,
 * written once each because three copies of it in SQL is three chances for them
 * to drift apart.
 *
 * An allocation row counts only when **the payment cleared** and **the bill
 * still stands**. A pending cheque has not paid anything. A bounced or
 * cancelled receipt has stopped paying. A voided invoice is not owed, so money
 * applied to it goes back to the customer's advance. No row is ever deleted to
 * express any of this.
 */

/** Cleared money applied to the invoice aliased `i`. */
const SETTLED_FOR_INVOICE = `(SELECT COALESCE(SUM(pa.amount_minor), 0)
             FROM payment_allocations pa
             JOIN payments pp ON pp.id = pa.payment_id
            WHERE pa.invoice_id = i.id AND pp.status = 'cleared')`;

/** What the payment aliased `p` has applied to bills that still stand. */
const APPLIED_FOR_PAYMENT = `(SELECT COALESCE(SUM(pa.amount_minor), 0)
             FROM payment_allocations pa
             JOIN invoices ii ON ii.id = pa.invoice_id
            WHERE pa.payment_id = p.id AND ii.status <> 'void')`;

const PAYMENT_COLUMNS = `p.id, p.payment_no, p.customer_id, cu.name AS customer_name,
        p.received_at, p.method, p.amount_minor, p.currency, p.fx_rate_to_npr, p.status,
        p.cheque_no, p.cheque_date, p.cleared_at, p.bounced_at, p.bounce_reason,
        p.cancelled_at, p.cancel_reason, p.note,
        ${APPLIED_FOR_PAYMENT} AS applied_minor,
        (SELECT COALESCE(SUM(pa.amount_minor), 0)
           FROM payment_allocations pa WHERE pa.payment_id = p.id) AS historic_applied_minor`;

/* ------------------------------------------------------------------ reading */

function mapSummary(row: PaymentRow, asOf: string): PaymentSummary {
  const status = assertPaymentStatus(row.status);
  const amountMinor = Number(row.amount_minor);
  const appliedMinor = Number(row.applied_minor);
  return {
    id: Number(row.id),
    paymentNo: row.payment_no,
    customerId: Number(row.customer_id),
    customerName: row.customer_name,
    receivedAt: row.received_at,
    method: assertPaymentMethod(row.method),
    amountMinor,
    currency: assertCurrency(row.currency),
    status,
    chequeNo: row.cheque_no,
    chequeDate: row.cheque_date,
    postDated: status === 'pending' && isPostDatedCheque(row.cheque_date, asOf),
    appliedMinor,
    // Only cleared money is available to apply. A pending cheque's remainder
    // is not an advance; it is not money yet.
    unappliedMinor: status === 'cleared' ? amountMinor - appliedMinor : 0,
  };
}

export function getPayment(tx: Tx, paymentId: number, asOf: string = today()): Payment {
  const row = tx.db
    .prepare(
      `SELECT ${PAYMENT_COLUMNS}
         FROM payments p
         JOIN customers cu ON cu.id = p.customer_id
        WHERE p.id = ?`,
    )
    .get(paymentId) as PaymentRow | undefined;

  if (row === undefined) {
    throw new NotFoundError('payment', paymentId);
  }

  const allocationRows = tx.db
    .prepare(
      `SELECT pa.id, pa.invoice_id, i.invoice_no, i.invoice_date, i.total_minor, i.status,
              pa.amount_minor, pa.created_at
         FROM payment_allocations pa
         JOIN invoices i ON i.id = pa.invoice_id
        WHERE pa.payment_id = ?
        ORDER BY pa.id`,
    )
    .all(paymentId) as {
    id: number;
    invoice_id: number;
    invoice_no: string;
    invoice_date: string;
    total_minor: number;
    status: string;
    amount_minor: number;
    created_at: string;
  }[];

  const summary = mapSummary(row, asOf);
  return {
    ...summary,
    fxRateToNpr: Number(row.fx_rate_to_npr),
    historicAppliedMinor: Number(row.historic_applied_minor),
    clearedAt: row.cleared_at,
    bouncedAt: row.bounced_at,
    bounceReason: row.bounce_reason,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    note: row.note,
    allocations: allocationRows.map((allocation) => ({
      id: Number(allocation.id),
      invoiceId: Number(allocation.invoice_id),
      invoiceNo: allocation.invoice_no,
      invoiceDate: allocation.invoice_date,
      invoiceTotalMinor: Number(allocation.total_minor),
      invoiceStatus: assertInvoiceStatus(allocation.status),
      amountMinor: Number(allocation.amount_minor),
      createdAt: allocation.created_at,
    })),
  };
}

export function listPayments(
  tx: Tx,
  filter: {
    customerId?: number;
    status?: PaymentStatus;
    method?: PaymentMethod;
    invoiceId?: number;
    limit?: number;
    asOf?: string;
  } = {},
): PaymentSummary[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filter.customerId !== undefined) {
    clauses.push('p.customer_id = ?');
    params.push(filter.customerId);
  }
  if (filter.status !== undefined) {
    clauses.push('p.status = ?');
    params.push(assertPaymentStatus(filter.status));
  }
  if (filter.method !== undefined) {
    clauses.push('p.method = ?');
    params.push(assertPaymentMethod(filter.method));
  }
  if (filter.invoiceId !== undefined) {
    clauses.push(
      'EXISTS (SELECT 1 FROM payment_allocations pa WHERE pa.payment_id = p.id AND pa.invoice_id = ?)',
    );
    params.push(filter.invoiceId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  const rows = tx.db
    .prepare(
      `SELECT ${PAYMENT_COLUMNS}
         FROM payments p
         JOIN customers cu ON cu.id = p.customer_id
         ${where}
        ORDER BY p.id DESC
        LIMIT ?`,
    )
    .all(...(params as never[])) as PaymentRow[];

  const asOf = filter.asOf ?? today();
  return rows.map((row) => mapSummary(row, asOf));
}

/**
 * Cheques taken but not yet cleared.
 *
 * These are deliberately not part of any balance. The owner needs to see them
 * as their own list — which ones can be banked now, and which are dated
 * forward — because a drawer full of cheques is not the same as money.
 */
export function listPendingCheques(
  tx: Tx,
  filter: { customerId?: number; asOf?: string } = {},
): PaymentSummary[] {
  return listPayments(tx, { ...filter, status: 'pending', method: 'cheque', limit: 500 });
}

/**
 * What every invoice of a customer still owes.
 *
 * `settled_minor` counts allocations from **cleared** payments only. A pending
 * cheque applied to an invoice does not reduce it, and a bounced payment's
 * allocation rows stay in the table but stop counting — which is exactly how
 * the outstanding balance comes back on a bounce without deleting anything.
 */
export function listReceivables(
  tx: Tx,
  filter: { customerId?: number; onlyOutstanding?: boolean; limit?: number } = {},
): InvoiceReceivable[] {
  const clauses: string[] = [`i.status = 'issued'`];
  const params: unknown[] = [];
  if (filter.customerId !== undefined) {
    clauses.push('i.customer_id = ?');
    params.push(filter.customerId);
  }
  params.push(filter.limit ?? 500);

  const rows = tx.db
    .prepare(
      `SELECT i.id, i.invoice_no, i.invoice_date, i.due_date, i.status, i.currency, i.total_minor,
              ${SETTLED_FOR_INVOICE} AS settled_minor
         FROM invoices i
        WHERE ${clauses.join(' AND ')}
        ORDER BY i.invoice_date, i.id
        LIMIT ?`,
    )
    .all(...(params as never[])) as {
    id: number;
    invoice_no: string;
    invoice_date: string;
    due_date: string | null;
    status: string;
    currency: string;
    total_minor: number;
    settled_minor: number;
  }[];

  const receivables = rows.map((row) => {
    const totalMinor = Number(row.total_minor);
    const settledMinor = Number(row.settled_minor);
    return {
      invoiceId: Number(row.id),
      invoiceNo: row.invoice_no,
      invoiceDate: row.invoice_date,
      dueDate: row.due_date,
      status: assertInvoiceStatus(row.status),
      currency: assertCurrency(row.currency),
      totalMinor,
      settledMinor,
      outstandingMinor: totalMinor - settledMinor,
    };
  });

  return filter.onlyOutstanding === true
    ? receivables.filter((receivable) => receivable.outstandingMinor > 0)
    : receivables;
}

/**
 * A customer's balance, one figure set per currency, with the documents behind
 * it.
 *
 * There is no single number, on purpose: a customer with a dollar invoice and
 * rupee invoices does not have one balance, and adding them at today's rate
 * would invent a figure no document supports (D011).
 *
 * The balances are computed by aggregate query, not by adding up `invoices` and
 * `payments` below. Those two lists are for display and are capped; a balance
 * that quietly stopped counting at the cap would be wrong in exactly the case
 * where it matters most — the customer who has been trading longest.
 */
export function getCustomerStatement(
  tx: Tx,
  customerId: number,
  options: { asOf?: string; limit?: number } = {},
): CustomerStatement {
  const customer = tx.db
    .prepare('SELECT id, name FROM customers WHERE id = ?')
    .get(customerId) as { id: number; name: string } | undefined;
  if (customer === undefined) {
    throw new NotFoundError('customer', customerId);
  }

  const asOf = assertDate(options.asOf ?? today(), 'asOf');
  const limit = options.limit ?? 200;

  type Parts = {
    invoicedMinor: number;
    settledMinor: number;
    advanceMinor: number;
    pendingChequeMinor: number;
    invoiceCount: number;
  };
  const byCurrency = new Map<Currency, Parts>();
  const part = (currency: Currency): Parts => {
    let existing = byCurrency.get(currency);
    if (existing === undefined) {
      existing = {
        invoicedMinor: 0,
        settledMinor: 0,
        advanceMinor: 0,
        pendingChequeMinor: 0,
        invoiceCount: 0,
      };
      byCurrency.set(currency, existing);
    }
    return existing;
  };

  // What is owed: every issued invoice, less cleared money applied to it.
  const invoiceTotals = tx.db
    .prepare(
      `SELECT i.currency,
              COUNT(*) AS invoice_count,
              COALESCE(SUM(i.total_minor), 0) AS invoiced_minor,
              COALESCE(SUM(${SETTLED_FOR_INVOICE}), 0) AS settled_minor
         FROM invoices i
        WHERE i.customer_id = ? AND i.status = 'issued'
        GROUP BY i.currency`,
    )
    .all(customerId) as {
    currency: string;
    invoice_count: number;
    invoiced_minor: number;
    settled_minor: number;
  }[];
  for (const row of invoiceTotals) {
    const bucket = part(assertCurrency(row.currency));
    bucket.invoicedMinor += Number(row.invoiced_minor);
    bucket.settledMinor += Number(row.settled_minor);
    bucket.invoiceCount += Number(row.invoice_count);
  }

  // Money in hand that no standing bill has claimed (the advance), and cheques
  // that are not money yet. Neither changes what is owed; both are reported.
  const paymentTotals = tx.db
    .prepare(
      `SELECT p.currency,
              COALESCE(SUM(CASE WHEN p.status = 'cleared'
                                THEN p.amount_minor - ${APPLIED_FOR_PAYMENT}
                                ELSE 0 END), 0) AS advance_minor,
              COALESCE(SUM(CASE WHEN p.status = 'pending'
                                THEN p.amount_minor ELSE 0 END), 0) AS pending_cheque_minor
         FROM payments p
        WHERE p.customer_id = ?
        GROUP BY p.currency`,
    )
    .all(customerId) as {
    currency: string;
    advance_minor: number;
    pending_cheque_minor: number;
  }[];
  for (const row of paymentTotals) {
    const bucket = part(assertCurrency(row.currency));
    bucket.advanceMinor += Number(row.advance_minor);
    bucket.pendingChequeMinor += Number(row.pending_cheque_minor);
  }

  const balances = [...byCurrency.entries()]
    .map(([currency, parts]) => ({
      currency,
      invoiceCount: parts.invoiceCount,
      ...computeBalance(parts),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return {
    customerId: Number(customer.id),
    customerName: customer.name,
    balances,
    invoices: listReceivables(tx, { customerId, limit }),
    payments: listPayments(tx, { customerId, limit, asOf }),
  };
}

/* ------------------------------------------------------------------ writing */

/**
 * Record money arriving.
 *
 * A cheque lands as pending and changes nothing the customer owes until it
 * clears. Cash and a bank transfer land cleared, because the money is already
 * in the drawer or the account.
 */
export function recordPayment(tx: Tx, input: RecordPaymentInput): Payment {
  const customer = tx.db
    .prepare('SELECT id, name, default_currency FROM customers WHERE id = ?')
    .get(input.customerId) as { id: number; name: string; default_currency: string } | undefined;
  if (customer === undefined) {
    throw new NotFoundError('customer', input.customerId);
  }

  const method = assertPaymentMethod(input.method);
  const amountMinor = assertMinor(input.amountMinor, 'amountMinor');
  if (amountMinor <= 0) {
    throw new ValidationError(`a payment must be more than nothing, got ${amountMinor}`, 'amountMinor');
  }

  const receivedAt = assertDate(input.receivedAt ?? today(), 'receivedAt');
  const currency = assertCurrency(input.currency ?? customer.default_currency, 'currency');
  const fxRateToNpr = rateForNewDocument(currency, input.fxRateToNpr);
  const cheque = assertChequeDetails({
    method,
    chequeNo: input.chequeNo,
    chequeDate: input.chequeDate,
  });
  const status = openingStatus(method);
  const note = (input.note ?? '').trim();

  const paymentNo = nextDocumentNumber(tx, 'PAY', documentYear(receivedAt));
  const info = tx.db
    .prepare(
      `INSERT INTO payments
         (payment_no, customer_id, received_at, method, amount_minor, currency, fx_rate_to_npr,
          status, cheque_no, cheque_date, cleared_at, note, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      paymentNo,
      customer.id,
      receivedAt,
      method,
      amountMinor,
      currency,
      fxRateToNpr,
      status,
      cheque.chequeNo,
      cheque.chequeDate,
      // Cash and bank transfer clear on the day they arrive. A cheque has no
      // clearing date until the bank gives it one.
      status === 'cleared' ? receivedAt : null,
      note.length > 0 ? note : null,
      nowTimestamp(),
      input.userId,
    );

  const paymentId = Number(info.lastInsertRowid);
  recordAudit(tx, {
    action: 'payment_recorded',
    entityType: 'payment',
    entityId: paymentId,
    detail: { to: status, paymentNo, method, amountMinor, currency },
    userId: input.userId,
  });

  if (input.allocations !== undefined && input.allocations.length > 0) {
    applyPayment(tx, paymentId, input.allocations, input.userId);
  }

  return getPayment(tx, paymentId);
}

/**
 * Apply a payment to bills the owner has named.
 *
 * Allocation is append-only, so applying more later adds rows rather than
 * editing them. A payment that already gave an invoice money cannot give it
 * more in a second call — the UNIQUE on (payment_id, invoice_id) says one row
 * per pair, and combining them silently would hide which receipt paid what.
 */
export function applyPayment(
  tx: Tx,
  paymentId: number,
  allocations: readonly { invoiceId: number; amountMinor: number }[],
  userId: number,
): Payment {
  const payment = getPayment(tx, paymentId);

  // A bounced or cancelled receipt is not money and cannot be applied. A
  // pending cheque can be: the owner records which bills it is meant for, and
  // nothing moves until it clears.
  if (payment.status === 'bounced' || payment.status === 'cancelled') {
    assertPaymentTransition(payment.status, 'cleared');
  }
  if (!Array.isArray(allocations)) {
    throw new ValidationError('allocations must be a list', 'allocations');
  }

  const requests: AllocationRequest[] = allocations.map((allocation, index) => {
    const invoice = tx.db
      .prepare(
        `SELECT i.id, i.invoice_no, i.status, i.currency, i.total_minor, i.customer_id,
                (SELECT COALESCE(SUM(pa.amount_minor), 0)
                   FROM payment_allocations pa
                  WHERE pa.invoice_id = i.id AND pa.payment_id = ?) AS this_payment_minor
           FROM invoices i
          WHERE i.id = ?`,
      )
      .get(paymentId, allocation.invoiceId) as
      | {
          id: number;
          invoice_no: string;
          status: string;
          currency: string;
          total_minor: number;
          customer_id: number;
          this_payment_minor: number;
        }
      | undefined;

    if (invoice === undefined) {
      throw new NotFoundError('invoice', allocation.invoiceId);
    }
    if (Number(invoice.customer_id) !== payment.customerId) {
      throw new ValidationError(
        `${invoice.invoice_no} belongs to another customer, so ${payment.paymentNo} cannot pay it`,
        `allocations[${index}].invoiceId`,
      );
    }
    if (Number(invoice.this_payment_minor) > 0) {
      throw new ValidationError(
        `${payment.paymentNo} has already been applied to ${invoice.invoice_no}; ` +
          'record a separate payment rather than adding to that one',
        `allocations[${index}].invoiceId`,
      );
    }

    // A pending cheque earmarked against this invoice must not be double
    // counted as available: what is outstanding for allocation purposes is the
    // total less everything already promised to it, cleared or not.
    const promisedMinor = Number(
      (
        tx.db
          .prepare(
            `SELECT COALESCE(SUM(pa.amount_minor), 0) AS promised
               FROM payment_allocations pa
               JOIN payments p ON p.id = pa.payment_id
              WHERE pa.invoice_id = ? AND p.status IN ('pending', 'cleared')`,
          )
          .get(allocation.invoiceId) as { promised: number }
      ).promised,
    );

    return {
      invoiceId: Number(invoice.id),
      amountMinor: allocation.amountMinor,
      invoiceNo: invoice.invoice_no,
      invoiceStatus: assertInvoiceStatus(invoice.status),
      invoiceCurrency: assertCurrency(invoice.currency),
      invoiceOutstandingMinor: Number(invoice.total_minor) - promisedMinor,
    };
  });

  const plan = planAllocation(
    {
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      alreadyAppliedMinor: payment.appliedMinor,
    },
    requests,
  );

  const insert = tx.db.prepare(
    `INSERT INTO payment_allocations (payment_id, invoice_id, amount_minor, created_at, created_by)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const at = nowTimestamp();
  for (const line of plan.lines) {
    insert.run(paymentId, line.invoiceId, line.amountMinor, at, userId);
  }

  recordAudit(tx, {
    action: 'payment_applied',
    entityType: 'payment',
    entityId: paymentId,
    detail: {
      paymentNo: payment.paymentNo,
      appliedMinor: plan.appliedMinor,
      unappliedMinor: plan.unappliedMinor,
      lines: plan.lines,
    },
    userId,
  });

  return getPayment(tx, paymentId);
}

/**
 * The bank credited the cheque. Now it is money, and now it reduces what the
 * customer owes — including through any allocation already recorded against it.
 */
export function clearCheque(
  tx: Tx,
  paymentId: number,
  input: { clearedOn?: string; userId: number },
): Payment {
  const before = getPayment(tx, paymentId);
  assertBankEventApplies(before.method, 'cleared');
  assertPaymentTransition(before.status, 'cleared');

  const clearedOn = assertClearingDate(
    before.chequeDate,
    assertDate(input.clearedOn ?? today(), 'clearedOn'),
  );

  tx.db
    .prepare(`UPDATE payments SET status = 'cleared', cleared_at = ? WHERE id = ?`)
    .run(clearedOn, paymentId);
  recordAudit(tx, {
    action: 'payment_cleared',
    entityType: 'payment',
    entityId: paymentId,
    detail: {
      from: before.status,
      to: 'cleared',
      paymentNo: before.paymentNo,
      clearedOn,
      amountMinor: before.amountMinor,
    },
    userId: input.userId,
  });

  return getPayment(tx, paymentId);
}

/**
 * The bank returned the cheque.
 *
 * Nothing is deleted. The allocation rows stay exactly where they are; they
 * simply stop counting, because every balance query only counts allocations
 * belonging to a cleared payment. The customer owes the money again, and the
 * record still shows that a cheque was taken, when it was banked, and why it
 * came back (D028).
 */
export function bounceCheque(
  tx: Tx,
  paymentId: number,
  input: { reason: string; bouncedOn?: string; userId: number },
): Payment {
  const before = getPayment(tx, paymentId);
  assertBankEventApplies(before.method, 'bounced');
  const reason = assertReason(
    input.reason,
    'reason',
    'a bounced cheque must say why the bank returned it',
  );
  assertPaymentTransition(before.status, 'bounced');
  const bouncedOn = assertDate(input.bouncedOn ?? today(), 'bouncedOn');

  tx.db
    .prepare(`UPDATE payments SET status = 'bounced', bounced_at = ?, bounce_reason = ? WHERE id = ?`)
    .run(bouncedOn, reason, paymentId);
  recordAudit(tx, {
    action: 'payment_bounced',
    entityType: 'payment',
    entityId: paymentId,
    detail: {
      from: before.status,
      to: 'bounced',
      paymentNo: before.paymentNo,
      bouncedOn,
      reason,
      amountMinor: before.amountMinor,
      restoredMinor: before.appliedMinor,
    },
    userId: input.userId,
  });

  return getPayment(tx, paymentId);
}

/**
 * Cancel a receipt that should not have been recorded.
 *
 * The row stays, the allocations stay, and the reason is mandatory — money
 * coming back off the books unexplained is the same audit hole as an
 * unexplained stock adjustment (D005, D024).
 */
export function cancelPayment(
  tx: Tx,
  paymentId: number,
  input: { reason: string; cancelledOn?: string; userId: number },
): Payment {
  const before = getPayment(tx, paymentId);
  const reason = assertReason(
    input.reason,
    'reason',
    'cancelling a payment needs a reason',
  );
  assertPaymentTransition(before.status, 'cancelled');
  const cancelledOn = assertDate(input.cancelledOn ?? today(), 'cancelledOn');

  tx.db
    .prepare(
      `UPDATE payments SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?`,
    )
    .run(cancelledOn, reason, paymentId);
  recordAudit(tx, {
    action: 'payment_cancelled',
    entityType: 'payment',
    entityId: paymentId,
    detail: {
      from: before.status,
      to: 'cancelled',
      paymentNo: before.paymentNo,
      cancelledOn,
      reason,
      amountMinor: before.amountMinor,
      restoredMinor: before.status === 'cleared' ? before.appliedMinor : 0,
    },
    userId: input.userId,
  });

  return getPayment(tx, paymentId);
}

/**
 * Payment business rules that need no database.
 *
 * A payment is money arriving. Nothing here reads a table, which is what makes
 * these rules cheap to test exhaustively — and they are the rules that decide
 * what a customer owes, so they are tested exhaustively.
 *
 * The rules, and where they come from:
 *
 *   D007  integer minor units only
 *   D011  the payment is in its own currency, with its own rate for reporting
 *   D013  every status change is a real event and is logged
 *   D026  the owner picks which bills a payment settles; nothing is applied
 *         automatically
 *   D027  money with no bill yet is held as an advance, not refused
 *   D028  a cheque already marked cleared can still be returned by the bank
 *   D029  a payment settles bills in its own currency only
 *
 * The rule that matters most is not written as a function here, because it is
 * a subtraction the service performs: **only a cleared payment reduces what a
 * customer owes.** A pending cheque is a promise. See `settlesReceivables`.
 */

import { BusinessRuleError, ValidationError } from './errors.ts';
import { parseDate } from './dates.ts';
import { assertMinor, assertNonNegativeMinor, sumMinor, type Currency } from './money.ts';
import type { InvoiceStatus } from './invoices.ts';

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'cheque'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'cleared', 'bounced', 'cancelled'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value);
}

export function assertPaymentMethod(value: unknown, field = 'method'): PaymentMethod {
  if (!isPaymentMethod(value)) {
    throw new ValidationError(
      `method must be one of ${PAYMENT_METHODS.join(', ')}, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export function assertPaymentStatus(value: unknown, field = 'status'): PaymentStatus {
  if (!isPaymentStatus(value)) {
    throw new ValidationError(
      `status must be one of ${PAYMENT_STATUSES.join(', ')}, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

/**
 * Cash and a bank transfer are money already in hand, so they are born
 * cleared. A cheque is a promise until the bank says otherwise.
 */
export function openingStatus(method: PaymentMethod): PaymentStatus {
  return method === 'cheque' ? 'pending' : 'cleared';
}

/**
 * The one rule that decides a customer balance: only cleared money reduces
 * what is owed. A pending cheque does not, a bounced one does not, and a
 * cancelled receipt does not.
 */
export function settlesReceivables(status: PaymentStatus): boolean {
  return status === 'cleared';
}

/** A receipt still expected to become money. Pending cheques are reported on their own. */
export function isAwaitingBank(status: PaymentStatus): boolean {
  return status === 'pending';
}

/**
 * Legal status changes.
 *
 * `cleared -> bounced` exists because of D028: the owner marks a cheque
 * cleared when it is deposited, and the bank can return it a week later.
 *
 * `bounced` is the end of the line. A cheque the customer asks the bank to
 * present again is a new receipt, not a resurrected one — that keeps two
 * bank events as two rows instead of overwriting the first.
 */
const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['cleared', 'bounced', 'cancelled'],
  cleared: ['bounced', 'cancelled'],
  bounced: [],
  cancelled: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
  assertPaymentStatus(from, 'from');
  assertPaymentStatus(to, 'to');
  if (canTransition(from, to)) {
    return to;
  }
  if (from === 'cleared' && to === 'cleared') {
    throw new BusinessRuleError(
      'payment_already_cleared',
      'this payment has already been marked cleared',
      { from, to },
    );
  }
  if (from === 'bounced') {
    throw new BusinessRuleError(
      'payment_is_bounced',
      'this cheque has bounced; record the replacement as a new payment so both bank events are kept',
      { from, to },
    );
  }
  if (from === 'cancelled') {
    throw new BusinessRuleError(
      'payment_is_cancelled',
      'this payment was cancelled; record a new one instead',
      { from, to },
    );
  }
  throw new BusinessRuleError(
    'illegal_payment_transition',
    `a payment cannot go from ${from} to ${to}`,
    { from, to, allowed: ALLOWED_TRANSITIONS[from] },
  );
}

/** Only a cheque passes through a bank, so only a cheque can clear or bounce. */
export function assertBankEventApplies(method: PaymentMethod, event: 'cleared' | 'bounced'): void {
  if (method !== 'cheque') {
    throw new BusinessRuleError(
      event === 'cleared' ? 'payment_needs_no_clearing' : 'only_a_cheque_can_bounce',
      `${PAYMENT_METHOD_LABELS[method].toLowerCase()} does not pass through a bank clearing, ` +
        'so it cannot be ' +
        event,
      { method, event },
    );
  }
}

/* ------------------------------------------------------------------- cheques */

export type ChequeDetails = {
  chequeNo: string | null;
  chequeDate: string | null;
};

/**
 * Cheque details belong to cheques and nothing else. A cheque number typed
 * against a cash receipt is a mistake worth stopping, not tidying away.
 */
export function assertChequeDetails(input: {
  method: PaymentMethod;
  chequeNo?: string | null;
  chequeDate?: string | null;
}): ChequeDetails {
  const chequeNo = (input.chequeNo ?? '').trim();
  const chequeDate = (input.chequeDate ?? '').trim();

  if (input.method === 'cheque') {
    if (chequeNo.length === 0) {
      throw new ValidationError('a cheque needs its number', 'chequeNo');
    }
    if (chequeDate.length === 0) {
      throw new ValidationError('a cheque needs the date written on it', 'chequeDate');
    }
    parseDate(chequeDate, 'chequeDate');
    return { chequeNo, chequeDate };
  }

  if (chequeNo.length > 0) {
    throw new ValidationError(
      `a ${PAYMENT_METHOD_LABELS[input.method].toLowerCase()} has no cheque number`,
      'chequeNo',
    );
  }
  if (chequeDate.length > 0) {
    throw new ValidationError(
      `a ${PAYMENT_METHOD_LABELS[input.method].toLowerCase()} has no cheque date`,
      'chequeDate',
    );
  }
  return { chequeNo: null, chequeDate: null };
}

/**
 * A cheque dated after today cannot be banked yet. The owner takes these and
 * they have to be visible as a separate thing from cheques already deposited.
 */
export function isPostDatedCheque(chequeDate: string | null, asOf: string): boolean {
  if (chequeDate === null) {
    return false;
  }
  return parseDate(chequeDate, 'chequeDate') > parseDate(asOf, 'asOf');
}

/** A cheque cannot be banked before it is written. */
export function assertClearingDate(chequeDate: string | null, clearedOn: string): string {
  parseDate(clearedOn, 'clearedOn');
  if (chequeDate !== null && parseDate(clearedOn, 'clearedOn') < parseDate(chequeDate, 'chequeDate')) {
    throw new BusinessRuleError(
      'cleared_before_cheque_date',
      `a cheque dated ${chequeDate} cannot have cleared on ${clearedOn}`,
      { chequeDate, clearedOn },
    );
  }
  return clearedOn;
}

/** A reason that has to mean something. Blank is not an explanation. */
export function assertReason(value: unknown, field: string, what: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${what}`, field);
  }
  return value.trim();
}

/* ---------------------------------------------------------------- allocation */

/**
 * One line of an allocation, with everything the rules need about the invoice
 * it points at. The service looks the invoice facts up; the arithmetic here
 * stays pure.
 */
export type AllocationRequest = {
  invoiceId: number;
  amountMinor: number;
  invoiceNo: string;
  invoiceStatus: InvoiceStatus;
  invoiceCurrency: Currency;
  /** Total, less what cleared payments have already applied to it. */
  invoiceOutstandingMinor: number;
};

export type AllocationPlan = {
  lines: { invoiceId: number; amountMinor: number }[];
  /** What this call applies. */
  appliedMinor: number;
  /** What the payment has left over afterwards — the customer's advance (D027). */
  unappliedMinor: number;
};

/**
 * Decide what a payment settles.
 *
 * The owner names the invoices and the amounts (D026), so every check here is
 * about refusing a split that does not add up:
 *
 *   - a bill can only be paid once over — no invoice may receive more than it
 *     still owes, so a customer balance can never go negative through
 *     allocation
 *   - a payment cannot give away more than it holds, counting anything it has
 *     already applied
 *   - only an issued bill can be paid: a draft has not been given to the
 *     customer and a void one is not owed
 *   - rupees do not settle a dollar bill (D029)
 *
 * Whatever is left over is not an error. It is an advance, and the owner can
 * apply it to a later invoice.
 */
export function planAllocation(
  payment: { amountMinor: number; currency: Currency; alreadyAppliedMinor: number },
  requests: readonly AllocationRequest[],
): AllocationPlan {
  const paymentAmountMinor = assertNonNegativeMinor(payment.amountMinor, 'amountMinor');
  const alreadyAppliedMinor = assertNonNegativeMinor(
    payment.alreadyAppliedMinor,
    'alreadyAppliedMinor',
  );

  if (requests.length === 0) {
    throw new ValidationError('name at least one invoice to apply this payment to', 'allocations');
  }

  const seen = new Set<number>();
  const lines = requests.map((request, index) => {
    if (seen.has(request.invoiceId)) {
      throw new ValidationError(
        `invoice ${request.invoiceNo} appears twice in the same allocation; ` +
          'give it one combined amount instead',
        `allocations[${index}].invoiceId`,
      );
    }
    seen.add(request.invoiceId);

    const amountMinor = assertMinor(request.amountMinor, `allocations[${index}].amountMinor`);
    if (amountMinor <= 0) {
      throw new ValidationError(
        `the amount applied to ${request.invoiceNo} must be greater than zero, got ${amountMinor}`,
        `allocations[${index}].amountMinor`,
      );
    }

    if (request.invoiceStatus === 'void') {
      throw new BusinessRuleError(
        'invoice_is_void',
        `${request.invoiceNo} has been voided, so nothing is owed against it`,
        { invoiceId: request.invoiceId, invoiceNo: request.invoiceNo },
      );
    }
    if (request.invoiceStatus !== 'issued') {
      throw new BusinessRuleError(
        'invoice_not_issued',
        `${request.invoiceNo} is still a draft; issue it before taking payment against it`,
        { invoiceId: request.invoiceId, invoiceNo: request.invoiceNo, status: request.invoiceStatus },
      );
    }

    // D029. Converting here would create an FX gain or loss the books have
    // nowhere to record, so it is refused instead of guessed at.
    if (request.invoiceCurrency !== payment.currency) {
      throw new BusinessRuleError(
        'payment_currency_mismatch',
        `a payment in ${payment.currency} cannot settle ${request.invoiceNo}, which is in ` +
          `${request.invoiceCurrency}`,
        {
          invoiceId: request.invoiceId,
          invoiceNo: request.invoiceNo,
          paymentCurrency: payment.currency,
          invoiceCurrency: request.invoiceCurrency,
        },
      );
    }

    const outstandingMinor = assertNonNegativeMinor(
      request.invoiceOutstandingMinor,
      `allocations[${index}].invoiceOutstandingMinor`,
    );
    if (amountMinor > outstandingMinor) {
      throw new BusinessRuleError(
        'allocation_exceeds_invoice',
        `${request.invoiceNo} still owes ${outstandingMinor}, so ${amountMinor} cannot be applied ` +
          'to it',
        {
          invoiceId: request.invoiceId,
          invoiceNo: request.invoiceNo,
          outstandingMinor,
          amountMinor,
        },
      );
    }

    return { invoiceId: request.invoiceId, amountMinor };
  });

  const appliedMinor = sumMinor(lines.map((line) => line.amountMinor));
  const availableMinor = paymentAmountMinor - alreadyAppliedMinor;
  if (appliedMinor > availableMinor) {
    throw new BusinessRuleError(
      'allocation_exceeds_payment',
      `this payment has ${availableMinor} left to apply, not ${appliedMinor}`,
      { paymentAmountMinor, alreadyAppliedMinor, availableMinor, appliedMinor },
    );
  }

  return {
    lines,
    appliedMinor,
    unappliedMinor: availableMinor - appliedMinor,
  };
}

/* ------------------------------------------------------------------- balance */

export type BalanceParts = {
  /** Total of every issued invoice in this currency. Void invoices are not owed. */
  invoicedMinor: number;
  /** What cleared payments have applied to those invoices. */
  settledMinor: number;
  /** Cleared money not yet applied to any invoice — the customer's advance (D027). */
  advanceMinor: number;
  /** Cheques taken but not yet cleared. Reported, never subtracted. */
  pendingChequeMinor: number;
};

export type Balance = BalanceParts & {
  /** What the customer owes: issued invoices less cleared money applied to them. */
  outstandingMinor: number;
};

/**
 * A customer balance, for one currency.
 *
 * Pending cheques are deliberately kept out of `outstandingMinor`. A cheque in
 * the drawer is not money, and a balance that counts it flatters the business
 * and hides a bounce. It is reported alongside so the owner can see both.
 *
 * The advance is kept out too, and for the opposite reason: it is real money,
 * but it has not been applied to a bill, and the owner decides which bill it
 * pays (D026). Netting it here would make that decision invisibly.
 */
export function computeBalance(parts: BalanceParts): Balance {
  const invoicedMinor = assertNonNegativeMinor(parts.invoicedMinor, 'invoicedMinor');
  const settledMinor = assertNonNegativeMinor(parts.settledMinor, 'settledMinor');
  const advanceMinor = assertNonNegativeMinor(parts.advanceMinor, 'advanceMinor');
  const pendingChequeMinor = assertNonNegativeMinor(parts.pendingChequeMinor, 'pendingChequeMinor');

  // Allocation refuses to overpay a bill, so this subtraction cannot go
  // negative. If it ever does, an allocation was written without the rules.
  if (settledMinor > invoicedMinor) {
    throw new BusinessRuleError(
      'settled_exceeds_invoiced',
      `cleared payments applied (${settledMinor}) exceed the invoiced total (${invoicedMinor}); ` +
        'an allocation has been written that the rules would have refused',
      { invoicedMinor, settledMinor },
    );
  }

  return {
    invoicedMinor,
    settledMinor,
    advanceMinor,
    pendingChequeMinor,
    outstandingMinor: invoicedMinor - settledMinor,
  };
}

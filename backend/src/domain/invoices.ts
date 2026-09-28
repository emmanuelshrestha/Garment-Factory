/**
 * Invoice business rules that need no database.
 *
 * An invoice is the moment goods become money owed, so everything here is
 * arithmetic on integer minor units and refusals with reasons. Nothing in this
 * file reads a table, which is what makes the money rules cheap to test
 * exhaustively.
 *
 * The rules, and where they come from:
 *
 *   D005  an issued invoice is immutable; corrections are void-and-reissue
 *   D018  money is rounded once per line, half away from zero — and an
 *         invoice line needs no rounding at all, because qty and unit price
 *         are both integers
 *   D022  the due date is typed on the invoice, and cannot precede it
 *   D024  one discount on the whole bill, and it must say why
 */

import { BusinessRuleError, ValidationError } from './errors.ts';
import { parseDate } from './dates.ts';
import { assertNonNegativeMinor, assertPositiveQty, lineTotalMinor, sumMinor } from './money.ts';

export const INVOICE_STATUSES = ['draft', 'issued', 'void'] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === 'string' && (INVOICE_STATUSES as readonly string[]).includes(value);
}

export function assertInvoiceStatus(value: unknown, field = 'status'): InvoiceStatus {
  if (!isInvoiceStatus(value)) {
    throw new ValidationError(
      `status must be one of ${INVOICE_STATUSES.join(', ')}, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

/**
 * Legal status changes.
 *
 * A draft may still be abandoned, an issued invoice may only be voided, and a
 * void invoice is the end of the line. There is deliberately no route back
 * from `issued` to `draft`: that would be editing an issued invoice with extra
 * steps (D005).
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ['issued', 'void'],
  issued: ['void'],
  void: [],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): InvoiceStatus {
  assertInvoiceStatus(from, 'from');
  assertInvoiceStatus(to, 'to');
  if (canTransition(from, to)) {
    return to;
  }
  if (from === 'issued' && to === 'issued') {
    throw new BusinessRuleError(
      'invoice_already_issued',
      'this invoice has already been issued and cannot be issued again',
      { from, to },
    );
  }
  if (from === 'void') {
    throw new BusinessRuleError(
      'invoice_is_void',
      'this invoice has been voided; issue a new one for the same goods instead',
      { from, to },
    );
  }
  throw new BusinessRuleError(
    'illegal_invoice_transition',
    `an invoice cannot go from ${from} to ${to}`,
    { from, to, allowed: ALLOWED_TRANSITIONS[from] },
  );
}

/** Only a draft may be changed. Issued and void invoices are frozen (D005). */
export function isEditableStatus(status: InvoiceStatus): boolean {
  return status === 'draft';
}

/** A standing invoice is one the customer still owes money against. */
export function isStandingStatus(status: InvoiceStatus): boolean {
  return status !== 'void';
}

/* -------------------------------------------------------------------- lines */

export type InvoiceLineRequest = {
  /** The delivered goods being billed. One line per delivery line. */
  deliveryLineId: number;
  variantId: number;
  /** Frozen text, e.g. "Bomber Jacket / Black / L". */
  descriptionSnapshot: string;
  qty: number;
  /** The price the order snapshotted, never today's price list (D005). */
  unitPriceMinor: number;
};

export type InvoiceLinePlan = InvoiceLineRequest & {
  lineTotalMinor: number;
};

export type InvoiceTotals = {
  lines: InvoiceLinePlan[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
};

/**
 * Turn billable delivered goods into invoice lines and a total.
 *
 * Both qty and unit price are whole numbers of minor units, so a line total is
 * exact multiplication — no rounding step exists here to get wrong. The
 * document total is the sum of already-final line amounts and is never
 * re-rounded (D018).
 */
export function buildInvoice(
  requests: readonly InvoiceLineRequest[],
  discount: { minor?: number; reason?: string | null } = {},
): InvoiceTotals {
  if (requests.length === 0) {
    throw new ValidationError('an invoice needs at least one line', 'lines');
  }

  const seen = new Set<number>();
  const lines: InvoiceLinePlan[] = requests.map((request, index) => {
    if (seen.has(request.deliveryLineId)) {
      throw new ValidationError(
        `delivery line ${request.deliveryLineId} appears twice on the same invoice`,
        `lines[${index}].deliveryLineId`,
      );
    }
    seen.add(request.deliveryLineId);

    const qty = assertPositiveQty(request.qty, `lines[${index}].qty`);
    const unitPriceMinor = assertNonNegativeMinor(
      request.unitPriceMinor,
      `lines[${index}].unitPriceMinor`,
    );
    if (request.descriptionSnapshot.trim().length === 0) {
      throw new ValidationError(
        'an invoice line needs a description, because the invoice must still read correctly ' +
          'after the product is renamed',
        `lines[${index}].descriptionSnapshot`,
      );
    }

    return {
      ...request,
      qty,
      unitPriceMinor,
      lineTotalMinor: lineTotalMinor(unitPriceMinor, qty),
    };
  });

  const subtotalMinor = sumMinor(lines.map((line) => line.lineTotalMinor));
  const discountMinor = assertNonNegativeMinor(discount.minor ?? 0, 'discountMinor');

  // D024: a discount with no explanation is an audit hole, the same way an
  // unexplained stock adjustment is.
  if (discountMinor > 0 && (discount.reason ?? '').trim().length === 0) {
    throw new ValidationError(
      'a discount must say why it was given',
      'discountReason',
    );
  }
  if (discountMinor > subtotalMinor) {
    throw new BusinessRuleError(
      'discount_exceeds_invoice',
      `a discount of ${discountMinor} cannot exceed the invoice subtotal of ${subtotalMinor}`,
      { subtotalMinor, discountMinor },
    );
  }

  return {
    lines,
    subtotalMinor,
    discountMinor,
    totalMinor: subtotalMinor - discountMinor,
  };
}

/**
 * D022. The owner types the due date, so the only rule is that money cannot
 * fall due before the bill exists.
 */
export function assertDueDate(invoiceDate: string, dueDate: string | null): string | null {
  if (dueDate === null) {
    return null;
  }
  if (parseDate(dueDate, 'dueDate') < parseDate(invoiceDate, 'invoiceDate')) {
    throw new BusinessRuleError(
      'due_date_before_invoice_date',
      `a bill dated ${invoiceDate} cannot fall due on ${dueDate}`,
      { invoiceDate, dueDate },
    );
  }
  return dueDate;
}

/** The frozen line description: "Bomber Jacket / Black / L". */
export function describeVariant(parts: {
  productName: string;
  colour: string;
  size: string;
}): string {
  return `${parts.productName} / ${parts.colour} / ${parts.size}`;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertDueDate,
  assertInvoiceStatus,
  assertInvoiceTransition,
  buildInvoice,
  canTransition,
  describeVariant,
  INVOICE_STATUSES,
  isEditableStatus,
  isInvoiceStatus,
  isStandingStatus,
  type InvoiceLineRequest,
} from '../../src/domain/invoices.ts';
import { BusinessRuleError, ValidationError } from '../../src/domain/errors.ts';

function line(overrides: Partial<InvoiceLineRequest> = {}): InvoiceLineRequest {
  return {
    deliveryLineId: 1,
    variantId: 1,
    descriptionSnapshot: 'Bomber Jacket / Black / L',
    qty: 10,
    unitPriceMinor: 80000,
    ...overrides,
  };
}

function refuses(attempt: () => unknown, rule: string): void {
  assert.throws(attempt, (error: unknown) => {
    assert.ok(error instanceof BusinessRuleError, `expected a BusinessRuleError, got ${String(error)}`);
    assert.equal(error.rule, rule);
    return true;
  });
}

function rejects(attempt: () => unknown, field: string): void {
  assert.throws(attempt, (error: unknown) => {
    assert.ok(error instanceof ValidationError, `expected a ValidationError, got ${String(error)}`);
    assert.equal(error.field, field);
    return true;
  });
}

/* ------------------------------------------------------------- statuses */

test('the three invoice statuses, and nothing else', () => {
  assert.deepEqual([...INVOICE_STATUSES], ['draft', 'issued', 'void']);
  for (const status of INVOICE_STATUSES) {
    assert.ok(isInvoiceStatus(status));
    assert.equal(assertInvoiceStatus(status), status);
  }
  for (const notAStatus of ['DRAFT', 'cancelled', 'paid', '', null, undefined, 3]) {
    assert.equal(isInvoiceStatus(notAStatus), false, `${String(notAStatus)} is not a status`);
  }
  rejects(() => assertInvoiceStatus('paid'), 'status');
  rejects(() => assertInvoiceStatus('paid', 'invoice.status'), 'invoice.status');
});

test('a draft may be issued or abandoned; an issued invoice may only be voided', () => {
  assert.equal(canTransition('draft', 'issued'), true);
  assert.equal(canTransition('draft', 'void'), true);
  assert.equal(canTransition('issued', 'void'), true);

  // The route that must not exist: un-issuing is editing an issued invoice
  // with extra steps (D005).
  assert.equal(canTransition('issued', 'draft'), false);
  assert.equal(canTransition('void', 'draft'), false);
  assert.equal(canTransition('void', 'issued'), false);
  assert.equal(canTransition('draft', 'draft'), false);
  assert.equal(canTransition('issued', 'issued'), false);
  assert.equal(canTransition('void', 'void'), false);
});

test('refused transitions name the reason the owner would recognise', () => {
  assert.equal(assertInvoiceTransition('draft', 'issued'), 'issued');
  assert.equal(assertInvoiceTransition('issued', 'void'), 'void');

  refuses(() => assertInvoiceTransition('issued', 'issued'), 'invoice_already_issued');
  refuses(() => assertInvoiceTransition('void', 'issued'), 'invoice_is_void');
  refuses(() => assertInvoiceTransition('void', 'void'), 'invoice_is_void');
  refuses(() => assertInvoiceTransition('issued', 'draft'), 'illegal_invoice_transition');
  refuses(() => assertInvoiceTransition('draft', 'draft'), 'illegal_invoice_transition');

  rejects(() => assertInvoiceTransition('paid' as never, 'void'), 'from');
  rejects(() => assertInvoiceTransition('draft', 'paid' as never), 'to');
});

test('only a draft is editable, and only a void invoice stops being owed', () => {
  assert.equal(isEditableStatus('draft'), true);
  assert.equal(isEditableStatus('issued'), false);
  assert.equal(isEditableStatus('void'), false);

  assert.equal(isStandingStatus('draft'), true);
  assert.equal(isStandingStatus('issued'), true);
  assert.equal(isStandingStatus('void'), false);
});

/* ---------------------------------------------------------------- totals */

test('a line total is qty times unit price, exactly', () => {
  const built = buildInvoice([line({ qty: 7, unitPriceMinor: 123457 })]);
  assert.equal(built.lines[0].lineTotalMinor, 864199);
  assert.equal(built.subtotalMinor, 864199);
  assert.equal(built.discountMinor, 0);
  assert.equal(built.totalMinor, 864199);
});

test('the subtotal is the sum of the lines, and the total the subtotal less the discount', () => {
  const built = buildInvoice(
    [
      line({ deliveryLineId: 1, qty: 10, unitPriceMinor: 80000 }),
      line({ deliveryLineId: 2, qty: 3, unitPriceMinor: 125050 }),
      line({ deliveryLineId: 3, qty: 1, unitPriceMinor: 1 }),
    ],
    { minor: 50000, reason: 'agreed with the buyer for the late shipment' },
  );

  assert.equal(built.lines.length, 3);
  assert.deepEqual(
    built.lines.map((l) => l.lineTotalMinor),
    [800000, 375150, 1],
  );
  assert.equal(built.subtotalMinor, 1175151);
  assert.equal(built.discountMinor, 50000);
  assert.equal(built.totalMinor, 1125151);
});

test('a zero-priced line is allowed — a free replacement still needs paperwork', () => {
  const built = buildInvoice([line({ qty: 2, unitPriceMinor: 0 })]);
  assert.equal(built.subtotalMinor, 0);
  assert.equal(built.totalMinor, 0);
});

test('a discount may take the bill to nothing but not below', () => {
  const full = buildInvoice([line({ qty: 1, unitPriceMinor: 80000 })], {
    minor: 80000,
    reason: 'written off, goods faulty',
  });
  assert.equal(full.totalMinor, 0);

  refuses(
    () =>
      buildInvoice([line({ qty: 1, unitPriceMinor: 80000 })], {
        minor: 80001,
        reason: 'one paisa too far',
      }),
    'discount_exceeds_invoice',
  );
});

test('a discount must say why (D024)', () => {
  rejects(() => buildInvoice([line()], { minor: 1000 }), 'discountReason');
  rejects(() => buildInvoice([line()], { minor: 1000, reason: '   ' }), 'discountReason');
  rejects(() => buildInvoice([line()], { minor: 1000, reason: null }), 'discountReason');

  // No discount, no explanation needed.
  assert.equal(buildInvoice([line()], { minor: 0 }).totalMinor, 800000);
  assert.equal(buildInvoice([line()]).totalMinor, 800000);
});

test('an invoice needs lines, and no line twice', () => {
  rejects(() => buildInvoice([]), 'lines');
  rejects(
    () => buildInvoice([line({ deliveryLineId: 4 }), line({ deliveryLineId: 4 })]),
    'lines[1].deliveryLineId',
  );
});

test('quantities and prices are whole, positive, and finite', () => {
  rejects(() => buildInvoice([line({ qty: 0 })]), 'lines[0].qty');
  rejects(() => buildInvoice([line({ qty: -1 })]), 'lines[0].qty');
  rejects(() => buildInvoice([line({ qty: 1.5 })]), 'lines[0].qty');
  rejects(() => buildInvoice([line({ unitPriceMinor: -1 })]), 'lines[0].unitPriceMinor');
  rejects(() => buildInvoice([line({ unitPriceMinor: 10.5 })]), 'lines[0].unitPriceMinor');
  rejects(() => buildInvoice([line({ unitPriceMinor: Number.NaN })]), 'lines[0].unitPriceMinor');
  rejects(() => buildInvoice([line({ unitPriceMinor: Number.POSITIVE_INFINITY })]), 'lines[0].unitPriceMinor');
  rejects(() => buildInvoice([line(), line({ deliveryLineId: 2, qty: -3 })]), 'lines[1].qty');
  rejects(() => buildInvoice([line()], { minor: -1, reason: 'negative' }), 'discountMinor');
});

test('a line must carry a description, so the bill still reads right after a rename', () => {
  rejects(() => buildInvoice([line({ descriptionSnapshot: '' })]), 'lines[0].descriptionSnapshot');
  rejects(() => buildInvoice([line({ descriptionSnapshot: '  \t ' })]), 'lines[0].descriptionSnapshot');
});

test('buildInvoice does not mutate what it was given', () => {
  const requests = [line({ deliveryLineId: 9, qty: 4 })];
  const snapshot = JSON.parse(JSON.stringify(requests));
  buildInvoice(requests, { minor: 100, reason: 'goodwill' });
  assert.deepEqual(JSON.parse(JSON.stringify(requests)), snapshot);
});

/* -------------------------------------------------------------- due date */

test('money cannot fall due before the bill exists (D022)', () => {
  assert.equal(assertDueDate('2026-08-24', null), null);
  assert.equal(assertDueDate('2026-08-24', '2026-08-24'), '2026-08-24', 'due on the day is fine');
  assert.equal(assertDueDate('2026-08-24', '2026-09-23'), '2026-09-23');

  refuses(() => assertDueDate('2026-08-24', '2026-08-23'), 'due_date_before_invoice_date');
  refuses(() => assertDueDate('2026-08-24', '2025-08-24'), 'due_date_before_invoice_date');
  rejects(() => assertDueDate('2026-08-24', '24/08/2026'), 'dueDate');
});

/* ----------------------------------------------------------- description */

test('the frozen description reads product, colour, size', () => {
  assert.equal(
    describeVariant({ productName: 'Bomber Jacket', colour: 'Black', size: 'L' }),
    'Bomber Jacket / Black / L',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertBankEventApplies,
  assertChequeDetails,
  assertClearingDate,
  assertPaymentMethod,
  assertPaymentStatus,
  assertPaymentTransition,
  assertReason,
  canTransition,
  computeBalance,
  isAwaitingBank,
  isPostDatedCheque,
  openingStatus,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  planAllocation,
  settlesReceivables,
  type AllocationRequest,
  type PaymentStatus,
} from '../../src/domain/payments.ts';
import { BusinessRuleError, ValidationError } from '../../src/domain/errors.ts';

function target(overrides: Partial<AllocationRequest> = {}): AllocationRequest {
  return {
    invoiceId: 1,
    amountMinor: 50000,
    invoiceNo: 'INV-2026-00001',
    invoiceStatus: 'issued',
    invoiceCurrency: 'NPR',
    invoiceOutstandingMinor: 50000,
    ...overrides,
  };
}

const cleared = { amountMinor: 50000, currency: 'NPR' as const, alreadyAppliedMinor: 0 };

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

/* -------------------------------------------------------- methods, statuses */

test('the payment methods and statuses are exactly what the schema allows', () => {
  assert.deepEqual(PAYMENT_METHODS, ['cash', 'bank_transfer', 'cheque']);
  assert.deepEqual(PAYMENT_STATUSES, ['pending', 'cleared', 'bounced', 'cancelled']);
  assert.equal(assertPaymentMethod('cheque'), 'cheque');
  assert.equal(assertPaymentStatus('bounced'), 'bounced');
  rejects(() => assertPaymentMethod('upi'), 'method');
  rejects(() => assertPaymentMethod('Cash'), 'method');
  rejects(() => assertPaymentStatus('paid'), 'status');
  rejects(() => assertPaymentMethod(undefined), 'method');
});

test('cash and bank transfer are money in hand; a cheque is a promise', () => {
  assert.equal(openingStatus('cash'), 'cleared');
  assert.equal(openingStatus('bank_transfer'), 'cleared');
  assert.equal(openingStatus('cheque'), 'pending');
});

test('only cleared money reduces what a customer owes', () => {
  assert.equal(settlesReceivables('cleared'), true);
  assert.equal(settlesReceivables('pending'), false);
  assert.equal(settlesReceivables('bounced'), false);
  assert.equal(settlesReceivables('cancelled'), false);
  assert.equal(isAwaitingBank('pending'), true);
  assert.equal(isAwaitingBank('cleared'), false);
});

/* ---------------------------------------------------------------- lifecycle */

test('every legal payment transition is allowed and nothing else is', () => {
  const legal: [PaymentStatus, PaymentStatus][] = [
    ['pending', 'cleared'],
    ['pending', 'bounced'],
    ['pending', 'cancelled'],
    ['cleared', 'bounced'],
    ['cleared', 'cancelled'],
  ];
  for (const [from, to] of legal) {
    assert.equal(canTransition(from, to), true, `${from} -> ${to} should be legal`);
    assert.equal(assertPaymentTransition(from, to), to);
  }

  const illegal = PAYMENT_STATUSES.flatMap((from) =>
    PAYMENT_STATUSES.filter(
      (to) => !legal.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to),
    ).map((to) => [from, to] as [PaymentStatus, PaymentStatus]),
  );
  assert.equal(illegal.length, 11);
  for (const [from, to] of illegal) {
    assert.equal(canTransition(from, to), false, `${from} -> ${to} should be illegal`);
    assert.throws(() => assertPaymentTransition(from, to), BusinessRuleError);
  }
});

test('a cheque already cleared may still bounce, which is the whole point of D028', () => {
  assert.equal(assertPaymentTransition('cleared', 'bounced'), 'bounced');
});

test('each refusal names the situation, not just "illegal"', () => {
  refuses(() => assertPaymentTransition('cleared', 'cleared'), 'payment_already_cleared');
  refuses(() => assertPaymentTransition('bounced', 'cleared'), 'payment_is_bounced');
  refuses(() => assertPaymentTransition('cancelled', 'cleared'), 'payment_is_cancelled');
  refuses(() => assertPaymentTransition('pending', 'pending'), 'illegal_payment_transition');
  rejects(() => assertPaymentTransition('paid' as PaymentStatus, 'cleared'), 'from');
  rejects(() => assertPaymentTransition('pending', 'paid' as PaymentStatus), 'to');
});

test('only a cheque passes through a bank', () => {
  assert.equal(assertBankEventApplies('cheque', 'cleared'), undefined);
  assert.equal(assertBankEventApplies('cheque', 'bounced'), undefined);
  refuses(() => assertBankEventApplies('cash', 'bounced'), 'only_a_cheque_can_bounce');
  refuses(() => assertBankEventApplies('bank_transfer', 'bounced'), 'only_a_cheque_can_bounce');
  refuses(() => assertBankEventApplies('cash', 'cleared'), 'payment_needs_no_clearing');
});

/* ------------------------------------------------------------------ cheques */

test('cheque details belong to cheques and nothing else', () => {
  assert.deepEqual(
    assertChequeDetails({ method: 'cheque', chequeNo: ' 004321 ', chequeDate: '2026-09-15' }),
    { chequeNo: '004321', chequeDate: '2026-09-15' },
  );
  assert.deepEqual(assertChequeDetails({ method: 'cash' }), { chequeNo: null, chequeDate: null });
  assert.deepEqual(
    assertChequeDetails({ method: 'bank_transfer', chequeNo: '', chequeDate: null }),
    { chequeNo: null, chequeDate: null },
  );

  rejects(() => assertChequeDetails({ method: 'cheque', chequeDate: '2026-09-15' }), 'chequeNo');
  rejects(() => assertChequeDetails({ method: 'cheque', chequeNo: '   ', chequeDate: '2026-09-15' }), 'chequeNo');
  rejects(() => assertChequeDetails({ method: 'cheque', chequeNo: '004321' }), 'chequeDate');
  rejects(
    () => assertChequeDetails({ method: 'cheque', chequeNo: '004321', chequeDate: '15/09/2026' }),
    'chequeDate',
  );
  rejects(() => assertChequeDetails({ method: 'cash', chequeNo: '004321' }), 'chequeNo');
  rejects(() => assertChequeDetails({ method: 'cash', chequeDate: '2026-09-15' }), 'chequeDate');
});

test('a post-dated cheque is one dated after today, and today is not post-dated', () => {
  assert.equal(isPostDatedCheque('2026-09-15', '2026-08-24'), true);
  assert.equal(isPostDatedCheque('2026-08-24', '2026-08-24'), false);
  assert.equal(isPostDatedCheque('2026-08-01', '2026-08-24'), false);
  assert.equal(isPostDatedCheque(null, '2026-08-24'), false);
});

test('a cheque cannot have cleared before it was written', () => {
  assert.equal(assertClearingDate('2026-08-20', '2026-08-24'), '2026-08-24');
  assert.equal(assertClearingDate('2026-08-24', '2026-08-24'), '2026-08-24');
  assert.equal(assertClearingDate(null, '2026-08-24'), '2026-08-24');
  refuses(() => assertClearingDate('2026-08-24', '2026-08-20'), 'cleared_before_cheque_date');
  rejects(() => assertClearingDate('2026-08-24', 'yesterday'), 'clearedOn');
});

test('a reason has to say something', () => {
  assert.equal(assertReason('  signature mismatch  ', 'reason', 'say why'), 'signature mismatch');
  rejects(() => assertReason('', 'reason', 'say why'), 'reason');
  rejects(() => assertReason('   ', 'reason', 'say why'), 'reason');
  rejects(() => assertReason(null, 'reason', 'say why'), 'reason');
  rejects(() => assertReason(7, 'reason', 'say why'), 'reason');
});

/* --------------------------------------------------------------- allocation */

test('a payment split across three bills adds up exactly', () => {
  const plan = planAllocation(
    { amountMinor: 1_000_000, currency: 'NPR', alreadyAppliedMinor: 0 },
    [
      target({ invoiceId: 1, invoiceNo: 'INV-2026-00001', amountMinor: 285_000, invoiceOutstandingMinor: 285_000 }),
      target({ invoiceId: 2, invoiceNo: 'INV-2026-00002', amountMinor: 414_999, invoiceOutstandingMinor: 500_000 }),
      target({ invoiceId: 3, invoiceNo: 'INV-2026-00003', amountMinor: 1, invoiceOutstandingMinor: 90_000 }),
    ],
  );
  assert.equal(plan.appliedMinor, 700_000);
  assert.equal(plan.unappliedMinor, 300_000);
  assert.deepEqual(plan.lines, [
    { invoiceId: 1, amountMinor: 285_000 },
    { invoiceId: 2, amountMinor: 414_999 },
    { invoiceId: 3, amountMinor: 1 },
  ]);
});

test('paying a bill in full leaves nothing over; paying part of one leaves the rest owing', () => {
  assert.equal(planAllocation(cleared, [target()]).unappliedMinor, 0);
  const part = planAllocation(cleared, [target({ amountMinor: 20000 })]);
  assert.equal(part.appliedMinor, 20000);
  assert.equal(part.unappliedMinor, 30000);
});

test('money left over is an advance, not an error (D027)', () => {
  const plan = planAllocation(
    { amountMinor: 500_000, currency: 'NPR', alreadyAppliedMinor: 0 },
    [target({ amountMinor: 50_000, invoiceOutstandingMinor: 50_000 })],
  );
  assert.equal(plan.unappliedMinor, 450_000);
});

test('a payment cannot give away more than it holds', () => {
  refuses(
    () => planAllocation(cleared, [target({ amountMinor: 50001, invoiceOutstandingMinor: 90000 })]),
    'allocation_exceeds_payment',
  );
  // Two bills that each fit, but together do not.
  refuses(
    () =>
      planAllocation(cleared, [
        target({ invoiceId: 1, amountMinor: 30000 }),
        target({ invoiceId: 2, invoiceNo: 'INV-2026-00002', amountMinor: 30000 }),
      ]),
    'allocation_exceeds_payment',
  );
  // What it has already applied counts against it.
  refuses(
    () =>
      planAllocation(
        { amountMinor: 50000, currency: 'NPR', alreadyAppliedMinor: 40000 },
        [target({ amountMinor: 10001 })],
      ),
    'allocation_exceeds_payment',
  );
  assert.equal(
    planAllocation(
      { amountMinor: 50000, currency: 'NPR', alreadyAppliedMinor: 40000 },
      [target({ amountMinor: 10000 })],
    ).unappliedMinor,
    0,
  );
});

test('no bill may be paid more than it owes, so a balance cannot go negative', () => {
  refuses(
    () => planAllocation(cleared, [target({ amountMinor: 50000, invoiceOutstandingMinor: 49999 })]),
    'allocation_exceeds_invoice',
  );
  assert.equal(
    planAllocation(cleared, [target({ amountMinor: 49999, invoiceOutstandingMinor: 49999 })]).appliedMinor,
    49999,
  );
  refuses(
    () => planAllocation(cleared, [target({ amountMinor: 1, invoiceOutstandingMinor: 0 })]),
    'allocation_exceeds_invoice',
  );
});

test('only an issued bill can be paid', () => {
  refuses(() => planAllocation(cleared, [target({ invoiceStatus: 'draft' })]), 'invoice_not_issued');
  refuses(() => planAllocation(cleared, [target({ invoiceStatus: 'void' })]), 'invoice_is_void');
});

test('rupees do not settle a dollar bill (D029)', () => {
  refuses(
    () => planAllocation(cleared, [target({ invoiceCurrency: 'USD' })]),
    'payment_currency_mismatch',
  );
  refuses(
    () =>
      planAllocation(
        { amountMinor: 50000, currency: 'USD', alreadyAppliedMinor: 0 },
        [target({ invoiceCurrency: 'INR' })],
      ),
    'payment_currency_mismatch',
  );
  assert.equal(
    planAllocation(
      { amountMinor: 50000, currency: 'USD', alreadyAppliedMinor: 0 },
      [target({ invoiceCurrency: 'USD' })],
    ).appliedMinor,
    50000,
  );
});

test('an allocation must name at least one bill, and each bill only once', () => {
  rejects(() => planAllocation(cleared, []), 'allocations');
  rejects(
    () =>
      planAllocation(cleared, [
        target({ invoiceId: 1, amountMinor: 10000 }),
        target({ invoiceId: 1, amountMinor: 10000 }),
      ]),
    'allocations[1].invoiceId',
  );
});

test('an allocated amount must be a positive whole number of paisa', () => {
  rejects(() => planAllocation(cleared, [target({ amountMinor: 0 })]), 'allocations[0].amountMinor');
  rejects(() => planAllocation(cleared, [target({ amountMinor: -100 })]), 'allocations[0].amountMinor');
  rejects(() => planAllocation(cleared, [target({ amountMinor: 100.5 })]), 'allocations[0].amountMinor');
  rejects(
    () => planAllocation(cleared, [target({ amountMinor: Number.NaN })]),
    'allocations[0].amountMinor',
  );
  rejects(
    () => planAllocation(cleared, [target({ amountMinor: Number.POSITIVE_INFINITY })]),
    'allocations[0].amountMinor',
  );
  rejects(
    () => planAllocation(cleared, [target({ amountMinor: '10000' as unknown as number })]),
    'allocations[0].amountMinor',
  );
});

test('the payment amount itself is guarded before anything is applied', () => {
  rejects(
    () => planAllocation({ amountMinor: 500.5, currency: 'NPR', alreadyAppliedMinor: 0 }, [target()]),
    'amountMinor',
  );
  rejects(
    () => planAllocation({ amountMinor: -500, currency: 'NPR', alreadyAppliedMinor: 0 }, [target()]),
    'amountMinor',
  );
  rejects(
    () => planAllocation({ amountMinor: 500, currency: 'NPR', alreadyAppliedMinor: -1 }, [target()]),
    'alreadyAppliedMinor',
  );
});

test('planning an allocation does not mutate what it was given', () => {
  const requests = [target({ amountMinor: 20000 })];
  const before = JSON.stringify(requests);
  planAllocation(cleared, requests);
  assert.equal(JSON.stringify(requests), before);
});

/* ------------------------------------------------------------------ balance */

test('a balance is invoiced less cleared money applied, and nothing else', () => {
  const balance = computeBalance({
    invoicedMinor: 1_000_000,
    settledMinor: 300_000,
    advanceMinor: 0,
    pendingChequeMinor: 0,
  });
  assert.equal(balance.outstandingMinor, 700_000);
});

test('a pending cheque does not reduce what the customer owes', () => {
  const balance = computeBalance({
    invoicedMinor: 1_000_000,
    settledMinor: 0,
    advanceMinor: 0,
    pendingChequeMinor: 1_000_000,
  });
  assert.equal(balance.outstandingMinor, 1_000_000);
  assert.equal(balance.pendingChequeMinor, 1_000_000);
});

test('an advance is reported but not netted off, because the owner picks the bill', () => {
  const balance = computeBalance({
    invoicedMinor: 500_000,
    settledMinor: 0,
    advanceMinor: 500_000,
    pendingChequeMinor: 0,
  });
  assert.equal(balance.outstandingMinor, 500_000);
  assert.equal(balance.advanceMinor, 500_000);
});

test('a fully settled customer owes nothing', () => {
  assert.equal(
    computeBalance({
      invoicedMinor: 285_000,
      settledMinor: 285_000,
      advanceMinor: 0,
      pendingChequeMinor: 0,
    }).outstandingMinor,
    0,
  );
});

test('a balance that has been overpaid is a bug, and says so', () => {
  refuses(
    () =>
      computeBalance({
        invoicedMinor: 100,
        settledMinor: 101,
        advanceMinor: 0,
        pendingChequeMinor: 0,
      }),
    'settled_exceeds_invoiced',
  );
});

test('every part of a balance must be a whole number of paisa', () => {
  rejects(
    () => computeBalance({ invoicedMinor: 1.5, settledMinor: 0, advanceMinor: 0, pendingChequeMinor: 0 }),
    'invoicedMinor',
  );
  rejects(
    () => computeBalance({ invoicedMinor: 0, settledMinor: -1, advanceMinor: 0, pendingChequeMinor: 0 }),
    'settledMinor',
  );
  rejects(
    () => computeBalance({ invoicedMinor: 0, settledMinor: 0, advanceMinor: 0.01, pendingChequeMinor: 0 }),
    'advanceMinor',
  );
  rejects(
    () => computeBalance({ invoicedMinor: 0, settledMinor: 0, advanceMinor: 0, pendingChequeMinor: -5 }),
    'pendingChequeMinor',
  );
});

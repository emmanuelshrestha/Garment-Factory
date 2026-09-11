/**
 * Payments against a real migrated database.
 *
 * The claim under test, over and over, is the one in CLAUDE.md: *pending
 * cheques do not reduce receivables; cleared payments do; a bounced cheque
 * restores the outstanding balance while preserving history.* Every one of
 * those three clauses has a test that fails if the SQL stops meaning it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  applyPayment,
  bounceCheque,
  cancelPayment,
  clearCheque,
  getCustomerStatement,
  getPayment,
  listPayments,
  listPendingCheques,
  listReceivables,
  recordPayment,
} from '../../src/services/payments.ts';
import { invoiceDelivery, issueInvoice, voidInvoice } from '../../src/services/invoices.ts';
import { listAudit } from '../../src/services/audit.ts';
import { deliverNow } from '../../src/services/deliveries.ts';
import { confirmOrder, createOrder, getOrder } from '../../src/services/orders.ts';
import { recordStockMovement } from '../../src/services/stock.ts';
import { createCustomer } from '../../src/services/customers.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../src/domain/errors.ts';
import { createTestDb, seedVariant, type TestDb } from '../helpers/testDb.ts';

function withDb<T>(fn: (t: TestDb) => T): T {
  const t = createTestDb();
  try {
    return fn(t);
  } finally {
    t.cleanup();
  }
}

/**
 * A customer with one issued invoice behind real stock and a real delivery.
 * Default total is 30 × 80000 = 2,400,000 paisa.
 */
function seedIssuedInvoice(
  t: TestDb,
  options: {
    qty?: number;
    priceMinor?: number;
    customerCode?: string;
    customerName?: string;
    productCode?: string;
    colour?: string;
    currency?: 'NPR' | 'INR' | 'USD';
    fxRateToNpr?: number;
    linePriceMinor?: number;
    invoiceDate?: string;
    issue?: boolean;
  } = {},
) {
  const {
    qty = 30,
    priceMinor = 80000,
    customerCode = 'C-1',
    customerName = 'Kathmandu Traders',
    productCode = 'JKT-A',
    colour = 'Black',
    currency,
    fxRateToNpr,
    linePriceMinor,
    invoiceDate = '2026-08-24',
    issue = true,
  } = options;

  const seeded = seedVariant(t, { productCode, colour, defaultPriceMinor: priceMinor });
  return transaction(t.db, (tx) => {
    const customerId =
      existingCustomer(tx, customerCode) ??
      createCustomer(tx, { code: customerCode, name: customerName, userId: t.userId });
    recordStockMovement(tx, {
      variantId: seeded.variantId,
      qty,
      movementType: 'opening_balance',
      userId: t.userId,
    });
    const orderId = createOrder(tx, {
      customerId,
      orderDate: '2026-08-20',
      lines: [{ variantId: seeded.variantId, qtyOrdered: qty, unitPriceMinor: linePriceMinor }],
      currency,
      fxRateToNpr,
      userId: t.userId,
    });
    confirmOrder(tx, orderId, t.userId);
    const order = getOrder(tx, orderId);
    const dispatched = deliverNow(tx, {
      orderId,
      deliveredAt: invoiceDate,
      lines: [{ orderLineId: order.lines[0].id, qty }],
      userId: t.userId,
    });
    const draft = invoiceDelivery(tx, dispatched.delivery.id, {
      invoiceDate,
      fxRateToNpr,
      userId: t.userId,
    });
    const invoice = issue ? issueInvoice(tx, draft.id, t.userId) : draft;
    return {
      customerId,
      invoice,
      invoiceId: invoice.id,
      totalMinor: invoice.totalMinor,
      deliveryId: dispatched.delivery.id,
      variantId: seeded.variantId,
    };
  });
}

function existingCustomer(
  tx: { db: { prepare: (sql: string) => { get: (...a: never[]) => unknown } } },
  code: string,
) {
  const row = tx.db.prepare('SELECT id FROM customers WHERE code = ?').get(code as never) as
    | { id: number }
    | undefined;
  return row === undefined ? undefined : Number(row.id);
}

function refuses(attempt: () => unknown, rule: string): BusinessRuleError {
  let captured: BusinessRuleError | undefined;
  assert.throws(attempt, (error: unknown) => {
    assert.ok(error instanceof BusinessRuleError, `expected a BusinessRuleError, got ${String(error)}`);
    assert.equal(error.rule, rule);
    captured = error;
    return true;
  });
  return captured as BusinessRuleError;
}

function rejects(attempt: () => unknown, field: string): void {
  assert.throws(attempt, (error: unknown) => {
    assert.ok(error instanceof ValidationError, `expected a ValidationError, got ${String(error)}`);
    assert.equal(error.field, field);
    return true;
  });
}

/** The one figure the whole slice exists to get right. */
function outstanding(t: TestDb, customerId: number, currency = 'NPR'): number {
  return readOnly(t.db, (tx) => {
    const statement = getCustomerStatement(tx, customerId, { asOf: '2026-08-24' });
    const balance = statement.balances.find((b) => b.currency === currency);
    return balance === undefined ? 0 : balance.outstandingMinor;
  });
}

/** Audit actions for one payment, oldest first — `listAudit` returns newest first. */
function actions(t: TestDb, paymentId: number): string[] {
  return readOnly(t.db, (tx) =>
    listAudit(tx, { entityType: 'payment', entityId: paymentId })
      .map((row) => row.action)
      .reverse(),
  );
}

/* ------------------------------------------------------- cash and bank transfer */

test('cash is money the moment it is recorded, and settles the bill it is applied to', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    assert.equal(s.totalMinor, 2_400_000);
    assert.equal(outstanding(t, s.customerId), 2_400_000);

    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );

    assert.equal(payment.paymentNo, 'PAY-2026-00001');
    assert.equal(payment.status, 'cleared');
    assert.equal(payment.clearedAt, '2026-08-24', 'cash clears on the day it arrives');
    assert.equal(payment.appliedMinor, 2_400_000);
    assert.equal(payment.unappliedMinor, 0);
    assert.equal(payment.postDated, false);
    assert.equal(payment.chequeNo, null);
    assert.equal(outstanding(t, s.customerId), 0);

    const receivable = readOnly(t.db, (tx) => listReceivables(tx, { customerId: s.customerId })[0]!);
    assert.equal(receivable.settledMinor, 2_400_000);
    assert.equal(receivable.outstandingMinor, 0);
    assert.deepEqual(actions(t, payment.id), ['payment_recorded', 'payment_applied']);
  });
});

test('a bank transfer is cleared too; only a cheque waits on a bank', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 500_000,
        method: 'bank_transfer',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    assert.equal(payment.status, 'cleared');

    refuses(
      () => transaction(t.db, (tx) => clearCheque(tx, payment.id, { userId: t.userId })),
      'payment_needs_no_clearing',
    );
    refuses(
      () =>
        transaction(t.db, (tx) =>
          bounceCheque(tx, payment.id, { reason: 'recalled', userId: t.userId }),
        ),
      'only_a_cheque_can_bounce',
    );
  });
});

/* ------------------------------------------------------------------ cheques */

test('a cheque in the drawer is not money: the customer still owes the full amount', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cheque',
        chequeNo: '004321',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );

    assert.equal(payment.status, 'pending');
    assert.equal(payment.clearedAt, null);
    assert.equal(payment.appliedMinor, 2_400_000, 'the owner has said which bill it is for');
    assert.equal(payment.unappliedMinor, 0, 'a pending cheque holds no advance; it is not money yet');

    // The whole point: an earmarked cheque has changed nothing that is owed.
    assert.equal(outstanding(t, s.customerId), 2_400_000);
    const statement = readOnly(t.db, (tx) => getCustomerStatement(tx, s.customerId, { asOf: '2026-08-24' }));
    const npr = statement.balances[0]!;
    assert.equal(npr.settledMinor, 0);
    assert.equal(npr.pendingChequeMinor, 2_400_000);
    assert.equal(npr.advanceMinor, 0);
  });
});

test('clearing the cheque settles the bill it was already applied to', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cheque',
        chequeNo: '004321',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );

    const cleared = transaction(t.db, (tx) =>
      clearCheque(tx, payment.id, { clearedOn: '2026-08-26', userId: t.userId }),
    );
    assert.equal(cleared.status, 'cleared');
    assert.equal(cleared.clearedAt, '2026-08-26');
    assert.equal(outstanding(t, s.customerId), 0);

    const statement = readOnly(t.db, (tx) => getCustomerStatement(tx, s.customerId, { asOf: '2026-08-26' }));
    assert.equal(statement.balances[0]!.pendingChequeMinor, 0);
    assert.equal(statement.balances[0]!.settledMinor, 2_400_000);
  });
});

test('a bounced cheque restores the balance and deletes nothing (D028)', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cheque',
        chequeNo: '004321',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) => clearCheque(tx, payment.id, { clearedOn: '2026-08-26', userId: t.userId }));
    assert.equal(outstanding(t, s.customerId), 0);

    const bounced = transaction(t.db, (tx) =>
      bounceCheque(tx, payment.id, {
        reason: 'insufficient funds',
        bouncedOn: '2026-09-02',
        userId: t.userId,
      }),
    );

    assert.equal(bounced.status, 'bounced');
    assert.equal(bounced.bouncedAt, '2026-09-02');
    assert.equal(bounced.bounceReason, 'insufficient funds');
    assert.equal(
      bounced.clearedAt,
      '2026-08-26',
      'the cheque really was banked on the 26th; a bounce must not rewrite that',
    );

    // History intact.
    assert.equal(bounced.allocations.length, 1);
    assert.equal(bounced.allocations[0]!.amountMinor, 2_400_000);
    const allocationRows = readOnly(
      t.db,
      (tx) =>
        (
          tx.db.prepare('SELECT COUNT(*) AS n FROM payment_allocations').get() as { n: number }
        ).n,
    );
    assert.equal(Number(allocationRows), 1, 'the allocation row is history and stays');

    // Balance back.
    assert.equal(outstanding(t, s.customerId), 2_400_000);
    const statement = readOnly(t.db, (tx) => getCustomerStatement(tx, s.customerId, { asOf: '2026-09-02' }));
    assert.equal(statement.balances[0]!.settledMinor, 0);
    assert.equal(statement.balances[0]!.pendingChequeMinor, 0, 'a bounced cheque is not pending');
    assert.equal(statement.balances[0]!.advanceMinor, 0, 'and it is not an advance either');

    assert.deepEqual(actions(t, payment.id), [
      'payment_recorded',
      'payment_applied',
      'payment_cleared',
      'payment_bounced',
    ]);
    const bounceAudit = readOnly(t.db, (tx) =>
      listAudit(tx, { entityType: 'payment', entityId: payment.id }).find(
        (row) => row.action === 'payment_bounced',
      ),
    );
    assert.equal((bounceAudit!.detail as { restoredMinor: number }).restoredMinor, 2_400_000);
  });
});

test('a cheque can bounce straight from pending, and then it never cleared', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cheque',
        chequeNo: '9',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    const bounced = transaction(t.db, (tx) =>
      bounceCheque(tx, payment.id, { reason: 'signature mismatch', bouncedOn: '2026-08-27', userId: t.userId }),
    );
    assert.equal(bounced.clearedAt, null);
    assert.equal(bounced.status, 'bounced');
    assert.equal(outstanding(t, s.customerId), 2_400_000);
  });
});

test('a bounced cheque is the end of that receipt', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cheque',
        chequeNo: '9',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) => bounceCheque(tx, payment.id, { reason: 'no funds', userId: t.userId }));

    refuses(
      () => transaction(t.db, (tx) => clearCheque(tx, payment.id, { userId: t.userId })),
      'payment_is_bounced',
    );
    refuses(
      () => transaction(t.db, (tx) => bounceCheque(tx, payment.id, { reason: 'again', userId: t.userId })),
      'payment_is_bounced',
    );
    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, payment.id, [{ invoiceId: s.invoiceId, amountMinor: 1 }], t.userId),
        ),
      'payment_is_bounced',
    );
  });
});

test('a bounce and a cancellation both have to say why', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cheque',
        chequeNo: '9',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    rejects(
      () => transaction(t.db, (tx) => bounceCheque(tx, payment.id, { reason: '  ', userId: t.userId })),
      'reason',
    );
    rejects(
      () => transaction(t.db, (tx) => cancelPayment(tx, payment.id, { reason: '', userId: t.userId })),
      'reason',
    );
    assert.equal(
      readOnly(t.db, (tx) => getPayment(tx, payment.id, '2026-08-24').status),
      'pending',
      'a refused bounce leaves the payment exactly as it was',
    );
  });
});

test('a cheque cannot have cleared before it was written', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cheque',
        chequeNo: '9',
        chequeDate: '2026-09-15',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    refuses(
      () => transaction(t.db, (tx) => clearCheque(tx, payment.id, { clearedOn: '2026-09-14', userId: t.userId })),
      'cleared_before_cheque_date',
    );
  });
});

test('post-dated cheques are listed apart from the ones that can be banked', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    transaction(t.db, (tx) => {
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 100_000,
        method: 'cheque',
        chequeNo: 'NOW',
        chequeDate: '2026-08-20',
        receivedAt: '2026-08-24',
        userId: t.userId,
      });
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 200_000,
        method: 'cheque',
        chequeNo: 'LATER',
        chequeDate: '2026-12-31',
        receivedAt: '2026-08-24',
        userId: t.userId,
      });
      return null;
    });

    const pending = readOnly(t.db, (tx) => listPendingCheques(tx, { asOf: '2026-08-24' }));
    assert.equal(pending.length, 2);
    const byNo = new Map(pending.map((p) => [p.chequeNo, p]));
    assert.equal(byNo.get('NOW')!.postDated, false);
    assert.equal(byNo.get('LATER')!.postDated, true);

    // On the day it is dated, it is bankable.
    assert.equal(
      readOnly(t.db, (tx) => listPendingCheques(tx, { asOf: '2026-12-31' })).every((p) => !p.postDated),
      true,
    );
  });
});

/* ---------------------------------------------------------------- advances */

test('money arriving before any bill is held as an advance (D027)', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        note: 'deposit against next season',
        userId: t.userId,
      }),
    );

    assert.equal(payment.appliedMinor, 0);
    assert.equal(payment.unappliedMinor, 1_000_000);
    assert.equal(payment.note, 'deposit against next season');

    const statement = readOnly(t.db, (tx) => getCustomerStatement(tx, s.customerId, { asOf: '2026-08-24' }));
    assert.equal(statement.balances[0]!.advanceMinor, 1_000_000);
    assert.equal(
      statement.balances[0]!.outstandingMinor,
      2_400_000,
      'an advance is reported, never netted off: the owner picks the bill (D026)',
    );

    // Applying part of it later leaves the rest as an advance.
    const applied = transaction(t.db, (tx) =>
      applyPayment(tx, payment.id, [{ invoiceId: s.invoiceId, amountMinor: 600_000 }], t.userId),
    );
    assert.equal(applied.appliedMinor, 600_000);
    assert.equal(applied.unappliedMinor, 400_000);
    assert.equal(outstanding(t, s.customerId), 1_800_000);
    assert.equal(
      readOnly(t.db, (tx) => getCustomerStatement(tx, s.customerId, { asOf: '2026-08-24' }).balances[0]!.advanceMinor),
      400_000,
    );
  });
});

test('a pending cheque holds no advance, because it is not money', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cheque',
        chequeNo: '9',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    // Nothing has been applied, so the arithmetic would happily report a
    // million paisa here. It must not: this is the figure the owner reads as
    // "money left to apply", and a cheque in the drawer is not that.
    assert.equal(payment.appliedMinor, 0);
    assert.equal(payment.unappliedMinor, 0);
    assert.equal(
      readOnly(t.db, (tx) => listPayments(tx, { asOf: '2026-08-24' })[0]!.unappliedMinor),
      0,
      'and the list says the same as the detail',
    );

    const npr = readOnly(
      t.db,
      (tx) => getCustomerStatement(tx, s.customerId, { asOf: '2026-08-24' }).balances[0]!,
    );
    assert.equal(npr.advanceMinor, 0);
    assert.equal(npr.pendingChequeMinor, 1_000_000);

    // Once the bank pays it, the same money *is* an advance.
    transaction(t.db, (tx) => clearCheque(tx, payment.id, { clearedOn: '2026-08-25', userId: t.userId }));
    assert.equal(
      readOnly(t.db, (tx) => getPayment(tx, payment.id, '2026-08-25').unappliedMinor),
      1_000_000,
    );
  });
});

/* -------------------------------------------------------------- allocation */

test('no bill can be paid more than it owes, to the paisa', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 3_000_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, payment.id, [{ invoiceId: s.invoiceId, amountMinor: 2_400_001 }], t.userId),
        ),
      'allocation_exceeds_invoice',
    );
    const ok = transaction(t.db, (tx) =>
      applyPayment(tx, payment.id, [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }], t.userId),
    );
    assert.equal(ok.appliedMinor, 2_400_000);
    assert.equal(outstanding(t, s.customerId), 0);
  });
});

test('a pending cheque reserves the bill, so two promises cannot exceed it', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cheque',
        chequeNo: '004321',
        chequeDate: '2026-08-22',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );
    const cash = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 500_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );

    // Were the cheque ignored here, both could be applied in full and the
    // invoice would end up settled for 4,800,000 the moment the cheque cleared.
    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, cash.id, [{ invoiceId: s.invoiceId, amountMinor: 1 }], t.userId),
        ),
      'allocation_exceeds_invoice',
    );
  });
});

test('a payment cannot give away more than it holds', () => {
  withDb((t) => {
    const first = seedIssuedInvoice(t);
    const second = seedIssuedInvoice(t, { colour: 'Navy', qty: 20 });
    assert.equal(second.totalMinor, 1_600_000);

    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: first.customerId,
        amountMinor: 2_000_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(
            tx,
            payment.id,
            [
              { invoiceId: first.invoiceId, amountMinor: 1_000_000 },
              { invoiceId: second.invoiceId, amountMinor: 1_000_001 },
            ],
            t.userId,
          ),
        ),
      'allocation_exceeds_payment',
    );

    const split = transaction(t.db, (tx) =>
      applyPayment(
        tx,
        payment.id,
        [
          { invoiceId: first.invoiceId, amountMinor: 1_000_000 },
          { invoiceId: second.invoiceId, amountMinor: 1_000_000 },
        ],
        t.userId,
      ),
    );
    assert.equal(split.appliedMinor, 2_000_000);
    assert.equal(split.unappliedMinor, 0);
    assert.equal(outstanding(t, first.customerId), 2_400_000 + 1_600_000 - 2_000_000);
  });
});

test('one payment cannot be applied to the same bill twice', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 400_000 }],
        userId: t.userId,
      }),
    );
    rejects(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, payment.id, [{ invoiceId: s.invoiceId, amountMinor: 100_000 }], t.userId),
        ),
      'allocations[0].invoiceId',
    );
    // And not twice inside one call either.
    const other = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 1_000_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    rejects(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(
            tx,
            other.id,
            [
              { invoiceId: s.invoiceId, amountMinor: 100_000 },
              { invoiceId: s.invoiceId, amountMinor: 100_000 },
            ],
            t.userId,
          ),
        ),
      'allocations[1].invoiceId',
    );
  });
});

test("a payment cannot pay another customer's bill", () => {
  withDb((t) => {
    const mine = seedIssuedInvoice(t);
    const theirs = seedIssuedInvoice(t, {
      customerCode: 'C-2',
      customerName: 'Pokhara Outfitters',
      colour: 'Olive',
      qty: 10,
    });
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: mine.customerId,
        amountMinor: 500_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    rejects(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, payment.id, [{ invoiceId: theirs.invoiceId, amountMinor: 100_000 }], t.userId),
        ),
      'allocations[0].invoiceId',
    );
  });
});

test('rupees do not settle a dollar bill (D029)', () => {
  withDb((t) => {
    const npr = seedIssuedInvoice(t);
    const usd = seedIssuedInvoice(t, {
      colour: 'Sand',
      qty: 10,
      currency: 'USD',
      fxRateToNpr: 133_000_000,
      linePriceMinor: 6_000,
    });
    assert.equal(usd.invoice.currency, 'USD');
    assert.equal(usd.totalMinor, 60_000);

    const rupees = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: npr.customerId,
        amountMinor: 500_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, rupees.id, [{ invoiceId: usd.invoiceId, amountMinor: 60_000 }], t.userId),
        ),
      'payment_currency_mismatch',
    );

    const dollars = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: usd.customerId,
        amountMinor: 60_000,
        method: 'cash',
        currency: 'USD',
        fxRateToNpr: 134_000_000,
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: usd.invoiceId, amountMinor: 60_000 }],
        userId: t.userId,
      }),
    );
    assert.equal(dollars.currency, 'USD');
    assert.equal(dollars.fxRateToNpr, 134_000_000, 'the rate is the one at the time of the receipt');
    assert.equal(dollars.appliedMinor, 60_000);
  });
});

test('a statement keeps each currency apart rather than inventing a total', () => {
  withDb((t) => {
    const npr = seedIssuedInvoice(t);
    seedIssuedInvoice(t, {
      colour: 'Sand',
      qty: 10,
      currency: 'USD',
      fxRateToNpr: 133_000_000,
      linePriceMinor: 6_000,
    });

    const statement = readOnly(t.db, (tx) => getCustomerStatement(tx, npr.customerId, { asOf: '2026-08-24' }));
    assert.deepEqual(
      statement.balances.map((b) => [b.currency, b.outstandingMinor, b.invoiceCount]),
      [
        ['NPR', 2_400_000, 1],
        ['USD', 60_000, 1],
      ],
    );
    assert.equal(statement.customerName, 'Kathmandu Traders');
  });
});

test('an advance in a currency the customer has no bills in is still reported', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 20_000,
        method: 'cash',
        currency: 'USD',
        fxRateToNpr: 133_000_000,
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );

    const statement = readOnly(t.db, (tx) =>
      getCustomerStatement(tx, s.customerId, { asOf: '2026-08-24' }),
    );
    assert.deepEqual(
      statement.balances.map((b) => [b.currency, b.invoicedMinor, b.advanceMinor, b.outstandingMinor]),
      [
        ['NPR', 2_400_000, 0, 2_400_000],
        ['USD', 0, 20_000, 0],
      ],
    );
  });
});

test('a balance counts every document, not just the ones the list shows', () => {
  withDb((t) => {
    const first = seedIssuedInvoice(t);
    seedIssuedInvoice(t, { colour: 'Navy', qty: 10 });

    // `limit` caps the display lists only. A balance that stopped counting at
    // the cap would be wrong for exactly the customer who has traded longest.
    const statement = readOnly(t.db, (tx) =>
      getCustomerStatement(tx, first.customerId, { asOf: '2026-08-24', limit: 1 }),
    );
    assert.equal(statement.invoices.length, 1, 'the list is capped');
    assert.equal(statement.balances[0]!.invoiceCount, 2, 'the balance is not');
    assert.equal(statement.balances[0]!.outstandingMinor, 3_200_000);
  });
});

test('only an issued bill can be paid', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t, { issue: false });
    assert.equal(s.invoice.status, 'draft');
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 500_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );
    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, payment.id, [{ invoiceId: s.invoiceId, amountMinor: 100_000 }], t.userId),
        ),
      'invoice_not_issued',
    );
    assert.equal(
      readOnly(t.db, (tx) => listReceivables(tx, { customerId: s.customerId }).length),
      0,
      'a draft is not a receivable',
    );
  });
});

/* ------------------------------------------------------- void and reissue */

test('voiding a paid bill hands the money back to the advance, and the reissue can take it', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );
    assert.equal(outstanding(t, s.customerId), 0);

    transaction(t.db, (tx) => voidInvoice(tx, s.invoiceId, 'wrong discount', t.userId));

    const afterVoid = readOnly(t.db, (tx) => getPayment(tx, payment.id, '2026-08-24'));
    assert.equal(afterVoid.appliedMinor, 0, 'a voided bill owes nothing, so nothing is applied to it');
    assert.equal(afterVoid.historicAppliedMinor, 2_400_000, 'but the allocation row is still there');
    assert.equal(afterVoid.allocations.length, 1);
    assert.equal(afterVoid.allocations[0]!.invoiceStatus, 'void');
    assert.equal(
      afterVoid.unappliedMinor,
      2_400_000,
      'the money did not vanish; it is the customer’s again to allocate',
    );

    const statement = readOnly(t.db, (tx) => getCustomerStatement(tx, s.customerId, { asOf: '2026-08-24' }));
    assert.equal(statement.balances[0]!.invoicedMinor, 0, 'a void invoice is not owed');
    assert.equal(statement.balances[0]!.advanceMinor, 2_400_000);

    // Reissue from the same delivery and settle it with the same money.
    const reissued = transaction(t.db, (tx) => {
      const draft = invoiceDelivery(tx, s.deliveryId, { invoiceDate: '2026-08-25', userId: t.userId });
      return issueInvoice(tx, draft.id, t.userId);
    });
    assert.notEqual(reissued.id, s.invoiceId);
    assert.equal(outstanding(t, s.customerId), 2_400_000);

    const reapplied = transaction(t.db, (tx) =>
      applyPayment(tx, payment.id, [{ invoiceId: reissued.id, amountMinor: 2_400_000 }], t.userId),
    );
    assert.equal(reapplied.appliedMinor, 2_400_000);
    assert.equal(reapplied.historicAppliedMinor, 4_800_000);
    assert.equal(reapplied.allocations.length, 2, 'two rows, because two things happened');
    assert.equal(outstanding(t, s.customerId), 0);
  });
});

/* ------------------------------------------------------------ cancellation */

test('cancelling a receipt takes it off the books and says why', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );
    assert.equal(outstanding(t, s.customerId), 0);

    const cancelled = transaction(t.db, (tx) =>
      cancelPayment(tx, payment.id, {
        reason: 'entered against the wrong customer',
        cancelledOn: '2026-08-25',
        userId: t.userId,
      }),
    );
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledAt, '2026-08-25');
    assert.equal(cancelled.cancelReason, 'entered against the wrong customer');
    assert.equal(cancelled.allocations.length, 1, 'the row stays; only its effect stops');
    assert.equal(cancelled.unappliedMinor, 0, 'a cancelled receipt is not an advance');
    assert.equal(outstanding(t, s.customerId), 2_400_000);

    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(tx, payment.id, [{ invoiceId: s.invoiceId, amountMinor: 1 }], t.userId),
        ),
      'payment_is_cancelled',
    );
    assert.deepEqual(actions(t, payment.id), [
      'payment_recorded',
      'payment_applied',
      'payment_cancelled',
    ]);
  });
});

/* -------------------------------------------------- numbering and listing */

test('a payment number takes its year from the day the money arrived (D017)', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const numbers = transaction(t.db, (tx) => [
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 100_000,
        method: 'cash',
        receivedAt: '2025-12-31',
        userId: t.userId,
      }).paymentNo,
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 100_000,
        method: 'cash',
        receivedAt: '2026-01-02',
        userId: t.userId,
      }).paymentNo,
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 100_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }).paymentNo,
    ]);
    assert.deepEqual(numbers, ['PAY-2025-00001', 'PAY-2026-00001', 'PAY-2026-00002']);
  });
});

test('payments can be listed by customer, status, method and invoice', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const other = seedIssuedInvoice(t, {
      customerCode: 'C-2',
      customerName: 'Pokhara Outfitters',
      colour: 'Olive',
      qty: 10,
    });
    const cash = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 400_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 400_000 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: other.customerId,
        amountMinor: 100_000,
        method: 'cheque',
        chequeNo: '77',
        chequeDate: '2026-08-24',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      assert.equal(listPayments(tx, { asOf: '2026-08-24' }).length, 2);
      assert.equal(listPayments(tx, { customerId: s.customerId, asOf: '2026-08-24' }).length, 1);
      assert.equal(listPayments(tx, { status: 'pending', asOf: '2026-08-24' }).length, 1);
      assert.equal(listPayments(tx, { method: 'cash', asOf: '2026-08-24' }).length, 1);
      const forInvoice = listPayments(tx, { invoiceId: s.invoiceId, asOf: '2026-08-24' });
      assert.deepEqual(
        forInvoice.map((p) => p.id),
        [cash.id],
      );
      return null;
    });
  });
});

test('outstanding-only receivables hide the bills that are settled', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    const second = seedIssuedInvoice(t, { colour: 'Navy', qty: 10 });
    transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: s.customerId,
        amountMinor: 2_400_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        allocations: [{ invoiceId: s.invoiceId, amountMinor: 2_400_000 }],
        userId: t.userId,
      }),
    );
    readOnly(t.db, (tx) => {
      assert.equal(listReceivables(tx, { customerId: s.customerId }).length, 2);
      const open = listReceivables(tx, { customerId: s.customerId, onlyOutstanding: true });
      assert.deepEqual(
        open.map((r) => r.invoiceId),
        [second.invoiceId],
      );
      return null;
    });
  });
});

/* ------------------------------------------------------------- validation */

test('a receipt needs a real customer, a real amount and, for a cheque, its details', () => {
  withDb((t) => {
    const s = seedIssuedInvoice(t);
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          recordPayment(tx, { customerId: 9999, amountMinor: 100, method: 'cash', userId: t.userId }),
        ),
      NotFoundError,
    );
    rejects(
      () =>
        transaction(t.db, (tx) =>
          recordPayment(tx, {
            customerId: s.customerId,
            amountMinor: 0,
            method: 'cash',
            receivedAt: '2026-08-24',
            userId: t.userId,
          }),
        ),
      'amountMinor',
    );
    rejects(
      () =>
        transaction(t.db, (tx) =>
          recordPayment(tx, {
            customerId: s.customerId,
            amountMinor: 100_000,
            method: 'cheque',
            receivedAt: '2026-08-24',
            userId: t.userId,
          }),
        ),
      'chequeNo',
    );
    rejects(
      () =>
        transaction(t.db, (tx) =>
          recordPayment(tx, {
            customerId: s.customerId,
            amountMinor: 100_000,
            method: 'cash',
            chequeNo: '9',
            receivedAt: '2026-08-24',
            userId: t.userId,
          }),
        ),
      'chequeNo',
    );
    rejects(
      () =>
        transaction(t.db, (tx) =>
          recordPayment(tx, {
            customerId: s.customerId,
            amountMinor: 100_000,
            method: 'upi' as never,
            receivedAt: '2026-08-24',
            userId: t.userId,
          }),
        ),
      'method',
    );
    assert.throws(
      () => readOnly(t.db, (tx) => getPayment(tx, 9999, '2026-08-24')),
      NotFoundError,
    );
    assert.throws(
      () => readOnly(t.db, (tx) => getCustomerStatement(tx, 9999, { asOf: '2026-08-24' })),
      NotFoundError,
    );
    assert.throws(
      () =>
        transaction(t.db, (tx) => {
          const payment = recordPayment(tx, {
            customerId: s.customerId,
            amountMinor: 100_000,
            method: 'cash',
            receivedAt: '2026-08-24',
            userId: t.userId,
          });
          return applyPayment(tx, payment.id, [{ invoiceId: 9999, amountMinor: 1 }], t.userId);
        }),
      NotFoundError,
    );
  });
});

test('a failed allocation leaves no half-written rows behind', () => {
  withDb((t) => {
    const first = seedIssuedInvoice(t);
    const second = seedIssuedInvoice(t, { colour: 'Navy', qty: 10 });
    const payment = transaction(t.db, (tx) =>
      recordPayment(tx, {
        customerId: first.customerId,
        amountMinor: 1_000_000,
        method: 'cash',
        receivedAt: '2026-08-24',
        userId: t.userId,
      }),
    );

    // The first line is fine, the second fits its invoice but overdraws the
    // payment. The transaction must take both back — otherwise the customer's
    // balance moves by half an instruction.
    refuses(
      () =>
        transaction(t.db, (tx) =>
          applyPayment(
            tx,
            payment.id,
            [
              { invoiceId: first.invoiceId, amountMinor: 500_000 },
              { invoiceId: second.invoiceId, amountMinor: 600_000 },
            ],
            t.userId,
          ),
        ),
      'allocation_exceeds_payment',
    );

    const after = readOnly(t.db, (tx) => getPayment(tx, payment.id, '2026-08-24'));
    assert.equal(after.allocations.length, 0);
    assert.equal(after.appliedMinor, 0);
    assert.equal(outstanding(t, first.customerId), 2_400_000 + 800_000);
  });
});

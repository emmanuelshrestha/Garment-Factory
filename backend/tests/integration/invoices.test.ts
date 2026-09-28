import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  createInvoice,
  getInvoice,
  invoiceDelivery,
  issueInvoice,
  listBillableLines,
  listInvoices,
  voidInvoice,
} from '../../src/services/invoices.ts';
import { listAudit } from '../../src/services/audit.ts';
import { createDelivery, deliverNow, dispatchDelivery } from '../../src/services/deliveries.ts';
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
 * A confirmed order with stock behind it, ready to deliver.
 *
 * `priceMinor` is the *product's* price at order time. Later tests change the
 * product price afterwards to prove the invoice does not follow it.
 */
function seedConfirmedOrder(
  t: TestDb,
  options: {
    onHand?: number;
    qtyOrdered?: number;
    priceMinor?: number;
    productCode?: string;
    colour?: string;
    customerCode?: string;
    customerName?: string;
    currency?: 'NPR' | 'INR' | 'USD';
    fxRateToNpr?: number;
    /** Needed whenever the order currency is not the product's own. */
    linePriceMinor?: number;
  } = {},
) {
  const {
    onHand = 100,
    qtyOrdered = 30,
    priceMinor = 80000,
    productCode = 'JKT-A',
    colour = 'Black',
    customerCode = 'C-1',
    customerName = 'Kathmandu Traders',
    currency,
    fxRateToNpr,
    linePriceMinor,
  } = options;
  const seeded = seedVariant(t, { productCode, colour, defaultPriceMinor: priceMinor });
  return transaction(t.db, (tx) => {
    const customerId = existingCustomer(tx, customerCode) ??
      createCustomer(tx, { code: customerCode, name: customerName, userId: t.userId });
    if (onHand > 0) {
      recordStockMovement(tx, {
        variantId: seeded.variantId,
        qty: onHand,
        movementType: 'opening_balance',
        userId: t.userId,
      });
    }
    const orderId = createOrder(tx, {
      customerId,
      orderDate: '2026-08-20',
      lines: [{ variantId: seeded.variantId, qtyOrdered, unitPriceMinor: linePriceMinor }],
      currency,
      fxRateToNpr,
      userId: t.userId,
    });
    confirmOrder(tx, orderId, t.userId);
    const order = getOrder(tx, orderId);
    return { ...seeded, customerId, orderId, orderLineId: order.lines[0].id, order };
  });
}

function existingCustomer(tx: { db: { prepare: (sql: string) => { get: (...a: never[]) => unknown } } }, code: string) {
  const row = tx.db.prepare('SELECT id FROM customers WHERE code = ?').get(code as never) as
    | { id: number }
    | undefined;
  return row === undefined ? undefined : Number(row.id);
}

/** Dispatch `qty` from a confirmed order and return the delivery. */
function dispatch(t: TestDb, orderId: number, orderLineId: number, qty: number, deliveredAt = '2026-08-24') {
  return transaction(t.db, (tx) =>
    deliverNow(tx, { orderId, deliveredAt, lines: [{ orderLineId, qty }], userId: t.userId }),
  );
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

/* ------------------------------------------------- what may be billed */

test('only dispatched goods are billable — a draft delivery is not', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t);
    const draft = transaction(t.db, (tx) =>
      createDelivery(tx, {
        orderId: s.orderId,
        deliveredAt: '2026-08-24',
        lines: [{ orderLineId: s.orderLineId, qty: 10 }],
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      assert.deepEqual(listBillableLines(tx), [], 'nothing has left the factory yet');
    });

    refuses(
      () => transaction(t.db, (tx) => invoiceDelivery(tx, draft.id, { userId: t.userId })),
      'delivery_not_dispatched',
    );

    // The same refusal when the line is named outright, not reached through
    // the delivery: both routes must check that the goods actually left.
    const draftLineId = readOnly(t.db, (tx) => {
      const row = tx.db
        .prepare('SELECT id FROM delivery_lines WHERE delivery_id = ?')
        .get(draft.id) as { id: number };
      return Number(row.id);
    });
    refuses(
      () => transaction(t.db, (tx) => createInvoice(tx, { deliveryLineIds: [draftLineId], userId: t.userId })),
      'delivery_not_dispatched',
    );

    transaction(t.db, (tx) => dispatchDelivery(tx, draft.id, t.userId));
    readOnly(t.db, (tx) => {
      const billable = listBillableLines(tx);
      assert.equal(billable.length, 1);
      assert.equal(billable[0].qty, 10);
      assert.equal(billable[0].unitPriceMinor, 80000);
      assert.equal(billable[0].lineTotalMinor, 800000);
      assert.equal(billable[0].description, 'Product JKT-A / Black / L');
    });
  });
});

test('a partial delivery bills only what left the building', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 30 });
    dispatch(t, s.orderId, s.orderLineId, 12);

    const invoice = transaction(t.db, (tx) =>
      createInvoice(tx, { deliveryId: 1, invoiceDate: '2026-08-24', userId: t.userId }),
    );

    assert.equal(invoice.lines.length, 1);
    assert.equal(invoice.lines[0].qty, 12, 'twelve delivered, twelve billed');
    assert.equal(invoice.subtotalMinor, 960000);
    assert.equal(invoice.totalMinor, 960000);

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, s.orderId);
      assert.equal(order.status, 'partially_delivered');
      assert.equal(order.totalMinor, 2400000, 'the order still says 30 pieces');
    });
  });
});

test('several deliveries of one order can go on one invoice (D010)', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 30 });
    dispatch(t, s.orderId, s.orderLineId, 10, '2026-08-22');
    dispatch(t, s.orderId, s.orderLineId, 20, '2026-08-24');

    const invoice = transaction(t.db, (tx) => {
      const billable = listBillableLines(tx);
      assert.equal(billable.length, 2);
      return createInvoice(tx, {
        deliveryLineIds: billable.map((l) => l.deliveryLineId),
        invoiceDate: '2026-08-25',
        userId: t.userId,
      });
    });

    assert.equal(invoice.lines.length, 2);
    assert.equal(invoice.subtotalMinor, 2400000, 'all 30 pieces at 800.00');
    assert.equal(invoice.orderId, s.orderId, 'one order, so the invoice can name it');
    assert.notEqual(invoice.lines[0].deliveryId, invoice.lines[1].deliveryId);
  });
});

test('the same delivered goods cannot be billed twice', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t);
    dispatch(t, s.orderId, s.orderLineId, 10);

    const first = transaction(t.db, (tx) => invoiceDelivery(tx, 1, { userId: t.userId }));
    assert.equal(first.invoiceNo, 'INV-2026-00001');

    // Through the delivery: there is simply nothing left.
    refuses(
      () => transaction(t.db, (tx) => invoiceDelivery(tx, 1, { userId: t.userId })),
      'nothing_left_to_invoice',
    );

    // Naming the line explicitly reaches the database guarantee (D025).
    refuses(
      () =>
        transaction(t.db, (tx) =>
          createInvoice(tx, { deliveryLineIds: [first.lines[0].deliveryLineId], userId: t.userId }),
        ),
      'goods_already_invoiced',
    );

    readOnly(t.db, (tx) => {
      assert.equal(listInvoices(tx).length, 1, 'the refused attempt left nothing behind');
      assert.deepEqual(listBillableLines(tx), []);
    });
  });
});

test('a refused invoice rolls back its document number too', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t);
    dispatch(t, s.orderId, s.orderLineId, 10);

    refuses(
      () =>
        transaction(t.db, (tx) =>
          createInvoice(tx, {
            deliveryId: 1,
            discountMinor: 99999999,
            discountReason: 'far too much',
            userId: t.userId,
          }),
        ),
      'discount_exceeds_invoice',
    );

    const invoice = transaction(t.db, (tx) => invoiceDelivery(tx, 1, { userId: t.userId }));
    assert.equal(invoice.invoiceNo, 'INV-2026-00001', 'numbers are gapless (D017)');
  });
});

test('unknown deliveries and delivered lines are not found, not invented', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t);
    dispatch(t, s.orderId, s.orderLineId, 10);

    assert.throws(
      () => transaction(t.db, (tx) => invoiceDelivery(tx, 99, { userId: t.userId })),
      (error: unknown) => error instanceof NotFoundError,
    );
    assert.throws(
      () => transaction(t.db, (tx) => createInvoice(tx, { deliveryLineIds: [1, 77], userId: t.userId })),
      (error: unknown) => error instanceof NotFoundError,
    );
    assert.throws(
      () => readOnly(t.db, (tx) => getInvoice(tx, 1)),
      (error: unknown) => error instanceof NotFoundError,
    );

    rejects(() => transaction(t.db, (tx) => createInvoice(tx, { userId: t.userId })), 'deliveryId');
    rejects(
      () => transaction(t.db, (tx) => createInvoice(tx, { deliveryId: 1, deliveryLineIds: [1], userId: t.userId })),
      'deliveryId',
    );
    rejects(
      () => transaction(t.db, (tx) => createInvoice(tx, { deliveryLineIds: [], userId: t.userId })),
      'deliveryLineIds',
    );
    rejects(
      () => transaction(t.db, (tx) => createInvoice(tx, { deliveryLineIds: [1, 1], userId: t.userId })),
      'deliveryLineIds',
    );
  });
});

test('one invoice cannot span two customers or two currencies', () => {
  withDb((t) => {
    const a = seedConfirmedOrder(t, { customerCode: 'C-1', customerName: 'Kathmandu Traders' });
    const b = seedConfirmedOrder(t, {
      productCode: 'JKT-B',
      customerCode: 'C-2',
      customerName: 'Pokhara Outfitters',
    });
    dispatch(t, a.orderId, a.orderLineId, 5);
    dispatch(t, b.orderId, b.orderLineId, 5);

    refuses(
      () => transaction(t.db, (tx) => createInvoice(tx, { deliveryLineIds: [1, 2], userId: t.userId })),
      'invoice_spans_customers',
    );

    const c = seedConfirmedOrder(t, {
      productCode: 'JKT-C',
      customerCode: 'C-1',
      currency: 'USD',
      fxRateToNpr: 138_000_000,
      linePriceMinor: 5800,
    });
    dispatch(t, c.orderId, c.orderLineId, 5);
    refuses(
      () => transaction(t.db, (tx) => createInvoice(tx, { deliveryLineIds: [1, 3], userId: t.userId })),
      'invoice_spans_currencies',
    );
  });
});

/* ------------------------------------------------------------- the price */

test('the invoice charges the price the order snapshotted, not today\'s price list', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { priceMinor: 80000, qtyOrdered: 10 });
    dispatch(t, s.orderId, s.orderLineId, 10);

    // The owner raises the product price after the goods went out.
    transaction(t.db, (tx) => {
      tx.db.prepare('UPDATE products SET default_price_minor = ? WHERE id = ?').run(150000, s.productId);
    });

    const invoice = transaction(t.db, (tx) => invoiceDelivery(tx, 1, { userId: t.userId }));
    assert.equal(invoice.lines[0].unitPriceMinor, 80000, 'the order agreed 800.00 a piece');
    assert.equal(invoice.totalMinor, 800000);
  });
});

test('the invoice description survives the product being renamed', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 5 });
    dispatch(t, s.orderId, s.orderLineId, 5);
    const invoice = transaction(t.db, (tx) => {
      const created = invoiceDelivery(tx, 1, { userId: t.userId });
      issueInvoice(tx, created.id, t.userId);
      return created;
    });
    assert.equal(invoice.lines[0].description, 'Product JKT-A / Black / L');

    transaction(t.db, (tx) => {
      tx.db.prepare('UPDATE products SET name = ? WHERE id = ?').run('Renamed Parka', s.productId);
    });

    readOnly(t.db, (tx) => {
      assert.equal(
        getInvoice(tx, invoice.id).lines[0].description,
        'Product JKT-A / Black / L',
        'an issued invoice reads the same for ever',
      );
    });
  });
});

test('a foreign-currency invoice keeps the order\'s currency and its own FX rate', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, {
      currency: 'USD',
      fxRateToNpr: 138_000_000,
      linePriceMinor: 5800,
      qtyOrdered: 4,
    });
    dispatch(t, s.orderId, s.orderLineId, 4);

    const invoice = transaction(t.db, (tx) =>
      invoiceDelivery(tx, 1, { fxRateToNpr: 139_500_000, userId: t.userId }),
    );
    assert.equal(invoice.currency, 'USD');
    assert.equal(invoice.fxRateToNpr, 139_500_000, 'the rate on the day the bill was written');
    assert.equal(invoice.totalMinor, 23200, 'USD 58.00 a piece, four pieces');

    const npr = transaction(t.db, (tx) => {
      const s2 = seedConfirmedOrderInside(tx, t);
      return invoiceDelivery(tx, s2.deliveryId, { userId: t.userId });
    });
    assert.equal(npr.currency, 'NPR');
    assert.equal(npr.fxRateToNpr, 1_000_000, 'NPR is pinned to one');
  });
});

/** A second order/delivery created inside an existing transaction. */
function seedConfirmedOrderInside(tx: Parameters<typeof createOrder>[0], t: TestDb) {
  const seeded = seedVariant(t, { productCode: 'JKT-N', defaultPriceMinor: 50000 });
  recordStockMovement(tx, {
    variantId: seeded.variantId,
    qty: 10,
    movementType: 'opening_balance',
    userId: t.userId,
  });
  const customerId = createCustomer(tx, { code: 'C-NPR', name: 'Lalitpur Retail', userId: t.userId });
  const orderId = createOrder(tx, {
    customerId,
    orderDate: '2026-08-20',
    lines: [{ variantId: seeded.variantId, qtyOrdered: 3 }],
    userId: t.userId,
  });
  confirmOrder(tx, orderId, t.userId);
  const orderLineId = getOrder(tx, orderId).lines[0].id;
  const delivery = deliverNow(tx, {
    orderId,
    deliveredAt: '2026-08-24',
    lines: [{ orderLineId, qty: 3 }],
    userId: t.userId,
  }).delivery;
  return { deliveryId: delivery.id };
}

/* -------------------------------------------------------- the discount */

test('a discount is one figure on the whole bill, and it must say why (D024)', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 10 });
    dispatch(t, s.orderId, s.orderLineId, 10);

    rejects(
      () => transaction(t.db, (tx) => invoiceDelivery(tx, 1, { discountMinor: 50000, userId: t.userId })),
      'discountReason',
    );

    const invoice = transaction(t.db, (tx) =>
      invoiceDelivery(tx, 1, {
        discountMinor: 50000,
        discountReason: '  agreed for the late shipment  ',
        userId: t.userId,
      }),
    );
    assert.equal(invoice.subtotalMinor, 800000);
    assert.equal(invoice.discountMinor, 50000);
    assert.equal(invoice.totalMinor, 750000);
    assert.equal(invoice.discountReason, 'agreed for the late shipment');
  });
});

/* --------------------------------------------------------- the due date */

test('the due date is typed on the invoice and cannot precede it (D022)', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 20 });
    dispatch(t, s.orderId, s.orderLineId, 10, '2026-08-22');
    dispatch(t, s.orderId, s.orderLineId, 10, '2026-08-23');

    const cash = transaction(t.db, (tx) => invoiceDelivery(tx, 1, { invoiceDate: '2026-08-24', userId: t.userId }));
    assert.equal(cash.dueDate, null, 'a cash sale has no due date');

    refuses(
      () =>
        transaction(t.db, (tx) =>
          invoiceDelivery(tx, 2, { invoiceDate: '2026-08-24', dueDate: '2026-08-01', userId: t.userId }),
        ),
      'due_date_before_invoice_date',
    );

    const credit = transaction(t.db, (tx) =>
      invoiceDelivery(tx, 2, { invoiceDate: '2026-08-24', dueDate: '2026-09-23', userId: t.userId }),
    );
    assert.equal(credit.dueDate, '2026-09-23');
  });
});

/* --------------------------------------------------- issue, void, reissue */

test('an issued invoice is frozen; a void needs a reason', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 10 });
    dispatch(t, s.orderId, s.orderLineId, 10);
    const draft = transaction(t.db, (tx) => invoiceDelivery(tx, 1, { userId: t.userId }));
    assert.equal(draft.status, 'draft');

    const issued = transaction(t.db, (tx) => issueInvoice(tx, draft.id, t.userId));
    assert.equal(issued.status, 'issued');

    refuses(() => transaction(t.db, (tx) => issueInvoice(tx, draft.id, t.userId)), 'invoice_already_issued');
    rejects(() => transaction(t.db, (tx) => voidInvoice(tx, draft.id, '   ', t.userId)), 'reason');

    const voided = transaction(t.db, (tx) => voidInvoice(tx, draft.id, 'wrong quantity typed', t.userId));
    assert.equal(voided.status, 'void');
    assert.equal(voided.voidReason, 'wrong quantity typed');
    assert.ok(voided.voidedAt !== null);
    assert.equal(voided.lines.length, 1, 'the lines stay for the record');
    assert.equal(voided.totalMinor, 800000, 'and so does the figure it once claimed');

    refuses(() => transaction(t.db, (tx) => issueInvoice(tx, draft.id, t.userId)), 'invoice_is_void');
    refuses(() => transaction(t.db, (tx) => voidInvoice(tx, draft.id, 'again', t.userId)), 'invoice_is_void');
  });
});

test('void and reissue bills the same goods again, and both invoices survive (D005)', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 10 });
    dispatch(t, s.orderId, s.orderLineId, 10);

    const wrong = transaction(t.db, (tx) => {
      const created = invoiceDelivery(tx, 1, { discountMinor: 100000, discountReason: 'typed by mistake', userId: t.userId });
      return issueInvoice(tx, created.id, t.userId);
    });
    assert.equal(wrong.totalMinor, 700000);

    readOnly(t.db, (tx) => {
      assert.deepEqual(listBillableLines(tx), [], 'a standing invoice blocks re-billing');
    });

    transaction(t.db, (tx) => voidInvoice(tx, wrong.id, 'discount was not agreed', t.userId));

    const reissued = readOnly(t.db, (tx) => {
      const billable = listBillableLines(tx);
      assert.equal(billable.length, 1, 'voiding freed the goods to be billed correctly');
      return billable[0];
    });
    assert.equal(reissued.deliveryLineId, wrong.lines[0].deliveryLineId, 'the very same delivered line');

    const right = transaction(t.db, (tx) => {
      const created = invoiceDelivery(tx, 1, { userId: t.userId });
      return issueInvoice(tx, created.id, t.userId);
    });
    assert.equal(right.invoiceNo, 'INV-2026-00002');
    assert.equal(right.totalMinor, 800000);

    readOnly(t.db, (tx) => {
      const all = listInvoices(tx);
      assert.equal(all.length, 2, 'nothing was deleted');
      assert.deepEqual(
        all.map((i) => [i.invoiceNo, i.status]),
        [
          ['INV-2026-00002', 'issued'],
          ['INV-2026-00001', 'void'],
        ],
      );
      assert.equal(getInvoice(tx, wrong.id).totalMinor, 700000, 'the void invoice still reads as it did');
      assert.deepEqual(listBillableLines(tx), [], 'and the new invoice blocks again');
    });
  });
});

test('every invoice transition leaves an audit row (D013)', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 10 });
    dispatch(t, s.orderId, s.orderLineId, 10);
    const invoice = transaction(t.db, (tx) => {
      const created = invoiceDelivery(tx, 1, { userId: t.userId });
      issueInvoice(tx, created.id, t.userId);
      voidInvoice(tx, created.id, 'customer cancelled after dispatch', t.userId);
      return created;
    });

    readOnly(t.db, (tx) => {
      const trail = listAudit(tx, { entityType: 'invoice', entityId: invoice.id });
      assert.deepEqual(
        trail.map((row) => row.action),
        ['invoice_voided', 'invoice_issued', 'invoice_created'],
      );
      for (const row of trail) {
        assert.equal(row.userId, t.userId);
        assert.ok(row.at.length > 0);
      }
      assert.equal(trail[0].detail?.reason, 'customer cancelled after dispatch');
      assert.equal(trail[2].detail?.invoiceNo, 'INV-2026-00001');
    });
  });
});

test('a failed invoice writes no audit row either', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 10 });
    dispatch(t, s.orderId, s.orderLineId, 10);
    refuses(
      () =>
        transaction(t.db, (tx) =>
          invoiceDelivery(tx, 1, { discountMinor: 900000, discountReason: 'too much', userId: t.userId }),
        ),
      'discount_exceeds_invoice',
    );
    readOnly(t.db, (tx) => {
      assert.deepEqual(listAudit(tx, { entityType: 'invoice' }), []);
    });
  });
});

/* -------------------------------------------------------------- listing */

test('invoices list newest first and filter by customer, order and status', () => {
  withDb((t) => {
    const a = seedConfirmedOrder(t, { customerCode: 'C-1', qtyOrdered: 20 });
    const b = seedConfirmedOrder(t, { productCode: 'JKT-B', customerCode: 'C-2', customerName: 'Pokhara Outfitters', qtyOrdered: 5 });
    dispatch(t, a.orderId, a.orderLineId, 10, '2026-08-22');
    dispatch(t, a.orderId, a.orderLineId, 10, '2026-08-23');
    dispatch(t, b.orderId, b.orderLineId, 5, '2026-08-24');

    const first = transaction(t.db, (tx) => invoiceDelivery(tx, 1, { userId: t.userId }));
    transaction(t.db, (tx) => issueInvoice(tx, first.id, t.userId));
    transaction(t.db, (tx) => invoiceDelivery(tx, 2, { userId: t.userId }));
    transaction(t.db, (tx) => invoiceDelivery(tx, 3, { userId: t.userId }));

    readOnly(t.db, (tx) => {
      assert.deepEqual(
        listInvoices(tx).map((i) => i.invoiceNo),
        ['INV-2026-00003', 'INV-2026-00002', 'INV-2026-00001'],
      );
      assert.equal(listInvoices(tx, { customerId: a.customerId }).length, 2);
      assert.equal(listInvoices(tx, { customerId: b.customerId }).length, 1);
      assert.equal(listInvoices(tx, { orderId: a.orderId }).length, 2);
      assert.deepEqual(
        listInvoices(tx, { status: 'issued' }).map((i) => i.invoiceNo),
        ['INV-2026-00001'],
      );
      assert.equal(listInvoices(tx, { status: 'void' }).length, 0);
      assert.equal(listInvoices(tx, { limit: 1 }).length, 1);

      const summary = listInvoices(tx, { customerId: b.customerId })[0];
      assert.equal(summary.customerName, 'Pokhara Outfitters');
      assert.equal(summary.lineCount, 1);
      assert.equal(summary.totalMinor, 400000);

      assert.equal(listBillableLines(tx, { customerId: a.customerId }).length, 0);
      assert.equal(listBillableLines(tx, { deliveryId: 999 }).length, 0);
    });
  });
});

test('invoice numbers take the year from the invoice date, not from today', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { qtyOrdered: 10 });
    dispatch(t, s.orderId, s.orderLineId, 10, '2025-12-31');
    const invoice = transaction(t.db, (tx) =>
      invoiceDelivery(tx, 1, { invoiceDate: '2025-12-31', userId: t.userId }),
    );
    assert.equal(invoice.invoiceNo, 'INV-2025-00001');
  });
});

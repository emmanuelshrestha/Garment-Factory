import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  addOrderLine,
  allocateOrder,
  cancelOrder,
  closeOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  listShortages,
  releaseOrderAllocations,
  removeOrderLine,
  updateOrderLine,
} from '../../src/services/orders.ts';
import { getAvailableQty, getStockOnHand, recordStockMovement } from '../../src/services/stock.ts';
import { createCustomer } from '../../src/services/customers.ts';
import { setProductPrice, setVariantPrice } from '../../src/services/catalogue.ts';
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

/** A customer, a priced variant, and some stock on the shelf. */
function seedSellable(
  t: TestDb,
  options: { onHand?: number; defaultPriceMinor?: number; productCode?: string; size?: string } = {},
) {
  const { onHand = 0, defaultPriceMinor = 80000, productCode = 'JKT-A', size = 'L' } = options;
  const seeded = seedVariant(t, { productCode, size, defaultPriceMinor });
  return transaction(t.db, (tx) => {
    const customerId = createCustomer(tx, {
      code: `C-${productCode}-${size}`,
      name: 'Kathmandu Traders',
      userId: t.userId,
    });
    if (onHand > 0) {
      recordStockMovement(tx, {
        variantId: seeded.variantId,
        qty: onHand,
        movementType: 'opening_balance',
        userId: t.userId,
      });
    }
    return { ...seeded, customerId };
  });
}

test('a draft order snapshots the catalogue price and totals from its lines', () => {
  withDb((t) => {
    const s = seedSellable(t, { defaultPriceMinor: 80000 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        orderDate: '2026-08-23',
        requiredDate: '2026-09-15',
        lines: [{ variantId: s.variantId, qtyOrdered: 3 }],
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.orderNo, 'ORD-2026-00001');
      assert.equal(order.status, 'draft');
      assert.equal(order.currency, 'NPR');
      assert.equal(order.fxRateToNpr, 1_000_000, 'NPR is pinned to exactly 1.0');
      assert.equal(order.lines.length, 1);
      assert.equal(order.lines[0]?.unitPriceMinor, 80000);
      assert.equal(order.lines[0]?.lineTotalMinor, 240000);
      assert.equal(order.totalMinor, 240000);
      assert.equal(order.lines[0]?.qtyAllocated, 0, 'a draft reserves nothing');
    });
  });
});

test('D005: changing the catalogue price does not touch an existing order', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 100, defaultPriceMinor: 80000 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 10 }],
        userId: t.userId,
      }),
    );

    transaction(t.db, (tx) => {
      setProductPrice(tx, { productId: s.productId, priceMinor: 99000, userId: t.userId });
      setVariantPrice(tx, { variantId: s.variantId, priceMinor: 120000, userId: t.userId });
    });

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.lines[0]?.unitPriceMinor, 80000, 'the snapshot is what was agreed');
      assert.equal(order.totalMinor, 800000);
    });

    // Confirmation must not re-resolve the price: this is the moment a naive
    // implementation would quietly reprice the order upward.
    transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));
    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.status, 'confirmed');
      assert.equal(order.lines[0]?.unitPriceMinor, 80000, 'still the agreed price after confirmation');
      assert.equal(order.totalMinor, 800000);
    });

    // And a price change after confirmation cannot reach it either.
    transaction(t.db, (tx) =>
      setVariantPrice(tx, { variantId: s.variantId, priceMinor: 150000, userId: t.userId }),
    );
    readOnly(t.db, (tx) => assert.equal(getOrder(tx, orderId).totalMinor, 800000));

    // A new order picks up the current price, and the variant override wins (D009).
    const laterId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 1 }],
        userId: t.userId,
      }),
    );
    readOnly(t.db, (tx) => {
      assert.equal(getOrder(tx, laterId).lines[0]?.unitPriceMinor, 150000);
    });
  });
});

test('business rule 14: a per-order price override is honoured and snapshotted', () => {
  withDb((t) => {
    const s = seedSellable(t, { defaultPriceMinor: 80000 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 100, unitPriceMinor: 72000, note: 'Bulk price' }],
        userId: t.userId,
      }),
    );
    readOnly(t.db, (tx) => {
      const line = getOrder(tx, orderId).lines[0];
      assert.equal(line?.unitPriceMinor, 72000);
      assert.equal(line?.lineTotalMinor, 7_200_000);
      assert.equal(line?.note, 'Bulk price');
    });
  });
});

test('D011: a foreign-currency order carries its own rate and refuses a converted price', () => {
  withDb((t) => {
    const s = seedSellable(t, { defaultPriceMinor: 80000 });

    // The variant is priced in NPR, so an INR order must state the INR price
    // rather than have one derived from the rate.
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, {
            customerId: s.customerId,
            currency: 'INR',
            fxRateToNpr: 1_600_000,
            lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
            userId: t.userId,
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'price_currency_mismatch');
        return true;
      },
    );

    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        currency: 'INR',
        fxRateToNpr: 1_600_000,
        lines: [{ variantId: s.variantId, qtyOrdered: 5, unitPriceMinor: 85000 }],
        userId: t.userId,
      }),
    );
    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.currency, 'INR');
      assert.equal(order.fxRateToNpr, 1_600_000);
      assert.equal(order.totalMinor, 425000, 'the total stays in the order currency');
    });

    // A foreign-currency order without a rate is refused rather than guessed.
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, {
            customerId: s.customerId,
            currency: 'USD',
            lines: [{ variantId: s.variantId, qtyOrdered: 1, unitPriceMinor: 1200 }],
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
  });
});

test('D004: confirming reserves stock without writing a single movement', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 100 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 40 }],
        userId: t.userId,
      }),
    );

    const before = readOnly(t.db, (tx) => getStockOnHand(tx, s.variantId));
    const result = transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));

    assert.equal(result.totalShortageQty, 0);
    assert.equal(result.plans[0]?.allocateQty, 40);

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), before, 'nothing physically moved');
      assert.equal(getStockOnHand(tx, s.variantId), 100);
      assert.equal(getAvailableQty(tx, s.variantId), 60, 'but 40 are promised away');
      const movements = t.db
        .prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE variant_id = ?')
        .get(s.variantId) as { n: number };
      assert.equal(Number(movements.n), 1, 'only the opening balance is in the ledger');
      const order = getOrder(tx, orderId);
      assert.equal(order.status, 'confirmed');
      assert.equal(order.lines[0]?.qtyAllocated, 40);
      assert.equal(order.lines[0]?.shortageQty, 0);
    });
  });
});

test('a shortage is reported, not refused: 30 on the shelf against an order for 50', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 30 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 50 }],
        userId: t.userId,
      }),
    );

    const result = transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));
    assert.equal(result.plans[0]?.allocateQty, 30);
    assert.equal(result.totalShortageQty, 20);

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.status, 'confirmed', 'the order stands; production covers the rest');
      assert.equal(order.lines[0]?.qtyAllocated, 30);
      assert.equal(order.lines[0]?.shortageQty, 20);
      assert.equal(getAvailableQty(tx, s.variantId), 0);
      assert.equal(getStockOnHand(tx, s.variantId), 30);
    });
  });
});

test('a short order tops up once stock arrives, and re-running changes nothing', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 30 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 50 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));

    // 25 more pieces arrive. The order needs 20 of them.
    transaction(t.db, (tx) =>
      recordStockMovement(tx, {
        variantId: s.variantId,
        qty: 25,
        movementType: 'adjustment_in',
        reason: 'Found in the store room',
        userId: t.userId,
      }),
    );

    const topUp = transaction(t.db, (tx) => allocateOrder(tx, orderId, t.userId));
    assert.equal(topUp.plans[0]?.allocateQty, 20);
    assert.equal(topUp.totalShortageQty, 0);

    const again = transaction(t.db, (tx) => allocateOrder(tx, orderId, t.userId));
    assert.equal(again.plans[0]?.allocateQty, 0, 'idempotent: nothing outstanding, nothing reserved');

    readOnly(t.db, (tx) => {
      assert.equal(getOrder(tx, orderId).lines[0]?.qtyAllocated, 50);
      assert.equal(getAvailableQty(tx, s.variantId), 5);
      assert.equal(getStockOnHand(tx, s.variantId), 55);
    });
  });
});

test('two orders cannot reserve the same pieces', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 50 });
    const firstId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 40 }],
        userId: t.userId,
      }),
    );
    const secondId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 40 }],
        userId: t.userId,
      }),
    );

    transaction(t.db, (tx) => confirmOrder(tx, firstId, t.userId));
    const second = transaction(t.db, (tx) => confirmOrder(tx, secondId, t.userId));

    assert.equal(second.plans[0]?.allocateQty, 10, 'only 10 were left unpromised');
    assert.equal(second.totalShortageQty, 30);
    readOnly(t.db, (tx) => {
      assert.equal(getAvailableQty(tx, s.variantId), 0);
      assert.equal(getStockOnHand(tx, s.variantId), 50);
    });
  });
});

test('cancelling releases the reservation and keeps the history', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 50 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 40 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));
    readOnly(t.db, (tx) => assert.equal(getAvailableQty(tx, s.variantId), 10));

    transaction(t.db, (tx) => cancelOrder(tx, orderId, 'Customer changed their mind'));

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.status, 'cancelled');
      assert.equal(order.lines[0]?.qtyAllocated, 0);
      assert.equal(getAvailableQty(tx, s.variantId), 50, 'the stock is free again');
      assert.equal(getStockOnHand(tx, s.variantId), 50, 'and never moved');
      assert.match(order.notes ?? '', /Customer changed their mind/);
    });

    // The released reservation is still on record, not deleted.
    const rows = t.db
      .prepare(
        `SELECT status, released_at FROM stock_allocations a
           JOIN order_lines l ON l.id = a.order_line_id WHERE l.order_id = ?`,
      )
      .all(orderId) as { status: string; released_at: string | null }[];
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, 'released');
    assert.ok(rows[0]?.released_at, 'when it was released is recorded');
  });
});

test('cancelling needs a reason and cannot happen twice', () => {
  withDb((t) => {
    const s = seedSellable(t);
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      }),
    );
    assert.throws(() => transaction(t.db, (tx) => cancelOrder(tx, orderId, '   ')), ValidationError);
    transaction(t.db, (tx) => cancelOrder(tx, orderId, 'Duplicate entry'));
    assert.throws(() => transaction(t.db, (tx) => cancelOrder(tx, orderId, 'again')), BusinessRuleError);
  });
});

test('a confirmed order is frozen: no new lines, no price edits', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 10 });
    const other = seedVariant(t, { productCode: 'JKT-A', size: 'XL' });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));

    for (const attempt of [
      () => transaction(t.db, (tx) => addOrderLine(tx, orderId, { variantId: other.variantId, qtyOrdered: 1 })),
      () => transaction(t.db, (tx) => updateOrderLine(tx, orderId, 1, { unitPriceMinor: 1 })),
      () => transaction(t.db, (tx) => updateOrderLine(tx, orderId, 1, { qtyOrdered: 99 })),
      () => transaction(t.db, (tx) => removeOrderLine(tx, orderId, 1)),
    ]) {
      assert.throws(attempt, (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'order_not_editable');
        return true;
      });
    }

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.lines.length, 1);
      assert.equal(order.lines[0]?.qtyOrdered, 5);
      assert.equal(order.lines[0]?.unitPriceMinor, 80000);
    });
  });
});

test('a draft can be edited freely', () => {
  withDb((t) => {
    const s = seedSellable(t);
    const second = seedVariant(t, { productCode: 'JKT-A', size: 'XL' });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      }),
    );
    const secondLineId = transaction(t.db, (tx) =>
      addOrderLine(tx, orderId, { variantId: second.variantId, qtyOrdered: 2 }),
    );
    transaction(t.db, (tx) => updateOrderLine(tx, orderId, secondLineId, { qtyOrdered: 7, unitPriceMinor: 75000 }));

    readOnly(t.db, (tx) => {
      const order = getOrder(tx, orderId);
      assert.equal(order.lines.length, 2);
      assert.equal(order.totalMinor, 5 * 80000 + 7 * 75000);
    });

    transaction(t.db, (tx) => removeOrderLine(tx, orderId, secondLineId));
    readOnly(t.db, (tx) => assert.equal(getOrder(tx, orderId).lines.length, 1));

    // The last line cannot go: an order with no lines is not an order.
    const lastLineId = readOnly(t.db, (tx) => getOrder(tx, orderId).lines[0]!.id);
    assert.throws(
      () => transaction(t.db, (tx) => removeOrderLine(tx, orderId, lastLineId)),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'order_needs_a_line');
        return true;
      },
    );
  });
});

test('the same variant cannot appear twice on one order', () => {
  withDb((t) => {
    const s = seedSellable(t);
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, {
            customerId: s.customerId,
            lines: [
              { variantId: s.variantId, qtyOrdered: 5 },
              { variantId: s.variantId, qtyOrdered: 3 },
            ],
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
    // The failed order left nothing behind.
    readOnly(t.db, (tx) => assert.equal(listOrders(tx).length, 0));
  });
});

test('a rolled-back order burns neither a number nor a row (D017)', () => {
  withDb((t) => {
    const s = seedSellable(t);
    assert.throws(() =>
      transaction(t.db, (tx) => {
        createOrder(tx, {
          customerId: s.customerId,
          lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
          userId: t.userId,
        });
        throw new Error('something went wrong after the number was taken');
      }),
    );

    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      }),
    );
    readOnly(t.db, (tx) => {
      assert.equal(getOrder(tx, orderId).orderNo, 'ORD-2026-00001');
      assert.equal(listOrders(tx).length, 1);
    });
  });
});

test('an order cannot be placed for an unknown customer, variant or empty basket', () => {
  withDb((t) => {
    const s = seedSellable(t);
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, { customerId: 999, lines: [{ variantId: s.variantId, qtyOrdered: 1 }], userId: t.userId }),
        ),
      NotFoundError,
    );
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, { customerId: s.customerId, lines: [{ variantId: 999, qtyOrdered: 1 }], userId: t.userId }),
        ),
      NotFoundError,
    );
    assert.throws(
      () => transaction(t.db, (tx) => createOrder(tx, { customerId: s.customerId, lines: [], userId: t.userId })),
      ValidationError,
    );
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, {
            customerId: s.customerId,
            orderDate: '2026-09-01',
            requiredDate: '2026-08-01',
            lines: [{ variantId: s.variantId, qtyOrdered: 1 }],
            userId: t.userId,
          }),
        ),
      ValidationError,
      'a delivery date before the order date is a typo',
    );
  });
});

test('an unpriced variant cannot be ordered without a price on the line', () => {
  withDb((t) => {
    const seeded = seedVariant(t, { productCode: 'JKT-Z', defaultPriceMinor: null });
    const customerId = transaction(t.db, (tx) =>
      createCustomer(tx, { code: 'C-1', name: 'Buyer', userId: t.userId }),
    );

    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, {
            customerId,
            lines: [{ variantId: seeded.variantId, qtyOrdered: 1 }],
            userId: t.userId,
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'price_not_set');
        return true;
      },
    );

    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId,
        lines: [{ variantId: seeded.variantId, qtyOrdered: 1, unitPriceMinor: 65000 }],
        userId: t.userId,
      }),
    );
    readOnly(t.db, (tx) => assert.equal(getOrder(tx, orderId).lines[0]?.unitPriceMinor, 65000));
  });
});

test('an empty or draft order cannot reserve stock', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 10 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      }),
    );
    assert.throws(
      () => transaction(t.db, (tx) => allocateOrder(tx, orderId, t.userId)),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'order_not_allocatable');
        return true;
      },
    );
    transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));
    assert.throws(() => transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId)), BusinessRuleError);
  });
});

test('the order list shows totals, shortages and open orders only', () => {
  withDb((t) => {
    const a = seedSellable(t, { onHand: 10, productCode: 'JKT-A', size: 'L' });
    const b = seedSellable(t, { onHand: 0, productCode: 'JKT-B', size: 'M' });

    const openId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: a.customerId,
        lines: [{ variantId: a.variantId, qtyOrdered: 25 }],
        userId: t.userId,
      }),
    );
    const cancelledId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: b.customerId,
        lines: [{ variantId: b.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) => confirmOrder(tx, openId, t.userId));
    transaction(t.db, (tx) => cancelOrder(tx, cancelledId, 'Duplicate'));

    readOnly(t.db, (tx) => {
      const all = listOrders(tx);
      assert.equal(all.length, 2);
      const open = listOrders(tx, { openOnly: true });
      assert.equal(open.length, 1);
      assert.equal(open[0]?.id, openId);
      assert.equal(open[0]?.totalMinor, 25 * 80000);
      assert.equal(open[0]?.totalShortageQty, 15, '10 reserved of 25');
      assert.equal(listOrders(tx, { customerId: b.customerId }).length, 1);
      assert.equal(listOrders(tx, { status: 'cancelled' }).length, 1);
      assert.equal(listOrders(tx, { status: 'draft' }).length, 0);
    });
  });
});

test('shortages across open orders roll up per variant, worst first', () => {
  withDb((t) => {
    const a = seedSellable(t, { onHand: 10, productCode: 'JKT-A', size: 'L' });
    const b = seedSellable(t, { onHand: 0, productCode: 'JKT-B', size: 'M' });

    const first = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: a.customerId,
        requiredDate: '2026-09-30',
        lines: [{ variantId: a.variantId, qtyOrdered: 25 }],
        userId: t.userId,
      }),
    );
    const second = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: b.customerId,
        requiredDate: '2026-09-10',
        lines: [{ variantId: a.variantId, qtyOrdered: 30 }],
        userId: t.userId,
      }),
    );
    const third = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: b.customerId,
        lines: [{ variantId: b.variantId, qtyOrdered: 8 }],
        userId: t.userId,
      }),
    );
    for (const id of [first, second, third]) {
      transaction(t.db, (tx) => confirmOrder(tx, id, t.userId));
    }

    readOnly(t.db, (tx) => {
      const shortages = listShortages(tx);
      assert.deepEqual(
        shortages.map((s) => [s.sku, s.shortageQty, s.orderCount]),
        [
          ['JKT-A-BLACK-L', 45, 2],
          ['JKT-B-BLACK-M', 8, 1],
        ],
        '25 + 30 ordered against 10 on the shelf leaves 45; the other has none',
      );
      assert.equal(shortages[0]?.earliestRequiredDate, '2026-09-10', 'the tightest deadline surfaces');
    });

    // A cancelled order stops demanding production.
    transaction(t.db, (tx) => cancelOrder(tx, second, 'Customer withdrew'));
    readOnly(t.db, (tx) => {
      const shortages = listShortages(tx);
      assert.equal(shortages.length, 2);
      // The 10 freed pieces are still reserved to the first order, which had
      // taken them at confirmation; only the withdrawn 30 disappear.
      assert.equal(shortages.find((s) => s.sku === 'JKT-A-BLACK-L')?.shortageQty, 15);
    });
  });
});

test('releasing allocations by hand frees stock and is reflected everywhere', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 100 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 60 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));
    const freed = transaction(t.db, (tx) => releaseOrderAllocations(tx, orderId));
    assert.equal(freed, 60);
    readOnly(t.db, (tx) => {
      assert.equal(getAvailableQty(tx, s.variantId), 100);
      assert.equal(getOrder(tx, orderId).lines[0]?.shortageQty, 60, 'the order is short again');
    });
  });
});

test('a deactivated variant cannot be added to a new order', () => {
  withDb((t) => {
    const s = seedSellable(t);
    t.db.prepare('UPDATE product_variants SET is_active = 0 WHERE id = ?').run(s.variantId);
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createOrder(tx, {
            customerId: s.customerId,
            lines: [{ variantId: s.variantId, qtyOrdered: 1 }],
            userId: t.userId,
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'variant_not_active');
        return true;
      },
    );
  });
});

test('an order cannot be closed before it is delivered', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 10 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      }),
    );
    assert.throws(() => transaction(t.db, (tx) => closeOrder(tx, orderId)), BusinessRuleError);
    transaction(t.db, (tx) => confirmOrder(tx, orderId, t.userId));
    assert.throws(() => transaction(t.db, (tx) => closeOrder(tx, orderId)), BusinessRuleError);
  });
});

test('a failed confirmation leaves no reservation behind', () => {
  withDb((t) => {
    const s = seedSellable(t, { onHand: 100 });
    const orderId = transaction(t.db, (tx) =>
      createOrder(tx, {
        customerId: s.customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 40 }],
        userId: t.userId,
      }),
    );

    assert.throws(() =>
      transaction(t.db, (tx) => {
        confirmOrder(tx, orderId, t.userId);
        throw new Error('printer caught fire');
      }),
    );

    readOnly(t.db, (tx) => {
      assert.equal(getOrder(tx, orderId).status, 'draft', 'still a draft');
      assert.equal(getAvailableQty(tx, s.variantId), 100, 'nothing was reserved');
    });
    const rows = t.db.prepare('SELECT COUNT(*) AS n FROM stock_allocations').get() as { n: number };
    assert.equal(Number(rows.n), 0);
  });
});

test('order numbers run in sequence per year and per document type', () => {
  withDb((t) => {
    const s = seedSellable(t);
    const numbers = ['2026-01-05', '2026-12-31', '2027-01-01'].map((orderDate) =>
      transaction(t.db, (tx) => {
        const id = createOrder(tx, {
          customerId: s.customerId,
          orderDate,
          lines: [{ variantId: s.variantId, qtyOrdered: 1 }],
          userId: t.userId,
        });
        return getOrder(tx, id).orderNo;
      }),
    );
    assert.deepEqual(numbers, ['ORD-2026-00001', 'ORD-2026-00002', 'ORD-2027-00001']);
  });
});

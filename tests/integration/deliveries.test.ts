import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  cancelDelivery,
  createDelivery,
  deliverNow,
  dispatchDelivery,
  getDelivery,
  listDeliveries,
} from '../../src/services/deliveries.ts';
import { cancelOrder, closeOrder, confirmOrder, createOrder, getOrder } from '../../src/services/orders.ts';
import { getAvailableQty, getStockOnHand, listMovements, recordStockMovement } from '../../src/services/stock.ts';
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
 * A confirmed order for one variant, with `onHand` pieces on the shelf and
 * whatever could be reserved already reserved.
 */
function seedConfirmedOrder(
  t: TestDb,
  options: { onHand?: number; qtyOrdered?: number; priceMinor?: number } = {},
) {
  const { onHand = 30, qtyOrdered = 30, priceMinor = 80000 } = options;
  const seeded = seedVariant(t, { defaultPriceMinor: priceMinor });
  return transaction(t.db, (tx) => {
    const customerId = createCustomer(tx, { code: 'C-1', name: 'Kathmandu Traders', userId: t.userId });
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
      orderDate: '2026-08-23',
      lines: [{ variantId: seeded.variantId, qtyOrdered }],
      userId: t.userId,
    });
    confirmOrder(tx, orderId, t.userId);
    const order = getOrder(tx, orderId);
    return { ...seeded, customerId, orderId, orderLineId: order.lines[0].id };
  });
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

/* ------------------------------------------------------------- the draft */

test('a draft delivery is a packing list: it moves no stock at all', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 30, qtyOrdered: 30 });
    const delivery = transaction(t.db, (tx) =>
      createDelivery(tx, {
        orderId: s.orderId,
        deliveredAt: '2026-08-24',
        lines: [{ orderLineId: s.orderLineId, qty: 10 }],
        userId: t.userId,
      }),
    );

    assert.equal(delivery.deliveryNo, 'DEL-2026-00001');
    assert.equal(delivery.status, 'draft');
    assert.equal(delivery.totalQty, 10);
    assert.equal(delivery.lines[0].movementId, null, 'a draft has caused no movement');

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 30, 'the shelf has not been touched');
      assert.equal(listMovements(tx, s.variantId).length, 1, 'only the opening balance exists');
      assert.equal(getAvailableQty(tx, s.variantId), 0, 'all 30 are still reserved for the order');
      assert.equal(getOrder(tx, s.orderId).status, 'confirmed', 'the order has not moved on');
    });
  });
});

test('a delivery can only be written against a confirmed or part-delivered order', () => {
  withDb((t) => {
    const seeded = seedVariant(t, {});
    const { orderId, orderLineId } = transaction(t.db, (tx) => {
      const customerId = createCustomer(tx, { code: 'C-1', name: 'Buyer', userId: t.userId });
      const id = createOrder(tx, {
        customerId,
        lines: [{ variantId: seeded.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      });
      return { orderId: id, orderLineId: getOrder(tx, id).lines[0].id };
    });

    // Still a draft: nothing has been promised to anybody.
    refuses(
      () =>
        transaction(t.db, (tx) =>
          createDelivery(tx, { orderId, lines: [{ orderLineId, qty: 1 }], userId: t.userId }),
        ),
      'order_not_deliverable',
    );

    transaction(t.db, (tx) => cancelOrder(tx, orderId, 'customer withdrew'));
    refuses(
      () =>
        transaction(t.db, (tx) =>
          createDelivery(tx, { orderId, lines: [{ orderLineId, qty: 1 }], userId: t.userId }),
        ),
      'order_not_deliverable',
    );
  });
});

test('a delivery line must belong to the order it is delivering', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t);
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createDelivery(tx, {
            orderId: s.orderId,
            lines: [{ orderLineId: s.orderLineId + 999, qty: 1 }],
            userId: t.userId,
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /is not part of order ORD-2026-00001/);
        return true;
      },
    );
  });
});

test('an unknown delivery is not found rather than silently ignored', () => {
  withDb((t) => {
    assert.throws(() => readOnly(t.db, (tx) => getDelivery(tx, 404)), NotFoundError);
    assert.throws(() => transaction(t.db, (tx) => dispatchDelivery(tx, 404, t.userId)), NotFoundError);
  });
});

/* ----------------------------------------------------------- the dispatch */

test('dispatch writes exactly one outward movement per line and lowers the shelf', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 30, qtyOrdered: 30 });
    // Deliberately not today: the owner often enters a dispatch a day or two
    // later, and the movement must carry the date the goods actually left.
    const result = transaction(t.db, (tx) =>
      deliverNow(tx, {
        orderId: s.orderId,
        deliveredAt: '2026-08-01',
        lines: [{ orderLineId: s.orderLineId, qty: 30 }],
        userId: t.userId,
      }),
    );

    assert.equal(result.delivery.status, 'dispatched');
    assert.equal(result.order.status, 'delivered');
    assert.equal(result.allocation, null, 'a fully delivered order has nothing left to reserve');

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 0);
      const movements = listMovements(tx, s.variantId);
      assert.equal(movements.length, 2, 'the opening balance and one delivery movement');
      const out = movements.find((m) => m.movementType === 'delivery_out');
      assert.ok(out, 'the delivery wrote a delivery_out movement');
      assert.equal(out.qtyDelta, -30, 'outward movements are negative');
      assert.equal(out.refType, 'delivery');
      assert.equal(out.refId, result.delivery.id, 'the movement points back at the delivery');
      assert.equal(out.occurredAt, '2026-08-01', "the movement's business date is the delivery date");

      const delivery = getDelivery(tx, result.delivery.id);
      assert.equal(delivery.lines[0].movementId, out.id, 'the line records the movement it caused');
    });
  });
});

test('a partial delivery leaves the order part-delivered and re-reserves the rest', () => {
  withDb((t) => {
    // 30 ordered, 22 on the shelf, so 22 reserved and 8 short.
    const s = seedConfirmedOrder(t, { onHand: 22, qtyOrdered: 30 });
    readOnly(t.db, (tx) => {
      const order = getOrder(tx, s.orderId);
      assert.equal(order.lines[0].qtyAllocated, 22);
      assert.equal(order.totalShortageQty, 8);
    });

    const result = transaction(t.db, (tx) =>
      deliverNow(tx, {
        orderId: s.orderId,
        lines: [{ orderLineId: s.orderLineId, qty: 10 }],
        userId: t.userId,
      }),
    );

    assert.equal(result.order.status, 'partially_delivered');
    assert.ok(result.allocation, 'the remainder was re-reserved');

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 12, '22 on the shelf less the 10 that went out');

      const order = getOrder(tx, s.orderId);
      assert.equal(order.lines[0].qtyDelivered, 10);
      assert.equal(order.lines[0].qtyAllocated, 12, 'the 12 still on the shelf are reserved again');
      assert.equal(order.lines[0].shortageQty, 8, 'the shortage is unchanged: 30 - 10 - 12');
      assert.equal(getAvailableQty(tx, s.variantId), 0, 'nothing is free while the order is open');

      // The consumed reservation is kept, not deleted.
      const rows = tx.db
        .prepare('SELECT status, qty FROM stock_allocations WHERE order_line_id = ? ORDER BY id')
        .all(s.orderLineId) as { status: string; qty: number }[];
      assert.deepEqual(
        rows.map((row) => ({ status: row.status, qty: Number(row.qty) })),
        [
          { status: 'consumed', qty: 22 },
          { status: 'active', qty: 12 },
        ],
      );
    });
  });
});

test('two partial deliveries finish the order and never double-count the stock', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 30, qtyOrdered: 30 });
    transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 18 }], userId: t.userId }),
    );
    const second = transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 12 }], userId: t.userId }),
    );

    assert.equal(second.order.status, 'delivered');
    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 0);
      assert.equal(listMovements(tx, s.variantId).filter((m) => m.movementType === 'delivery_out').length, 2);
      assert.equal(getOrder(tx, s.orderId).lines[0].qtyDelivered, 30);
      assert.equal(listDeliveries(tx, { orderId: s.orderId }).length, 2);
      assert.equal(
        tx.db
          .prepare("SELECT COUNT(*) AS n FROM stock_allocations WHERE order_line_id = ? AND status = 'active'")
          .get(s.orderLineId).n,
        0,
        'a delivered order holds no reservation',
      );
    });
  });
});

test('a delivered order can be closed and then delivers nothing more', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 5, qtyOrdered: 5 });
    transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 5 }], userId: t.userId }),
    );
    transaction(t.db, (tx) => closeOrder(tx, s.orderId));
    refuses(
      () =>
        transaction(t.db, (tx) =>
          createDelivery(tx, {
            orderId: s.orderId,
            lines: [{ orderLineId: s.orderLineId, qty: 1 }],
            userId: t.userId,
          }),
        ),
      'order_not_deliverable',
    );
  });
});

/* -------------------------------------------------------------- refusals */

test('a delivery cannot send more than the order still expects', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 50, qtyOrdered: 30 });
    const error = refuses(
      () =>
        transaction(t.db, (tx) =>
          deliverNow(tx, {
            orderId: s.orderId,
            lines: [{ orderLineId: s.orderLineId, qty: 31 }],
            userId: t.userId,
          }),
        ),
      'delivery_exceeds_order',
    );
    assert.match(error.message, /expects 30 more/);

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 50, 'the refusal left the shelf alone');
      assert.equal(listDeliveries(tx).length, 0, 'and wrote no delivery');
    });
  });
});

test('a delivery cannot take stock reserved for another order', () => {
  withDb((t) => {
    // 20 on the shelf. The first order reserves all 20; the second reserves
    // nothing and must not be able to ship anyway.
    const s = seedConfirmedOrder(t, { onHand: 20, qtyOrdered: 20 });
    const second = transaction(t.db, (tx) => {
      const customerId = createCustomer(tx, { code: 'C-2', name: 'Pokhara Retail', userId: t.userId });
      const orderId = createOrder(tx, {
        customerId,
        lines: [{ variantId: s.variantId, qtyOrdered: 5 }],
        userId: t.userId,
      });
      confirmOrder(tx, orderId, t.userId);
      return { orderId, orderLineId: getOrder(tx, orderId).lines[0].id };
    });

    readOnly(t.db, (tx) => {
      assert.equal(getOrder(tx, second.orderId).lines[0].qtyAllocated, 0, 'nothing was free to reserve');
    });

    refuses(
      () =>
        transaction(t.db, (tx) =>
          deliverNow(tx, {
            orderId: second.orderId,
            lines: [{ orderLineId: second.orderLineId, qty: 5 }],
            userId: t.userId,
          }),
        ),
      'delivery_exceeds_available_stock',
    );

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 20, 'the first order still has its 20 pieces');
    });
  });
});

test('a delivery cannot ship pieces that are not on the shelf', () => {
  withDb((t) => {
    // Ordered 30 with nothing in stock: confirmed, reserved 0, short 30.
    const s = seedConfirmedOrder(t, { onHand: 0, qtyOrdered: 30 });
    refuses(
      () =>
        transaction(t.db, (tx) =>
          deliverNow(tx, {
            orderId: s.orderId,
            lines: [{ orderLineId: s.orderLineId, qty: 1 }],
            userId: t.userId,
          }),
        ),
      'delivery_exceeds_available_stock',
    );
    readOnly(t.db, (tx) => assert.equal(getStockOnHand(tx, s.variantId), 0));
  });
});

test('an unreserved order line may still ship from stock that arrived later', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 0, qtyOrdered: 10 });
    // Stock arrives but nobody re-runs the reservation.
    transaction(t.db, (tx) =>
      recordStockMovement(tx, {
        variantId: s.variantId,
        qty: 4,
        movementType: 'production_receipt',
        userId: t.userId,
      }),
    );

    const result = transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 4 }], userId: t.userId }),
    );
    assert.equal(result.order.status, 'partially_delivered');
    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 0);
      assert.equal(getOrder(tx, s.orderId).lines[0].shortageQty, 6);
    });
  });
});

test('a refused dispatch rolls back the movements it had already written', () => {
  withDb((t) => {
    // Two lines, both deliverable on their own; the second asks for too much.
    const a = seedVariant(t, { productCode: 'JKT-A', size: 'L' });
    const b = seedVariant(t, { productCode: 'JKT-B', size: 'M' });
    const s = transaction(t.db, (tx) => {
      const customerId = createCustomer(tx, { code: 'C-1', name: 'Buyer', userId: t.userId });
      for (const variantId of [a.variantId, b.variantId]) {
        recordStockMovement(tx, { variantId, qty: 10, movementType: 'opening_balance', userId: t.userId });
      }
      const orderId = createOrder(tx, {
        customerId,
        lines: [
          { variantId: a.variantId, qtyOrdered: 10 },
          { variantId: b.variantId, qtyOrdered: 10 },
        ],
        userId: t.userId,
      });
      confirmOrder(tx, orderId, t.userId);
      const order = getOrder(tx, orderId);
      return { orderId, lineA: order.lines[0].id, lineB: order.lines[1].id };
    });

    refuses(
      () =>
        transaction(t.db, (tx) =>
          deliverNow(tx, {
            orderId: s.orderId,
            lines: [
              { orderLineId: s.lineA, qty: 10 },
              { orderLineId: s.lineB, qty: 11 },
            ],
            userId: t.userId,
          }),
        ),
      'delivery_exceeds_order',
    );

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, a.variantId), 10, 'the good line did not sneak out');
      assert.equal(getStockOnHand(tx, b.variantId), 10);
      assert.equal(listDeliveries(tx).length, 0);
      assert.equal(getOrder(tx, s.orderId).status, 'confirmed');
    });
  });
});

test('a draft is re-checked at dispatch, not trusted', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 10, qtyOrdered: 10 });
    const delivery = transaction(t.db, (tx) =>
      createDelivery(tx, {
        orderId: s.orderId,
        lines: [{ orderLineId: s.orderLineId, qty: 10 }],
        userId: t.userId,
      }),
    );

    // Between writing the list and loading the van, 6 pieces are found to be
    // damaged and adjusted out.
    transaction(t.db, (tx) =>
      recordStockMovement(tx, {
        variantId: s.variantId,
        qty: 6,
        movementType: 'adjustment_out',
        reason: 'water damage',
        userId: t.userId,
      }),
    );

    refuses(
      () => transaction(t.db, (tx) => dispatchDelivery(tx, delivery.id, t.userId)),
      'delivery_exceeds_available_stock',
    );

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 4);
      assert.equal(getDelivery(tx, delivery.id).status, 'draft', 'the draft is still there to be corrected');
    });
  });
});

test('a delivery is dispatched once and cannot be dispatched again', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 10, qtyOrdered: 10 });
    const result = transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 6 }], userId: t.userId }),
    );

    refuses(
      () => transaction(t.db, (tx) => dispatchDelivery(tx, result.delivery.id, t.userId)),
      'delivery_not_dispatchable',
    );

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 4, 'the second attempt moved nothing');
      assert.equal(listMovements(tx, s.variantId).filter((m) => m.movementType === 'delivery_out').length, 1);
    });
  });
});

test('an order that has been part-delivered cannot be cancelled (OPEN-5)', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 30, qtyOrdered: 30 });
    transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 5 }], userId: t.userId }),
    );
    refuses(
      () => transaction(t.db, (tx) => cancelOrder(tx, s.orderId, 'customer changed their mind')),
      'cannot_cancel_part_delivered_order',
    );
  });
});

/* ------------------------------------------------------- cancelling a draft */

test('a draft delivery can be cancelled with a reason and moves nothing', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 10, qtyOrdered: 10 });
    const delivery = transaction(t.db, (tx) =>
      createDelivery(tx, {
        orderId: s.orderId,
        lines: [{ orderLineId: s.orderLineId, qty: 10 }],
        userId: t.userId,
      }),
    );

    const cancelled = transaction(t.db, (tx) =>
      cancelDelivery(tx, delivery.id, 'van broke down', t.userId),
    );
    assert.equal(cancelled.status, 'cancelled');
    assert.match(cancelled.notes ?? '', /van broke down/);

    assert.throws(
      () => transaction(t.db, (tx) => cancelDelivery(tx, delivery.id, '   ', t.userId)),
      ValidationError,
    );
    refuses(
      () => transaction(t.db, (tx) => cancelDelivery(tx, delivery.id, 'again', t.userId)),
      'delivery_already_cancelled',
    );
    refuses(
      () => transaction(t.db, (tx) => dispatchDelivery(tx, delivery.id, t.userId)),
      'delivery_not_dispatchable',
    );

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 10);
      assert.equal(getOrder(tx, s.orderId).lines[0].qtyDelivered, 0, 'a cancelled delivery delivers nothing');
    });
  });
});

test('a dispatched delivery cannot be cancelled: the goods have gone', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 10, qtyOrdered: 10 });
    const result = transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 10 }], userId: t.userId }),
    );
    const error = refuses(
      () => transaction(t.db, (tx) => cancelDelivery(tx, result.delivery.id, 'wrong colour', t.userId)),
      'dispatched_delivery_cannot_be_cancelled',
    );
    assert.match(error.message, /goods return/);

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, s.variantId), 0, 'the ledger was not quietly reversed');
    });
  });
});

/* ------------------------------------------------------------------ lists */

test('deliveries are listed newest first and can be filtered', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 30, qtyOrdered: 30 });
    const draft = transaction(t.db, (tx) =>
      createDelivery(tx, {
        orderId: s.orderId,
        lines: [{ orderLineId: s.orderLineId, qty: 5 }],
        userId: t.userId,
      }),
    );
    transaction(t.db, (tx) =>
      deliverNow(tx, { orderId: s.orderId, lines: [{ orderLineId: s.orderLineId, qty: 7 }], userId: t.userId }),
    );

    readOnly(t.db, (tx) => {
      const all = listDeliveries(tx);
      assert.equal(all.length, 2);
      assert.ok(all[0].id > all[1].id, 'newest first');
      assert.equal(all[0].totalQty, 7);
      assert.equal(all[0].lineCount, 1);
      assert.equal(all[0].customerName, 'Kathmandu Traders');

      assert.deepEqual(
        listDeliveries(tx, { status: 'draft' }).map((d) => d.id),
        [draft.id],
      );
      assert.equal(listDeliveries(tx, { status: 'dispatched' }).length, 1);
      assert.equal(listDeliveries(tx, { customerId: s.customerId }).length, 2);
      assert.equal(listDeliveries(tx, { orderId: s.orderId + 999 }).length, 0);
      assert.equal(listDeliveries(tx, { limit: 1 }).length, 1);
      assert.throws(() => listDeliveries(tx, { status: 'posted' as never }), ValidationError);
    });
  });
});

test('delivery numbers are gapless within the year', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 30, qtyOrdered: 30 });
    const first = transaction(t.db, (tx) =>
      createDelivery(tx, {
        orderId: s.orderId,
        deliveredAt: '2026-08-24',
        lines: [{ orderLineId: s.orderLineId, qty: 1 }],
        userId: t.userId,
      }),
    );
    assert.equal(first.deliveryNo, 'DEL-2026-00001');

    // A refused delivery gives its number back.
    refuses(
      () =>
        transaction(t.db, (tx) =>
          createDelivery(tx, {
            orderId: s.orderId,
            deliveredAt: '2026-08-24',
            lines: [{ orderLineId: s.orderLineId, qty: 999 }],
            userId: t.userId,
          }),
        ),
      'delivery_exceeds_order',
    );

    const second = transaction(t.db, (tx) =>
      createDelivery(tx, {
        orderId: s.orderId,
        deliveredAt: '2026-08-24',
        lines: [{ orderLineId: s.orderLineId, qty: 1 }],
        userId: t.userId,
      }),
    );
    assert.equal(second.deliveryNo, 'DEL-2026-00002');
  });
});

test('a delivery quantity must be a whole number of garments', () => {
  withDb((t) => {
    const s = seedConfirmedOrder(t, { onHand: 30, qtyOrdered: 30 });
    for (const qty of [0, -1, 2.5, Number.NaN, '5' as unknown as number]) {
      assert.throws(
        () =>
          transaction(t.db, (tx) =>
            createDelivery(tx, {
              orderId: s.orderId,
              lines: [{ orderLineId: s.orderLineId, qty }],
              userId: t.userId,
            }),
          ),
        ValidationError,
        `qty ${String(qty)} should have been refused`,
      );
    }
    assert.throws(
      () => transaction(t.db, (tx) => createDelivery(tx, { orderId: s.orderId, lines: [], userId: t.userId })),
      ValidationError,
    );
  });
});

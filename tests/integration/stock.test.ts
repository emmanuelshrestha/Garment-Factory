import test from 'node:test';
import assert from 'node:assert/strict';
import { readOnly, transaction } from '../../src/db/sqlite.ts';
import {
  createStockAdjustment,
  getAllocatedQty,
  getAvailableQty,
  getStockOnHand,
  getStockSummary,
  listLowStock,
  listMovements,
  listStockSummaries,
  recordOpeningBalance,
  recordStockMovement,
} from '../../src/services/stock.ts';
import { setSetting } from '../../src/services/settings.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../../src/domain/errors.ts';
import { createTestDb, seedCustomer, seedVariant, type TestDb } from '../helpers/testDb.ts';

/** An order line, so allocations can be tested without the orders service. */
function seedOrderLine(t: TestDb, variantId: number, qty: number): number {
  const now = new Date().toISOString();
  const customerId = seedCustomer(t);
  const orderId = Number(
    t.db
      .prepare(
        `INSERT INTO orders (order_no, customer_id, order_date, currency, fx_rate_to_npr,
                             status, created_at, created_by)
         VALUES (?, ?, '2026-08-23', 'NPR', 1000000, 'confirmed', ?, ?)`,
      )
      .run(`ORD-2026-${String(Math.floor(Math.random() * 89999) + 10000)}`, customerId, now, t.userId)
      .lastInsertRowid,
  );
  return Number(
    t.db
      .prepare(
        `INSERT INTO order_lines (order_id, variant_id, qty_ordered, unit_price_minor)
         VALUES (?, ?, ?, 80000)`,
      )
      .run(orderId, variantId, qty).lastInsertRowid,
  );
}

function seedAllocation(t: TestDb, variantId: number, qty: number, status = 'active'): number {
  const orderLineId = seedOrderLine(t, variantId, qty);
  return Number(
    t.db
      .prepare(
        `INSERT INTO stock_allocations (order_line_id, variant_id, qty, status, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(orderLineId, variantId, qty, status, new Date().toISOString(), t.userId).lastInsertRowid,
  );
}

test('on-hand is the sum of the ledger, with no cached column', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, variantId), 0);
      recordOpeningBalance(tx, { variantId, qty: 100, userId: t.userId });
      recordStockMovement(tx, {
        variantId,
        qty: 40,
        movementType: 'production_receipt',
        refId: null,
        userId: t.userId,
      });
      recordStockMovement(tx, {
        variantId,
        qty: 15,
        movementType: 'delivery_out',
        refId: null,
        userId: t.userId,
      });
      assert.equal(getStockOnHand(tx, variantId), 125);
    });

    // Proven by recomputing straight from the ledger, bypassing the service.
    const row = t.db
      .prepare('SELECT SUM(qty_delta) AS total FROM stock_movements WHERE variant_id = ?')
      .get(variantId) as { total: number };
    assert.equal(Number(row.total), 125);

    // And there is no quantity column anywhere on the variant to drift.
    const columns = t.db.prepare('SELECT name FROM pragma_table_info(?)').all('product_variants') as {
      name: string;
    }[];
    const quantityish = columns
      .map((c) => c.name)
      .filter((name) => /qty|quantity|on_hand|stock/.test(name) && name !== 'min_stock_qty');
    assert.deepEqual(quantityish, []);
  } finally {
    t.cleanup();
  }
});

test('the caller passes a positive quantity and the ledger applies the sign', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 10, userId: t.userId });
      recordStockMovement(tx, {
        variantId,
        qty: 4,
        movementType: 'delivery_out',
        refId: null,
        userId: t.userId,
      });
    });
    const deltas = t.db
      .prepare('SELECT movement_type, qty_delta FROM stock_movements WHERE variant_id = ? ORDER BY id')
      .all(variantId) as { movement_type: string; qty_delta: number }[];
    // Mapped to tuples because node:sqlite returns null-prototype rows, which
    // strict deepEqual will not match against a plain object literal.
    assert.deepEqual(
      deltas.map((row) => [row.movement_type, Number(row.qty_delta)]),
      [
        ['opening_balance', 10],
        ['delivery_out', -4],
      ],
    );

    // A zero or fractional quantity is refused outright.
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          recordStockMovement(tx, {
            variantId,
            qty: 0,
            movementType: 'delivery_out',
            refId: null,
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          recordStockMovement(tx, {
            variantId,
            qty: 2.5,
            movementType: 'production_receipt',
            refId: null,
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
  } finally {
    t.cleanup();
  }
});

test('stock can never be driven negative', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 5, userId: t.userId });
    });

    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          recordStockMovement(tx, {
            variantId,
            qty: 6,
            movementType: 'delivery_out',
            refId: null,
            userId: t.userId,
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'stock_cannot_go_negative');
        return true;
      },
    );

    // Exactly emptying the shelf is fine; one more is not.
    transaction(t.db, (tx) => {
      recordStockMovement(tx, {
        variantId,
        qty: 5,
        movementType: 'delivery_out',
        refId: null,
        userId: t.userId,
      });
    });
    assert.equal(readOnly(t.db, (tx) => getStockOnHand(tx, variantId)), 0);
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          recordStockMovement(tx, {
            variantId,
            qty: 1,
            movementType: 'delivery_out',
            refId: null,
            userId: t.userId,
          }),
        ),
      BusinessRuleError,
    );
  } finally {
    t.cleanup();
  }
});

test('a movement for a variant that does not exist is refused', () => {
  const t = createTestDb();
  try {
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          recordStockMovement(tx, {
            variantId: 9999,
            qty: 1,
            movementType: 'production_receipt',
            refId: null,
            userId: t.userId,
          }),
        ),
      NotFoundError,
    );
  } finally {
    t.cleanup();
  }
});

test('D004: allocation reserves stock without moving it', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 100, userId: t.userId });
    });
    seedAllocation(t, variantId, 30);

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, variantId), 100, 'physical stock unchanged by allocation');
      assert.equal(getAllocatedQty(tx, variantId), 30);
      assert.equal(getAvailableQty(tx, variantId), 70);
    });

    // The allocation produced no ledger row at all.
    const count = t.db
      .prepare('SELECT COUNT(*) AS n FROM stock_movements WHERE variant_id = ?')
      .get(variantId) as { n: number };
    assert.equal(Number(count.n), 1);
  } finally {
    t.cleanup();
  }
});

test('a released allocation stops consuming availability', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 50, userId: t.userId });
    });
    const allocationId = seedAllocation(t, variantId, 20);
    assert.equal(readOnly(t.db, (tx) => getAvailableQty(tx, variantId)), 30);

    t.db
      .prepare("UPDATE stock_allocations SET status = 'released', released_at = ? WHERE id = ?")
      .run(new Date().toISOString(), allocationId);
    assert.equal(readOnly(t.db, (tx) => getAvailableQty(tx, variantId)), 50);

    // A consumed allocation is also no longer a reservation: the delivery it
    // belongs to has already taken the stock out of the ledger.
    t.db.prepare("UPDATE stock_allocations SET status = 'consumed' WHERE id = ?").run(allocationId);
    assert.equal(readOnly(t.db, (tx) => getAllocatedQty(tx, variantId)), 0);
  } finally {
    t.cleanup();
  }
});

test('over-commitment is reported, not hidden', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 10, userId: t.userId });
    });
    seedAllocation(t, variantId, 10);
    // 8 of the 10 promised pieces are damaged and written off.
    transaction(t.db, (tx) =>
      createStockAdjustment(tx, {
        reasonCode: 'damage',
        note: 'Water damage in store room',
        lines: [{ variantId, qtyDelta: -8 }],
        userId: t.userId,
      }),
    );

    readOnly(t.db, (tx) => {
      const summary = getStockSummary(tx, variantId);
      assert.equal(summary.onHand, 2);
      assert.equal(summary.allocated, 10);
      assert.equal(summary.available, -8);
      assert.equal(summary.overCommitted, true);
    });
  } finally {
    t.cleanup();
  }
});

test('an adjustment writes one movement per line, linked back to the reason', () => {
  const t = createTestDb();
  try {
    const a = seedVariant(t, { productCode: 'JKT-A', colour: 'Black', size: 'L' });
    const b = seedVariant(t, { productCode: 'JKT-A', colour: 'Black', size: 'XL' });
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId: a.variantId, qty: 20, userId: t.userId });
      recordOpeningBalance(tx, { variantId: b.variantId, qty: 20, userId: t.userId });
    });

    const adjustment = transaction(t.db, (tx) =>
      createStockAdjustment(tx, {
        reasonCode: 'stock_count',
        note: 'Annual count: 2 extra L, 3 missing XL',
        lines: [
          { variantId: a.variantId, qtyDelta: 2 },
          { variantId: b.variantId, qtyDelta: -3 },
        ],
        adjustedAt: '2026-08-23',
        userId: t.userId,
      }),
    );

    assert.equal(adjustment.adjustmentNo, 'ADJ-2026-00001');
    assert.equal(adjustment.lines.length, 2);
    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, a.variantId), 22);
      assert.equal(getStockOnHand(tx, b.variantId), 17);
    });

    // Each line points at exactly one movement, and each movement carries the reason.
    const joined = t.db
      .prepare(
        `SELECT l.qty_delta AS line_delta, m.qty_delta AS movement_delta,
                m.movement_type, m.ref_type, m.ref_id, m.reason
           FROM stock_adjustment_lines l
           JOIN stock_movements m ON m.id = l.movement_id
          WHERE l.adjustment_id = ?
          ORDER BY l.id`,
      )
      .all(adjustment.id) as {
      line_delta: number;
      movement_delta: number;
      movement_type: string;
      ref_type: string;
      ref_id: number;
      reason: string;
    }[];

    assert.equal(joined.length, 2);
    for (const row of joined) {
      assert.equal(Number(row.line_delta), Number(row.movement_delta));
      assert.equal(row.ref_type, 'adjustment');
      assert.equal(Number(row.ref_id), adjustment.id);
      assert.match(row.reason, /Annual count/);
    }
    assert.equal(joined[0]?.movement_type, 'adjustment_in');
    assert.equal(joined[1]?.movement_type, 'adjustment_out');
  } finally {
    t.cleanup();
  }
});

test('an adjustment without a reason is refused', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    for (const note of ['', '   ', undefined as unknown as string]) {
      assert.throws(
        () =>
          transaction(t.db, (tx) =>
            createStockAdjustment(tx, {
              reasonCode: 'damage',
              note,
              lines: [{ variantId, qtyDelta: 1 }],
              userId: t.userId,
            }),
          ),
        ValidationError,
      );
    }
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createStockAdjustment(tx, {
            reasonCode: 'because' as 'damage',
            note: 'valid note',
            lines: [{ variantId, qtyDelta: 1 }],
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
    assert.equal(readOnly(t.db, (tx) => getStockOnHand(tx, variantId)), 0);
  } finally {
    t.cleanup();
  }
});

test('an adjustment is all-or-nothing', () => {
  const t = createTestDb();
  try {
    const a = seedVariant(t, { colour: 'Black', size: 'L' });
    const b = seedVariant(t, { colour: 'Black', size: 'XL' });
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId: a.variantId, qty: 10, userId: t.userId });
      recordOpeningBalance(tx, { variantId: b.variantId, qty: 1, userId: t.userId });
    });

    // The second line takes more than exists, so the first line must not stick.
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createStockAdjustment(tx, {
            reasonCode: 'loss',
            note: 'Two lines, one impossible',
            lines: [
              { variantId: a.variantId, qtyDelta: -5 },
              { variantId: b.variantId, qtyDelta: -50 },
            ],
            userId: t.userId,
          }),
        ),
      BusinessRuleError,
    );

    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, a.variantId), 10, 'first line rolled back with the second');
      assert.equal(getStockOnHand(tx, b.variantId), 1);
    });
    const adjustments = t.db.prepare('SELECT COUNT(*) AS n FROM stock_adjustments').get() as {
      n: number;
    };
    assert.equal(Number(adjustments.n), 0, 'no orphan adjustment header');
  } finally {
    t.cleanup();
  }
});

test('the same variant twice in one adjustment is refused rather than guessed at', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createStockAdjustment(tx, {
            reasonCode: 'correction',
            note: 'two lines, one variant',
            lines: [
              { variantId, qtyDelta: 5 },
              { variantId, qtyDelta: -2 },
            ],
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
    // A zero-delta line is meaningless and is also refused.
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createStockAdjustment(tx, {
            reasonCode: 'correction',
            note: 'nothing changed',
            lines: [{ variantId, qtyDelta: 0 }],
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
    assert.throws(
      () =>
        transaction(t.db, (tx) =>
          createStockAdjustment(tx, {
            reasonCode: 'correction',
            note: 'no lines',
            lines: [],
            userId: t.userId,
          }),
        ),
      ValidationError,
    );
  } finally {
    t.cleanup();
  }
});

test('an opening balance can only be set once', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 60, userId: t.userId });
    });
    assert.throws(
      () =>
        transaction(t.db, (tx) => recordOpeningBalance(tx, { variantId, qty: 5, userId: t.userId })),
      (error: unknown) => {
        assert.ok(error instanceof BusinessRuleError);
        assert.equal(error.rule, 'opening_balance_already_set');
        return true;
      },
    );
    assert.equal(readOnly(t.db, (tx) => getStockOnHand(tx, variantId)), 60);
  } finally {
    t.cleanup();
  }
});

test('the ledger is append-only: history survives and reads like a statement', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId, qty: 100, occurredAt: '2026-08-01', userId: t.userId });
      recordStockMovement(tx, {
        variantId,
        qty: 30,
        movementType: 'delivery_out',
        refId: null,
        occurredAt: '2026-08-10',
        userId: t.userId,
      });
      recordStockMovement(tx, {
        variantId,
        qty: 5,
        movementType: 'return_in',
        refId: null,
        occurredAt: '2026-08-15',
        userId: t.userId,
      });
    });

    const history = readOnly(t.db, (tx) => listMovements(tx, variantId));
    assert.deepEqual(
      history.map((m) => [m.occurredAt, m.qtyDelta, m.balance]),
      [
        ['2026-08-01', 100, 100],
        ['2026-08-10', -30, 70],
        ['2026-08-15', 5, 75],
      ],
    );
    assert.equal(history[history.length - 1]?.balance, getStockOnHandDirect(t, variantId));
  } finally {
    t.cleanup();
  }
});

test('D019: the matrix reports a band per variant, using the system setting', () => {
  const t = createTestDb();
  try {
    const red = seedVariant(t, { colour: 'Black', size: 'S', minStockQty: 20 });
    const amber = seedVariant(t, { colour: 'Black', size: 'M', minStockQty: 20 });
    const green = seedVariant(t, { colour: 'Black', size: 'L', minStockQty: 20 });
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId: red.variantId, qty: 20, userId: t.userId });
      recordOpeningBalance(tx, { variantId: amber.variantId, qty: 25, userId: t.userId });
      recordOpeningBalance(tx, { variantId: green.variantId, qty: 26, userId: t.userId });
    });

    readOnly(t.db, (tx) => {
      const bands = new Map(listStockSummaries(tx).map((s) => [s.variantId, s.band]));
      assert.equal(bands.get(red.variantId), 'red');
      assert.equal(bands.get(amber.variantId), 'amber');
      assert.equal(bands.get(green.variantId), 'green');
    });

    // Widening the setting moves the boundary with no code change.
    transaction(t.db, (tx) => setSetting(tx, 'low_stock_amber_percent', '50'));
    readOnly(t.db, (tx) => {
      const bands = new Map(listStockSummaries(tx).map((s) => [s.variantId, s.band]));
      assert.equal(bands.get(green.variantId), 'amber');
    });
  } finally {
    t.cleanup();
  }
});

test('the low-stock list is worst-first and excludes healthy variants', () => {
  const t = createTestDb();
  try {
    const worst = seedVariant(t, { colour: 'Black', size: 'S', minStockQty: 50 }); // 40 short
    const mild = seedVariant(t, { colour: 'Black', size: 'M', minStockQty: 10 }); // 8 short
    const fine = seedVariant(t, { colour: 'Black', size: 'L', minStockQty: 5 });
    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId: worst.variantId, qty: 10, userId: t.userId });
      recordOpeningBalance(tx, { variantId: mild.variantId, qty: 2, userId: t.userId });
      recordOpeningBalance(tx, { variantId: fine.variantId, qty: 500, userId: t.userId });
    });

    const low = readOnly(t.db, (tx) => listLowStock(tx));
    assert.deepEqual(
      low.map((s) => s.variantId),
      [worst.variantId, mild.variantId],
    );
  } finally {
    t.cleanup();
  }
});

test('the low-stock list ignores deactivated variants', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t, { minStockQty: 10 });
    t.db.prepare('UPDATE product_variants SET is_active = 0 WHERE id = ?').run(variantId);
    assert.deepEqual(readOnly(t.db, (tx) => listLowStock(tx)), []);
    // But it is still visible in the full matrix, so its stock is not lost.
    assert.equal(readOnly(t.db, (tx) => listStockSummaries(tx)).length, 1);
  } finally {
    t.cleanup();
  }
});

test('a failed operation leaves no orphan movement', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    assert.throws(
      () =>
        transaction(t.db, (tx) => {
          recordStockMovement(tx, {
            variantId,
            qty: 25,
            movementType: 'production_receipt',
            refId: null,
            userId: t.userId,
          });
          throw new Error('delivery failed after the stock moved');
        }),
      /delivery failed/,
    );
    assert.equal(readOnly(t.db, (tx) => getStockOnHand(tx, variantId)), 0);
    const count = t.db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get() as { n: number };
    assert.equal(Number(count.n), 0);
  } finally {
    t.cleanup();
  }
});

test('stock is tracked per Product + Colour + Size, not per product', () => {
  const t = createTestDb();
  try {
    const black = seedVariant(t, { colour: 'Black', size: 'L' });
    const navy = seedVariant(t, { colour: 'Navy', size: 'L' });
    assert.notEqual(black.variantId, navy.variantId);
    assert.equal(black.productId, navy.productId);

    transaction(t.db, (tx) => {
      recordOpeningBalance(tx, { variantId: black.variantId, qty: 7, userId: t.userId });
    });
    readOnly(t.db, (tx) => {
      assert.equal(getStockOnHand(tx, black.variantId), 7);
      assert.equal(getStockOnHand(tx, navy.variantId), 0, 'the other colour is a separate shelf');
      assert.equal(listStockSummaries(tx, { productId: black.productId }).length, 2);
    });
  } finally {
    t.cleanup();
  }
});

function getStockOnHandDirect(t: TestDb, variantId: number): number {
  const row = t.db
    .prepare('SELECT COALESCE(SUM(qty_delta), 0) AS total FROM stock_movements WHERE variant_id = ?')
    .get(variantId) as { total: number };
  return Number(row.total);
}

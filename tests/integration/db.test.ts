import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { backupTo, closeDatabase, openDatabase, readOnly, transaction } from '../../src/db/sqlite.ts';
import { migrate } from '../../src/db/migrate.ts';
import { createTestDb, seedVariant } from '../helpers/testDb.ts';

test('migrations produce a schema that passes integrity and FK checks', () => {
  const t = createTestDb();
  try {
    const integrity = t.db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    assert.equal(integrity.integrity_check, 'ok');
    assert.equal(t.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  } finally {
    t.cleanup();
  }
});

test('D014: every table is STRICT', () => {
  const t = createTestDb();
  try {
    const tables = t.db
      .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string; sql: string }>;
    assert.ok(tables.length > 20, `expected the full schema, found ${tables.length} tables`);
    const lax = tables.filter((row) => !/\bSTRICT\b/i.test(row.sql)).map((row) => row.name);
    assert.deepEqual(lax, [], `these tables are not STRICT: ${lax.join(', ')}`);
  } finally {
    t.cleanup();
  }
});

test('D014: the database itself rejects a float in a money column', () => {
  const t = createTestDb();
  try {
    const { productId } = seedVariant(t);
    assert.throws(
      () => t.db.prepare('UPDATE products SET default_price_minor = 850.5 WHERE id = ?').run(productId),
      /datatype mismatch|cannot store/i,
    );
    assert.throws(
      () => t.db.prepare("UPDATE products SET default_price_minor = 'lots' WHERE id = ?").run(productId),
      /datatype mismatch|cannot store/i,
    );
    // A whole number expressed as a float is still storable, because SQLite
    // converts losslessly. Guarding that case is money.ts's job, not the
    // schema's — which is exactly why both layers exist.
    t.db.prepare('UPDATE products SET default_price_minor = 850.0 WHERE id = ?').run(productId);
    const row = t.db.prepare('SELECT default_price_minor AS p FROM products WHERE id = ?').get(productId) as {
      p: number;
    };
    assert.equal(row.p, 850);
  } finally {
    t.cleanup();
  }
});

test('foreign keys are enforced on every connection', () => {
  const t = createTestDb();
  try {
    assert.throws(
      () =>
        t.db
          .prepare(
            `INSERT INTO stock_movements
               (variant_id, qty_delta, movement_type, ref_type, occurred_at, created_at, created_by)
             VALUES (99999, 5, 'opening_balance', 'opening', ?, ?, ?)`,
          )
          .run('2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', t.userId),
      /FOREIGN KEY constraint failed/i,
    );
  } finally {
    t.cleanup();
  }
});

test('a stock movement of zero is rejected', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    assert.throws(
      () => insertMovement(t, variantId, 0, 'opening_balance', 'opening'),
      /CHECK constraint failed/i,
    );
  } finally {
    t.cleanup();
  }
});

test('movement sign and movement type must agree', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    // An "in" movement cannot remove stock...
    assert.throws(
      () => insertMovement(t, variantId, -5, 'adjustment_in', 'adjustment'),
      /CHECK constraint failed/i,
    );
    // ...and an "out" movement cannot add it.
    assert.throws(
      () => insertMovement(t, variantId, 5, 'delivery_out', 'delivery'),
      /CHECK constraint failed/i,
    );
    // The correct pairings are accepted.
    insertMovement(t, variantId, 5, 'adjustment_in', 'adjustment');
    insertMovement(t, variantId, -2, 'delivery_out', 'delivery');
    const row = t.db
      .prepare('SELECT coalesce(sum(qty_delta), 0) AS on_hand FROM stock_movements WHERE variant_id = ?')
      .get(variantId) as { on_hand: number };
    assert.equal(row.on_hand, 3);
  } finally {
    t.cleanup();
  }
});

test('a thrown error rolls the whole transaction back, leaving nothing behind', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    const before = countMovements(t, variantId);

    assert.throws(
      () =>
        transaction(t.db, (tx) => {
          tx.db
            .prepare(
              `INSERT INTO stock_movements
                 (variant_id, qty_delta, movement_type, ref_type, occurred_at, created_at, created_by)
               VALUES (?, 10, 'opening_balance', 'opening', ?, ?, ?)`,
            )
            .run(variantId, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', t.userId);
          // Simulate a business rule failing after a write has happened.
          throw new Error('business rule failed halfway through');
        }),
      /business rule failed halfway through/,
    );

    assert.equal(countMovements(t, variantId), before, 'the rolled-back movement must not survive');
    assert.equal(t.db.isTransaction, false, 'the connection must be left clean');
  } finally {
    t.cleanup();
  }
});

test('a successful transaction commits everything', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    const result = transaction(t.db, (tx) => {
      for (const qty of [10, 5, 3]) {
        tx.db
          .prepare(
            `INSERT INTO stock_movements
               (variant_id, qty_delta, movement_type, ref_type, occurred_at, created_at, created_by)
             VALUES (?, ?, 'opening_balance', 'opening', ?, ?, ?)`,
          )
          .run(variantId, qty, '2026-08-23T00:00:00.000Z', '2026-08-23T00:00:00.000Z', t.userId);
      }
      return 'done';
    });
    assert.equal(result, 'done');
    assert.equal(countMovements(t, variantId), 3);
  } finally {
    t.cleanup();
  }
});

test('nesting a transaction is refused rather than faked with a savepoint', () => {
  const t = createTestDb();
  try {
    assert.throws(
      () => transaction(t.db, () => transaction(t.db, () => 1)),
      /cannot be nested/,
    );
    assert.equal(t.db.isTransaction, false);
  } finally {
    t.cleanup();
  }
});

test('a read-only call does not open a transaction', () => {
  const t = createTestDb();
  try {
    const count = readOnly(t.db, (tx) => {
      assert.equal(tx.db.isTransaction, false);
      return (tx.db.prepare('SELECT count(*) AS c FROM sizes').get() as { c: number }).c;
    });
    assert.ok(count >= 6);
  } finally {
    t.cleanup();
  }
});

test('VACUUM INTO makes a usable backup while the database is open', () => {
  const t = createTestDb();
  try {
    const { variantId } = seedVariant(t);
    insertMovement(t, variantId, 7, 'opening_balance', 'opening');

    const dbPath = (t.db.prepare('PRAGMA database_list').get() as { file: string }).file;
    const backupPath = join(dirname(dbPath), 'backup.db');
    backupTo(t.db, backupPath);
    assert.ok(existsSync(backupPath));

    // The copy must be a real, readable database with the same data.
    const restored = openDatabase(backupPath, { walMode: false });
    const row = restored
      .prepare('SELECT coalesce(sum(qty_delta), 0) AS on_hand FROM stock_movements WHERE variant_id = ?')
      .get(variantId) as { on_hand: number };
    assert.equal(row.on_hand, 7);
    closeDatabase(restored);
  } finally {
    t.cleanup();
  }
});

test('an applied migration cannot be edited behind the database back', () => {
  const t = createTestDb();
  const migrationPath = join(
    import.meta.dirname,
    '..',
    '..',
    'src',
    'db',
    'migrations',
    '001_init.sql',
  );
  const original = readFileSync(migrationPath, 'utf8');
  try {
    writeFileSync(migrationPath, `${original}\n-- tampered\n`);
    assert.throws(() => migrate(t.db), /has changed since it was applied/);
  } finally {
    writeFileSync(migrationPath, original);
    t.cleanup();
  }
});

test('migrating twice is a no-op', () => {
  const t = createTestDb();
  try {
    const result = migrate(t.db);
    assert.deepEqual(result.applied, []);
    assert.deepEqual(result.alreadyApplied, ['001_init.sql']);
  } finally {
    t.cleanup();
  }
});

// --- helpers ---------------------------------------------------------------

function insertMovement(
  t: ReturnType<typeof createTestDb>,
  variantId: number,
  qtyDelta: number,
  movementType: string,
  refType: string,
): void {
  const at = '2026-08-23T00:00:00.000Z';
  t.db
    .prepare(
      `INSERT INTO stock_movements
         (variant_id, qty_delta, movement_type, ref_type, occurred_at, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(variantId, qtyDelta, movementType, refType, at, at, t.userId);
}

function countMovements(t: ReturnType<typeof createTestDb>, variantId: number): number {
  return (
    t.db.prepare('SELECT count(*) AS c FROM stock_movements WHERE variant_id = ?').get(variantId) as {
      c: number;
    }
  ).c;
}

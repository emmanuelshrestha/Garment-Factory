import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, openDatabase, type Db } from '../../src/db/sqlite.ts';
import { migrate } from '../../src/db/migrate.ts';

/**
 * A real SQLite file with real migrations applied. Not a mock: the rules under
 * test are transactional and constraint-based, so testing them against a fake
 * would only prove the fake works.
 */
export type TestDb = {
  db: Db;
  /** id of the seeded owner user, for created_by columns. */
  userId: number;
  cleanup: () => void;
};

export function createTestDb(): TestDb {
  const dir = mkdtempSync(join(tmpdir(), 'garment-test-'));
  const db = openDatabase(join(dir, 'test.db'));
  migrate(db);

  db.prepare(
    `INSERT INTO users (username, password_hash, password_salt, display_name, role, created_at)
     VALUES ('owner', 'x', 'x', 'Owner', 'owner', ?)`,
  ).run(new Date().toISOString());
  const userId = Number(
    (db.prepare('SELECT id FROM users WHERE username = ?').get('owner') as { id: number }).id,
  );

  return {
    db,
    userId,
    cleanup: () => {
      closeDatabase(db);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A product with one colour and one size, returning the variant id. */
export function seedVariant(
  t: TestDb,
  options: {
    productCode?: string;
    colour?: string;
    size?: string;
    defaultPriceMinor?: number | null;
    variantPriceMinor?: number | null;
    minStockQty?: number;
  } = {},
): { productId: number; variantId: number } {
  const {
    productCode = 'JKT-A',
    colour = 'Black',
    size = 'L',
    defaultPriceMinor = 80000,
    variantPriceMinor = null,
    minStockQty = 0,
  } = options;
  const now = new Date().toISOString();

  const productId = upsertId(
    t.db,
    'SELECT id FROM products WHERE code = ?',
    [productCode],
    `INSERT INTO products (code, name, default_price_minor, default_currency, created_at, created_by)
     VALUES (?, ?, ?, 'NPR', ?, ?)`,
    [productCode, `Product ${productCode}`, defaultPriceMinor, now, t.userId],
  );
  const colourId = upsertId(
    t.db,
    'SELECT id FROM colours WHERE name = ?',
    [colour],
    'INSERT INTO colours (name) VALUES (?)',
    [colour],
  );
  const sizeId = upsertId(
    t.db,
    'SELECT id FROM sizes WHERE name = ?',
    [size],
    'INSERT INTO sizes (name, sort_order) VALUES (?, 99)',
    [size],
  );

  const sku = `${productCode}-${colour}-${size}`.toUpperCase();
  const variantId = upsertId(
    t.db,
    'SELECT id FROM product_variants WHERE sku = ?',
    [sku],
    `INSERT INTO product_variants (product_id, colour_id, size_id, sku, price_minor, min_stock_qty, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [productId, colourId, sizeId, sku, variantPriceMinor, minStockQty, now],
  );

  return { productId, variantId };
}

export function seedCustomer(t: TestDb, code = 'CUST-1'): number {
  return upsertId(
    t.db,
    'SELECT id FROM customers WHERE code = ?',
    [code],
    `INSERT INTO customers (code, name, default_currency, created_at, created_by)
     VALUES (?, ?, 'NPR', ?, ?)`,
    [code, `Customer ${code}`, new Date().toISOString(), t.userId],
  );
}

type SqlValue = string | number | bigint | null | Uint8Array;

function upsertId(
  db: Db,
  selectSql: string,
  selectParams: SqlValue[],
  insertSql: string,
  insertParams: SqlValue[],
): number {
  const existing = db.prepare(selectSql).get(...selectParams) as { id: number } | undefined;
  if (existing) {
    return Number(existing.id);
  }
  const info = db.prepare(insertSql).run(...insertParams);
  return Number(info.lastInsertRowid);
}

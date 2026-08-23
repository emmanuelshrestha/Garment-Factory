/**
 * Create the owner account, and optionally a small sample catalogue.
 *
 *   node --experimental-strip-types scripts/seed.ts
 *   node --experimental-strip-types scripts/seed.ts --demo
 *
 * Safe to run more than once: nothing here overwrites existing rows.
 *
 * The owner's password is hashed with scrypt (a Node built-in) because the
 * users table requires a hash and a salt. Login is NOT implemented yet — the
 * hash exists so that when it is, no data has to be migrated.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../src/config.ts';
import { closeDatabase, openDatabase, transaction, type Tx } from '../src/db/sqlite.ts';
import { migrate } from '../src/db/migrate.ts';
import {
  createColour,
  createProduct,
  generateVariants,
  listColours,
  listSizes,
  listVariants,
} from '../src/services/catalogue.ts';
import { createCustomer, getCustomerByCode } from '../src/services/customers.ts';
import { recordOpeningBalance } from '../src/services/stock.ts';
import { nowTimestamp } from '../src/domain/dates.ts';

const OWNER_USERNAME = 'owner';
const DEMO_COLOURS = ['Black', 'Navy Blue', 'Olive', 'Maroon'];

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  return { hash: scryptSync(password, salt, 64).toString('hex'), salt };
}

/** Exported so a future login route uses exactly the same comparison. */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function ensureOwner(tx: Tx): { userId: number; created: boolean } {
  const existing = tx.db.prepare('SELECT id FROM users WHERE username = ?').get(OWNER_USERNAME) as
    | { id: number }
    | undefined;
  if (existing) {
    return { userId: Number(existing.id), created: false };
  }

  const password = process.env.GARMENT_OWNER_PASSWORD ?? 'change-me';
  const { hash, salt } = hashPassword(password);
  const info = tx.db
    .prepare(
      `INSERT INTO users (username, password_hash, password_salt, display_name, role, created_at)
       VALUES (?, ?, ?, ?, 'owner', ?)`,
    )
    .run(OWNER_USERNAME, hash, salt, 'Owner', nowTimestamp());
  return { userId: Number(info.lastInsertRowid), created: true };
}

function seedDemo(tx: Tx, userId: number): void {
  for (const name of DEMO_COLOURS) {
    if (!listColours(tx).some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      createColour(tx, name);
    }
  }
  const colours = listColours(tx).filter((c) => DEMO_COLOURS.includes(c.name));
  const sizes = listSizes(tx).filter((s) => ['S', 'M', 'L', 'XL'].includes(s.name));

  const products = [
    { code: 'JKT-BOMBER', name: 'Bomber Jacket', defaultPriceMinor: 285000 },
    { code: 'JKT-PUFFER', name: 'Puffer Jacket', defaultPriceMinor: 420000 },
    { code: 'JKT-DENIM', name: 'Denim Jacket', defaultPriceMinor: 195000 },
  ];

  for (const product of products) {
    const existing = tx.db.prepare('SELECT id FROM products WHERE code = ?').get(product.code) as
      | { id: number }
      | undefined;
    if (existing) {
      continue;
    }
    const productId = createProduct(tx, {
      code: product.code,
      name: product.name,
      category: 'Jackets',
      defaultPriceMinor: product.defaultPriceMinor,
      userId,
    });
    generateVariants(tx, {
      productId,
      colourIds: colours.map((c) => c.id),
      sizeIds: sizes.map((s) => s.id),
      minStockQty: 20,
      userId,
    });
    // Opening stock on some variants only, so the screen shows red, amber and
    // green bands instead of a uniform wall of zeros.
    const variants = listVariants(tx, productId);
    variants.forEach((variant, index) => {
      const qty = [0, 8, 22, 40, 60][index % 5]!;
      if (qty > 0) {
        recordOpeningBalance(tx, { variantId: variant.id, qty, userId });
      }
    });
  }

  for (const customer of [
    { code: 'C-001', name: 'Himalaya Traders', phone: '9801000001' },
    { code: 'C-002', name: 'Everest Outfitters', phone: '9801000002' },
    { code: 'C-003', name: 'Kathmandu Retail House', phone: '9801000003' },
  ]) {
    if (!getCustomerByCode(tx, customer.code)) {
      createCustomer(tx, { ...customer, userId });
    }
  }
}

function main(): void {
  const demo = process.argv.includes('--demo');
  mkdirSync(dirname(config.databasePath), { recursive: true });

  const db = openDatabase(config.databasePath);
  try {
    migrate(db);
    const summary = transaction(db, (tx) => {
      const owner = ensureOwner(tx);
      if (demo) {
        seedDemo(tx, owner.userId);
      }
      return owner;
    });

    console.log(
      summary.created
        ? `created owner user (id ${summary.userId}); password: ${process.env.GARMENT_OWNER_PASSWORD ? 'from GARMENT_OWNER_PASSWORD' : "'change-me'"}`
        : `owner user already exists (id ${summary.userId})`,
    );
    if (demo) {
      console.log('sample catalogue, stock and customers seeded');
    }
    console.log(`database: ${config.databasePath}`);
  } finally {
    closeDatabase(db);
  }
}

main();

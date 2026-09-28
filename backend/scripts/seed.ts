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
import { config } from '../src/config.ts';
import { closeDatabase, openDatabase, transaction, type Tx } from '../src/db/sqlite.ts';
import { migrate } from '../src/db/migrate.ts';
import { ensureOwner } from './seedLib.ts';
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

const DEMO_COLOURS = ['Black', 'Navy Blue', 'Olive', 'Maroon', 'Heather Grey'];

export const DEMO_10_PRODUCTS = [
  { code: 'JKT-BOMBER', name: 'Classic Bomber Jacket', category: 'Jackets', defaultPriceMinor: 285000 },
  { code: 'JKT-PUFFER', name: 'Winter Puffer Jacket', category: 'Jackets', defaultPriceMinor: 420000 },
  { code: 'JKT-DENIM', name: 'Vintage Denim Jacket', category: 'Jackets', defaultPriceMinor: 320000 },
  { code: 'HD-FLEECE', name: 'Heavyweight Fleece Hoodie', category: 'Hoodies', defaultPriceMinor: 220000 },
  { code: 'TS-POLO', name: 'Pique Cotton Polo Shirt', category: 'Shirts', defaultPriceMinor: 145000 },
  { code: 'TR-FORMAL', name: 'Slim Fit Formal Trouser', category: 'Trousers', defaultPriceMinor: 185000 },
  { code: 'CRG-CARGO', name: 'Tactical Cargo Pants', category: 'Pants', defaultPriceMinor: 240000 },
  { code: 'SWT-CREW', name: 'Premium Cotton Crewneck', category: 'Sweaters', defaultPriceMinor: 195000 },
  { code: 'WND-SHELL', name: 'Waterproof Windbreaker', category: 'Outerwear', defaultPriceMinor: 265000 },
  { code: 'TRK-SPORT', name: 'Athletic Track Pants', category: 'Sportswear', defaultPriceMinor: 160000 },
];

function seedDemo(tx: Tx, userId: number): void {
  for (const name of DEMO_COLOURS) {
    if (!listColours(tx).some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      createColour(tx, name);
    }
  }
  const colours = listColours(tx).filter((c) => DEMO_COLOURS.includes(c.name));
  const sizes = listSizes(tx).filter((s) => ['S', 'M', 'L', 'XL'].includes(s.name));

  for (const product of DEMO_10_PRODUCTS) {
    const existing = tx.db.prepare('SELECT id FROM products WHERE code = ?').get(product.code) as
      | { id: number }
      | undefined;
    if (existing) {
      continue;
    }
    const productId = createProduct(tx, {
      code: product.code,
      name: product.name,
      category: product.category,
      defaultPriceMinor: product.defaultPriceMinor,
      defaultCurrency: 'NPR',
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

  const demoCustomers = [
    {
      code: 'CUST-DEMO',
      name: 'Kathmandu Outfitters & Apparel',
      phone: '+977 9801234567',
      address: 'New Road, Kathmandu, Nepal',
      defaultCurrency: 'NPR' as const,
      notes: 'Premier wholesale retail chain with 4 outlets in Bagmati province.',
    },
    {
      code: 'C-001',
      name: 'Himalaya Traders',
      phone: '+977 9801000001',
      address: 'Pokhara Lakeside, Nepal',
      defaultCurrency: 'NPR' as const,
      notes: 'Active trekking and sportswear client.',
    },
    {
      code: 'C-002',
      name: 'Everest Outfitters',
      phone: '+977 9801000002',
      address: 'Namche Bazaar, Solukhumbu',
      defaultCurrency: 'NPR' as const,
      notes: 'Specializes in down jackets and fleece wear.',
    },
  ];

  for (const customer of demoCustomers) {
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
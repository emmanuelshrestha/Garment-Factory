/**
 * The catalogue: products, colours, sizes, and the Product + Colour + Size
 * variants that stock is actually counted against.
 *
 * Price changes append to `price_history` and never touch a document that has
 * already been written. Orders snapshot their price at confirmation, so the two
 * mechanisms together mean a price change today cannot alter what was sold last
 * month.
 */

import type { Tx } from '../db/sqlite.ts';
import { NotFoundError, ValidationError } from '../domain/errors.ts';
import { assertCurrency, assertNonNegativeMinor, type Currency } from '../domain/money.ts';
import { assertDate, nowTimestamp, today } from '../domain/dates.ts';
import { resolvePrice, type ResolvedPrice } from '../domain/pricing.ts';

export type Colour = { id: number; name: string; isActive: boolean };
export type Size = { id: number; name: string; sortOrder: number; isActive: boolean };

export type Product = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  defaultPriceMinor: number | null;
  defaultCurrency: Currency;
  isActive: boolean;
  images: string[];
  displayImage: string | null;
};

export type Variant = {
  id: number;
  productId: number;
  sku: string;
  colourId: number;
  colour: string;
  sizeId: number;
  size: string;
  priceMinor: number | null;
  minStockQty: number;
  isActive: boolean;
};

/* -------------------------------------------------------------- colours */

export function createColour(tx: Tx, name: string): number {
  const clean = assertName(name, 'colour name');
  const existing = tx.db.prepare('SELECT id FROM colours WHERE name = ?').get(clean) as
    | { id: number }
    | undefined;
  if (existing) {
    throw new ValidationError(`colour ${clean} already exists`, 'name');
  }
  return Number(tx.db.prepare('INSERT INTO colours (name) VALUES (?)').run(clean).lastInsertRowid);
}

export function listColours(tx: Tx, activeOnly = false): Colour[] {
  const rows = tx.db
    .prepare(
      `SELECT id, name, is_active FROM colours
        ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY name`,
    )
    .all() as { id: number; name: string; is_active: number }[];
  return rows.map((r) => ({ id: Number(r.id), name: r.name, isActive: Number(r.is_active) === 1 }));
}

export function setColourActive(tx: Tx, colourId: number, isActive: boolean): void {
  const info = tx.db
    .prepare('UPDATE colours SET is_active = ? WHERE id = ?')
    .run(isActive ? 1 : 0, colourId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('colour', colourId);
  }
}

export function updateColour(tx: Tx, colourId: number, name: string): void {
  const clean = assertName(name, 'colour name');
  const existing = tx.db.prepare('SELECT id FROM colours WHERE name = ? AND id != ?').get(clean, colourId);
  if (existing) {
    throw new ValidationError(`colour ${clean} already exists`, 'name');
  }
  const info = tx.db.prepare('UPDATE colours SET name = ? WHERE id = ?').run(clean, colourId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('colour', colourId);
  }
}

export function deleteColour(tx: Tx, colourId: number): void {
  const existing = tx.db.prepare('SELECT 1 FROM product_variants WHERE colour_id = ? LIMIT 1').get(colourId);
  if (existing) {
    throw new ValidationError(
      'Cannot delete colour: it is used by existing product variants. Deactivate it instead.',
      'colourId',
    );
  }
  const info = tx.db.prepare('DELETE FROM colours WHERE id = ?').run(colourId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('colour', colourId);
  }
}

/* ---------------------------------------------------------------- sizes */

export function createSize(tx: Tx, name: string, sortOrder: number): number {
  const clean = assertName(name, 'size name');
  if (!Number.isInteger(sortOrder)) {
    throw new ValidationError(`sortOrder must be a whole number, got ${sortOrder}`, 'sortOrder');
  }
  return Number(
    tx.db.prepare('INSERT INTO sizes (name, sort_order) VALUES (?, ?)').run(clean, sortOrder)
      .lastInsertRowid,
  );
}

export function setSizeActive(tx: Tx, sizeId: number, isActive: boolean): void {
  const info = tx.db
    .prepare('UPDATE sizes SET is_active = ? WHERE id = ?')
    .run(isActive ? 1 : 0, sizeId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('size', sizeId);
  }
}

export function updateSize(
  tx: Tx,
  sizeId: number,
  changes: { name?: string; sortOrder?: number; isActive?: boolean },
): void {
  const current = tx.db.prepare('SELECT id, name, sort_order, is_active FROM sizes WHERE id = ?').get(sizeId) as
    | { id: number; name: string; sort_order: number; is_active: number }
    | undefined;
  if (!current) {
    throw new NotFoundError('size', sizeId);
  }
  const name = changes.name !== undefined ? assertName(changes.name, 'size name') : current.name;
  const sortOrder = changes.sortOrder !== undefined ? changes.sortOrder : current.sort_order;
  if (!Number.isInteger(sortOrder)) {
    throw new ValidationError(`sortOrder must be a whole number, got ${sortOrder}`, 'sortOrder');
  }
  const isActive = changes.isActive !== undefined ? (changes.isActive ? 1 : 0) : current.is_active;

  const existing = tx.db.prepare('SELECT id FROM sizes WHERE name = ? AND id != ?').get(name, sizeId);
  if (existing) {
    throw new ValidationError(`size ${name} already exists`, 'name');
  }
  tx.db.prepare('UPDATE sizes SET name = ?, sort_order = ?, is_active = ? WHERE id = ?').run(name, sortOrder, isActive, sizeId);
}

export function deleteSize(tx: Tx, sizeId: number): void {
  const existing = tx.db.prepare('SELECT 1 FROM product_variants WHERE size_id = ? LIMIT 1').get(sizeId);
  if (existing) {
    throw new ValidationError(
      'Cannot delete size: it is used by existing product variants. Deactivate it instead.',
      'sizeId',
    );
  }
  const info = tx.db.prepare('DELETE FROM sizes WHERE id = ?').run(sizeId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('size', sizeId);
  }
}

export function listSizes(tx: Tx, activeOnly = false): Size[] {
  const rows = tx.db
    .prepare(
      `SELECT id, name, sort_order, is_active FROM sizes
        ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order, name`,
    )
    .all() as { id: number; name: string; sort_order: number; is_active: number }[];
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    sortOrder: Number(r.sort_order),
    isActive: Number(r.is_active) === 1,
  }));
}

/* ------------------------------------------------------------- products */

export type CreateProductInput = {
  code: string;
  name: string;
  category?: string | null;
  defaultPriceMinor?: number | null;
  defaultCurrency?: Currency;
  images?: string[];
  displayImage?: string | null;
  userId: number;
};

export function createProduct(tx: Tx, input: CreateProductInput): number {
  const code = assertCode(input.code, 'product code');
  const name = assertName(input.name, 'product name');
  const currency = assertCurrency(input.defaultCurrency ?? 'NPR');
  const price =
    input.defaultPriceMinor === null || input.defaultPriceMinor === undefined
      ? null
      : assertNonNegativeMinor(input.defaultPriceMinor, 'defaultPriceMinor');

  if (getProductByCode(tx, code)) {
    throw new ValidationError(`product code ${code} is already used`, 'code');
  }

  const images = sanitizeImages(input.images);
  const displayImage = deriveDisplayImage(images, input.displayImage);
  const imagesJson = images.length > 0 ? JSON.stringify(images) : null;

  const productId = Number(
    tx.db
      .prepare(
        `INSERT INTO products (code, name, category, default_price_minor, default_currency, created_at, created_by, images, display_image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(code, name, input.category ?? null, price, currency, nowTimestamp(), input.userId, imagesJson, displayImage)
      .lastInsertRowid,
  );

  if (price !== null) {
    recordPriceHistory(tx, {
      productId,
      variantId: null,
      priceMinor: price,
      currency,
      effectiveFrom: today(),
      note: 'Initial price',
      userId: input.userId,
    });
  }

  return productId;
}

export function getProduct(tx: Tx, productId: number): Product {
  const row = tx.db
    .prepare(
      `SELECT id, code, name, category, default_price_minor, default_currency, is_active, images, display_image
         FROM products WHERE id = ?`,
    )
    .get(productId) as ProductRow | undefined;
  if (!row) {
    throw new NotFoundError('product', productId);
  }
  return toProduct(row);
}

export function getProductByCode(tx: Tx, code: string): Product | null {
  const row = tx.db
    .prepare(
      `SELECT id, code, name, category, default_price_minor, default_currency, is_active, images, display_image
         FROM products WHERE code = ?`,
    )
    .get(code) as ProductRow | undefined;
  return row ? toProduct(row) : null;
}

export function listProducts(tx: Tx, activeOnly = false): Product[] {
  const rows = tx.db
    .prepare(
      `SELECT id, code, name, category, default_price_minor, default_currency, is_active, images, display_image
         FROM products ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY code`,
    )
    .all() as ProductRow[];
  return rows.map(toProduct);
}

export type UpdateProductChanges = {
  code?: string;
  name?: string;
  category?: string | null;
  defaultPriceMinor?: number | null;
  defaultCurrency?: Currency;
  isActive?: boolean;
  images?: string[];
  displayImage?: string | null;
  userId?: number;
};

export function updateProduct(tx: Tx, productId: number, changes: UpdateProductChanges): void {
  const product = getProduct(tx, productId);
  const code = changes.code === undefined ? product.code : assertCode(changes.code, 'product code');
  if (code !== product.code) {
    const existing = getProductByCode(tx, code);
    if (existing && existing.id !== productId) {
      throw new ValidationError(`product code ${code} is already used`, 'code');
    }
  }
  const name = changes.name === undefined ? product.name : assertName(changes.name, 'product name');
  const category = changes.category === undefined ? product.category : changes.category;
  const currency = changes.defaultCurrency === undefined ? product.defaultCurrency : assertCurrency(changes.defaultCurrency);
  const isActive = changes.isActive === undefined ? product.isActive : changes.isActive;

  let priceMinor = product.defaultPriceMinor;
  if (changes.defaultPriceMinor !== undefined) {
    priceMinor =
      changes.defaultPriceMinor === null
        ? null
        : assertNonNegativeMinor(changes.defaultPriceMinor, 'defaultPriceMinor');
  }

  const images = changes.images !== undefined ? sanitizeImages(changes.images) : product.images;
  const requestedDisplay = changes.displayImage !== undefined ? changes.displayImage : product.displayImage;
  const displayImage = deriveDisplayImage(images, requestedDisplay);
  const imagesJson = images.length > 0 ? JSON.stringify(images) : null;

  tx.db
    .prepare('UPDATE products SET code = ?, name = ?, category = ?, default_price_minor = ?, default_currency = ?, is_active = ?, images = ?, display_image = ? WHERE id = ?')
    .run(code, name, category, priceMinor, currency, isActive ? 1 : 0, imagesJson, displayImage, productId);

  if (priceMinor !== null && priceMinor !== product.defaultPriceMinor && changes.userId !== undefined) {
    recordPriceHistory(tx, {
      productId,
      variantId: null,
      priceMinor,
      currency,
      effectiveFrom: today(),
      note: 'Updated default price',
      userId: changes.userId,
    });
  }
}

export function deleteProduct(tx: Tx, productId: number): void {
  const product = getProduct(tx, productId);

  const hasMovements = tx.db
    .prepare(
      `SELECT 1 FROM stock_movements m
       JOIN product_variants v ON v.id = m.variant_id
       WHERE v.product_id = ? LIMIT 1`,
    )
    .get(productId);
  if (hasMovements) {
    throw new ValidationError(
      `Cannot delete product '${product.code}': it has recorded stock movements. Deactivate it instead.`,
      'productId',
    );
  }

  const hasOrders = tx.db
    .prepare(
      `SELECT 1 FROM order_lines ol
       JOIN product_variants v ON v.id = ol.variant_id
       WHERE v.product_id = ? LIMIT 1`,
    )
    .get(productId);
  if (hasOrders) {
    throw new ValidationError(
      `Cannot delete product '${product.code}': it has existing orders. Deactivate it instead.`,
      'productId',
    );
  }

  const hasCutting = tx.db
    .prepare(
      `SELECT 1 FROM cutting_stock_movements c
       JOIN product_variants v ON v.id = c.variant_id
       WHERE v.product_id = ? LIMIT 1`,
    )
    .get(productId);
  if (hasCutting) {
    throw new ValidationError(
      `Cannot delete product '${product.code}': it has recorded cutting stock movements. Deactivate it instead.`,
      'productId',
    );
  }

  tx.db.prepare('DELETE FROM price_history WHERE product_id = ?').run(productId);
  tx.db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
  const info = tx.db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('product', productId);
  }
}

/* ------------------------------------------------------------- variants */

export type GenerateVariantsInput = {
  productId: number;
  colourIds: number[];
  sizeIds: number[];
  minStockQty?: number;
  userId: number;
};

/**
 * Bulk-create the colour x size grid for a product.
 *
 * Idempotent: a variant that already exists is skipped, not duplicated and not
 * an error, so the owner can add one colour later and press the same button.
 */
export function generateVariants(
  tx: Tx,
  input: GenerateVariantsInput,
): { created: number[]; skipped: number } {
  const product = getProduct(tx, input.productId);
  if (input.colourIds.length === 0 || input.sizeIds.length === 0) {
    throw new ValidationError('choose at least one colour and one size', 'colourIds');
  }
  const minStockQty = input.minStockQty ?? 0;
  if (!Number.isInteger(minStockQty) || minStockQty < 0) {
    throw new ValidationError(`minStockQty must be zero or more, got ${minStockQty}`, 'minStockQty');
  }
  const colours = new Map(listColours(tx).map((c) => [c.id, c.name]));
  const sizes = new Map(listSizes(tx).map((s) => [s.id, s.name]));
  const now = nowTimestamp();
  const created: number[] = [];
  let skipped = 0;

  for (const colourId of dedupe(input.colourIds)) {
    const colourName = colours.get(colourId);
    if (!colourName) {
      throw new NotFoundError('colour', colourId);
    }
    for (const sizeId of dedupe(input.sizeIds)) {
      const sizeName = sizes.get(sizeId);
      if (!sizeName) {
        throw new NotFoundError('size', sizeId);
      }
      const existing = tx.db
        .prepare('SELECT id FROM product_variants WHERE product_id = ? AND colour_id = ? AND size_id = ?')
        .get(product.id, colourId, sizeId) as { id: number } | undefined;
      if (existing) {
        skipped += 1;
        continue;
      }
      const sku = buildSku(product.code, colourName, sizeName);
      const variantId = Number(
        tx.db
          .prepare(
            `INSERT INTO product_variants (product_id, colour_id, size_id, sku, price_minor, min_stock_qty, created_at)
             VALUES (?, ?, ?, ?, NULL, ?, ?)`,
          )
          .run(product.id, colourId, sizeId, sku, minStockQty, now).lastInsertRowid,
      );
      created.push(variantId);
    }
  }

  return { created, skipped };
}

export function listVariants(tx: Tx, productId?: number, activeOnly = false): Variant[] {
  if (productId !== undefined) {
    const rows = tx.db
      .prepare(
        `SELECT v.id, v.product_id, v.sku, v.colour_id, c.name AS colour,
                v.size_id, s.name AS size, v.price_minor, v.min_stock_qty, v.is_active
           FROM product_variants v
           JOIN colours c ON c.id = v.colour_id
           JOIN sizes   s ON s.id = v.size_id
          WHERE v.product_id = ? ${activeOnly ? 'AND v.is_active = 1' : ''}
          ORDER BY c.name, s.sort_order`,
      )
      .all(productId) as VariantRow[];
    return rows.map(toVariant);
  }
  const rows = tx.db
    .prepare(
      `SELECT v.id, v.product_id, v.sku, v.colour_id, c.name AS colour,
              v.size_id, s.name AS size, v.price_minor, v.min_stock_qty, v.is_active
         FROM product_variants v
         JOIN colours c ON c.id = v.colour_id
         JOIN sizes   s ON s.id = v.size_id
        ${activeOnly ? 'WHERE v.is_active = 1' : ''}
        ORDER BY v.product_id, c.name, s.sort_order`,
    )
    .all() as VariantRow[];
  return rows.map(toVariant);
}

export function getVariant(tx: Tx, variantId: number): Variant {
  const row = tx.db
    .prepare(
      `SELECT v.id, v.product_id, v.sku, v.colour_id, c.name AS colour,
              v.size_id, s.name AS size, v.price_minor, v.min_stock_qty, v.is_active
         FROM product_variants v
         JOIN colours c ON c.id = v.colour_id
         JOIN sizes   s ON s.id = v.size_id
        WHERE v.id = ?`,
    )
    .get(variantId) as VariantRow | undefined;
  if (!row) {
    throw new NotFoundError('product variant', variantId);
  }
  return toVariant(row);
}

export function setVariantMinStock(tx: Tx, variantId: number, minStockQty: number): void {
  if (!Number.isInteger(minStockQty) || minStockQty < 0) {
    throw new ValidationError(`minStockQty must be zero or more, got ${minStockQty}`, 'minStockQty');
  }
  const info = tx.db
    .prepare('UPDATE product_variants SET min_stock_qty = ? WHERE id = ?')
    .run(minStockQty, variantId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('product variant', variantId);
  }
}

export function setVariantActive(tx: Tx, variantId: number, isActive: boolean): void {
  const info = tx.db
    .prepare('UPDATE product_variants SET is_active = ? WHERE id = ?')
    .run(isActive ? 1 : 0, variantId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('product variant', variantId);
  }
}

export function deleteVariant(tx: Tx, variantId: number): void {
  const variant = getVariant(tx, variantId);
  const hasMovements = tx.db
    .prepare('SELECT 1 FROM stock_movements WHERE variant_id = ? LIMIT 1')
    .get(variantId);
  if (hasMovements) {
    throw new ValidationError(
      `Cannot delete variant '${variant.sku}': it has recorded stock movements. Deactivate it instead.`,
      'variantId',
    );
  }

  const hasOrders = tx.db
    .prepare('SELECT 1 FROM order_lines WHERE variant_id = ? LIMIT 1')
    .get(variantId);
  if (hasOrders) {
    throw new ValidationError(
      `Cannot delete variant '${variant.sku}': it has existing orders. Deactivate it instead.`,
      'variantId',
    );
  }

  const hasCutting = tx.db
    .prepare('SELECT 1 FROM cutting_stock_movements WHERE variant_id = ? LIMIT 1')
    .get(variantId);
  if (hasCutting) {
    throw new ValidationError(
      `Cannot delete variant '${variant.sku}': it has recorded cutting stock movements. Deactivate it instead.`,
      'variantId',
    );
  }

  tx.db.prepare('DELETE FROM price_history WHERE variant_id = ?').run(variantId);
  const info = tx.db.prepare('DELETE FROM product_variants WHERE id = ?').run(variantId);
  if (Number(info.changes) === 0) {
    throw new NotFoundError('product variant', variantId);
  }
}

/* -------------------------------------------------------------- pricing */

/** The price a new order line would use, and where it came from (D009). */
export function resolveVariantPrice(tx: Tx, variantId: number): ResolvedPrice {
  const row = tx.db
    .prepare(
      `SELECT v.sku, v.price_minor, p.default_price_minor, p.default_currency
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
        WHERE v.id = ?`,
    )
    .get(variantId) as
    | { sku: string; price_minor: number | null; default_price_minor: number | null; default_currency: string }
    | undefined;
  if (!row) {
    throw new NotFoundError('product variant', variantId);
  }
  return resolvePrice({
    variantPriceMinor: row.price_minor === null ? null : Number(row.price_minor),
    productDefaultPriceMinor: row.default_price_minor === null ? null : Number(row.default_price_minor),
    productCurrency: row.default_currency,
    sku: row.sku,
  });
}

/**
 * Change a product's default price.
 *
 * The current price lives on the product; every change is also appended to
 * `price_history`, which is never updated or deleted. Existing orders and
 * invoices are untouched — they carry their own snapshot.
 */
export function setProductPrice(
  tx: Tx,
  input: {
    productId: number;
    priceMinor: number;
    currency?: Currency;
    effectiveFrom?: string;
    note?: string | null;
    userId: number;
  },
): void {
  const product = getProduct(tx, input.productId);
  const priceMinor = assertNonNegativeMinor(input.priceMinor, 'priceMinor');
  const currency = assertCurrency(input.currency ?? product.defaultCurrency);

  tx.db
    .prepare('UPDATE products SET default_price_minor = ?, default_currency = ? WHERE id = ?')
    .run(priceMinor, currency, product.id);

  recordPriceHistory(tx, {
    productId: product.id,
    variantId: null,
    priceMinor,
    currency,
    effectiveFrom: input.effectiveFrom ?? today(),
    note: input.note ?? null,
    userId: input.userId,
  });
}

/** Override the price of one variant, or clear the override by passing null. */
export function setVariantPrice(
  tx: Tx,
  input: {
    variantId: number;
    priceMinor: number | null;
    effectiveFrom?: string;
    note?: string | null;
    userId: number;
  },
): void {
  const variant = getVariant(tx, input.variantId);
  const product = getProduct(tx, variant.productId);
  const priceMinor =
    input.priceMinor === null ? null : assertNonNegativeMinor(input.priceMinor, 'priceMinor');

  tx.db.prepare('UPDATE product_variants SET price_minor = ? WHERE id = ?').run(priceMinor, variant.id);

  if (priceMinor !== null) {
    recordPriceHistory(tx, {
      productId: product.id,
      variantId: variant.id,
      priceMinor,
      currency: product.defaultCurrency,
      effectiveFrom: input.effectiveFrom ?? today(),
      note: input.note ?? null,
      userId: input.userId,
    });
  }
}

export type PriceHistoryRow = {
  id: number;
  productId: number;
  variantId: number | null;
  priceMinor: number;
  currency: Currency;
  effectiveFrom: string;
  note: string | null;
};

export function listPriceHistory(tx: Tx, productId: number): PriceHistoryRow[] {
  const rows = tx.db
    .prepare(
      `SELECT id, product_id, variant_id, price_minor, currency, effective_from, note
         FROM price_history WHERE product_id = ? ORDER BY effective_from, id`,
    )
    .all(productId) as {
    id: number;
    product_id: number;
    variant_id: number | null;
    price_minor: number;
    currency: string;
    effective_from: string;
    note: string | null;
  }[];
  return rows.map((r) => ({
    id: Number(r.id),
    productId: Number(r.product_id),
    variantId: r.variant_id === null ? null : Number(r.variant_id),
    priceMinor: Number(r.price_minor),
    currency: assertCurrency(r.currency),
    effectiveFrom: r.effective_from,
    note: r.note,
  }));
}

function recordPriceHistory(
  tx: Tx,
  input: {
    productId: number;
    variantId: number | null;
    priceMinor: number;
    currency: Currency;
    effectiveFrom: string;
    note: string | null;
    userId: number;
  },
): void {
  tx.db
    .prepare(
      `INSERT INTO price_history (product_id, variant_id, price_minor, currency, effective_from, created_at, created_by, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.productId,
      input.variantId,
      input.priceMinor,
      input.currency,
      assertDate(input.effectiveFrom, 'effectiveFrom'),
      nowTimestamp(),
      input.userId,
      input.note,
    );
}

/* --------------------------------------------------------------- helpers */

type ProductRow = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  default_price_minor: number | null;
  default_currency: string;
  is_active: number;
  images: string | null;
  display_image: string | null;
};

export function sanitizeImages(images?: string[]): string[] {
  if (!images || !Array.isArray(images)) return [];
  return images
    .filter((img): img is string => typeof img === 'string' && img.trim().length > 0)
    .map((img) => img.trim())
    .slice(0, 4);
}

export function deriveDisplayImage(images: string[], requestedDisplayImage?: string | null): string | null {
  if (requestedDisplayImage && images.includes(requestedDisplayImage)) {
    return requestedDisplayImage;
  }
  return images.length > 0 ? images[0] : null;
}

function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return sanitizeImages(parsed);
    }
  } catch {
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return [raw.trim()];
    }
  }
  return [];
}

function toProduct(row: ProductRow): Product {
  const images = parseImages(row.images);
  const displayImage = deriveDisplayImage(images, row.display_image);
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    category: row.category,
    defaultPriceMinor: row.default_price_minor === null ? null : Number(row.default_price_minor),
    defaultCurrency: assertCurrency(row.default_currency),
    isActive: Number(row.is_active) === 1,
    images,
    displayImage,
  };
}

type VariantRow = {
  id: number;
  product_id: number;
  sku: string;
  colour_id: number;
  colour: string;
  size_id: number;
  size: string;
  price_minor: number | null;
  min_stock_qty: number;
  is_active: number;
};

function toVariant(row: VariantRow): Variant {
  return {
    id: Number(row.id),
    productId: Number(row.product_id),
    sku: row.sku,
    colourId: Number(row.colour_id),
    colour: row.colour,
    sizeId: Number(row.size_id),
    size: row.size,
    priceMinor: row.price_minor === null ? null : Number(row.price_minor),
    minStockQty: Number(row.min_stock_qty),
    isActive: Number(row.is_active) === 1,
  };
}

/** `JKT-A` + `Navy Blue` + `2XL` -> `JKT-A-NAVYBLUE-2XL`. */
export function buildSku(productCode: string, colour: string, size: string): string {
  const part = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${productCode.toUpperCase()}-${part(colour)}-${part(size)}`;
}

function assertCode(value: unknown, field: string): string {
  const clean = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 _-]{0,31}$/.test(clean)) {
    throw new ValidationError(
      `${field} must be 1-32 characters of letters, digits, space, hyphen or underscore, got ${JSON.stringify(value)}`,
      'code',
    );
  }
  return clean;
}

function assertName(value: unknown, field: string): string {
  const clean = String(value ?? '').trim();
  if (clean.length === 0 || clean.length > 120) {
    throw new ValidationError(`${field} must be 1-120 characters, got ${JSON.stringify(value)}`, 'name');
  }
  return clean;
}

function dedupe(ids: number[]): number[] {
  return [...new Set(ids)];
}

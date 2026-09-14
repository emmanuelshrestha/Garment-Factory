/**
 * Catalogue routes: products, colours, sizes, variants and prices.
 *
 * Reads go through `readOnly` so they never take the write lock; writes go
 * through `transaction` so a half-finished change cannot be committed.
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import { ValidationError } from '../../domain/errors.ts';
import {
  createColour,
  createProduct,
  generateVariants,
  getProduct,
  listColours,
  listPriceHistory,
  listProducts,
  listSizes,
  listVariants,
  resolveVariantPrice,
  setColourActive,
  setProductPrice,
  setSizeActive,
  setVariantActive,
  setVariantMinStock,
  setVariantPrice,
  updateProduct,
} from '../../services/catalogue.ts';
import { recordOpeningBalance } from '../../services/stock.ts';
import type { AppContext } from '../context.ts';
import type { Route } from '../router.ts';
import {
  optionalBoolean,
  optionalInt,
  optionalString,
  readJsonBody,
  requireInt,
  requireString,
  sendJson,
} from '../respond.ts';

export function catalogueRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/colours',
      handler: ({ res, query }) => {
        const colours = readOnly(app.db, (tx) => listColours(tx, optionalBoolean(query.activeOnly, 'activeOnly') ?? false));
        sendJson(res, 200, { colours });
      },
    },
    {
      method: 'POST',
      pattern: '/api/colours',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const id = transaction(app.db, (tx) => createColour(tx, requireString(body.name, 'name')));
        sendJson(res, 201, { id });
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/colours/:id',
      handler: async ({ req, res, params }) => {
        const colourId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        transaction(app.db, (tx) =>
          setColourActive(tx, colourId, optionalBoolean(body.isActive, 'isActive') ?? false),
        );
        sendJson(res, 200, { ok: true });
      },
    },
    {
      method: 'GET',
      pattern: '/api/sizes',
      handler: ({ res, query }) => {
        const sizes = readOnly(app.db, (tx) => listSizes(tx, optionalBoolean(query.activeOnly, 'activeOnly') ?? false));
        sendJson(res, 200, { sizes });
      },
    },
    {
      method: 'POST',
      pattern: '/api/sizes',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const id = transaction(app.db, (tx) =>
          createSize(tx, requireString(body.name, 'name'), requireInt(body.sortOrder, 'sortOrder')),
        );
        sendJson(res, 201, { id });
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/sizes/:id',
      handler: async ({ req, res, params }) => {
        const sizeId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        transaction(app.db, (tx) =>
          setSizeActive(tx, sizeId, optionalBoolean(body.isActive, 'isActive') ?? false),
        );
        sendJson(res, 200, { ok: true });
      },
    },
    {
      method: 'GET',
      pattern: '/api/products',
      handler: ({ res, query }) => {
        const products = readOnly(app.db, (tx) =>
          listProducts(tx, optionalBoolean(query.activeOnly, 'activeOnly') ?? false),
        );
        sendJson(res, 200, { products });
      },
    },
    {
      method: 'POST',
      pattern: '/api/products',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const id = transaction(app.db, (tx) =>
          createProduct(tx, {
            code: requireString(body.code, 'code'),
            name: requireString(body.name, 'name'),
            category: optionalString(body.category, 'category') ?? null,
            defaultPriceMinor: optionalInt(body.defaultPriceMinor, 'defaultPriceMinor') ?? null,
            defaultCurrency: optionalString(body.defaultCurrency, 'defaultCurrency') as 'NPR' | undefined,
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 201, { id });
      },
    },
    {
      method: 'GET',
      pattern: '/api/products/:id',
      handler: ({ res, params }) => {
        const productId = requireInt(params.id, 'id');
        const payload = readOnly(app.db, (tx) => ({
          product: getProduct(tx, productId),
          variants: listVariants(tx, productId),
          priceHistory: listPriceHistory(tx, productId),
        }));
        sendJson(res, 200, payload);
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/products/:id',
      handler: async ({ req, res, params }) => {
        const productId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        transaction(app.db, (tx) =>
          updateProduct(tx, productId, {
            name: optionalString(body.name, 'name'),
            category: body.category === undefined ? undefined : optionalString(body.category, 'category') ?? null,
            isActive: optionalBoolean(body.isActive, 'isActive'),
          }),
        );
        sendJson(res, 200, { ok: true });
      },
    },
    {
      method: 'POST',
      pattern: '/api/products/:id/price',
      handler: async ({ req, res, params }) => {
        const productId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        transaction(app.db, (tx) =>
          setProductPrice(tx, {
            productId,
            priceMinor: requireInt(body.priceMinor, 'priceMinor'),
            effectiveFrom: optionalString(body.effectiveFrom, 'effectiveFrom'),
            note: optionalString(body.note, 'note') ?? null,
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 200, { ok: true });
      },
    },
    {
      method: 'POST',
      pattern: '/api/products/:id/variants',
      handler: async ({ req, res, params }) => {
        const productId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const openingStockQty = optionalInt(body.openingStockQty, 'openingStockQty') ?? 0;
        if (openingStockQty < 0) {
          throw new ValidationError('openingStockQty must be zero or more', 'openingStockQty');
        }
        const result = transaction(app.db, (tx) => {
          const generated = generateVariants(tx, {
            productId,
            colourIds: intArray(body.colourIds, 'colourIds'),
            sizeIds: intArray(body.sizeIds, 'sizeIds'),
            minStockQty: optionalInt(body.minStockQty, 'minStockQty'),
            userId: app.currentUserId,
          });
          // Automatically create opening balance for each newly created variant
          if (openingStockQty > 0) {
            for (const variantId of generated.created) {
              recordOpeningBalance(tx, {
                variantId,
                qty: openingStockQty,
                userId: app.currentUserId,
              });
            }
          }
          return generated;
        });
        sendJson(res, 201, result);
      },
    },
    {
      // GET /api/variants?productId=N — list all variants, optionally filtered by product
      method: 'GET',
      pattern: '/api/variants',
      handler: ({ res, query }) => {
        const productId = optionalInt(query.productId, 'productId');
        const activeOnly = optionalBoolean(query.activeOnly, 'activeOnly') ?? false;
        const variants = readOnly(app.db, (tx) => listVariants(tx, productId, activeOnly));
        sendJson(res, 200, { variants });
      },
    },
    {
      method: 'GET',
      pattern: '/api/variants/:id/price',
      handler: ({ res, params }) => {
        const variantId = requireInt(params.id, 'id');
        const price = readOnly(app.db, (tx) => resolveVariantPrice(tx, variantId));
        sendJson(res, 200, price);
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/variants/:id',
      handler: async ({ req, res, params }) => {
        const variantId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        transaction(app.db, (tx) => {
          if (body.minStockQty !== undefined) {
            setVariantMinStock(tx, variantId, requireInt(body.minStockQty, 'minStockQty'));
          }
          if (body.isActive !== undefined) {
            setVariantActive(tx, variantId, optionalBoolean(body.isActive, 'isActive') ?? true);
          }
          if (body.priceMinor !== undefined) {
            // Explicit null clears the override and falls back to the product
            // price; it is not the same as omitting the field.
            setVariantPrice(tx, {
              variantId,
              priceMinor: body.priceMinor === null ? null : requireInt(body.priceMinor, 'priceMinor'),
              userId: app.currentUserId,
            });
          }
        });
        sendJson(res, 200, { ok: true });
      },
    },
  ];
}

function intArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty array of ids`, field);
  }
  return value.map((item, index) => requireInt(item, `${field}[${index}]`));
}

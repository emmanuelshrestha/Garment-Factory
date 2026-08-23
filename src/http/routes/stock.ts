/**
 * Stock routes.
 *
 * There is no endpoint that sets a stock quantity. Stock changes only through
 * an opening balance, an adjustment with a reason, or a delivery — every one of
 * them an append-only ledger entry. That is deliberate: a PUT that overwrote a
 * quantity would destroy the audit trail the business depends on.
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import { ValidationError } from '../../domain/errors.ts';
import {
  createStockAdjustment,
  getStockSummary,
  listLowStock,
  listMovements,
  listStockSummaries,
  recordOpeningBalance,
  type AdjustmentLineInput,
  type AdjustmentReasonCode,
} from '../../services/stock.ts';
import type { AppContext } from '../context.ts';
import type { Route } from '../router.ts';
import {
  optionalBoolean,
  optionalInt,
  optionalString,
  readJsonBody,
  requireArray,
  requireInt,
  requireString,
  sendJson,
} from '../respond.ts';

export function stockRoutes(app: AppContext): Route[] {
  return [
    {
      // The Colour x Size matrix screen. One query, not one per variant.
      method: 'GET',
      pattern: '/api/stock',
      handler: ({ res, query }) => {
        const rows = readOnly(app.db, (tx) =>
          listStockSummaries(tx, {
            productId: optionalInt(query.productId, 'productId'),
            activeOnly: optionalBoolean(query.activeOnly, 'activeOnly') ?? false,
          }),
        );
        sendJson(res, 200, { stock: rows });
      },
    },
    {
      method: 'GET',
      pattern: '/api/stock/low',
      handler: ({ res }) => {
        const rows = readOnly(app.db, (tx) => listLowStock(tx));
        sendJson(res, 200, { lowStock: rows });
      },
    },
    {
      method: 'GET',
      pattern: '/api/stock/:variantId',
      handler: ({ res, params, query }) => {
        const variantId = requireInt(params.variantId, 'variantId');
        const payload = readOnly(app.db, (tx) => ({
          summary: getStockSummary(tx, variantId),
          movements: listMovements(tx, variantId, optionalInt(query.limit, 'limit') ?? 500),
        }));
        sendJson(res, 200, payload);
      },
    },
    {
      // Starting stock when a variant first enters the system.
      method: 'POST',
      pattern: '/api/stock/opening-balance',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const movementId = transaction(app.db, (tx) =>
          recordOpeningBalance(tx, {
            variantId: requireInt(body.variantId, 'variantId'),
            qty: requireInt(body.qty, 'qty'),
            occurredAt: optionalString(body.occurredAt, 'occurredAt'),
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 201, { movementId });
      },
    },
    {
      // The only sanctioned way to correct stock by hand. A note is mandatory.
      method: 'POST',
      pattern: '/api/stock/adjustments',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const lines: AdjustmentLineInput[] = requireArray(body.lines, 'lines').map((line, index) => ({
          variantId: requireInt(line.variantId, `lines[${index}].variantId`),
          qtyDelta: requireInt(line.qtyDelta, `lines[${index}].qtyDelta`),
        }));
        const adjustment = transaction(app.db, (tx) =>
          createStockAdjustment(tx, {
            reasonCode: requireString(body.reasonCode, 'reasonCode') as AdjustmentReasonCode,
            note: requireString(body.note, 'note'),
            adjustedAt: optionalString(body.adjustedAt, 'adjustedAt'),
            lines,
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 201, { adjustment });
      },
    },
    {
      // Present only to be explicit that it is refused. Editing a quantity
      // directly would leave the ledger and the screen disagreeing.
      method: 'PUT',
      pattern: '/api/stock/:variantId',
      handler: () => {
        throw new ValidationError(
          'stock quantities cannot be set directly; post an opening balance or a stock adjustment with a reason',
          'qty',
        );
      },
    },
  ];
}

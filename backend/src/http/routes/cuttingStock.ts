import { transaction, readOnly } from '../../db/sqlite.ts';
import {
  addCuttingStock,
  transferToFinishedStock,
  listCuttingStockSummaries,
  createCuttingStockAdjustment,
} from '../../services/cuttingStock.ts';
import type { AppContext } from '../context.ts';
import type { Route } from '../router.ts';
import {
  readJsonBody,
  requireInt,
  sendJson,
} from '../respond.ts';

export function cuttingStockRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/cutting-stock',
      handler: async ({ res }) => {
        const summaries = readOnly(app.db, (tx) => listCuttingStockSummaries(tx));
        sendJson(res, 200, { summaries });
      },
    },
    {
      method: 'POST',
      pattern: '/api/cutting-stock/add',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        transaction(app.db, (tx) => {
          addCuttingStock(tx, requireInt(body.variantId, 'variantId'), requireInt(body.qty, 'qty'), app.currentUserId);
          sendJson(res, 201, { ok: true });
        });
      },
    },
    {
      method: 'POST',
      pattern: '/api/cutting-stock/transfer-to-finished',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        transaction(app.db, (tx) => {
          transferToFinishedStock(tx, requireInt(body.variantId, 'variantId'), requireInt(body.qty, 'qty'), app.currentUserId);
          sendJson(res, 201, { ok: true });
        });
      },
    },
    {
      method: 'POST',
      pattern: '/api/cutting-stock/adjust',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        transaction(app.db, (tx) => {
          createCuttingStockAdjustment(
            tx,
            requireInt(body.variantId, 'variantId'),
            requireInt(body.qtyDelta, 'qtyDelta'),
            String(body.reasonCode ?? 'correction'),
            String(body.note ?? ''),
            app.currentUserId
          );
          sendJson(res, 201, { ok: true });
        });
      },
    },
  ];
}

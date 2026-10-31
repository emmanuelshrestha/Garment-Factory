
import { readOnly, transaction } from '../../db/sqlite.ts';
import {
  listBags,
  createBag,
  getBagDetails,
  addStockToBag,
  removeStockFromBag,
  transferStock,
  getGlobalStockByBags
} from '../../services/bags.ts';
import type { AppContext } from '../context.ts';
import type { Route } from '../router.ts';
import {
  readJsonBody,
  requireInt,
  requireString,
  optionalString,
  sendJson,
} from '../respond.ts';

export function bagRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/bags',
      handler: ({ res }) => {
        const bags = readOnly(app.db, (tx) => listBags(tx));
        sendJson(res, 200, { bags });
      },
    },
    {
      method: 'POST',
      pattern: '/api/bags',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const name = requireString(body.name, 'name');
        const notes = optionalString(body.notes, 'notes') ?? null;
        transaction(app.db, (tx) => createBag(tx, name, notes));
        sendJson(res, 201, { success: true });
      },
    },
    {
      method: 'GET',
      pattern: '/api/bags/:id',
      handler: ({ res, params }) => {
        const bagId = requireInt(params.id, 'id');
        const bag = readOnly(app.db, (tx) => getBagDetails(tx, bagId));
        sendJson(res, 200, { bag });
      },
    },
    {
      method: 'POST',
      pattern: '/api/bags/:id/add-stock',
      handler: async ({ req, res, params }) => {
        const bagId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const variantId = requireInt(body.variantId, 'variantId');
        const quantity = requireInt(body.quantity, 'quantity');
        const reason = requireString(body.reason, 'reason');
        transaction(app.db, (tx) => addStockToBag(tx, bagId, variantId, quantity, reason, app.currentUserId));
        sendJson(res, 200, { success: true });
      },
    },
    {
      method: 'POST',
      pattern: '/api/bags/:id/remove-stock',
      handler: async ({ req, res, params }) => {
        const bagId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const variantId = requireInt(body.variantId, 'variantId');
        const quantity = requireInt(body.quantity, 'quantity');
        const reason = requireString(body.reason, 'reason');
        transaction(app.db, (tx) => removeStockFromBag(tx, bagId, variantId, quantity, reason, app.currentUserId));
        sendJson(res, 200, { success: true });
      },
    },
    {
      method: 'POST',
      pattern: '/api/bags/transfer',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const fromBagId = requireInt(body.fromBagId, 'fromBagId');
        const toBagId = requireInt(body.toBagId, 'toBagId');
        const variantId = requireInt(body.variantId, 'variantId');
        const quantity = requireInt(body.quantity, 'quantity');
        const reason = requireString(body.reason, 'reason');
        transaction(app.db, (tx) => transferStock(tx, fromBagId, toBagId, variantId, quantity, reason, app.currentUserId));
        sendJson(res, 200, { success: true });
      },
    },
    {
      method: 'GET',
      pattern: '/api/bags/stock/global',
      handler: ({ res }) => {
        const rows = readOnly(app.db, (tx) => getGlobalStockByBags(tx));
        sendJson(res, 200, { rows });
      },
    },
  ];
}

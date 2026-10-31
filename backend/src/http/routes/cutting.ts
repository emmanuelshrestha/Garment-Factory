
import { readOnly, transaction } from '../../db/sqlite.ts';
import {
  listCutBatches,
  recordCutBatch,
  getCuttingSummary,
} from '../../services/cutting.ts';
import type { AppContext } from '../context.ts';
import type { Route } from '../router.ts';
import {
  readJsonBody,
  requireInt,
  requireString,
  optionalInt,
  optionalString,
  sendJson,
} from '../respond.ts';

export function cuttingRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/cutting',
      handler: ({ res, query }) => {
        const records = readOnly(app.db, (tx) =>
          listCutBatches(tx, {
            startDate: optionalString(query.startDate, 'startDate'),
            endDate: optionalString(query.endDate, 'endDate'),
            productId: optionalInt(query.productId, 'productId'),
            limit: optionalInt(query.limit, 'limit'),
            offset: optionalInt(query.offset, 'offset'),
          }),
        );
        sendJson(res, 200, { records });
      },
    },
    {
      method: 'POST',
      pattern: '/api/cutting',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        transaction(app.db, (tx) =>
          recordCutBatch(tx, {
            productId: requireInt(body.productId, 'productId'),
            size: requireString(body.size, 'size'),
            quantity: requireInt(body.quantity, 'quantity'),
            date: requireString(body.cutDate, 'cutDate'),
            recordedById: app.currentUserId,
          }),
        );
        sendJson(res, 201, { success: true });
      },
    },
    {
      method: 'GET',
      pattern: '/api/cutting/summary',
      handler: ({ res, query }) => {
        const groupBy = (optionalString(query.groupBy, 'groupBy') as 'product' | 'size' | 'day') ?? 'product';
        const summary = readOnly(app.db, (tx) => getCuttingSummary(tx, groupBy));
        sendJson(res, 200, { summary });
      },
    },
  ];
}

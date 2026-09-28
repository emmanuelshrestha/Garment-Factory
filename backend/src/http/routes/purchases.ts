import { readOnly, transaction } from '../../db/sqlite.ts';
import type { Currency } from '../../domain/money.ts';
import { createPurchase, getPurchase, listPurchases } from '../../services/purchases.ts';
import type { AppContext } from '../context.ts';
import {
  optionalInt,
  optionalString,
  readJsonBody,
  requireInt,
  requireString,
  sendJson,
} from '../respond.ts';
import type { Route } from '../router.ts';

export function purchaseRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/purchases',
      handler: ({ res, query }) => {
        const purchases = readOnly(app.db, (tx) =>
          listPurchases(tx, {
            supplierName: optionalString(query.supplierName, 'supplierName'),
            from: optionalString(query.from, 'from'),
            to: optionalString(query.to, 'to'),
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { purchases });
      },
    },
    {
      method: 'GET',
      pattern: '/api/purchases/:id',
      handler: ({ res, params }) => {
        const id = requireInt(params.id, 'id');
        const purchase = readOnly(app.db, (tx) => getPurchase(tx, id));
        sendJson(res, 200, { purchase });
      },
    },
    {
      method: 'POST',
      pattern: '/api/purchases',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const purchase = transaction(app.db, (tx) =>
          createPurchase(tx, {
            supplierName: requireString(body.supplierName, 'supplierName'),
            description: requireString(body.description, 'description'),
            amountMinor: requireInt(body.amountMinor, 'amountMinor'),
            currency: optionalString(body.currency, 'currency') as Currency | undefined,
            fxRateToNpr: optionalInt(body.fxRateToNpr, 'fxRateToNpr'),
            purchaseDate: optionalString(body.purchaseDate, 'purchaseDate'),
            note: optionalString(body.note, 'note'),
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 201, { purchase });
      },
    },
  ];
}

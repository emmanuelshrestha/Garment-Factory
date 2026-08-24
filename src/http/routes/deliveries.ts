/**
 * Delivery routes.
 *
 * The two-step shape is exposed as it is: POST a draft, then POST its dispatch.
 * `?dispatch=true` on the create is the one-step convenience the console uses,
 * and it is still one transaction. Nothing here decides what may go out — that
 * is `services/deliveries.ts` and `domain/deliveries.ts` (D021).
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import {
  cancelDelivery,
  createDelivery,
  deliverNow,
  dispatchDelivery,
  getDelivery,
  listDeliveries,
  type DeliveryLineInput,
  type DeliveryStatus,
} from '../../services/deliveries.ts';
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

export function deliveryRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/deliveries',
      handler: ({ res, query }) => {
        const deliveries = readOnly(app.db, (tx) =>
          listDeliveries(tx, {
            orderId: optionalInt(query.orderId, 'orderId'),
            customerId: optionalInt(query.customerId, 'customerId'),
            // The service validates the status against DELIVERY_STATUSES.
            status: optionalString(query.status, 'status') as DeliveryStatus | undefined,
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { deliveries });
      },
    },
    {
      method: 'POST',
      pattern: '/api/deliveries',
      handler: async ({ req, res, query }) => {
        const body = await readJsonBody(req);
        const input = {
          orderId: requireInt(body.orderId, 'orderId'),
          deliveredAt: optionalString(body.deliveredAt, 'deliveredAt'),
          notes: optionalString(body.notes, 'notes') ?? null,
          lines: readLineInputs(body.lines),
          userId: app.currentUserId,
        };

        // Dispatch in the same transaction as the draft, so a refusal leaves no
        // half-shipped paperwork behind.
        const dispatch =
          optionalBoolean(query.dispatch, 'dispatch') ?? optionalBoolean(body.dispatch, 'dispatch') ?? false;

        if (dispatch) {
          const result = transaction(app.db, (tx) => deliverNow(tx, input));
          sendJson(res, 201, result);
          return;
        }

        const delivery = transaction(app.db, (tx) => createDelivery(tx, input));
        sendJson(res, 201, { delivery });
      },
    },
    {
      method: 'GET',
      pattern: '/api/deliveries/:id',
      handler: ({ res, params }) => {
        const deliveryId = requireInt(params.id, 'id');
        const delivery = readOnly(app.db, (tx) => getDelivery(tx, deliveryId));
        sendJson(res, 200, { delivery });
      },
    },
    {
      // The physical event: this is what moves finished stock.
      method: 'POST',
      pattern: '/api/deliveries/:id/dispatch',
      handler: ({ res, params }) => {
        const deliveryId = requireInt(params.id, 'id');
        const result = transaction(app.db, (tx) => dispatchDelivery(tx, deliveryId, app.currentUserId));
        sendJson(res, 200, result);
      },
    },
    {
      method: 'POST',
      pattern: '/api/deliveries/:id/cancel',
      handler: async ({ req, res, params }) => {
        const deliveryId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const delivery = transaction(app.db, (tx) =>
          cancelDelivery(tx, deliveryId, requireString(body.reason, 'reason'), app.currentUserId),
        );
        sendJson(res, 200, { delivery });
      },
    },
  ];
}

function readLineInputs(value: unknown): DeliveryLineInput[] {
  return requireArray(value, 'lines').map((line, index) => ({
    orderLineId: requireInt(line.orderLineId, `lines[${index}].orderLineId`),
    qty: requireInt(line.qty, `lines[${index}].qty`),
  }));
}

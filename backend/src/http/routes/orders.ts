/**
 * Order routes.
 *
 * Every rule that matters lives in the service and the domain: prices are
 * snapshotted at confirmation (D005), confirming reserves stock without moving
 * it (D004), and a shortage is reported rather than refused so the owner
 * decides whether to produce. This file only translates JSON.
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import type { Currency } from '../../domain/money.ts';
import type { OrderStatus } from '../../domain/orders.ts';
import {
  addOrderLine,
  allocateOrder,
  cancelOrder,
  closeOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  listShortages,
  removeOrderLine,
  updateOrderLine,
  type OrderLineInput,
} from '../../services/orders.ts';
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

export function orderRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/orders',
      handler: ({ res, query }) => {
        const orders = readOnly(app.db, (tx) =>
          listOrders(tx, {
            customerId: optionalInt(query.customerId, 'customerId'),
            // The service validates the status against ORDER_STATUSES.
            status: optionalString(query.status, 'status') as OrderStatus | undefined,
            openOnly: optionalBoolean(query.openOnly, 'openOnly') ?? false,
            fromDate: optionalString(query.fromDate, 'fromDate'),
            toDate: optionalString(query.toDate, 'toDate'),
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { orders });
      },
    },
    {
      method: 'POST',
      pattern: '/api/orders',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const lines = readLineInputs(body.lines);
        const order = transaction(app.db, (tx) => {
          const orderId = createOrder(tx, {
            customerId: requireInt(body.customerId, 'customerId'),
            orderDate: optionalString(body.orderDate, 'orderDate'),
            requiredDate: optionalString(body.requiredDate, 'requiredDate') ?? null,
            currency: optionalString(body.currency, 'currency') as Currency | undefined,
            fxRateToNpr: optionalInt(body.fxRateToNpr, 'fxRateToNpr'),
            notes: optionalString(body.notes, 'notes') ?? null,
            lines,
            userId: app.currentUserId,
          });
          // Read it back inside the same transaction so the reply shows exactly
          // what was committed, including the snapshotted prices.
          return getOrder(tx, orderId);
        });
        sendJson(res, 201, { order });
      },
    },
    {
      method: 'GET',
      pattern: '/api/orders/:id',
      handler: ({ res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const order = readOnly(app.db, (tx) => getOrder(tx, orderId));
        sendJson(res, 200, { order });
      },
    },
    {
      method: 'POST',
      pattern: '/api/orders/:id/lines',
      handler: async ({ req, res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const order = transaction(app.db, (tx) => {
          addOrderLine(tx, orderId, readLineInput(body, 'line'));
          return getOrder(tx, orderId);
        });
        sendJson(res, 201, { order });
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/orders/:id/lines/:lineId',
      handler: async ({ req, res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const lineId = requireInt(params.lineId, 'lineId');
        const body = await readJsonBody(req);
        const order = transaction(app.db, (tx) => {
          updateOrderLine(tx, orderId, lineId, {
            qtyOrdered: optionalInt(body.qtyOrdered, 'qtyOrdered'),
            unitPriceMinor: optionalInt(body.unitPriceMinor, 'unitPriceMinor'),
            note: body.note === undefined ? undefined : optionalString(body.note, 'note') ?? null,
          });
          return getOrder(tx, orderId);
        });
        sendJson(res, 200, { order });
      },
    },
    {
      method: 'DELETE',
      pattern: '/api/orders/:id/lines/:lineId',
      handler: ({ res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const lineId = requireInt(params.lineId, 'lineId');
        const order = transaction(app.db, (tx) => {
          removeOrderLine(tx, orderId, lineId);
          return getOrder(tx, orderId);
        });
        sendJson(res, 200, { order });
      },
    },
    {
      method: 'POST',
      pattern: '/api/orders/:id/confirm',
      handler: ({ res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const payload = transaction(app.db, (tx) => {
          const allocation = confirmOrder(tx, orderId, app.currentUserId);
          return { allocation, order: getOrder(tx, orderId) };
        });
        sendJson(res, 200, payload);
      },
    },
    {
      // Re-run reservation after stock arrives. Safe to call repeatedly: it
      // only ever tops up the outstanding quantity.
      method: 'POST',
      pattern: '/api/orders/:id/allocate',
      handler: ({ res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const payload = transaction(app.db, (tx) => {
          const allocation = allocateOrder(tx, orderId, app.currentUserId);
          return { allocation, order: getOrder(tx, orderId) };
        });
        sendJson(res, 200, payload);
      },
    },
    {
      method: 'POST',
      pattern: '/api/orders/:id/cancel',
      handler: async ({ req, res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const order = transaction(app.db, (tx) => {
          cancelOrder(tx, orderId, requireString(body.reason, 'reason'));
          return getOrder(tx, orderId);
        });
        sendJson(res, 200, { order });
      },
    },
    {
      method: 'POST',
      pattern: '/api/orders/:id/close',
      handler: ({ res, params }) => {
        const orderId = requireInt(params.id, 'id');
        const order = transaction(app.db, (tx) => {
          closeOrder(tx, orderId);
          return getOrder(tx, orderId);
        });
        sendJson(res, 200, { order });
      },
    },
    {
      // What production has to cover, worst first. Derived, never stored.
      method: 'GET',
      pattern: '/api/shortages',
      handler: ({ res }) => {
        const shortages = readOnly(app.db, (tx) => listShortages(tx));
        sendJson(res, 200, { shortages });
      },
    },
  ];
}

function readLineInputs(value: unknown): OrderLineInput[] {
  return requireArray(value, 'lines').map((line, index) => readLineInput(line, `lines[${index}]`));
}

function readLineInput(line: Record<string, unknown>, field: string): OrderLineInput {
  return {
    variantId: requireInt(line.variantId, `${field}.variantId`),
    qtyOrdered: requireInt(line.qtyOrdered, `${field}.qtyOrdered`),
    unitPriceMinor: optionalInt(line.unitPriceMinor, `${field}.unitPriceMinor`),
    note: optionalString(line.note, `${field}.note`) ?? null,
  };
}

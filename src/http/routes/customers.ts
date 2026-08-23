/**
 * Customer routes.
 *
 * A customer is never deleted — deactivation hides them from new orders while
 * their order, invoice and payment history stays intact.
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import type { Currency } from '../../domain/money.ts';
import {
  createCustomer,
  deactivateCustomer,
  getCustomer,
  listCustomers,
  reactivateCustomer,
  updateCustomer,
} from '../../services/customers.ts';
import { listOrders } from '../../services/orders.ts';
import type { AppContext } from '../context.ts';
import type { Route } from '../router.ts';
import {
  optionalBoolean,
  optionalString,
  readJsonBody,
  requireInt,
  requireString,
  sendJson,
} from '../respond.ts';

export function customerRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/customers',
      handler: ({ res, query }) => {
        const customers = readOnly(app.db, (tx) =>
          listCustomers(tx, {
            activeOnly: optionalBoolean(query.activeOnly, 'activeOnly') ?? false,
            search: optionalString(query.search, 'search'),
          }),
        );
        sendJson(res, 200, { customers });
      },
    },
    {
      method: 'POST',
      pattern: '/api/customers',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const id = transaction(app.db, (tx) =>
          createCustomer(tx, {
            code: requireString(body.code, 'code'),
            name: requireString(body.name, 'name'),
            phone: optionalString(body.phone, 'phone') ?? null,
            address: optionalString(body.address, 'address') ?? null,
            defaultCurrency: optionalString(body.defaultCurrency, 'defaultCurrency') as Currency | undefined,
            notes: optionalString(body.notes, 'notes') ?? null,
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 201, { id });
      },
    },
    {
      method: 'GET',
      pattern: '/api/customers/:id',
      handler: ({ res, params }) => {
        const customerId = requireInt(params.id, 'id');
        const payload = readOnly(app.db, (tx) => ({
          customer: getCustomer(tx, customerId),
          orders: listOrders(tx, { customerId }),
        }));
        sendJson(res, 200, payload);
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/customers/:id',
      handler: async ({ req, res, params }) => {
        const customerId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        transaction(app.db, (tx) =>
          updateCustomer(tx, customerId, {
            name: optionalString(body.name, 'name'),
            phone: body.phone === undefined ? undefined : optionalString(body.phone, 'phone') ?? null,
            address: body.address === undefined ? undefined : optionalString(body.address, 'address') ?? null,
            defaultCurrency: optionalString(body.defaultCurrency, 'defaultCurrency') as Currency | undefined,
            notes: body.notes === undefined ? undefined : optionalString(body.notes, 'notes') ?? null,
          }),
        );
        sendJson(res, 200, { ok: true });
      },
    },
    {
      method: 'POST',
      pattern: '/api/customers/:id/deactivate',
      handler: ({ res, params }) => {
        const customerId = requireInt(params.id, 'id');
        transaction(app.db, (tx) => deactivateCustomer(tx, customerId));
        sendJson(res, 200, { ok: true });
      },
    },
    {
      method: 'POST',
      pattern: '/api/customers/:id/reactivate',
      handler: ({ res, params }) => {
        const customerId = requireInt(params.id, 'id');
        transaction(app.db, (tx) => reactivateCustomer(tx, customerId));
        sendJson(res, 200, { ok: true });
      },
    },
  ];
}

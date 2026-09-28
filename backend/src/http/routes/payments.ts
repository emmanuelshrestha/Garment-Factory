/**
 * Payment routes.
 *
 * Two things are deliberately separate here, because they are separate
 * decisions: `POST /api/payments` records that money arrived, and
 * `POST /api/payments/:id/apply` records which bills it settles (D026).
 * Recording money never guesses at bills, and money with no bill yet is held
 * as an advance rather than refused (D027).
 *
 * A cheque is recorded pending and changes no balance until
 * `/clear` says the bank credited it; `/bounce` puts the receivable back
 * without deleting anything. This file decides none of that — it translates
 * JSON for `services/payments.ts`.
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import type { Currency } from '../../domain/money.ts';
import type { PaymentMethod, PaymentStatus } from '../../domain/payments.ts';
import {
  applyPayment,
  bounceCheque,
  cancelPayment,
  clearCheque,
  getCustomerStatement,
  getPayment,
  listPayments,
  listPendingCheques,
  listReceivables,
  recordPayment,
} from '../../services/payments.ts';
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
import { ValidationError } from '../../domain/errors.ts';

export function paymentRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/payments',
      handler: ({ res, query }) => {
        const payments = readOnly(app.db, (tx) =>
          listPayments(tx, {
            customerId: optionalInt(query.customerId, 'customerId'),
            // The service validates these against PAYMENT_STATUSES and
            // PAYMENT_METHODS.
            status: optionalString(query.status, 'status') as PaymentStatus | undefined,
            method: optionalString(query.method, 'method') as PaymentMethod | undefined,
            invoiceId: optionalInt(query.invoiceId, 'invoiceId'),
            limit: optionalInt(query.limit, 'limit'),
            asOf: optionalString(query.asOf, 'asOf'),
          }),
        );
        sendJson(res, 200, { payments });
      },
    },
    {
      method: 'POST',
      pattern: '/api/payments',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        // Allocations are optional: omitting them is the normal way to take a
        // deposit that has no bill yet (D027).
        const allocations =
          body.allocations === undefined || body.allocations === null
            ? undefined
            : readAllocations(body.allocations);

        const payment = transaction(app.db, (tx) =>
          recordPayment(tx, {
            customerId: requireInt(body.customerId, 'customerId'),
            amountMinor: requireInt(body.amountMinor, 'amountMinor'),
            method: requireString(body.method, 'method') as PaymentMethod,
            currency: optionalString(body.currency, 'currency') as Currency | undefined,
            fxRateToNpr: optionalInt(body.fxRateToNpr, 'fxRateToNpr'),
            receivedAt: optionalString(body.receivedAt, 'receivedAt'),
            chequeNo: optionalString(body.chequeNo, 'chequeNo') ?? null,
            chequeDate: optionalString(body.chequeDate, 'chequeDate') ?? null,
            note: optionalString(body.note, 'note') ?? null,
            allocations,
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 201, { payment });
      },
    },
    {
      method: 'GET',
      pattern: '/api/payments/:id',
      handler: ({ res, params, query }) => {
        const paymentId = requireInt(params.id, 'id');
        const asOf = optionalString(query.asOf, 'asOf');
        const payment = readOnly(app.db, (tx) =>
          asOf === undefined ? getPayment(tx, paymentId) : getPayment(tx, paymentId, asOf),
        );
        sendJson(res, 200, { payment });
      },
    },
    {
      // Which bills this money settles. The owner's decision, never inferred.
      method: 'POST',
      pattern: '/api/payments/:id/apply',
      handler: async ({ req, res, params }) => {
        const paymentId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const payment = transaction(app.db, (tx) =>
          applyPayment(tx, paymentId, readAllocations(body.allocations), app.currentUserId),
        );
        sendJson(res, 200, { payment });
      },
    },
    {
      // The bank credited the cheque. Only now does it settle anything.
      method: 'POST',
      pattern: '/api/payments/:id/clear',
      handler: async ({ req, res, params }) => {
        const paymentId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const payment = transaction(app.db, (tx) =>
          clearCheque(tx, paymentId, {
            clearedOn: optionalString(body.clearedOn, 'clearedOn'),
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 200, { payment });
      },
    },
    {
      // The cheque came back. The allocations stay; they stop counting (D028).
      method: 'POST',
      pattern: '/api/payments/:id/bounce',
      handler: async ({ req, res, params }) => {
        const paymentId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const payment = transaction(app.db, (tx) =>
          bounceCheque(tx, paymentId, {
            reason: requireString(body.reason, 'reason'),
            bouncedOn: optionalString(body.bouncedOn, 'bouncedOn'),
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 200, { payment });
      },
    },
    {
      // The receipt should never have existed. It is not deleted, it is
      // cancelled with a reason, on the same terms as voiding an invoice.
      method: 'POST',
      pattern: '/api/payments/:id/cancel',
      handler: async ({ req, res, params }) => {
        const paymentId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const payment = transaction(app.db, (tx) =>
          cancelPayment(tx, paymentId, {
            reason: requireString(body.reason, 'reason'),
            cancelledOn: optionalString(body.cancelledOn, 'cancelledOn'),
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 200, { payment });
      },
    },
    {
      // Cheques in the drawer. `postDated` flags the ones that cannot be
      // banked yet, which is the whole reason this list exists.
      method: 'GET',
      pattern: '/api/cheques/pending',
      handler: ({ res, query }) => {
        const cheques = readOnly(app.db, (tx) =>
          listPendingCheques(tx, {
            customerId: optionalInt(query.customerId, 'customerId'),
            asOf: optionalString(query.asOf, 'asOf'),
          }),
        );
        sendJson(res, 200, { cheques });
      },
    },
    {
      // What is still owed, bill by bill. Pending cheques are not deducted.
      method: 'GET',
      pattern: '/api/receivables',
      handler: ({ res, query }) => {
        const receivables = readOnly(app.db, (tx) =>
          listReceivables(tx, {
            customerId: optionalInt(query.customerId, 'customerId'),
            onlyOutstanding: optionalBoolean(query.onlyOutstanding, 'onlyOutstanding') ?? false,
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { receivables });
      },
    },
    {
      // One customer's balance, per currency (D029), with the bills and
      // receipts behind it. Lives with the payment routes rather than the
      // customer ones because every rule it depends on is a payment rule.
      method: 'GET',
      pattern: '/api/customers/:id/statement',
      handler: ({ res, params, query }) => {
        const customerId = requireInt(params.id, 'id');
        const statement = readOnly(app.db, (tx) =>
          getCustomerStatement(tx, customerId, {
            asOf: optionalString(query.asOf, 'asOf'),
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { statement });
      },
    },
  ];
}

function readAllocations(value: unknown): { invoiceId: number; amountMinor: number }[] {
  const rows = requireArray(value, 'allocations');
  return rows.map((row, index) => {
    const field = `allocations[${index}]`;
    const amountMinor = requireInt(row.amountMinor, `${field}.amountMinor`);
    if (amountMinor <= 0) {
      // The domain refuses this too, but saying so here names the array index.
      throw new ValidationError(
        `${field}.amountMinor must be more than nothing, got ${amountMinor}`,
        `${field}.amountMinor`,
      );
    }
    return {
      invoiceId: requireInt(row.invoiceId, `${field}.invoiceId`),
      amountMinor,
    };
  });
}

/**
 * Invoice routes.
 *
 * The default shape is one delivery, one invoice (D023): POST with a
 * `deliveryId`. Passing `deliveryLineIds` instead bills a hand-picked set,
 * which is how several deliveries end up on one bill (D010).
 *
 * `?issue=true` writes the draft and issues it in the same transaction, so a
 * refusal leaves no half-written bill behind. Nothing here decides what may be
 * billed or at what price — that is `services/invoices.ts` and
 * `domain/invoices.ts`.
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import {
  createInvoice,
  getInvoice,
  issueInvoice,
  listBillableLines,
  listInvoices,
  voidInvoice,
  type InvoiceStatus,
} from '../../services/invoices.ts';
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
import { ValidationError } from '../../domain/errors.ts';

export function invoiceRoutes(app: AppContext): Route[] {
  return [
    {
      // Delivered goods with no standing invoice against them: the owner's
      // "what still needs billing" list.
      method: 'GET',
      pattern: '/api/billable',
      handler: ({ res, query }) => {
        const lines = readOnly(app.db, (tx) =>
          listBillableLines(tx, {
            customerId: optionalInt(query.customerId, 'customerId'),
            deliveryId: optionalInt(query.deliveryId, 'deliveryId'),
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { lines });
      },
    },
    {
      method: 'GET',
      pattern: '/api/invoices',
      handler: ({ res, query }) => {
        const invoices = readOnly(app.db, (tx) =>
          listInvoices(tx, {
            customerId: optionalInt(query.customerId, 'customerId'),
            orderId: optionalInt(query.orderId, 'orderId'),
            // The service validates the status against INVOICE_STATUSES.
            status: optionalString(query.status, 'status') as InvoiceStatus | undefined,
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { invoices });
      },
    },
    {
      method: 'POST',
      pattern: '/api/invoices',
      handler: async ({ req, res, query }) => {
        const body = await readJsonBody(req);
        const input = {
          deliveryId: optionalInt(body.deliveryId, 'deliveryId'),
          deliveryLineIds: readLineIds(body.deliveryLineIds),
          invoiceDate: optionalString(body.invoiceDate, 'invoiceDate'),
          dueDate: optionalString(body.dueDate, 'dueDate') ?? null,
          discountMinor: optionalInt(body.discountMinor, 'discountMinor'),
          discountReason: optionalString(body.discountReason, 'discountReason') ?? null,
          fxRateToNpr: optionalInt(body.fxRateToNpr, 'fxRateToNpr'),
          userId: app.currentUserId,
        };

        // Issue inside the creating transaction: an invoice the owner meant to
        // issue must not survive as a draft if the issue itself fails.
        const issue =
          optionalBoolean(query.issue, 'issue') ?? optionalBoolean(body.issue, 'issue') ?? false;

        const invoice = transaction(app.db, (tx) => {
          const created = createInvoice(tx, input);
          return issue ? issueInvoice(tx, created.id, app.currentUserId) : created;
        });
        sendJson(res, 201, { invoice });
      },
    },
    {
      method: 'GET',
      pattern: '/api/invoices/:id',
      handler: ({ res, params }) => {
        const invoiceId = requireInt(params.id, 'id');
        const invoice = readOnly(app.db, (tx) => getInvoice(tx, invoiceId));
        sendJson(res, 200, { invoice });
      },
    },
    {
      // After this the invoice is frozen (D005).
      method: 'POST',
      pattern: '/api/invoices/:id/issue',
      handler: ({ res, params }) => {
        const invoiceId = requireInt(params.id, 'id');
        const invoice = transaction(app.db, (tx) => issueInvoice(tx, invoiceId, app.currentUserId));
        sendJson(res, 200, { invoice });
      },
    },
    {
      // The only correction path for an issued invoice: void, then bill the
      // same delivered goods again.
      method: 'POST',
      pattern: '/api/invoices/:id/void',
      handler: async ({ req, res, params }) => {
        const invoiceId = requireInt(params.id, 'id');
        const body = await readJsonBody(req);
        const invoice = transaction(app.db, (tx) =>
          voidInvoice(tx, invoiceId, requireString(body.reason, 'reason'), app.currentUserId),
        );
        sendJson(res, 200, { invoice });
      },
    },
  ];
}

function readLineIds(value: unknown): number[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ValidationError('deliveryLineIds must be an array', 'deliveryLineIds');
  }
  return value.map((id, index) => requireInt(id, `deliveryLineIds[${index}]`));
}

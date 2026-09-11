import { readOnly, transaction } from '../../db/sqlite.ts';
import type { Currency } from '../../domain/money.ts';
import type { PaymentMethod } from '../../domain/payments.ts';
import { createExpense, getExpense, listExpenses } from '../../services/expenses.ts';
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

export function expenseRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/expenses',
      handler: ({ res, query }) => {
        const expenses = readOnly(app.db, (tx) =>
          listExpenses(tx, {
            category: optionalString(query.category, 'category'),
            from: optionalString(query.from, 'from'),
            to: optionalString(query.to, 'to'),
            limit: optionalInt(query.limit, 'limit'),
          }),
        );
        sendJson(res, 200, { expenses });
      },
    },
    {
      method: 'GET',
      pattern: '/api/expenses/:id',
      handler: ({ res, params }) => {
        const id = requireInt(params.id, 'id');
        const expense = readOnly(app.db, (tx) => getExpense(tx, id));
        sendJson(res, 200, { expense });
      },
    },
    {
      method: 'POST',
      pattern: '/api/expenses',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const expense = transaction(app.db, (tx) =>
          createExpense(tx, {
            category: requireString(body.category, 'category'),
            amountMinor: requireInt(body.amountMinor, 'amountMinor'),
            currency: optionalString(body.currency, 'currency') as Currency | undefined,
            fxRateToNpr: optionalInt(body.fxRateToNpr, 'fxRateToNpr'),
            method: requireString(body.method, 'method') as PaymentMethod,
            expenseDate: optionalString(body.expenseDate, 'expenseDate'),
            payee: optionalString(body.payee, 'payee'),
            note: optionalString(body.note, 'note'),
            userId: app.currentUserId,
          }),
        );
        sendJson(res, 201, { expense });
      },
    },
  ];
}

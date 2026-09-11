/**
 * Expenses ledger.
 *
 * Records money out for operational expenses (tea, rent, utilities, factory supplies).
 * Has no finished-stock effect.
 */

import type { Tx } from '../db/sqlite.ts';
import { assertDate, documentYear, nowTimestamp, today } from '../domain/dates.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.ts';
import { rateForNewDocument } from '../domain/fx.ts';
import {
  assertCurrency,
  assertPositiveMinor,
  type Currency,
} from '../domain/money.ts';
import { assertPaymentMethod, type PaymentMethod } from '../domain/payments.ts';
import { recordAudit } from './audit.ts';
import { nextDocumentNumber } from './documentNumbers.ts';

export type Expense = {
  id: number;
  expenseNo: string;
  expenseDate: string;
  category: string;
  payee: string | null;
  amountMinor: number;
  currency: Currency;
  fxRateToNpr: number;
  method: PaymentMethod;
  note: string | null;
  createdAt: string;
  createdBy: number;
};

export type CreateExpenseInput = {
  category: string;
  amountMinor: number;
  currency?: Currency;
  fxRateToNpr?: number;
  method: PaymentMethod;
  expenseDate?: string;
  payee?: string | null;
  note?: string | null;
  userId: number;
};

export function createExpense(tx: Tx, input: CreateExpenseInput): Expense {
  const category = (input.category ?? '').trim();
  if (category.length === 0) {
    throw new ValidationError('category is required', 'category');
  }

  const amountMinor = assertPositiveMinor(input.amountMinor, 'amountMinor');
  const currency = assertCurrency(input.currency ?? 'NPR');
  const method = assertPaymentMethod(input.method, 'method');
  const expenseDate = assertDate(input.expenseDate ?? today(), 'expenseDate');
  const fxRateToNpr = rateForNewDocument(currency, input.fxRateToNpr);

  const expenseNo = nextDocumentNumber(tx, 'EXP', documentYear(expenseDate));
  const createdAt = nowTimestamp();

  const info = tx.db
    .prepare(
      `INSERT INTO expenses
         (expense_no, expense_date, category, payee, amount_minor, currency, fx_rate_to_npr, method, note, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      expenseNo,
      expenseDate,
      category,
      input.payee ? input.payee.trim() : null,
      amountMinor,
      currency,
      fxRateToNpr,
      method,
      input.note ? input.note.trim() : null,
      createdAt,
      input.userId,
    );

  const expenseId = Number(info.lastInsertRowid);

  recordAudit(tx, {
    action: 'expense_created',
    entityType: 'expense',
    entityId: expenseId,
    detail: { expenseNo, category, amountMinor, currency },
    userId: input.userId,
  });

  return getExpense(tx, expenseId);
}

export function getExpense(tx: Tx, id: number): Expense {
  const row = tx.db
    .prepare(
      `SELECT id, expense_no, expense_date, category, payee, amount_minor, currency, fx_rate_to_npr, method, note, created_at, created_by
         FROM expenses
        WHERE id = ?`,
    )
    .get(id) as {
    id: number;
    expense_no: string;
    expense_date: string;
    category: string;
    payee: string | null;
    amount_minor: number;
    currency: string;
    fx_rate_to_npr: number;
    method: string;
    note: string | null;
    created_at: string;
    created_by: number;
  } | undefined;

  if (!row) {
    throw new NotFoundError('expense', id);
  }

  return {
    id: Number(row.id),
    expenseNo: row.expense_no,
    expenseDate: row.expense_date,
    category: row.category,
    payee: row.payee,
    amountMinor: Number(row.amount_minor),
    currency: assertCurrency(row.currency),
    fxRateToNpr: Number(row.fx_rate_to_npr),
    method: assertPaymentMethod(row.method),
    note: row.note,
    createdAt: row.created_at,
    createdBy: Number(row.created_by),
  };
}

export type ListExpensesFilter = {
  category?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export function listExpenses(tx: Tx, filter: ListExpensesFilter = {}): Expense[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.category) {
    clauses.push('category = ?');
    params.push(filter.category.trim());
  }
  if (filter.from) {
    clauses.push('expense_date >= ?');
    params.push(assertDate(filter.from, 'from'));
  }
  if (filter.to) {
    clauses.push('expense_date <= ?');
    params.push(assertDate(filter.to, 'to'));
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  const rows = tx.db
    .prepare(
      `SELECT id, expense_no, expense_date, category, payee, amount_minor, currency, fx_rate_to_npr, method, note, created_at, created_by
         FROM expenses
        ${where}
        ORDER BY expense_date DESC, id DESC
        LIMIT ?`,
    )
    .all(...(params as never[])) as Array<{
    id: number;
    expense_no: string;
    expense_date: string;
    category: string;
    payee: string | null;
    amount_minor: number;
    currency: string;
    fx_rate_to_npr: number;
    method: string;
    note: string | null;
    created_at: string;
    created_by: number;
  }>;

  return rows.map((r) => ({
    id: Number(r.id),
    expenseNo: r.expense_no,
    expenseDate: r.expense_date,
    category: r.category,
    payee: r.payee,
    amountMinor: Number(r.amount_minor),
    currency: assertCurrency(r.currency),
    fxRateToNpr: Number(r.fx_rate_to_npr),
    method: assertPaymentMethod(r.method),
    note: r.note,
    createdAt: r.created_at,
    createdBy: Number(r.created_by),
  }));
}

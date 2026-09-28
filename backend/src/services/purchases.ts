/**
 * Purchases ledger.
 *
 * Records money spent on raw materials (fabrics, zippers, lining, threads, machines).
 * Raw materials are out of scope for stock tracking, so this records money spent and
 * writes NO stock movements.
 */

import type { Tx } from '../db/sqlite.ts';
import { assertDate, documentYear, nowTimestamp, today } from '../domain/dates.ts';
import { NotFoundError, ValidationError } from '../domain/errors.ts';
import { rateForNewDocument } from '../domain/fx.ts';
import {
  assertCurrency,
  assertPositiveMinor,
  type Currency,
} from '../domain/money.ts';
import { recordAudit } from './audit.ts';
import { nextDocumentNumber } from './documentNumbers.ts';

export type Purchase = {
  id: number;
  purchaseNo: string;
  supplierName: string;
  purchaseDate: string;
  description: string;
  amountMinor: number;
  currency: Currency;
  fxRateToNpr: number;
  note: string | null;
  createdAt: string;
  createdBy: number;
};

export type CreatePurchaseInput = {
  supplierName: string;
  description: string;
  amountMinor: number;
  currency?: Currency;
  fxRateToNpr?: number;
  purchaseDate?: string;
  note?: string | null;
  userId: number;
};

export function createPurchase(tx: Tx, input: CreatePurchaseInput): Purchase {
  const supplierName = (input.supplierName ?? '').trim();
  if (supplierName.length === 0) {
    throw new ValidationError('supplierName is required', 'supplierName');
  }

  const description = (input.description ?? '').trim();
  if (description.length === 0) {
    throw new ValidationError('description is required', 'description');
  }

  const amountMinor = assertPositiveMinor(input.amountMinor, 'amountMinor');
  const currency = assertCurrency(input.currency ?? 'NPR');
  const purchaseDate = assertDate(input.purchaseDate ?? today(), 'purchaseDate');
  const fxRateToNpr = rateForNewDocument(currency, input.fxRateToNpr);

  const purchaseNo = nextDocumentNumber(tx, 'PUR', documentYear(purchaseDate));
  const createdAt = nowTimestamp();

  const info = tx.db
    .prepare(
      `INSERT INTO purchases
         (purchase_no, supplier_name, purchase_date, description, amount_minor, currency, fx_rate_to_npr, note, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      purchaseNo,
      supplierName,
      purchaseDate,
      description,
      amountMinor,
      currency,
      fxRateToNpr,
      input.note ? input.note.trim() : null,
      createdAt,
      input.userId,
    );

  const purchaseId = Number(info.lastInsertRowid);

  recordAudit(tx, {
    action: 'purchase_created',
    entityType: 'purchase',
    entityId: purchaseId,
    detail: { purchaseNo, supplierName, amountMinor, currency },
    userId: input.userId,
  });

  return getPurchase(tx, purchaseId);
}

export function getPurchase(tx: Tx, id: number): Purchase {
  const row = tx.db
    .prepare(
      `SELECT id, purchase_no, supplier_name, purchase_date, description, amount_minor, currency, fx_rate_to_npr, note, created_at, created_by
         FROM purchases
        WHERE id = ?`,
    )
    .get(id) as {
    id: number;
    purchase_no: string;
    supplier_name: string;
    purchase_date: string;
    description: string;
    amount_minor: number;
    currency: string;
    fx_rate_to_npr: number;
    note: string | null;
    created_at: string;
    created_by: number;
  } | undefined;

  if (!row) {
    throw new NotFoundError('purchase', id);
  }

  return {
    id: Number(row.id),
    purchaseNo: row.purchase_no,
    supplierName: row.supplier_name,
    purchaseDate: row.purchase_date,
    description: row.description,
    amountMinor: Number(row.amount_minor),
    currency: assertCurrency(row.currency),
    fxRateToNpr: Number(row.fx_rate_to_npr),
    note: row.note,
    createdAt: row.created_at,
    createdBy: Number(row.created_by),
  };
}

export type ListPurchasesFilter = {
  supplierName?: string;
  from?: string;
  to?: string;
  limit?: number;
};

export function listPurchases(tx: Tx, filter: ListPurchasesFilter = {}): Purchase[] {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.supplierName) {
    clauses.push('supplier_name LIKE ?');
    params.push(`%${filter.supplierName.trim()}%`);
  }
  if (filter.from) {
    clauses.push('purchase_date >= ?');
    params.push(assertDate(filter.from, 'from'));
  }
  if (filter.to) {
    clauses.push('purchase_date <= ?');
    params.push(assertDate(filter.to, 'to'));
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  const rows = tx.db
    .prepare(
      `SELECT id, purchase_no, supplier_name, purchase_date, description, amount_minor, currency, fx_rate_to_npr, note, created_at, created_by
         FROM purchases
        ${where}
        ORDER BY purchase_date DESC, id DESC
        LIMIT ?`,
    )
    .all(...(params as never[])) as Array<{
    id: number;
    purchase_no: string;
    supplier_name: string;
    purchase_date: string;
    description: string;
    amount_minor: number;
    currency: string;
    fx_rate_to_npr: number;
    note: string | null;
    created_at: string;
    created_by: number;
  }>;

  return rows.map((r) => ({
    id: Number(r.id),
    purchaseNo: r.purchase_no,
    supplierName: r.supplier_name,
    purchaseDate: r.purchase_date,
    description: r.description,
    amountMinor: Number(r.amount_minor),
    currency: assertCurrency(r.currency),
    fxRateToNpr: Number(r.fx_rate_to_npr),
    note: r.note,
    createdAt: r.created_at,
    createdBy: Number(r.created_by),
  }));
}

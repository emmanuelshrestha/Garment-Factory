/**
 * Customers.
 *
 * A customer is never deleted — invoices and payments point at them, and
 * financial history must stay readable. Deactivating hides them from new
 * orders and leaves the history intact.
 */

import type { Tx } from '../db/sqlite.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.ts';
import { assertCurrency, type Currency } from '../domain/money.ts';
import { nowTimestamp } from '../domain/dates.ts';

export type Customer = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  defaultCurrency: Currency;
  notes: string | null;
  isActive: boolean;
};

export type CreateCustomerInput = {
  code: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  defaultCurrency?: Currency;
  notes?: string | null;
  userId: number;
};

export function createCustomer(tx: Tx, input: CreateCustomerInput): number {
  const code = assertCustomerCode(input.code);
  const name = assertCustomerName(input.name);
  const currency = assertCurrency(input.defaultCurrency ?? 'NPR');

  if (getCustomerByCode(tx, code)) {
    throw new ValidationError(`customer code ${code} is already used`, 'code');
  }

  return Number(
    tx.db
      .prepare(
        `INSERT INTO customers (code, name, phone, address, default_currency, notes, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        name,
        blankToNull(input.phone),
        blankToNull(input.address),
        currency,
        blankToNull(input.notes),
        nowTimestamp(),
        input.userId,
      ).lastInsertRowid,
  );
}

export function getCustomer(tx: Tx, customerId: number): Customer {
  const row = tx.db.prepare(`${SELECT_CUSTOMER} WHERE id = ?`).get(customerId) as
    | CustomerRow
    | undefined;
  if (!row) {
    throw new NotFoundError('customer', customerId);
  }
  return toCustomer(row);
}

export function getCustomerByCode(tx: Tx, code: string): Customer | null {
  const row = tx.db.prepare(`${SELECT_CUSTOMER} WHERE code = ?`).get(code) as CustomerRow | undefined;
  return row ? toCustomer(row) : null;
}

export function listCustomers(tx: Tx, options: { activeOnly?: boolean; search?: string } = {}): Customer[] {
  const where: string[] = [];
  const params: string[] = [];
  if (options.activeOnly) {
    where.push('is_active = 1');
  }
  if (options.search && options.search.trim().length > 0) {
    // Parameterised LIKE: the search text is never concatenated into the SQL.
    where.push('(name LIKE ? OR code LIKE ? OR phone LIKE ?)');
    const pattern = `%${options.search.trim()}%`;
    params.push(pattern, pattern, pattern);
  }
  const rows = tx.db
    .prepare(
      `${SELECT_CUSTOMER} ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY name`,
    )
    .all(...params) as CustomerRow[];
  return rows.map(toCustomer);
}

export function updateCustomer(
  tx: Tx,
  customerId: number,
  changes: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    defaultCurrency?: Currency;
    notes?: string | null;
  },
): void {
  const current = getCustomer(tx, customerId);
  const name = changes.name === undefined ? current.name : assertCustomerName(changes.name);
  const currency =
    changes.defaultCurrency === undefined
      ? current.defaultCurrency
      : assertCurrency(changes.defaultCurrency);

  tx.db
    .prepare(
      `UPDATE customers SET name = ?, phone = ?, address = ?, default_currency = ?, notes = ?
        WHERE id = ?`,
    )
    .run(
      name,
      changes.phone === undefined ? current.phone : blankToNull(changes.phone),
      changes.address === undefined ? current.address : blankToNull(changes.address),
      currency,
      changes.notes === undefined ? current.notes : blankToNull(changes.notes),
      customerId,
    );
}

/**
 * Deactivate a customer. Refused while they still have open orders, because
 * hiding a customer mid-order would strand work in progress.
 */
export function deactivateCustomer(tx: Tx, customerId: number): void {
  getCustomer(tx, customerId);
  const open = tx.db
    .prepare(
      `SELECT COUNT(*) AS n FROM orders
        WHERE customer_id = ?
          AND status IN ('draft', 'confirmed', 'partially_delivered')`,
    )
    .get(customerId) as { n: number };
  if (Number(open.n) > 0) {
    throw new BusinessRuleError(
      'customer_has_open_orders',
      `customer ${customerId} still has ${Number(open.n)} open order(s)`,
      { customerId, openOrders: Number(open.n) },
    );
  }
  tx.db.prepare('UPDATE customers SET is_active = 0 WHERE id = ?').run(customerId);
}

export function reactivateCustomer(tx: Tx, customerId: number): void {
  getCustomer(tx, customerId);
  tx.db.prepare('UPDATE customers SET is_active = 1 WHERE id = ?').run(customerId);
}

const SELECT_CUSTOMER = `SELECT id, code, name, phone, address, default_currency, notes, is_active FROM customers`;

type CustomerRow = {
  id: number;
  code: string;
  name: string;
  phone: string | null;
  address: string | null;
  default_currency: string;
  notes: string | null;
  is_active: number;
};

function toCustomer(row: CustomerRow): Customer {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    phone: row.phone,
    address: row.address,
    defaultCurrency: assertCurrency(row.default_currency),
    notes: row.notes,
    isActive: Number(row.is_active) === 1,
  };
}

function assertCustomerCode(value: unknown): string {
  const clean = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 _-]{0,31}$/.test(clean)) {
    throw new ValidationError(
      `customer code must be 1-32 characters of letters, digits, space, hyphen or underscore, got ${JSON.stringify(value)}`,
      'code',
    );
  }
  return clean;
}

function assertCustomerName(value: unknown): string {
  const clean = String(value ?? '').trim();
  if (clean.length === 0 || clean.length > 120) {
    throw new ValidationError(`customer name must be 1-120 characters, got ${JSON.stringify(value)}`, 'name');
  }
  return clean;
}

function blankToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const clean = value.trim();
  return clean.length === 0 ? null : clean;
}

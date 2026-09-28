import type { Tx } from '../db/sqlite.ts';
import { nowTimestamp } from '../domain/dates.ts';

export type Employee = {
  id: number;
  tailorNumber: string;
  name: string;
  isActive: boolean;
};

export function listEmployees(tx: Tx, filter: { activeOnly?: boolean } = {}): Employee[] {
  let query = 'SELECT id, tailor_number, name, is_active FROM employees';
  const params: any[] = [];
  if (filter.activeOnly) {
    query += ' WHERE is_active = 1';
  }
  query += ' ORDER BY tailor_number';

  return tx.db.prepare(query).all(...params).map((row: any) => ({
    id: Number(row.id),
    tailorNumber: row.tailor_number,
    name: row.name,
    isActive: Boolean(row.is_active),
  }));
}

export function createEmployee(tx: Tx, input: { tailorNumber: string; name: string }): number {
  const info = tx.db
    .prepare('INSERT INTO employees (tailor_number, name, created_at) VALUES (?, ?, ?)')
    .run(input.tailorNumber, input.name, nowTimestamp());
  return Number(info.lastInsertRowid);
}

export function toggleEmployeeActive(tx: Tx, id: number): void {
  tx.db.prepare('UPDATE employees SET is_active = NOT is_active WHERE id = ?').run(id);
}

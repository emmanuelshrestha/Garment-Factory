import type { Tx } from '../db/sqlite.ts';
import { nowTimestamp } from '../domain/dates.ts';

export type EarningsEntry = {
  id: number;
  employeeId: number;
  fiscalYear: number;
  month: string;
  quantity: number;
  totalEarned: number;
  advance: number;
  others: number;
  openingDue: number;
  closingDue: number;
  note: string | null;
  createdAt: string;
};

export function recordEarnings(
  tx: Tx,
  input: {
    employeeId: number;
    fiscalYear: number;
    monthName: string;
    quantity: number;
    totalEarned: number;
    advance: number;
    others: number;
    note: string | null;
  }
): number {
  // Check if an entry for this employee, fiscal year, and month already exists
  const existing = tx.db.prepare(
    'SELECT id FROM employee_earnings WHERE employee_id = ? AND fiscal_year = ? AND month = ?'
  ).get(input.employeeId, input.fiscalYear, input.monthName) as { id: number } | undefined;

  if (existing) {
    // Update existing entry
    tx.db.prepare(
      `UPDATE employee_earnings 
       SET quantity = ?, total_earned = ?, advance = ?, others = ?, note = ?
       WHERE id = ?`
    ).run(input.quantity, input.totalEarned, Math.abs(input.advance), input.others, input.note, existing.id);
  } else {
    // Insert new entry
    tx.db.prepare(
      `INSERT INTO employee_earnings 
         (employee_id, fiscal_year, month, quantity, total_earned, advance, others, opening_due, closing_due, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
    ).run(
      input.employeeId,
      input.fiscalYear,
      input.monthName,
      input.quantity,
      input.totalEarned,
      Math.abs(input.advance),
      input.others,
      input.note,
      nowTimestamp()
    );
  }

  // Recalculate opening/closing due across all chronological entries for this employee
  const entries = tx.db.prepare(
    `SELECT id, total_earned, advance, others 
     FROM employee_earnings 
     WHERE employee_id = ? 
     ORDER BY fiscal_year, 
       CASE month 
         WHEN 'Baisakh' THEN 1 
         WHEN 'Jestha' THEN 2 
         WHEN 'Ashadh' THEN 3 
         WHEN 'Shrawan' THEN 4 
         WHEN 'Bhadra' THEN 5 
         WHEN 'Ashwin' THEN 6 
         WHEN 'Kartik' THEN 7 
         WHEN 'Mangsir' THEN 8 
         WHEN 'Poush' THEN 9 
         WHEN 'Magh' THEN 10 
         WHEN 'Falgun' THEN 11 
         WHEN 'Chaitra' THEN 12 
       END, id`
  ).all(input.employeeId) as { id: number; total_earned: number; advance: number; others: number }[];

  let runningDue = 0;
  for (const entry of entries) {
    const openingDue = runningDue;
    const closingDue = openingDue + entry.total_earned + entry.others - Math.abs(entry.advance);
    tx.db.prepare(
      'UPDATE employee_earnings SET opening_due = ?, closing_due = ? WHERE id = ?'
    ).run(openingDue, closingDue, entry.id);
    runningDue = closingDue;
  }

  return existing ? existing.id : Number(tx.db.prepare('SELECT last_insert_rowid() as id').get()!.id);
}

export function getMonthlySummary(tx: Tx, fiscalYear: number, monthName: string): any[] {
  return tx.db.prepare(
    `SELECT e.id as employeeId, e.tailor_number as tailorNumber, e.name as employeeName, 
            COALESCE(ee.quantity, 0) as quantity, 
            COALESCE(ee.total_earned, 0) as totalEarned, 
            COALESCE(ee.advance, 0) as advance, 
            COALESCE(ee.others, 0) as others, 
            COALESCE(ee.opening_due, 0) as openingDue, 
            COALESCE(ee.closing_due, 0) as closingDue
     FROM employees e
     LEFT JOIN employee_earnings ee ON e.id = ee.employee_id AND ee.fiscal_year = ? AND ee.month = ?
     WHERE e.is_active = 1
     ORDER BY e.tailor_number`
  ).all(fiscalYear, monthName);
}

export function getEmployeeYearlyHistory(tx: Tx, employeeId: number, fiscalYear?: number): EarningsEntry[] {
  if (fiscalYear) {
    return tx.db.prepare(
      `SELECT id, employee_id as employeeId, fiscal_year as fiscalYear, month, quantity, total_earned as totalEarned, advance, others, opening_due as openingDue, closing_due as closingDue, note, created_at as createdAt
       FROM employee_earnings 
       WHERE employee_id = ? AND fiscal_year = ?
       ORDER BY fiscal_year, 
         CASE month 
           WHEN 'Baisakh' THEN 1 
           WHEN 'Jestha' THEN 2 
           WHEN 'Ashadh' THEN 3 
           WHEN 'Shrawan' THEN 4 
           WHEN 'Bhadra' THEN 5 
           WHEN 'Ashwin' THEN 6 
           WHEN 'Kartik' THEN 7 
           WHEN 'Mangsir' THEN 8 
           WHEN 'Poush' THEN 9 
           WHEN 'Magh' THEN 10 
           WHEN 'Falgun' THEN 11 
           WHEN 'Chaitra' THEN 12 
         END, id`
    ).all(employeeId, fiscalYear) as any[];
  } else {
    return tx.db.prepare(
      `SELECT id, employee_id as employeeId, fiscal_year as fiscalYear, month, quantity, total_earned as totalEarned, advance, others, opening_due as openingDue, closing_due as closingDue, note, created_at as createdAt
       FROM employee_earnings 
       WHERE employee_id = ?
       ORDER BY fiscal_year DESC, 
         CASE month 
           WHEN 'Baisakh' THEN 1 
           WHEN 'Jestha' THEN 2 
           WHEN 'Ashadh' THEN 3 
           WHEN 'Shrawan' THEN 4 
           WHEN 'Bhadra' THEN 5 
           WHEN 'Ashwin' THEN 6 
           WHEN 'Kartik' THEN 7 
           WHEN 'Mangsir' THEN 8 
           WHEN 'Poush' THEN 9 
           WHEN 'Magh' THEN 10 
           WHEN 'Falgun' THEN 11 
           WHEN 'Chaitra' THEN 12 
         END DESC, id DESC`
    ).all(employeeId) as any[];
  }
}

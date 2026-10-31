export interface Employee {
  id: number;
  tailorNumber: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function toEmployee(row: any): Employee {
  return {
    id: row.id,
    tailorNumber: row.tailor_number ?? row.tailorNumber ?? '',
    name: row.name ?? '',
    isActive: Boolean(row.is_active ?? row.isActive),
    createdAt: row.created_at ?? row.createdAt ?? '',
    updatedAt: row.updated_at ?? row.updatedAt ?? '',
  };
}

export function listEmployees(tx: any, options: { activeOnly?: boolean } = {}): Employee[] {
  const db = tx.db ?? tx;
  let sql = 'SELECT * FROM employees';
  if (options.activeOnly) {
    sql += ' WHERE is_active = 1';
  }
  sql += ' ORDER BY CAST(tailor_number AS INTEGER) ASC, tailor_number ASC, id ASC';
  const rows = db.prepare(sql).all();
  return rows.map(toEmployee);
}

export function createEmployee(
  tx: any,
  data: { tailorNumber: string; name: string }
): number {
  const db = tx.db ?? tx;
  const cols = db.prepare('PRAGMA table_info(employees)').all().map((c: any) => c.name);
  const hasCreatedAt = cols.includes('created_at');
  const hasUpdatedAt = cols.includes('updated_at');
  const hasIsActive = cols.includes('is_active');

  const insertCols = ['tailor_number', 'name'];
  const placeholders = ['?', '?'];
  const values: any[] = [data.tailorNumber, data.name];

  if (hasIsActive) {
    insertCols.push('is_active');
    placeholders.push('1');
  }
  if (hasCreatedAt) {
    insertCols.push('created_at');
    placeholders.push("datetime('now')");
  }
  if (hasUpdatedAt) {
    insertCols.push('updated_at');
    placeholders.push("datetime('now')");
  }

  const sql = `INSERT INTO employees (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`;
  const result = db.prepare(sql).run(...values);
  return Number(result.lastInsertRowid);
}

export function toggleEmployeeActive(tx: any, id: number): void {
  const db = tx.db ?? tx;
  const cols = db.prepare('PRAGMA table_info(employees)').all().map((c: any) => c.name);
  const hasUpdatedAt = cols.includes('updated_at');

  if (hasUpdatedAt) {
    db.prepare(`
      UPDATE employees 
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(id);
  } else {
    db.prepare(`
      UPDATE employees 
      SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END
      WHERE id = ?
    `).run(id);
  }
}

export function getEmployeeById(tx: any, id: number): Employee | null {
  const db = tx.db ?? tx;
  const row = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);
  return row ? toEmployee(row) : null;
}
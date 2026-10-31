import type { Tx } from '../db/sqlite.ts';
import { BusinessRuleError } from '../domain/errors.ts';
import { nowTimestamp } from '../domain/dates.ts';

export function recordCutBatch(tx: Tx, data: { productId: number; size: string; quantity: number; date: string; recordedById: number }) {
  if (data.quantity <= 0) throw new BusinessRuleError('invalid_quantity', 'Quantity must be positive');
  if (!/^d{4}-d{2}-d{2}$/.test(data.date)) throw new BusinessRuleError('invalid_date', 'Date must be YYYY-MM-DD');

  tx.db.prepare(
    'INSERT INTO cutting_records (product_id, size, quantity, cut_date, recorded_by_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.productId, data.size, data.quantity, data.date, data.recordedById, nowTimestamp());
}

export function listCutBatches(tx: Tx, filters: { startDate?: string; endDate?: string; productId?: number; limit?: number; offset?: number }) {
  let query = `
    SELECT cr.*, p.name as product_name, su.name as recorder_name
    FROM cutting_records cr
    JOIN products p ON cr.product_id = p.id
    LEFT JOIN staff_users su ON cr.recorded_by_id = su.id
    WHERE 1=1
  `;
  const params: any[] = [];
  
  if (filters.startDate) { query += ' AND cr.cut_date >= ?'; params.push(filters.startDate); }
  if (filters.endDate) { query += ' AND cr.cut_date <= ?'; params.push(filters.endDate); }
  if (filters.productId) { query += ' AND cr.product_id = ?'; params.push(filters.productId); }
  
  query += ' ORDER BY cr.cut_date DESC LIMIT ? OFFSET ?';
  params.push(filters.limit || 50, filters.offset || 0);
  
  return tx.db.prepare(query).all(...params);
}

export function getCuttingSummary(tx: Tx, groupBy: 'product' | 'size' | 'day') {
  const column = groupBy === 'product' ? 'p.name' : groupBy === 'size' ? 'cr.size' : 'cr.cut_date';
  const join = groupBy === 'product' ? 'JOIN products p ON cr.product_id = p.id' : '';
  
  return tx.db.prepare(`
    SELECT ${column} as label, SUM(quantity) as total_quantity
    FROM cutting_records cr
    ${join}
    GROUP BY label
    ORDER BY total_quantity DESC
  `).all();
}

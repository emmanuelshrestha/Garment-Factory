import type { Tx } from '../db/sqlite.ts';
import { ValidationError } from '../domain/errors.ts';
import { assertPositiveQty } from '../domain/money.ts';
import { nowTimestamp } from '../domain/dates.ts';
import { recordAudit } from './audit.ts';
import { recordStockMovement } from './stock.ts';
import { getVariant } from './catalogue.ts';

export type CuttingStockSummary = {
  variantId: number;
  sku: string;
  productId: number;
  productCode: string;
  productName: string;
  colour: string;
  size: string;
  onHand: number;
};

export function addCuttingStock(tx: Tx, variantId: number, qty: number, userId: number): void {
  const q = assertPositiveQty(qty, 'qty');
  getVariant(tx, variantId);

  tx.db.prepare(
    'INSERT INTO cutting_stock_movements (variant_id, qty_delta, movement_type, occurred_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(variantId, q, 'add', nowTimestamp(), nowTimestamp(), userId);

  recordAudit(tx, { userId, action: 'cutting_stock_added', entityType: 'variant', entityId: variantId, detail: { qty: q } });
}

export function transferToFinishedStock(tx: Tx, variantId: number, qty: number, userId: number): void {
  const v = getVariant(tx, variantId);
  const q = assertPositiveQty(qty, 'qty');

  const onHand = getCuttingStockOnHand(tx, variantId);
  if (onHand < q) {
    throw new ValidationError(`Insufficient cutting stock for ${v.sku}. Available: ${onHand}`, 'qty');
  }

  // Reduce cutting stock
  tx.db.prepare(
    'INSERT INTO cutting_stock_movements (variant_id, qty_delta, movement_type, occurred_at, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(variantId, -q, 'transfer_to_finished', nowTimestamp(), nowTimestamp(), userId);

  // Increase finished stock
  recordStockMovement(tx, {
    variantId,
    qty: q,
    movementType: 'production_receipt',
    reason: `Transfer from cutting: ${v.sku}`,
    userId
  });

  recordAudit(tx, { userId, action: 'cutting_stock_transferred', entityType: 'variant', entityId: variantId, detail: { qty: q } });
}

export function getCuttingStockOnHand(tx: Tx, variantId: number): number {
  const row = tx.db
    .prepare('SELECT COALESCE(SUM(qty_delta), 0) AS on_hand FROM cutting_stock_movements WHERE variant_id = ?')
    .get(variantId) as { on_hand: number };
  return Number(row.on_hand);
}

export function createCuttingStockAdjustment(
  tx: Tx,
  variantId: number,
  qtyDelta: number,
  reasonCode: string,
  note: string,
  userId: number
): void {
  const q = qtyDelta;
  if (q === 0) {
    throw new ValidationError('Quantity adjustment cannot be zero', 'qtyDelta');
  }
  
  const movementType = q > 0 ? 'adjustment_in' : 'adjustment_out';
  
  tx.db.prepare(
    'INSERT INTO cutting_stock_movements (variant_id, qty_delta, movement_type, occurred_at, created_at, created_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(variantId, q, movementType, nowTimestamp(), nowTimestamp(), userId, `${reasonCode}: ${note}`);

  recordAudit(tx, { 
    userId, 
    action: 'cutting_stock_adjusted', 
    entityType: 'variant', 
    entityId: variantId, 
    detail: { qtyDelta: q, reasonCode, note } 
  });
}

export function listCuttingStockSummaries(tx: Tx): CuttingStockSummary[] {
  return tx.db.prepare(`
    SELECT 
      v.id as variantId, v.sku, p.id as productId, p.code as productCode, p.name as productName, 
      c.name as colour, s.name as size,
      COALESCE(SUM(m.qty_delta), 0) as onHand
    FROM product_variants v
    JOIN products p ON v.product_id = p.id
    JOIN colours c ON v.colour_id = c.id
    JOIN sizes s ON v.size_id = s.id
    LEFT JOIN cutting_stock_movements m ON v.id = m.variant_id
    WHERE v.is_active = 1
    GROUP BY v.id
    ORDER BY p.code, c.name, s.sort_order
  `).all() as CuttingStockSummary[];
}

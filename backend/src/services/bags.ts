import type { Tx } from '../db/sqlite.ts';
import { BusinessRuleError, NotFoundError } from '../domain/errors.ts';
import { nowTimestamp } from '../domain/dates.ts';

export function createBag(tx: Tx, name: string, notes: string | null) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new BusinessRuleError('invalid_name', 'Bag name required');
  
  const existing = tx.db.prepare("SELECT id FROM bags WHERE name = ? AND status = 'active'").get(trimmedName);
  if (existing) throw new BusinessRuleError('duplicate_bag_name', 'A bag with this name already exists');

  tx.db.prepare("INSERT INTO bags (name, notes, status, created_at) VALUES (?, ?, 'active', ?)")
    .run(trimmedName, notes, nowTimestamp());
}

export function listBags(tx: Tx) {
  const bags = tx.db.prepare("SELECT id, name, notes, status FROM bags WHERE status = 'active'").all() as any[];
  
  for (const bag of bags) {
    bag.contents = tx.db.prepare(`
      SELECT bc.variant_id as variantId, bc.quantity, p.name as productName, c.name as colour, s.name as size
      FROM bag_contents bc
      JOIN product_variants pv ON bc.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN colours c ON pv.colour_id = c.id
      LEFT JOIN sizes s ON pv.size_id = s.id
      WHERE bc.bag_id = ?
    `).all(bag.id);
    
    bag.totalQty = bag.contents.reduce((sum: number, item: any) => sum + item.quantity, 0);
    bag.itemCount = bag.contents.length;
  }
  return bags;
}

export function getBagDetails(tx: Tx, bagId: number) {
  const bag = tx.db.prepare('SELECT id, name, notes, status FROM bags WHERE id = ?').get(bagId) as any;
  if (!bag) throw new NotFoundError('Bag', bagId);
  bag.contents = tx.db.prepare(`
    SELECT bc.variant_id as variantId, bc.quantity, p.name as productName, c.name as colour, s.name as size
    FROM bag_contents bc
    JOIN product_variants pv ON bc.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN colours c ON pv.colour_id = c.id
    LEFT JOIN sizes s ON pv.size_id = s.id
    WHERE bc.bag_id = ?
  `).all(bagId);
  return bag;
}

export function addStockToBag(tx: Tx, bagId: number, variantId: number, quantity: number, reason: string, userId: number) {
  if (quantity <= 0) throw new BusinessRuleError('invalid_quantity', 'Quantity must be positive');
  
  tx.db.prepare(`
    INSERT INTO bag_contents (bag_id, variant_id, quantity, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(bag_id, variant_id) DO UPDATE SET quantity = quantity + ?, updated_at = ?
  `).run(bagId, variantId, quantity, nowTimestamp(), quantity, nowTimestamp());
  
  // Satisfies SQLite CHECK constraints:
  // movement_type: 'adjustment_in', ref_type: 'adjustment', qty_delta > 0
  tx.db.prepare(`
    INSERT INTO stock_movements (variant_id, qty_delta, movement_type, ref_type, ref_id, occurred_at, created_at, created_by, reason)
    VALUES (?, ?, 'adjustment_in', 'adjustment', ?, ?, ?, ?, ?)
  `).run(variantId, quantity, bagId, nowTimestamp(), nowTimestamp(), userId, reason || 'Added to Bag');
}

export function removeStockFromBag(tx: Tx, bagId: number, variantId: number, quantity: number, reason: string, userId: number) {
  const current = tx.db.prepare('SELECT quantity FROM bag_contents WHERE bag_id = ? AND variant_id = ?').get(bagId, variantId) as { quantity: number } | undefined;
  if (!current || current.quantity < quantity) throw new BusinessRuleError('insufficient_stock', 'Insufficient stock in bag');
  
  const newQty = current.quantity - quantity;
  if (newQty === 0) {
    tx.db.prepare('DELETE FROM bag_contents WHERE bag_id = ? AND variant_id = ?').run(bagId, variantId);
  } else {
    tx.db.prepare('UPDATE bag_contents SET quantity = ?, updated_at = ? WHERE bag_id = ? AND variant_id = ?').run(newQty, nowTimestamp(), bagId, variantId);
  }
  
  // Satisfies SQLite CHECK constraints:
  // movement_type: 'adjustment_out', ref_type: 'adjustment', qty_delta < 0
  tx.db.prepare(`
    INSERT INTO stock_movements (variant_id, qty_delta, movement_type, ref_type, ref_id, occurred_at, created_at, created_by, reason)
    VALUES (?, ?, 'adjustment_out', 'adjustment', ?, ?, ?, ?, ?)
  `).run(variantId, -quantity, bagId, nowTimestamp(), nowTimestamp(), userId, reason || 'Removed from Bag');
}

export function transferStock(tx: Tx, fromBagId: number, toBagId: number, variantId: number, quantity: number, reason: string, userId: number) {
  removeStockFromBag(tx, fromBagId, variantId, quantity, 'Transfer out: ' + reason, userId);
  addStockToBag(tx, toBagId, variantId, quantity, 'Transfer in: ' + reason, userId);
}

export function getGlobalStockByBags(tx: Tx) {
  const rows = tx.db.prepare(`
    SELECT bc.variant_id as variantId, pv.sku, p.name as productName, 
           COALESCE(c.name, 'Default') as colour, 
           COALESCE(s.name, 'Default') as size,
           SUM(bc.quantity) as totalQty
    FROM bag_contents bc
    JOIN bags b ON bc.bag_id = b.id AND b.status = 'active'
    JOIN product_variants pv ON bc.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN colours c ON pv.colour_id = c.id
    LEFT JOIN sizes s ON pv.size_id = s.id
    WHERE bc.quantity > 0
    GROUP BY bc.variant_id
    HAVING SUM(bc.quantity) > 0
    ORDER BY p.name, c.name, s.name
  `).all() as any[];

  for (const row of rows) {
    row.bags = tx.db.prepare(`
      SELECT b.id as bagId, b.name as bagName, bc.quantity
      FROM bag_contents bc
      JOIN bags b ON bc.bag_id = b.id
      WHERE bc.variant_id = ? AND bc.quantity > 0 AND b.status = 'active'
      ORDER BY b.name
    `).all(row.variantId);
  }
  return rows;
}
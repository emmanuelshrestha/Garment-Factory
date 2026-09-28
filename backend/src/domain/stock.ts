/**
 * Stock arithmetic, kept pure so it can be reasoned about without a database.
 *
 * The ledger itself lives in services/stock.ts. Nothing here touches SQL, and
 * nothing here uses floating point — a float in a stock comparison is a bug.
 */

import { ValidationError } from './errors.ts';

export type StockBand = 'red' | 'amber' | 'green';

/** Fallback if the `low_stock_amber_percent` setting is missing (D019). */
export const DEFAULT_AMBER_PERCENT = 25;

export function assertQtyInteger(value: unknown, field = 'qty'): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(
      `${field} must be a whole number of pieces, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

/**
 * `available = on_hand - active allocations` (inventory skill).
 *
 * This can be **negative**, and that is deliberate. It means more pieces are
 * promised to orders than physically exist — which happens if stock is written
 * off after being allocated. Clamping it to zero would hide a real
 * over-commitment from the owner, so the true number is returned and the
 * caller decides how to show it.
 */
export function availableQty(onHand: number, allocatedQty: number): number {
  assertQtyInteger(onHand, 'onHand');
  assertQtyInteger(allocatedQty, 'allocatedQty');
  if (allocatedQty < 0) {
    throw new ValidationError(`allocatedQty cannot be negative, got ${allocatedQty}`, 'allocatedQty');
  }
  return onHand - allocatedQty;
}

/**
 * Low-stock band (D019).
 *
 * ```
 * red   : on_hand <= min_stock_qty
 * amber : min_stock_qty < on_hand <= min_stock_qty * (1 + percent/100)
 * green : anything above that
 * ```
 *
 * The multiplication is done on both sides by 100 so the comparison stays in
 * integers. A `min_stock_qty` of 0 gives an empty amber band, so only actual
 * zero stock shows red — which is the sensible reading of "no minimum set".
 */
export function stockBand(
  onHand: number,
  minStockQty: number,
  amberPercent: number = DEFAULT_AMBER_PERCENT,
): StockBand {
  assertQtyInteger(onHand, 'onHand');
  assertQtyInteger(minStockQty, 'minStockQty');
  assertAmberPercent(amberPercent);
  if (minStockQty < 0) {
    throw new ValidationError(`minStockQty cannot be negative, got ${minStockQty}`, 'minStockQty');
  }
  if (onHand <= minStockQty) {
    return 'red';
  }
  if (onHand * 100 <= minStockQty * (100 + amberPercent)) {
    return 'amber';
  }
  return 'green';
}

export function assertAmberPercent(value: unknown, field = 'amberPercent'): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1000) {
    throw new ValidationError(
      `${field} must be a whole percentage between 0 and 1000, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

/**
 * Return-in ledger entry.
 *
 * Returns go straight into sellable finished stock (owner decision).
 * A return is attached to one delivery (the one it reverses).
 *
 * Multi-line returns (goods from several deliveries in one lot) are a
 * later feature. For now, the owner enters one return per delivery.
 */
export type ReturnInput = {
  deliveryId: number;
  deliveryLineId: number;
  variantId: number;
  qty: number;
  returnDate: string; // YYYY-MM-DD
  reason: string;
  userId: number;
};

/**
 * Validate a return input.
 * - qty must be positive integer
 * - returnDate must be a valid date string
 * - reason must not be empty
 */
export function validateReturnInput(input: ReturnInput): void {
  assertQtyInteger(input.qty, 'qty');
  if (input.qty <= 0) {
    throw new ValidationError('return quantity must be positive', 'qty');
  }
  if (!input.returnDate || !input.returnDate.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)) {
    throw new ValidationError('return date must be YYYY-MM-DD', 'returnDate');
  }
  if (!input.reason || !input.reason.trim()) {
    throw new ValidationError('return requires a reason', 'reason');
  }
}

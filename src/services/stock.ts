/**
 * The stock ledger. **This is the only module that inserts into
 * `stock_movements`** (inventory skill). Every other service asks this one.
 *
 * `stock_movements` is append-only and is the single source of truth:
 * `on_hand = SUM(qty_delta)`. There is no cached quantity column, so on-hand
 * cannot drift from the ledger that explains it. Because every read goes
 * through `getStockOnHand`, a cache could be added later in one place if the
 * owner ever approves one.
 *
 * Callers always pass a **positive** quantity and say what kind of movement it
 * is. This module applies the sign. That removes an entire class of bug where a
 * caller forgets the minus on a delivery.
 */

import type { Tx } from '../db/sqlite.ts';
import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.ts';
import { assertPositiveQty } from '../domain/money.ts';
import { assertDate, documentYear, nowTimestamp, today } from '../domain/dates.ts';
import {
  DEFAULT_AMBER_PERCENT,
  type StockBand,
  availableQty,
  stockBand,
} from '../domain/stock.ts';
import { getIntSetting } from './settings.ts';
import { nextDocumentNumber } from './documentNumbers.ts';
import { recordAudit } from './audit.ts';

export const AMBER_PERCENT_SETTING = 'low_stock_amber_percent';

/**
 * Movement kinds, and the direction each one moves stock.
 *
 * This table is the single place where direction is decided. The database
 * enforces the same agreement with a CHECK constraint, so a mismatch here
 * fails loudly rather than writing a wrong-signed row.
 */
const MOVEMENT_DIRECTION = {
  opening_balance: 1,
  production_receipt: 1,
  return_in: 1,
  adjustment_in: 1,
  delivery_out: -1,
  adjustment_out: -1,
} as const;

export type MovementType = keyof typeof MOVEMENT_DIRECTION;

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_DIRECTION) as readonly MovementType[];

/** Which business event a movement is allowed to point at. */
const MOVEMENT_REF_TYPE = {
  opening_balance: 'opening',
  production_receipt: 'production',
  return_in: 'return',
  adjustment_in: 'adjustment',
  adjustment_out: 'adjustment',
  delivery_out: 'delivery',
} as const;

export type RefType = (typeof MOVEMENT_REF_TYPE)[MovementType];

export function isMovementType(value: unknown): value is MovementType {
  return typeof value === 'string' && value in MOVEMENT_DIRECTION;
}

export function assertMovementType(value: unknown): MovementType {
  if (!isMovementType(value)) {
    throw new ValidationError(
      `movementType must be one of ${MOVEMENT_TYPES.join(', ')}, got ${JSON.stringify(value)}`,
      'movementType',
    );
  }
  return value;
}

export type RecordMovementInput = {
  variantId: number;
  /** Always positive. The movement type decides the sign. */
  qty: number;
  movementType: MovementType;
  /** The id of the delivery / adjustment / production record that caused this. */
  refId?: number | null;
  /** Business date of the movement, 'YYYY-MM-DD'. Defaults to today. */
  occurredAt?: string;
  reason?: string | null;
  userId: number;
};

/**
 * Append one movement and return its id.
 *
 * Refuses to drive physical stock negative: the factory cannot ship pieces it
 * does not have, and a negative on-hand would mean the ledger no longer
 * describes the shelf.
 */
export function recordStockMovement(tx: Tx, input: RecordMovementInput): number {
  const movementType = assertMovementType(input.movementType);
  const qty = assertPositiveQty(input.qty, 'qty');
  const variantId = assertVariantExists(tx, input.variantId);
  const occurredAt = assertDate(input.occurredAt ?? today(), 'occurredAt');
  const direction = MOVEMENT_DIRECTION[movementType];
  const qtyDelta = direction * qty;

  if (direction < 0) {
    const onHand = getStockOnHand(tx, variantId);
    if (onHand + qtyDelta < 0) {
      throw new BusinessRuleError(
        'stock_cannot_go_negative',
        `cannot remove ${qty} from variant ${variantId}: only ${onHand} in stock`,
        { variantId, requested: qty, onHand, movementType },
      );
    }
  }

  const reason = normaliseReason(input.reason);
  if (movementType.startsWith('adjustment_') && reason === null) {
    // Belt and braces: createStockAdjustment already requires a note, but no
    // adjustment may reach the ledger without a traceable reason.
    throw new ValidationError('an adjustment movement requires a reason', 'reason');
  }

  const info = tx.db
    .prepare(
      `INSERT INTO stock_movements
         (variant_id, qty_delta, movement_type, ref_type, ref_id, occurred_at, created_at, created_by, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      variantId,
      qtyDelta,
      movementType,
      MOVEMENT_REF_TYPE[movementType],
      input.refId ?? null,
      occurredAt,
      nowTimestamp(),
      input.userId,
      reason,
    );

  return Number(info.lastInsertRowid);
}

/** `on_hand = SUM(qty_delta)`. The only way to read physical stock. */
export function getStockOnHand(tx: Tx, variantId: number): number {
  const row = tx.db
    .prepare('SELECT COALESCE(SUM(qty_delta), 0) AS on_hand FROM stock_movements WHERE variant_id = ?')
    .get(variantId) as { on_hand: number };
  return Number(row.on_hand);
}

/** Pieces promised to confirmed orders. Allocation is a reservation, not a movement (D004). */
export function getAllocatedQty(tx: Tx, variantId: number): number {
  const row = tx.db
    .prepare(
      `SELECT COALESCE(SUM(qty), 0) AS allocated
         FROM stock_allocations
        WHERE variant_id = ? AND status = 'active'`,
    )
    .get(variantId) as { allocated: number };
  return Number(row.allocated);
}

/** What can still be promised to a new order. May be negative — see domain/stock.ts. */
export function getAvailableQty(tx: Tx, variantId: number): number {
  return availableQty(getStockOnHand(tx, variantId), getAllocatedQty(tx, variantId));
}

export type StockSummary = {
  variantId: number;
  sku: string;
  productId: number;
  productCode: string;
  productName: string;
  colour: string;
  size: string;
  onHand: number;
  allocated: number;
  available: number;
  minStockQty: number;
  band: StockBand;
  /** True when more is promised than exists — surfaced, never hidden. */
  overCommitted: boolean;
};

export function getStockSummary(tx: Tx, variantId: number): StockSummary {
  const summaries = listStockSummaries(tx, { variantId });
  const summary = summaries[0];
  if (!summary) {
    throw new NotFoundError('product variant', variantId);
  }
  return summary;
}

/**
 * One query for the whole Colour x Size matrix screen.
 *
 * The aggregates are computed in SQL rather than by looping per variant,
 * because 50 products x colours x sizes is a few thousand variants and a query
 * per variant would be slow enough to notice on the factory PC.
 */
export function listStockSummaries(
  tx: Tx,
  filter: { productId?: number; variantId?: number; activeOnly?: boolean } = {},
): StockSummary[] {
  const amberPercent = getAmberPercent(tx);
  const where: string[] = [];
  const params: (number | string)[] = [];

  if (filter.variantId !== undefined) {
    where.push('v.id = ?');
    params.push(filter.variantId);
  }
  if (filter.productId !== undefined) {
    where.push('v.product_id = ?');
    params.push(filter.productId);
  }
  if (filter.activeOnly) {
    where.push('v.is_active = 1');
  }

  const rows = tx.db
    .prepare(
      `SELECT v.id            AS variant_id,
              v.sku           AS sku,
              v.product_id    AS product_id,
              p.code          AS product_code,
              p.name          AS product_name,
              c.name          AS colour,
              s.name          AS size,
              v.min_stock_qty AS min_stock_qty,
              COALESCE((SELECT SUM(m.qty_delta) FROM stock_movements m
                         WHERE m.variant_id = v.id), 0) AS on_hand,
              COALESCE((SELECT SUM(a.qty) FROM stock_allocations a
                         WHERE a.variant_id = v.id AND a.status = 'active'), 0) AS allocated
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         JOIN colours  c ON c.id = v.colour_id
         JOIN sizes    s ON s.id = v.size_id
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.code, c.name, s.sort_order, s.name`,
    )
    .all(...params) as {
    variant_id: number;
    sku: string;
    product_id: number;
    product_code: string;
    product_name: string;
    colour: string;
    size: string;
    min_stock_qty: number;
    on_hand: number;
    allocated: number;
  }[];

  return rows.map((row) => {
    const onHand = Number(row.on_hand);
    const allocated = Number(row.allocated);
    const minStockQty = Number(row.min_stock_qty);
    const available = availableQty(onHand, allocated);
    return {
      variantId: Number(row.variant_id),
      sku: row.sku,
      productId: Number(row.product_id),
      productCode: row.product_code,
      productName: row.product_name,
      colour: row.colour,
      size: row.size,
      onHand,
      allocated,
      available,
      minStockQty,
      band: stockBand(onHand, minStockQty, amberPercent),
      overCommitted: available < 0,
    };
  });
}

/**
 * Variants in the red or amber band, worst first. For the dashboard.
 *
 * "Worst" is the largest shortfall against the variant's own threshold, so a
 * product 40 pieces below its minimum outranks one that is 2 below, regardless
 * of the absolute quantities.
 */
export function listLowStock(tx: Tx): StockSummary[] {
  const shortfall = (s: StockSummary) => s.minStockQty - s.onHand;
  return listStockSummaries(tx, { activeOnly: true })
    .filter((s) => s.band !== 'green')
    .sort((a, b) => shortfall(b) - shortfall(a) || a.sku.localeCompare(b.sku));
}

export type MovementRow = {
  id: number;
  variantId: number;
  qtyDelta: number;
  movementType: MovementType;
  refType: RefType;
  refId: number | null;
  occurredAt: string;
  createdAt: string;
  reason: string | null;
  /** On-hand after this movement, so the history reads like a bank statement. */
  balance: number;
};

/** Per-variant movement history, oldest first, with a running balance. */
export function listMovements(tx: Tx, variantId: number, limit = 500): MovementRow[] {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new ValidationError(`limit must be a positive whole number, got ${limit}`, 'limit');
  }
  const rows = tx.db
    .prepare(
      `SELECT id, variant_id, qty_delta, movement_type, ref_type, ref_id,
              occurred_at, created_at, reason
         FROM stock_movements
        WHERE variant_id = ?
        ORDER BY occurred_at, id
        LIMIT ?`,
    )
    .all(variantId, limit) as {
    id: number;
    variant_id: number;
    qty_delta: number;
    movement_type: MovementType;
    ref_type: RefType;
    ref_id: number | null;
    occurred_at: string;
    created_at: string;
    reason: string | null;
  }[];

  let balance = 0;
  return rows.map((row) => {
    balance += Number(row.qty_delta);
    return {
      id: Number(row.id),
      variantId: Number(row.variant_id),
      qtyDelta: Number(row.qty_delta),
      movementType: row.movement_type,
      refType: row.ref_type,
      refId: row.ref_id === null ? null : Number(row.ref_id),
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
      reason: row.reason,
      balance,
    };
  });
}

export const ADJUSTMENT_REASON_CODES = [
  'stock_count',
  'damage',
  'loss',
  'found',
  'correction',
] as const;

export type AdjustmentReasonCode = (typeof ADJUSTMENT_REASON_CODES)[number];

export type AdjustmentLineInput = {
  variantId: number;
  /** Signed: positive adds stock, negative removes it. Zero is rejected. */
  qtyDelta: number;
};

export type CreateAdjustmentInput = {
  reasonCode: AdjustmentReasonCode;
  /** Mandatory free text. A reason code alone is not a traceable reason. */
  note: string;
  lines: AdjustmentLineInput[];
  adjustedAt?: string;
  userId: number;
};

export type StockAdjustment = {
  id: number;
  adjustmentNo: string;
  reasonCode: AdjustmentReasonCode;
  note: string;
  adjustedAt: string;
  lines: { variantId: number; qtyDelta: number; movementId: number }[];
};

/**
 * A stock adjustment: the only sanctioned way to correct stock by hand. Stock
 * quantities are never edited directly, and every correction is auditable.
 *
 * Every line produces exactly one ledger movement, linked back to its line, so
 * the audit trail runs from the number on the screen to the reason it changed.
 * The whole adjustment is one transaction: either all lines apply or none do.
 */
export function createStockAdjustment(tx: Tx, input: CreateAdjustmentInput): StockAdjustment {
  const reasonCode = assertReasonCode(input.reasonCode);
  const note = (input.note ?? '').trim();
  if (note.length === 0) {
    throw new ValidationError('an adjustment requires a note explaining why', 'note');
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new ValidationError('an adjustment needs at least one line', 'lines');
  }

  const adjustedAt = assertDate(input.adjustedAt ?? today(), 'adjustedAt');
  const seen = new Set<number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.qtyDelta) || line.qtyDelta === 0) {
      throw new ValidationError(
        `qtyDelta must be a non-zero whole number, got ${JSON.stringify(line.qtyDelta)}`,
        'qtyDelta',
      );
    }
    if (seen.has(line.variantId)) {
      // Two lines for one variant makes the audit trail ambiguous; the caller
      // should combine them rather than have us guess.
      throw new ValidationError(
        `variant ${line.variantId} appears twice in one adjustment; combine the lines`,
        'lines',
      );
    }
    seen.add(line.variantId);
  }

  const adjustmentNo = nextDocumentNumber(tx, 'ADJ', documentYear(adjustedAt));
  const createdAt = nowTimestamp();

  const adjustmentId = Number(
    tx.db
      .prepare(
        `INSERT INTO stock_adjustments
           (adjustment_no, adjusted_at, reason_code, note, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(adjustmentNo, adjustedAt, reasonCode, note, createdAt, input.userId).lastInsertRowid,
  );

  const lines = input.lines.map((line) => {
    const movementId = recordStockMovement(tx, {
      variantId: line.variantId,
      qty: Math.abs(line.qtyDelta),
      movementType: line.qtyDelta > 0 ? 'adjustment_in' : 'adjustment_out',
      refId: adjustmentId,
      occurredAt: adjustedAt,
      reason: `${reasonCode}: ${note}`,
      userId: input.userId,
    });

    tx.db
      .prepare(
        `INSERT INTO stock_adjustment_lines (adjustment_id, variant_id, qty_delta, movement_id)
         VALUES (?, ?, ?, ?)`,
      )
      .run(adjustmentId, line.variantId, line.qtyDelta, movementId);

    return { variantId: line.variantId, qtyDelta: line.qtyDelta, movementId };
  });

  recordAudit(tx, {
    action: 'stock_adjustment_created',
    entityType: 'stock_adjustment',
    entityId: adjustmentId,
    detail: { adjustmentNo, reasonCode, lineCount: lines.length },
    userId: input.userId,
  });

  return { id: adjustmentId, adjustmentNo, reasonCode, note, adjustedAt, lines };
}

/**
 * Opening balance for a variant: the stock that existed before the system did.
 *
 * Allowed once per variant. A second one would make "opening" meaningless — a
 * later correction is an adjustment, which carries a reason.
 */
export function recordOpeningBalance(
  tx: Tx,
  input: { variantId: number; qty: number; occurredAt?: string; userId: number },
): number {
  const variantId = assertVariantExists(tx, input.variantId);
  const existing = tx.db
    .prepare(
      `SELECT id FROM stock_movements
        WHERE variant_id = ? AND movement_type = 'opening_balance' LIMIT 1`,
    )
    .get(variantId) as { id: number } | undefined;

  if (existing) {
    throw new BusinessRuleError(
      'opening_balance_already_set',
      `variant ${variantId} already has an opening balance; correct it with a stock adjustment`,
      { variantId },
    );
  }

  return recordStockMovement(tx, {
    variantId,
    qty: input.qty,
    movementType: 'opening_balance',
    refId: null,
    occurredAt: input.occurredAt,
    reason: 'Opening balance',
    userId: input.userId,
  });
}

export function getAmberPercent(tx: Tx): number {
  return getIntSetting(tx, AMBER_PERCENT_SETTING, DEFAULT_AMBER_PERCENT);
}

function assertReasonCode(value: unknown): AdjustmentReasonCode {
  if (typeof value !== 'string' || !(ADJUSTMENT_REASON_CODES as readonly string[]).includes(value)) {
    throw new ValidationError(
      `reasonCode must be one of ${ADJUSTMENT_REASON_CODES.join(', ')}, got ${JSON.stringify(value)}`,
      'reasonCode',
    );
  }
  return value as AdjustmentReasonCode;
}

function assertVariantExists(tx: Tx, variantId: unknown): number {
  if (typeof variantId !== 'number' || !Number.isInteger(variantId) || variantId < 1) {
    throw new ValidationError(`variantId must be a positive whole number, got ${JSON.stringify(variantId)}`, 'variantId');
  }
  const row = tx.db.prepare('SELECT id FROM product_variants WHERE id = ?').get(variantId) as
    | { id: number }
    | undefined;
  if (!row) {
    throw new NotFoundError('product variant', variantId);
  }
  return variantId;
}

function normaliseReason(reason: string | null | undefined): string | null {
  if (reason === null || reason === undefined) {
    return null;
  }
  const trimmed = reason.trim();
  return trimmed.length === 0 ? null : trimmed;
}

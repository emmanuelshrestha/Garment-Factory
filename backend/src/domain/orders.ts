/**
 * Order business rules that need no database.
 *
 * Two things live here: which status changes are legal, and how much of an
 * order can be reserved from what is on the shelf. Both are pure functions so
 * they can be tested exhaustively without a factory's worth of fixtures.
 */

import { BusinessRuleError, ValidationError } from './errors.ts';
import { assertPositiveQty, lineTotalMinor, sumMinor } from './money.ts';
import { assertQtyInteger } from './stock.ts';

export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'partially_delivered',
  'delivered',
  'closed',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function assertOrderStatus(value: unknown, field = 'status'): OrderStatus {
  if (!isOrderStatus(value)) {
    throw new ValidationError(
      `status must be one of ${ORDER_STATUSES.join(', ')}, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

/**
 * Legal status changes.
 *
 * `partially_delivered` and `delivered` are set by the delivery service from
 * the delivered quantities, never chosen by hand. `closed` is the owner
 * saying "nothing more will happen on this order".
 *
 * Cancelling a part-delivered order is deliberately absent: goods have left
 * the factory and the accounting consequence is a business decision the owner
 * has not made yet. See the message in `assertOrderTransition`.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['partially_delivered', 'delivered', 'cancelled'],
  partially_delivered: ['delivered', 'partially_delivered', 'closed'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): OrderStatus {
  assertOrderStatus(from, 'from');
  assertOrderStatus(to, 'to');
  if (canTransition(from, to)) {
    return to;
  }
  if (from === 'partially_delivered' && to === 'cancelled') {
    throw new BusinessRuleError(
      'cannot_cancel_part_delivered_order',
      'this order has already been partly delivered, so it cannot be cancelled; ' +
        'deliver or close the remainder instead',
      { from, to },
    );
  }
  throw new BusinessRuleError(
    'illegal_order_transition',
    `an order cannot go from ${from} to ${to}`,
    { from, to, allowed: ALLOWED_TRANSITIONS[from] },
  );
}

/** Whether the order still occupies the owner's attention. */
export function isOpenStatus(status: OrderStatus): boolean {
  return status === 'draft' || status === 'confirmed' || status === 'partially_delivered';
}

/** Only a draft may have its lines and prices edited (D005). */
export function isEditableStatus(status: OrderStatus): boolean {
  return status === 'draft';
}

/* ---------------------------------------------------------------- totals */

export type OrderLineAmount = { unitPriceMinor: number; qtyOrdered: number };

/**
 * Order total in the order's own currency.
 *
 * Rounded once per line and never re-rounded (D018); the header stores no
 * total, so this is recomputed from the lines every time and cannot drift.
 */
export function orderTotalMinor(lines: readonly OrderLineAmount[]): number {
  return sumMinor(lines.map((line) => lineTotalMinor(line.unitPriceMinor, line.qtyOrdered)));
}

/* ------------------------------------------------------------ allocation */

export type AllocationRequest = {
  orderLineId: number;
  variantId: number;
  /** How many pieces the customer asked for on this line. */
  qtyOrdered: number;
  /** How many are already reserved for this line. */
  qtyAllocated: number;
  /** How many have already left the factory against this line. */
  qtyDelivered: number;
  /** Free stock for this variant right now: on_hand - active allocations. */
  qtyAvailable: number;
};

export type AllocationPlan = {
  orderLineId: number;
  variantId: number;
  /** Extra pieces to reserve now. Zero means nothing to do for this line. */
  allocateQty: number;
  /** Pieces still unaccounted for after this reservation: production or waiting. */
  shortageQty: number;
};

/**
 * Decide how much more stock to reserve for each line (D004).
 *
 * Reservation is a promise against free stock, never a stock movement. A line
 * is satisfied when allocated + delivered reaches the ordered quantity, so
 * topping up an under-allocated line later — once production or an adjustment
 * has put pieces on the shelf — is the same calculation run again.
 *
 * Partial reservation is deliberate: reserving 30 of 50 and flagging a
 * shortage of 20 is more useful to the factory than refusing the order.
 */
export function planAllocations(requests: readonly AllocationRequest[]): AllocationPlan[] {
  const seen = new Set<number>();
  return requests.map((request) => {
    if (seen.has(request.orderLineId)) {
      throw new ValidationError(`order line ${request.orderLineId} appears twice`, 'orderLineId');
    }
    seen.add(request.orderLineId);

    const qtyOrdered = assertPositiveQty(request.qtyOrdered, 'qtyOrdered');
    const qtyAllocated = assertNonNegative(request.qtyAllocated, 'qtyAllocated');
    const qtyDelivered = assertNonNegative(request.qtyDelivered, 'qtyDelivered');
    // Availability may legitimately be negative if an earlier adjustment took
    // stock away from under existing reservations; there is nothing to give out.
    const qtyAvailable = Math.max(0, assertQtyInteger(request.qtyAvailable, 'qtyAvailable'));

    const outstanding = Math.max(0, qtyOrdered - qtyAllocated - qtyDelivered);
    const allocateQty = Math.min(outstanding, qtyAvailable);

    return {
      orderLineId: request.orderLineId,
      variantId: request.variantId,
      allocateQty,
      shortageQty: outstanding - allocateQty,
    };
  });
}

/** Total pieces that must be produced or waited for after a plan is applied. */
export function totalShortage(plans: readonly AllocationPlan[]): number {
  return plans.reduce((sum, plan) => sum + plan.shortageQty, 0);
}

/**
 * The status an order has reached given what has been delivered.
 *
 * Deterministic from the lines, so an order can never claim to be delivered
 * while pieces are outstanding.
 */
export function fulfilmentStatus(
  lines: readonly { qtyOrdered: number; qtyDelivered: number }[],
): 'confirmed' | 'partially_delivered' | 'delivered' {
  if (lines.length === 0) {
    throw new ValidationError('an order must have at least one line', 'lines');
  }
  let delivered = 0;
  let outstanding = 0;
  for (const line of lines) {
    const ordered = assertPositiveQty(line.qtyOrdered, 'qtyOrdered');
    const done = assertNonNegative(line.qtyDelivered, 'qtyDelivered');
    delivered += done;
    outstanding += Math.max(0, ordered - done);
  }
  if (outstanding === 0) {
    return 'delivered';
  }
  return delivered > 0 ? 'partially_delivered' : 'confirmed';
}

function assertNonNegative(value: unknown, field: string): number {
  const qty = assertQtyInteger(value, field);
  if (qty < 0) {
    throw new ValidationError(`${field} cannot be negative, got ${qty}`, field);
  }
  return qty;
}

/**
 * Delivery arithmetic, kept pure.
 *
 * A delivery is the moment finished garments physically leave the factory. It
 * is the only event in the sales flow that reduces finished stock, and the
 * ledger write itself lives in services/deliveries.ts. Nothing here touches
 * SQL.
 *
 * Two rules decide what may go out (D021):
 *
 *   1. Never more than the order still expects: `qtyOrdered - qtyDelivered`.
 *   2. Never more pieces than exist and are not promised elsewhere: the
 *      pieces already reserved for this order line, plus whatever is free.
 *
 * Rule 2 is why a delivery cannot quietly take stock reserved for another
 * customer's confirmed order. Its edge case is an over-reserved variant — more
 * promised than is on the shelf, which an adjustment can cause — where the line
 * may still ship what physically exists but no more.
 */

import { BusinessRuleError, ValidationError } from './errors.ts';
import { assertQtyInteger } from './stock.ts';
import { assertPositiveQty } from './money.ts';

export type DeliveryLineRequest = {
  orderLineId: number;
  variantId: number;
  /** Pieces being sent now. */
  qty: number;
  qtyOrdered: number;
  /** Pieces already dispatched on earlier deliveries of this order line. */
  qtyDelivered: number;
  /** Active reservations held by this order line. */
  qtyAllocatedForLine: number;
  /** Ledger balance for the variant. */
  onHand: number;
  /** Active reservations for the variant across every order, including this one. */
  totalAllocatedForVariant: number;
};

export type DeliveryLinePlan = {
  orderLineId: number;
  variantId: number;
  qty: number;
  /** Of `qty`, how many pieces come out of this line's own reservation. */
  fromAllocation: number;
  /** Of `qty`, how many come from unreserved stock. */
  fromFreeStock: number;
  /** What the order line still expects after this delivery. */
  qtyRemaining: number;
};

/**
 * Decide whether a delivery may go out, and where its pieces come from.
 *
 * Throws instead of trimming. Silently reducing a quantity would mean the
 * paperwork and the van disagreed.
 */
export function planDelivery(requests: readonly DeliveryLineRequest[]): DeliveryLinePlan[] {
  if (requests.length === 0) {
    throw new ValidationError('a delivery needs at least one line', 'lines');
  }

  const seenLines = new Set<number>();
  const seenVariants = new Set<number>();

  return requests.map((request) => {
    const qty = assertPositiveQty(request.qty, 'qty');
    assertQtyInteger(request.qtyOrdered, 'qtyOrdered');
    assertQtyInteger(request.qtyDelivered, 'qtyDelivered');
    assertQtyInteger(request.qtyAllocatedForLine, 'qtyAllocatedForLine');
    assertQtyInteger(request.onHand, 'onHand');
    assertQtyInteger(request.totalAllocatedForVariant, 'totalAllocatedForVariant');

    if (seenLines.has(request.orderLineId)) {
      throw new ValidationError(
        `order line ${request.orderLineId} appears twice in one delivery`,
        'orderLineId',
      );
    }
    seenLines.add(request.orderLineId);

    // One order cannot have two lines for the same variant (order_lines is
    // UNIQUE on order_id + variant_id), so this guards against a caller
    // assembling a delivery by hand and double-spending the same free stock.
    if (seenVariants.has(request.variantId)) {
      throw new ValidationError(
        `variant ${request.variantId} appears twice in one delivery`,
        'variantId',
      );
    }
    seenVariants.add(request.variantId);

    const outstanding = request.qtyOrdered - request.qtyDelivered;
    if (qty > outstanding) {
      throw new BusinessRuleError(
        'delivery_exceeds_order',
        `cannot deliver ${qty} pieces: the order line expects ${outstanding} more` +
          ` (${request.qtyOrdered} ordered, ${request.qtyDelivered} already delivered)`,
        { orderLineId: request.orderLineId, qty, outstanding },
      );
    }

    const fromAllocation = Math.min(qty, Math.max(0, request.qtyAllocatedForLine));
    const fromFreeStock = qty - fromAllocation;
    const freeStock = request.onHand - request.totalAllocatedForVariant;
    const detail = {
      orderLineId: request.orderLineId,
      variantId: request.variantId,
      qty,
      reserved: request.qtyAllocatedForLine,
      freeStock,
      onHand: request.onHand,
    };

    // Nothing may leave that is not on the shelf, however much is reserved.
    // A variant can be over-reserved — an adjustment may have taken stock away
    // from under existing reservations — and then the reservation is a promise
    // the shelf cannot keep.
    if (qty > request.onHand) {
      throw new BusinessRuleError(
        'delivery_exceeds_available_stock',
        `cannot deliver ${qty} pieces: only ${request.onHand} in stock`,
        detail,
      );
    }

    // `Math.max(0, freeStock)`: when a variant is over-reserved there is simply
    // no free stock, which must not stop the line shipping the pieces it
    // already holds. Without the clamp an over-reserved variant would refuse
    // every delivery until someone adjusted the ledger.
    if (fromFreeStock > Math.max(0, freeStock)) {
      throw new BusinessRuleError(
        'delivery_exceeds_available_stock',
        `cannot deliver ${qty} pieces: ${request.qtyAllocatedForLine} reserved for this order` +
          ` and ${Math.max(0, freeStock)} unreserved in stock`,
        detail,
      );
    }

    return {
      orderLineId: request.orderLineId,
      variantId: request.variantId,
      qty,
      fromAllocation,
      fromFreeStock,
      qtyRemaining: outstanding - qty,
    };
  });
}

export function totalDeliveredQty(plans: readonly DeliveryLinePlan[]): number {
  return plans.reduce((sum, plan) => sum + plan.qty, 0);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planDelivery,
  totalDeliveredQty,
  type DeliveryLineRequest,
} from '../../src/domain/deliveries.ts';
import { BusinessRuleError, ValidationError } from '../../src/domain/errors.ts';

/**
 * A line with plenty of everything, so each test can change one number and
 * show what that number alone decides.
 */
function line(overrides: Partial<DeliveryLineRequest> = {}): DeliveryLineRequest {
  return {
    orderLineId: 1,
    variantId: 10,
    qty: 10,
    qtyOrdered: 30,
    qtyDelivered: 0,
    qtyAllocatedForLine: 30,
    onHand: 30,
    totalAllocatedForVariant: 30,
    ...overrides,
  };
}

/** Asserts the rule that refused, not merely that something threw. */
function refuses(
  attempt: () => unknown,
  rule: string,
  check?: (error: BusinessRuleError) => void,
): void {
  assert.throws(attempt, (error: unknown) => {
    assert.ok(error instanceof BusinessRuleError, `expected a BusinessRuleError, got ${String(error)}`);
    assert.equal(error.rule, rule);
    check?.(error);
    return true;
  });
}

test('D021: a delivery takes pieces from its own reservation first', () => {
  const plans = planDelivery([line({ qty: 10 })]);
  assert.deepEqual(plans, [
    {
      orderLineId: 1,
      variantId: 10,
      qty: 10,
      fromAllocation: 10,
      fromFreeStock: 0,
      qtyRemaining: 20,
    },
  ]);
});

test('D021: an unreserved order line may still ship from free stock', () => {
  // Nothing reserved — the order was never confirmed against stock, or the
  // reservation went elsewhere — but 12 pieces are sitting unpromised.
  const plans = planDelivery([
    line({ qty: 12, qtyAllocatedForLine: 0, onHand: 12, totalAllocatedForVariant: 0 }),
  ]);
  assert.equal(plans[0].fromAllocation, 0);
  assert.equal(plans[0].fromFreeStock, 12);
});

test('D021: a delivery may combine its reservation with free stock', () => {
  // 8 reserved for this line, 20 on the shelf, so 12 are free. Sending 15
  // means 8 from the reservation and 7 from the free pieces.
  const plans = planDelivery([
    line({ qty: 15, qtyAllocatedForLine: 8, onHand: 20, totalAllocatedForVariant: 8 }),
  ]);
  assert.equal(plans[0].fromAllocation, 8);
  assert.equal(plans[0].fromFreeStock, 7);
  assert.equal(plans[0].qtyRemaining, 15);
});

test('D021: stock reserved for another order is out of reach', () => {
  // 20 on the shelf, all 20 promised to somebody else; this line has none.
  refuses(
    () =>
      planDelivery([
        line({ qty: 5, qtyAllocatedForLine: 0, onHand: 20, totalAllocatedForVariant: 20 }),
      ]),
    'delivery_exceeds_available_stock',
  );
});

test('D021: a delivery cannot exceed what the order line still expects', () => {
  refuses(
    () => planDelivery([line({ qty: 11, qtyOrdered: 30, qtyDelivered: 20 })]),
    'delivery_exceeds_order',
    (error) => {
      assert.match(error.message, /expects 10 more/);
      assert.deepEqual(error.detail, { orderLineId: 1, qty: 11, outstanding: 10 });
    },
  );
});

test('the last outstanding piece can be delivered', () => {
  const plans = planDelivery([line({ qty: 10, qtyOrdered: 30, qtyDelivered: 20 })]);
  assert.equal(plans[0].qtyRemaining, 0);
});

test('a fully delivered line refuses one more piece', () => {
  refuses(
    () => planDelivery([line({ qty: 1, qtyOrdered: 30, qtyDelivered: 30 })]),
    'delivery_exceeds_order',
  );
});

test('a delivery cannot send more pieces than exist', () => {
  refuses(
    () =>
      planDelivery([
        line({ qty: 10, qtyAllocatedForLine: 0, onHand: 4, totalAllocatedForVariant: 0 }),
      ]),
    'delivery_exceeds_available_stock',
    (error) => assert.equal(error.detail?.onHand, 4),
  );
});

test('an over-reserved variant does not lend the delivery imaginary stock', () => {
  // An adjustment took stock away from under existing reservations: 5 on the
  // shelf, 20 still reserved, of which 20 belong to this line. The line may
  // ship the 5 that exist and no more.
  const request = { qtyAllocatedForLine: 20, onHand: 5, totalAllocatedForVariant: 20 };
  assert.equal(planDelivery([line({ qty: 5, ...request })])[0].fromAllocation, 5);

  // 6 would need a piece that is not there. `fromFreeStock` is 0 and free
  // stock is negative, so the arithmetic must still refuse.
  refuses(
    () => planDelivery([line({ qty: 6, ...request })]),
    'delivery_exceeds_available_stock',
    (error) => assert.equal(error.detail?.freeStock, -15),
  );
});

test('several lines are planned together', () => {
  const plans = planDelivery([
    line({ orderLineId: 1, variantId: 10, qty: 5 }),
    line({ orderLineId: 2, variantId: 11, qty: 7, qtyOrdered: 7 }),
  ]);
  assert.equal(plans.length, 2);
  assert.equal(totalDeliveredQty(plans), 12);
  assert.equal(plans[1].qtyRemaining, 0);
});

test('one bad line refuses the whole delivery', () => {
  // planDelivery returns a plan or throws; it never returns a partial one.
  refuses(
    () =>
      planDelivery([
        line({ orderLineId: 1, variantId: 10, qty: 5 }),
        line({ orderLineId: 2, variantId: 11, qty: 99, qtyOrdered: 10 }),
      ]),
    'delivery_exceeds_order',
  );
});

test('a delivery needs at least one line', () => {
  assert.throws(() => planDelivery([]), ValidationError);
});

test('the same order line cannot appear twice in one delivery', () => {
  assert.throws(
    () => planDelivery([line({ orderLineId: 1, variantId: 10 }), line({ orderLineId: 1, variantId: 11 })]),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.match(error.message, /appears twice/);
      return true;
    },
  );
});

test('the same variant cannot appear twice in one delivery', () => {
  // Otherwise two lines could each spend the same free pieces: 6 free, two
  // lines of 6, both individually affordable.
  const free = { qtyAllocatedForLine: 0, onHand: 6, totalAllocatedForVariant: 0 };
  assert.throws(
    () =>
      planDelivery([
        line({ orderLineId: 1, variantId: 10, qty: 6, ...free }),
        line({ orderLineId: 2, variantId: 10, qty: 6, ...free }),
      ]),
    (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.field, 'variantId');
      return true;
    },
  );
});

test('a delivery quantity must be a positive whole number of garments', () => {
  assert.throws(() => planDelivery([line({ qty: 0 })]), ValidationError);
  assert.throws(() => planDelivery([line({ qty: -5 })]), ValidationError);
  assert.throws(() => planDelivery([line({ qty: 2.5 })]), ValidationError);
  assert.throws(() => planDelivery([line({ qty: Number.NaN })]), ValidationError);
  assert.throws(() => planDelivery([line({ qty: '10' as unknown as number })]), ValidationError);
});

test('nonsense stock figures are refused rather than guessed at', () => {
  assert.throws(() => planDelivery([line({ onHand: 1.5 })]), ValidationError);
  assert.throws(() => planDelivery([line({ qtyDelivered: '0' as unknown as number })]), ValidationError);
  assert.throws(() => planDelivery([line({ totalAllocatedForVariant: Number.NaN })]), ValidationError);
});

test('totalDeliveredQty of nothing is nothing', () => {
  assert.equal(totalDeliveredQty([]), 0);
});

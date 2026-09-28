import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertOrderTransition,
  canTransition,
  fulfilmentStatus,
  orderTotalMinor,
  planAllocations,
  totalShortage,
} from '../../src/domain/orders.ts';
import { BusinessRuleError, ValidationError } from '../../src/domain/errors.ts';

test('an order total is the sum of its lines, rounded once per line', () => {
  assert.equal(
    orderTotalMinor([
      { unitPriceMinor: 80000, qtyOrdered: 3 },
      { unitPriceMinor: 85050, qtyOrdered: 2 },
    ]),
    240000 + 170100,
  );
  assert.equal(orderTotalMinor([]), 0);
});

test('a free line does not break the total', () => {
  assert.equal(
    orderTotalMinor([
      { unitPriceMinor: 0, qtyOrdered: 5 },
      { unitPriceMinor: 80000, qtyOrdered: 1 },
    ]),
    80000,
  );
});

test('D004: a line reserves as much free stock as it can and reports the rest', () => {
  const plans = planAllocations([
    { orderLineId: 1, variantId: 10, qtyOrdered: 50, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: 30 },
    { orderLineId: 2, variantId: 11, qtyOrdered: 20, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: 40 },
    { orderLineId: 3, variantId: 12, qtyOrdered: 10, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: 0 },
  ]);
  assert.deepEqual(
    plans.map((p) => [p.orderLineId, p.allocateQty, p.shortageQty]),
    [
      [1, 30, 20],
      [2, 20, 0],
      [3, 0, 10],
    ],
  );
  assert.equal(totalShortage(plans), 30);
});

test('an already-reserved line only tops up what is outstanding', () => {
  const [plan] = planAllocations([
    { orderLineId: 1, variantId: 10, qtyOrdered: 50, qtyAllocated: 30, qtyDelivered: 0, qtyAvailable: 100 },
  ]);
  assert.equal(plan?.allocateQty, 20, 'not 50 again');
  assert.equal(plan?.shortageQty, 0);
});

test('delivered pieces count towards the order, so they are not reserved twice', () => {
  const [plan] = planAllocations([
    { orderLineId: 1, variantId: 10, qtyOrdered: 50, qtyAllocated: 10, qtyDelivered: 40, qtyAvailable: 100 },
  ]);
  assert.equal(plan?.allocateQty, 0, 'ordered 50, 40 gone and 10 reserved: nothing left to reserve');
  assert.equal(plan?.shortageQty, 0);
});

test('an over-delivered line asks for nothing rather than going negative', () => {
  const [plan] = planAllocations([
    { orderLineId: 1, variantId: 10, qtyOrdered: 50, qtyAllocated: 0, qtyDelivered: 60, qtyAvailable: 100 },
  ]);
  assert.equal(plan?.allocateQty, 0);
  assert.equal(plan?.shortageQty, 0);
});

test('negative availability reserves nothing instead of inverting the arithmetic', () => {
  // Availability goes negative when an adjustment removes stock that was
  // already reserved. There is nothing free to hand out.
  const [plan] = planAllocations([
    { orderLineId: 1, variantId: 10, qtyOrdered: 50, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: -5 },
  ]);
  assert.equal(plan?.allocateQty, 0);
  assert.equal(plan?.shortageQty, 50);
});

test('re-running the plan when nothing changed reserves nothing', () => {
  const request = {
    orderLineId: 1,
    variantId: 10,
    qtyOrdered: 50,
    qtyAllocated: 50,
    qtyDelivered: 0,
    qtyAvailable: 200,
  };
  assert.equal(planAllocations([request])[0]?.allocateQty, 0);
});

test('allocation planning rejects nonsense rather than guessing', () => {
  assert.throws(
    () =>
      planAllocations([
        { orderLineId: 1, variantId: 10, qtyOrdered: 0, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: 5 },
      ]),
    ValidationError,
  );
  assert.throws(
    () =>
      planAllocations([
        { orderLineId: 1, variantId: 10, qtyOrdered: 10.5, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: 5 },
      ]),
    ValidationError,
  );
  assert.throws(
    () =>
      planAllocations([
        { orderLineId: 1, variantId: 10, qtyOrdered: 10, qtyAllocated: -1, qtyDelivered: 0, qtyAvailable: 5 },
      ]),
    ValidationError,
  );
  assert.throws(
    () =>
      planAllocations([
        { orderLineId: 1, variantId: 10, qtyOrdered: 10, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: 5 },
        { orderLineId: 1, variantId: 11, qtyOrdered: 10, qtyAllocated: 0, qtyDelivered: 0, qtyAvailable: 5 },
      ]),
    ValidationError,
    'the same line twice is a caller bug, not a double reservation',
  );
});

test('the legal status path is draft to confirmed to delivered to closed', () => {
  assert.ok(canTransition('draft', 'confirmed'));
  assert.ok(canTransition('confirmed', 'partially_delivered'));
  assert.ok(canTransition('confirmed', 'delivered'));
  assert.ok(canTransition('partially_delivered', 'delivered'));
  assert.ok(canTransition('delivered', 'closed'));
});

test('an order cannot skip confirmation or come back from the dead', () => {
  assert.equal(canTransition('draft', 'delivered'), false);
  assert.equal(canTransition('draft', 'closed'), false);
  assert.equal(canTransition('cancelled', 'confirmed'), false);
  assert.equal(canTransition('closed', 'confirmed'), false);
  assert.equal(canTransition('delivered', 'cancelled'), false);
  assert.throws(() => assertOrderTransition('cancelled', 'confirmed'), BusinessRuleError);
});

test('a draft or confirmed order can be cancelled; a part-delivered one cannot', () => {
  assert.ok(canTransition('draft', 'cancelled'));
  assert.ok(canTransition('confirmed', 'cancelled'));
  assert.throws(
    () => assertOrderTransition('partially_delivered', 'cancelled'),
    (error: unknown) => {
      assert.ok(error instanceof BusinessRuleError);
      assert.equal(error.rule, 'cannot_cancel_part_delivered_order');
      return true;
    },
  );
});

test('an unknown status is a validation error, not a silent false', () => {
  assert.throws(() => assertOrderTransition('draft', 'shipped' as 'delivered'), ValidationError);
  assert.throws(() => assertOrderTransition('paid' as 'draft', 'delivered'), ValidationError);
});

test('fulfilment status is derived from the lines, never asserted', () => {
  assert.equal(fulfilmentStatus([{ qtyOrdered: 10, qtyDelivered: 0 }]), 'confirmed');
  assert.equal(fulfilmentStatus([{ qtyOrdered: 10, qtyDelivered: 4 }]), 'partially_delivered');
  assert.equal(fulfilmentStatus([{ qtyOrdered: 10, qtyDelivered: 10 }]), 'delivered');
  assert.equal(
    fulfilmentStatus([
      { qtyOrdered: 10, qtyDelivered: 10 },
      { qtyOrdered: 5, qtyDelivered: 0 },
    ]),
    'partially_delivered',
    'one line complete is not a complete order',
  );
  assert.equal(
    fulfilmentStatus([
      { qtyOrdered: 10, qtyDelivered: 10 },
      { qtyOrdered: 5, qtyDelivered: 5 },
    ]),
    'delivered',
  );
  assert.throws(() => fulfilmentStatus([]), ValidationError);
});

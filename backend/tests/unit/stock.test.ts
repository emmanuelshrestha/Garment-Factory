import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_AMBER_PERCENT, availableQty, stockBand } from '../../src/domain/stock.ts';
import { ValidationError } from '../../src/domain/errors.ts';

test('available is on-hand minus active allocations', () => {
  assert.equal(availableQty(100, 30), 70);
  assert.equal(availableQty(100, 0), 100);
  assert.equal(availableQty(0, 0), 0);
});

test('available may be negative, so over-commitment is visible rather than hidden', () => {
  // 10 promised, then 8 written off as damaged: the owner is short 3.
  assert.equal(availableQty(7, 10), -3);
});

test('availability rejects nonsense input rather than coercing it', () => {
  assert.throws(() => availableQty(1.5, 0), ValidationError);
  assert.throws(() => availableQty(10, -1), ValidationError);
  assert.throws(() => availableQty('10' as unknown as number, 0), ValidationError);
});

test('D019: red is at or below the minimum', () => {
  assert.equal(stockBand(0, 20), 'red');
  assert.equal(stockBand(19, 20), 'red');
  assert.equal(stockBand(20, 20), 'red'); // at the minimum is already red
});

test('D019: amber is within 25% above the minimum', () => {
  assert.equal(stockBand(21, 20), 'amber');
  assert.equal(stockBand(25, 20), 'amber'); // 20 * 1.25 exactly
  assert.equal(stockBand(26, 20), 'green');
});

test('D019: the amber band uses integer arithmetic, so odd minimums are exact', () => {
  // 3 * 1.25 = 3.75, so 4 is above the band. A float 3.7499999 must not creep in.
  assert.equal(stockBand(3, 3), 'red');
  assert.equal(stockBand(4, 3), 'green');
  // 8 * 1.25 = 10 exactly.
  assert.equal(stockBand(10, 8), 'amber');
  assert.equal(stockBand(11, 8), 'green');
  // 7 * 1.25 = 8.75, so 8 is amber and 9 is green.
  assert.equal(stockBand(8, 7), 'amber');
  assert.equal(stockBand(9, 7), 'green');
});

test('D019: no minimum set means only empty stock is red', () => {
  assert.equal(stockBand(0, 0), 'red');
  assert.equal(stockBand(1, 0), 'green'); // amber band is empty when the minimum is 0
});

test('D019: the amber percent is a system setting, not a constant', () => {
  assert.equal(DEFAULT_AMBER_PERCENT, 25);
  assert.equal(stockBand(26, 20, 50), 'amber'); // wider band
  assert.equal(stockBand(31, 20, 50), 'green');
  assert.equal(stockBand(21, 20, 0), 'green'); // no amber band at all
});

test('negative on-hand is bandable but a negative minimum is a bug', () => {
  // A negative on-hand should never reach here, but if a report ever shows one
  // it must read as red, not crash the dashboard.
  assert.equal(stockBand(-5, 0), 'red');
  assert.throws(() => stockBand(10, -1), ValidationError);
});

test('band rejects fractional pieces and a nonsense percentage', () => {
  assert.throws(() => stockBand(10.5, 5), ValidationError);
  assert.throws(() => stockBand(10, 5, 12.5), ValidationError);
  assert.throws(() => stockBand(10, 5, -1), ValidationError);
});

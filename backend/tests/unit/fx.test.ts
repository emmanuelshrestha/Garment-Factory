import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FX_SCALE,
  NPR_RATE_SCALED,
  assertRateScaled,
  convertToNprMinor,
  formatRateScaled,
  parseRateToScaled,
  rateForNewDocument,
} from '../../src/domain/fx.ts';
import { ValidationError } from '../../src/domain/errors.ts';

test('parses a rate without floating point', () => {
  assert.equal(parseRateToScaled('1.6'), 1_600_000);
  assert.equal(parseRateToScaled('1.600000'), 1_600_000);
  assert.equal(parseRateToScaled('1'), 1_000_000);
  assert.equal(parseRateToScaled('134.25'), 134_250_000);
  assert.equal(parseRateToScaled('0.000001'), 1);
});

test('rejects a malformed or non-positive rate', () => {
  assert.throws(() => parseRateToScaled('1.6000001'), ValidationError); // 7 decimals
  assert.throws(() => parseRateToScaled('0'), ValidationError);
  assert.throws(() => parseRateToScaled('-1.6'), ValidationError);
  assert.throws(() => parseRateToScaled('abc'), ValidationError);
  assert.throws(() => assertRateScaled(1.5), ValidationError);
  assert.throws(() => assertRateScaled(0), ValidationError);
});

test('formats a rate back for display', () => {
  assert.equal(formatRateScaled(1_600_000), '1.6');
  assert.equal(formatRateScaled(1_000_000), '1');
  assert.equal(formatRateScaled(134_250_000), '134.25');
  assert.equal(formatRateScaled(1), '0.000001');
});

test('NPR conversion is the identity, exactly', () => {
  for (const amount of [0, 1, 85000, 123456789]) {
    assert.equal(convertToNprMinor(amount, NPR_RATE_SCALED), amount);
  }
});

test('D018: FX conversion rounds half away from zero, once', () => {
  // ₹850.00 at 1.6 -> Rs 1360.00, exact.
  assert.equal(convertToNprMinor(85000, 1_600_000), 136000);
  // 1 paisa at 1.5 -> 1.5 paisa -> rounds away from zero to 2.
  assert.equal(convertToNprMinor(1, 1_500_000), 2);
  assert.equal(convertToNprMinor(-1, 1_500_000), -2);
  // 1 paisa at 1.4 -> 1.4 -> 1.
  assert.equal(convertToNprMinor(1, 1_400_000), 1);
  // 3 paisa at 1.005 -> 3.015 -> 3.
  assert.equal(convertToNprMinor(3, 1_005_000), 3);
});

test('FX conversion refuses a float amount', () => {
  assert.throws(() => convertToNprMinor(850.5, 1_600_000), ValidationError);
});

test('D011: per-line conversion is what a report must sum', () => {
  // Converting each line and summing is the documented order of operations.
  // This test pins the difference so nobody "simplifies" it later: converting
  // the pre-rounded total gives a different answer than summing conversions.
  const lines = [1, 1, 1];
  const rate = 1_500_000;
  const perLine = lines.map((l) => convertToNprMinor(l, rate)).reduce((a, b) => a + b, 0);
  const onTotal = convertToNprMinor(3, rate);
  assert.equal(perLine, 6);
  assert.equal(onTotal, 5);
  assert.notEqual(perLine, onTotal);
});

test('an NPR document is pinned to a rate of exactly 1', () => {
  assert.equal(rateForNewDocument('NPR'), FX_SCALE);
  assert.equal(rateForNewDocument('NPR', NPR_RATE_SCALED), FX_SCALE);
  assert.throws(() => rateForNewDocument('NPR', 1_600_000), ValidationError);
});

test('a foreign-currency document must record the rate it used', () => {
  assert.equal(rateForNewDocument('INR', 1_600_000), 1_600_000);
  assert.throws(() => rateForNewDocument('INR'), ValidationError);
  assert.throws(() => rateForNewDocument('USD'), ValidationError);
});

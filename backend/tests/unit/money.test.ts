import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMinor,
  assertPositiveQty,
  divideRoundHalfAwayFromZero,
  formatMinor,
  formatMinorGrouped,
  lineTotalMinor,
  parseMoneyToMinor,
  sumMinor,
  toSafeMinor,
} from '../../src/domain/money.ts';
import { ValidationError } from '../../src/domain/errors.ts';

test('D018: rounds half away from zero, in both directions', () => {
  // 2.5 -> 3, -2.5 -> -3. Symmetric, so a reversal cancels exactly.
  assert.equal(divideRoundHalfAwayFromZero(5n, 2n), 3n);
  assert.equal(divideRoundHalfAwayFromZero(-5n, 2n), -3n);
  assert.equal(divideRoundHalfAwayFromZero(7n, 2n), 4n);
  assert.equal(divideRoundHalfAwayFromZero(-7n, 2n), -4n);
});

test('D018: rounds to nearest when not an exact half', () => {
  assert.equal(divideRoundHalfAwayFromZero(4n, 3n), 1n); // 1.33
  assert.equal(divideRoundHalfAwayFromZero(5n, 3n), 2n); // 1.67
  assert.equal(divideRoundHalfAwayFromZero(-4n, 3n), -1n);
  assert.equal(divideRoundHalfAwayFromZero(-5n, 3n), -2n);
});

test('D018: exact division is untouched', () => {
  assert.equal(divideRoundHalfAwayFromZero(100n, 4n), 25n);
  assert.equal(divideRoundHalfAwayFromZero(0n, 7n), 0n);
});

test('division by zero is rejected, not silently infinite', () => {
  assert.throws(() => divideRoundHalfAwayFromZero(1n, 0n), ValidationError);
});

test('a float amount is rejected outright', () => {
  assert.throws(() => assertMinor(850.5), ValidationError);
  assert.throws(() => assertMinor(0.1 + 0.2), ValidationError);
  assert.throws(() => assertMinor(Number.NaN), ValidationError);
  assert.throws(() => assertMinor(Number.POSITIVE_INFINITY), ValidationError);
  assert.throws(() => assertMinor('85000' as unknown as number), ValidationError);
});

test('line total is exact integer arithmetic with no rounding', () => {
  assert.equal(lineTotalMinor(85000, 3), 255000); // 850.00 x 3 = 2550.00
  assert.equal(lineTotalMinor(1, 7), 7);
  assert.equal(lineTotalMinor(0, 5), 0);
});

test('line total rejects a zero or negative quantity', () => {
  assert.throws(() => lineTotalMinor(85000, 0), ValidationError);
  assert.throws(() => lineTotalMinor(85000, -1), ValidationError);
  assert.throws(() => lineTotalMinor(85000, 2.5), ValidationError);
});

test('quantities must be whole pieces', () => {
  assert.equal(assertPositiveQty(12), 12);
  assert.throws(() => assertPositiveQty(1.5), ValidationError);
  assert.throws(() => assertPositiveQty(0), ValidationError);
});

test('D018: a total is the sum of rounded lines and is never re-rounded', () => {
  // Three lines that each already rounded. Summing must not nudge the total.
  const lines = [33333, 33333, 33334];
  assert.equal(sumMinor(lines), 100000);
});

test('summing an empty document gives zero, not an error', () => {
  assert.equal(sumMinor([]), 0);
});

test('parses human money input without floating point', () => {
  assert.equal(parseMoneyToMinor('850'), 85000);
  assert.equal(parseMoneyToMinor('850.5'), 85050);
  assert.equal(parseMoneyToMinor('850.50'), 85050);
  assert.equal(parseMoneyToMinor('0.01'), 1);
  assert.equal(parseMoneyToMinor('0'), 0);
  assert.equal(parseMoneyToMinor('-850.50'), -85050);
  assert.equal(parseMoneyToMinor('  850.50  '), 85050);
  assert.equal(parseMoneyToMinor(850), 85000);
});

test('rejects money input that cannot be represented exactly', () => {
  // Three decimals is a typo, not something to guess about.
  assert.throws(() => parseMoneyToMinor('850.555'), ValidationError);
  assert.throws(() => parseMoneyToMinor('850.5.5'), ValidationError);
  assert.throws(() => parseMoneyToMinor('8 50'), ValidationError);
  assert.throws(() => parseMoneyToMinor('Rs 850'), ValidationError);
  assert.throws(() => parseMoneyToMinor(''), ValidationError);
  assert.throws(() => parseMoneyToMinor('1e3'), ValidationError);
  // A float literal has already lost precision before we see it.
  assert.throws(() => parseMoneyToMinor(850.5), ValidationError);
});

test('parse and format round-trip', () => {
  for (const text of ['0.00', '0.01', '9.99', '850.00', '850.50', '123456.78', '-42.05']) {
    assert.equal(formatMinor(parseMoneyToMinor(text)), text);
  }
});

test('formats minor units for display', () => {
  assert.equal(formatMinor(85000), '850.00');
  assert.equal(formatMinor(85050), '850.50');
  assert.equal(formatMinor(5), '0.05');
  assert.equal(formatMinor(0), '0.00');
  assert.equal(formatMinor(-85050), '-850.50');
});

test('groups thousands for the printed bill', () => {
  assert.equal(formatMinorGrouped(85000), '850.00');
  assert.equal(formatMinorGrouped(123456789), '1,234,567.89');
  assert.equal(formatMinorGrouped(-123456789), '-1,234,567.89');
  assert.equal(formatMinorGrouped(100000), '1,000.00');
});

test('D015: an amount beyond exact representation throws instead of losing precision', () => {
  assert.throws(() => toSafeMinor(BigInt(Number.MAX_SAFE_INTEGER) + 1n), RangeError);
  assert.equal(toSafeMinor(BigInt(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
  assert.throws(() => lineTotalMinor(Number.MAX_SAFE_INTEGER, 2), RangeError);
});

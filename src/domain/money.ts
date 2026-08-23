/**
 * Money. Integer minor units only (paisa / cents). See DECISIONS.md D007.
 *
 * There is exactly one rounding rule in this system (D018):
 *
 *   Round half away from zero, to the nearest minor unit, applied ONCE per
 *   line. A document total is the sum of already-rounded line amounts and is
 *   never re-rounded.
 *
 * Any other rounding anywhere in this codebase is a bug.
 *
 * Intermediate arithmetic uses BigInt, then converts back with a safe-integer
 * check. A JavaScript number silently loses precision above 2^53-1; throwing
 * is the correct failure mode for money (D015).
 */

import { ValidationError } from './errors.ts';

export const MINOR_UNITS_PER_MAJOR = 100;

/** Largest amount representable exactly as a JS number, in minor units. */
export const MAX_SAFE_MINOR = Number.MAX_SAFE_INTEGER;

export type Currency = 'NPR' | 'INR' | 'USD';

export const CURRENCIES: readonly Currency[] = ['NPR', 'INR', 'USD'];

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

export function assertCurrency(value: unknown, field = 'currency'): Currency {
  if (!isCurrency(value)) {
    throw new ValidationError(
      `${field} must be one of ${CURRENCIES.join(', ')}, got ${JSON.stringify(value)}`,
      field,
    );
  }
  return value;
}

/**
 * Guard every value entering money arithmetic. A float here is the exact
 * failure this system is built to prevent, so it is rejected loudly rather
 * than truncated.
 */
export function assertMinor(value: unknown, field = 'amount'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`${field} must be a finite number, got ${JSON.stringify(value)}`, field);
  }
  if (!Number.isInteger(value)) {
    throw new ValidationError(
      `${field} must be an integer number of minor units, got ${value}. ` +
        'Money is never fractional here — pass paisa, not rupees.',
      field,
    );
  }
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError(`${field} exceeds the safe integer range: ${value}`, field);
  }
  return value;
}

export function assertNonNegativeMinor(value: unknown, field = 'amount'): number {
  const n = assertMinor(value, field);
  if (n < 0) {
    throw new ValidationError(`${field} must not be negative, got ${n}`, field);
  }
  return n;
}

export function assertPositiveQty(value: unknown, field = 'qty'): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(`${field} must be a whole number of pieces, got ${JSON.stringify(value)}`, field);
  }
  if (value <= 0) {
    throw new ValidationError(`${field} must be greater than zero, got ${value}`, field);
  }
  return value;
}

/**
 * Divide, rounding half away from zero. The single rounding primitive.
 *
 * 2.5 -> 3 and -2.5 -> -3. Symmetric, so a credit and the debit that
 * reverses it round to the same magnitude and cannot leave a stray paisa
 * behind.
 */
export function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new ValidationError('division by zero in money arithmetic');
  }
  if (denominator < 0n) {
    return divideRoundHalfAwayFromZero(-numerator, -denominator);
  }
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = abs / denominator;
  const remainder = abs % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/** Convert a BigInt result back to a number, refusing to lose precision. */
export function toSafeMinor(value: bigint, context = 'amount'): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(
      `${context} is too large to represent exactly: ${value.toString()} minor units. ` +
        `The limit is ${Number.MAX_SAFE_INTEGER} minor units.`,
    );
  }
  return Number(value);
}

/**
 * qty x unit price. Both are integers, so the product is exact and no
 * rounding happens here at all.
 */
export function lineTotalMinor(unitPriceMinor: number, qty: number): number {
  assertNonNegativeMinor(unitPriceMinor, 'unitPriceMinor');
  assertPositiveQty(qty, 'qty');
  return toSafeMinor(BigInt(unitPriceMinor) * BigInt(qty), 'line total');
}

/**
 * Sum already-rounded amounts. Exact, and deliberately does not round:
 * re-rounding a total is the classic way to make a document disagree with
 * its own lines by a paisa.
 */
export function sumMinor(amounts: readonly number[]): number {
  let total = 0n;
  for (const amount of amounts) {
    total += BigInt(assertMinor(amount, 'amount'));
  }
  return toSafeMinor(total, 'total');
}

/**
 * Parse money typed by a human into minor units, without ever touching a
 * float. "850" -> 85000, "850.5" -> 85050, "850.50" -> 85050.
 *
 * More than two decimal places is rejected rather than rounded: if someone
 * types 850.555 that is a data-entry mistake, and guessing which way they
 * meant it to go is not our job.
 */
export function parseMoneyToMinor(input: string | number, field = 'amount'): number {
  if (typeof input === 'number') {
    // A number literal has already been through floating point, so only an
    // exact integer count of major units can be trusted.
    if (!Number.isInteger(input)) {
      throw new ValidationError(
        `${field} must be given as a string when it has decimals, to avoid floating point (got ${input})`,
        field,
      );
    }
    return toSafeMinor(BigInt(input) * BigInt(MINOR_UNITS_PER_MAJOR), field);
  }

  const text = input.trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) {
    throw new ValidationError(
      `${field} must look like 850 or 850.50 (at most two decimal places), got ${JSON.stringify(input)}`,
      field,
    );
  }
  const [, sign, whole, fraction = ''] = match;
  const paisa = fraction.padEnd(2, '0');
  const magnitude = BigInt(whole) * BigInt(MINOR_UNITS_PER_MAJOR) + BigInt(paisa);
  return toSafeMinor(sign === '-' ? -magnitude : magnitude, field);
}

/** Render minor units for display or printing: 85050 -> "850.50". */
export function formatMinor(amountMinor: number): string {
  assertMinor(amountMinor, 'amountMinor');
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const whole = Math.trunc(abs / MINOR_UNITS_PER_MAJOR);
  const fraction = abs % MINOR_UNITS_PER_MAJOR;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/** Render with thousands separators, for the printed bill. */
export function formatMinorGrouped(amountMinor: number): string {
  const plain = formatMinor(amountMinor);
  const negative = plain.startsWith('-');
  const [whole, fraction] = (negative ? plain.slice(1) : plain).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${fraction}`;
}

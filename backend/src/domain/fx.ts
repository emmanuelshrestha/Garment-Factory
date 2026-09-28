/**
 * Foreign exchange, for NPR reporting only.
 *
 * The rate NEVER produces a sale price (DECISIONS.md D011). If an Indian
 * customer negotiates ₹850, the order line stores 85000 minor units with
 * currency INR — full stop. The rate exists so the owner can see one NPR
 * total across mixed-currency documents.
 *
 * A rate is stored as an INTEGER equal to the real rate x 1,000,000, and is
 * captured on the document when the document is created. Reporting uses the
 * rate on the document, never today's rate, so a report run next year still
 * agrees with the invoice that was printed.
 */

import { divideRoundHalfAwayFromZero, toSafeMinor, type Currency } from './money.ts';
import { ValidationError } from './errors.ts';

/** Rates are stored scaled by this factor. */
export const FX_SCALE = 1_000_000;

/** NPR to NPR is exactly 1, so conversion is the identity. */
export const NPR_RATE_SCALED = FX_SCALE;

const MAX_DECIMALS = 6;

export function assertRateScaled(value: unknown, field = 'fxRateToNpr'): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ValidationError(
      `${field} must be an integer rate scaled by ${FX_SCALE}, got ${JSON.stringify(value)}`,
      field,
    );
  }
  if (value <= 0) {
    throw new ValidationError(`${field} must be greater than zero, got ${value}`, field);
  }
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError(`${field} exceeds the safe integer range: ${value}`, field);
  }
  return value;
}

/** "1.6" -> 1600000. Up to six decimal places, parsed without floating point. */
export function parseRateToScaled(input: string | number, field = 'fxRateToNpr'): number {
  const text = typeof input === 'number' ? String(input) : input.trim();
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) {
    throw new ValidationError(
      `${field} must look like 1.6 or 1.600000 (at most ${MAX_DECIMALS} decimal places), ` +
        `got ${JSON.stringify(input)}`,
      field,
    );
  }
  const [, whole, fraction = ''] = match;
  const scaled = BigInt(whole) * BigInt(FX_SCALE) + BigInt(fraction.padEnd(MAX_DECIMALS, '0'));
  if (scaled <= 0n) {
    throw new ValidationError(`${field} must be greater than zero, got ${text}`, field);
  }
  return toSafeMinor(scaled, field);
}

/** 1600000 -> "1.6" — trailing zeros trimmed, for display. */
export function formatRateScaled(rateScaled: number): string {
  assertRateScaled(rateScaled);
  const whole = Math.trunc(rateScaled / FX_SCALE);
  const fraction = String(rateScaled % FX_SCALE)
    .padStart(MAX_DECIMALS, '0')
    .replace(/0+$/, '');
  return fraction === '' ? String(whole) : `${whole}.${fraction}`;
}

/**
 * Convert a document amount into NPR minor units.
 *
 * Rounds half away from zero, once (D018). Callers must convert per line and
 * sum the results, not sum first and convert the total — otherwise the NPR
 * figures on a report will not add up to the NPR figures on its lines.
 */
export function convertToNprMinor(amountMinor: number, rateScaled: number): number {
  if (!Number.isInteger(amountMinor)) {
    throw new ValidationError(`amountMinor must be an integer, got ${amountMinor}`, 'amountMinor');
  }
  assertRateScaled(rateScaled);
  const product = BigInt(amountMinor) * BigInt(rateScaled);
  return toSafeMinor(divideRoundHalfAwayFromZero(product, BigInt(FX_SCALE)), 'NPR amount');
}

/**
 * The rate to record on a new document. NPR is pinned to exactly 1 so no
 * operator can mistype it, and every other currency must be supplied — there
 * is no default rate to fall back on and no rate lookup service.
 */
export function rateForNewDocument(currency: Currency, suppliedRateScaled?: number): number {
  if (currency === 'NPR') {
    if (suppliedRateScaled !== undefined && suppliedRateScaled !== NPR_RATE_SCALED) {
      throw new ValidationError(
        `NPR documents must use a rate of exactly 1 (${NPR_RATE_SCALED}), got ${suppliedRateScaled}`,
        'fxRateToNpr',
      );
    }
    return NPR_RATE_SCALED;
  }
  if (suppliedRateScaled === undefined) {
    throw new ValidationError(`a ${currency} document must record the NPR rate used`, 'fxRateToNpr');
  }
  return assertRateScaled(suppliedRateScaled);
}

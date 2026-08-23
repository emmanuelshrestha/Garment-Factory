/**
 * Dates. AD only — there is one calendar in this system (D020).
 *
 * Dates are stored as 'YYYY-MM-DD' text and timestamps as ISO-8601 UTC.
 * Text rather than a numeric epoch because it sorts correctly in SQL, reads
 * correctly in a database browser, and cannot be silently reinterpreted in
 * another timezone.
 */

import { ValidationError } from './errors.ts';

export const MS_PER_DAY = 86_400_000;

/** Parse 'YYYY-MM-DD' into a UTC timestamp, rejecting anything else. */
export function parseDate(iso: string, field = 'date'): number {
  if (typeof iso !== 'string') {
    throw new ValidationError(`${field} must be a date string as YYYY-MM-DD, got ${JSON.stringify(iso)}`, field);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new ValidationError(`${field} must be a date as YYYY-MM-DD, got ${JSON.stringify(iso)}`, field);
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  // Date.UTC happily rolls 2023-02-29 over into March, so the result is
  // compared back against the input rather than trusted.
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new ValidationError(`${field} is not a real calendar date: ${iso}`, field);
  }
  return ms;
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return [
    String(d.getUTCFullYear()).padStart(4, '0'),
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    String(d.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

/** Validate and normalise a date, returning the canonical 'YYYY-MM-DD'. */
export function assertDate(iso: string, field = 'date'): string {
  return formatDate(parseDate(iso, field));
}

export function addDays(iso: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new ValidationError(`days must be a whole number, got ${days}`, 'days');
  }
  return formatDate(parseDate(iso) + days * MS_PER_DAY);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDate(toIso, 'to') - parseDate(fromIso, 'from')) / MS_PER_DAY);
}

/**
 * The year a document number belongs to (D017, amended).
 *
 * The sequence resets on 1 January, so this is simply the calendar year of the
 * document's own date. Deriving it from the document date rather than from
 * "now" means backdating a document files it under the right year.
 */
export function documentYear(iso: string): number {
  return new Date(parseDate(iso, 'documentDate')).getUTCFullYear();
}

/** ISO-8601 UTC timestamp for *_at columns. */
export function nowTimestamp(): string {
  return new Date().toISOString();
}

/** Today's date in the factory's local timezone, as 'YYYY-MM-DD'. */
export function today(now: Date = new Date()): string {
  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** '23 Aug 2026' — for screens and the printed bill. */
const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function formatDateForDisplay(iso: string): string {
  const d = new Date(parseDate(iso));
  return `${d.getUTCDate()} ${MONTH_ABBREVIATIONS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

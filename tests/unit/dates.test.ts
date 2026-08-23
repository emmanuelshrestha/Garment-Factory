import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  assertDate,
  daysBetween,
  documentYear,
  formatDate,
  formatDateForDisplay,
  nowTimestamp,
  parseDate,
  today,
} from '../../src/domain/dates.ts';
import { ValidationError } from '../../src/domain/errors.ts';

test('parses a valid date and round-trips it', () => {
  assert.equal(assertDate('2026-08-23'), '2026-08-23');
  assert.equal(assertDate('2000-01-01'), '2000-01-01');
  assert.equal(assertDate('2024-02-29'), '2024-02-29'); // leap year
  assert.equal(formatDate(parseDate('2026-12-31')), '2026-12-31');
});

test('rejects a date that is not a real calendar date', () => {
  // Date.UTC would roll these over into the next month; we refuse instead.
  assert.throws(() => parseDate('2023-02-29'), ValidationError);
  assert.throws(() => parseDate('2026-13-01'), ValidationError);
  assert.throws(() => parseDate('2026-04-31'), ValidationError);
  assert.throws(() => parseDate('2026-00-10'), ValidationError);
  assert.throws(() => parseDate('2026-01-00'), ValidationError);
});

test('rejects anything that is not YYYY-MM-DD', () => {
  assert.throws(() => parseDate('23/08/2026'), ValidationError);
  assert.throws(() => parseDate('2026-8-3'), ValidationError);
  assert.throws(() => parseDate('2026-08-23T00:00:00Z'), ValidationError);
  assert.throws(() => parseDate(''), ValidationError);
  assert.throws(() => parseDate(20260823 as unknown as string), ValidationError);
  assert.throws(() => parseDate(null as unknown as string), ValidationError);
});

test('the field name travels with the error so the UI can point at the input', () => {
  try {
    parseDate('nonsense', 'deliveryDate');
    assert.fail('expected a ValidationError');
  } catch (error) {
    assert.ok(error instanceof ValidationError);
    assert.equal(error.field, 'deliveryDate');
  }
});

test('addDays crosses months, years and leap days', () => {
  assert.equal(addDays('2026-08-23', 1), '2026-08-24');
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(addDays('2026-08-23', 0), '2026-08-23');
  assert.equal(addDays('2026-08-23', 30), '2026-09-22');
});

test('addDays refuses a fractional number of days', () => {
  assert.throws(() => addDays('2026-08-23', 1.5), ValidationError);
});

test('daysBetween counts whole days and signs them', () => {
  assert.equal(daysBetween('2026-08-23', '2026-08-23'), 0);
  assert.equal(daysBetween('2026-08-23', '2026-09-22'), 30);
  assert.equal(daysBetween('2026-09-22', '2026-08-23'), -30);
  // Across a leap day, so a naive 365-day assumption would be wrong.
  assert.equal(daysBetween('2024-02-01', '2024-03-01'), 29);
  assert.equal(daysBetween('2023-02-01', '2023-03-01'), 28);
});

test('daysBetween is immune to daylight saving, because dates are UTC', () => {
  // Nepal has no DST, but the code must not depend on that.
  assert.equal(daysBetween('2026-03-01', '2026-04-01'), 31);
  assert.equal(daysBetween('2026-10-01', '2026-11-01'), 31);
});

test('D017: documentYear is the calendar year of the document date', () => {
  assert.equal(documentYear('2026-01-01'), 2026);
  assert.equal(documentYear('2026-12-31'), 2026);
  assert.equal(documentYear('2027-01-01'), 2027);
  assert.throws(() => documentYear('not-a-date'), ValidationError);
});

test('today returns a parseable date in the local timezone', () => {
  const fixed = new Date(2026, 7, 23, 23, 30); // 23 Aug 2026, late evening local
  assert.equal(today(fixed), '2026-08-23');
  // The real one must at least be a date this module accepts.
  assert.equal(assertDate(today()), today());
});

test('nowTimestamp is an ISO-8601 UTC timestamp', () => {
  const stamp = nowTimestamp();
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  // Its date part is a date this module accepts.
  assert.equal(assertDate(stamp.slice(0, 10)), stamp.slice(0, 10));
});

test('display format is unambiguous for a printed bill', () => {
  assert.equal(formatDateForDisplay('2026-08-23'), '23 Aug 2026');
  assert.equal(formatDateForDisplay('2026-01-05'), '5 Jan 2026');
  assert.equal(formatDateForDisplay('2026-12-31'), '31 Dec 2026');
});

test('dates sort correctly as plain text, which is why they are stored as text', () => {
  const unsorted = ['2026-12-31', '2025-01-01', '2026-01-05', '2026-08-23'];
  assert.deepEqual([...unsorted].sort(), ['2025-01-01', '2026-01-05', '2026-08-23', '2026-12-31']);
});

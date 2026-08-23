/**
 * Settings. Small key/value table, read through typed accessors so a bad value
 * in the database becomes an error at the point of reading rather than a
 * mysterious NaN somewhere downstream.
 */

import type { Tx } from '../db/sqlite.ts';
import { NotFoundError, ValidationError } from '../domain/errors.ts';
import { nowTimestamp } from '../domain/dates.ts';

export function getSetting(tx: Tx, key: string): string | null {
  const row = tx.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function requireSetting(tx: Tx, key: string): string {
  const value = getSetting(tx, key);
  if (value === null) {
    throw new NotFoundError('setting', key);
  }
  return value;
}

/** An integer setting, with a fallback used only when the row is absent. */
export function getIntSetting(tx: Tx, key: string, fallback: number): number {
  const raw = getSetting(tx, key);
  if (raw === null) {
    return fallback;
  }
  if (!/^-?\d+$/.test(raw.trim())) {
    throw new ValidationError(`setting ${key} must be a whole number, found ${JSON.stringify(raw)}`, key);
  }
  return Number(raw.trim());
}

export function setSetting(tx: Tx, key: string, value: string): void {
  tx.db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, nowTimestamp());
}

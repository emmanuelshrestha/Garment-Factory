/**
 * Shared seed helpers. Used by `scripts/seed.ts` (single factory) and
 * `scripts/create-tenant.ts` (one owner per factory database).
 */

import { randomBytes, scryptSync } from 'node:crypto';
import type { Tx } from '../src/db/sqlite.ts';
import { nowTimestamp } from '../src/domain/dates.ts';

export const OWNER_USERNAME = 'owner';

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  return { hash: scryptSync(password, salt, 64).toString('hex'), salt };
}

export function ensureOwner(
  tx: Tx,
  options: { username?: string; displayName?: string; password: string } = {
    password: process.env.GARMENT_OWNER_PASSWORD ?? 'change-me',
  },
): { userId: number; created: boolean } {
  const username = options.username ?? OWNER_USERNAME;
  const existing = tx.db.prepare('SELECT id FROM users WHERE username = ?').get(username) as
    | { id: number }
    | undefined;
  if (existing) {
    return { userId: Number(existing.id), created: false };
  }

  const { hash, salt } = hashPassword(options.password);
  const info = tx.db
    .prepare(
      `INSERT INTO users (username, password_hash, password_salt, display_name, role, created_at)
       VALUES (?, ?, ?, ?, 'owner', ?)`,
    )
    .run(username, hash, salt, options.displayName ?? 'Owner', nowTimestamp());
  return { userId: Number(info.lastInsertRowid), created: true };
}

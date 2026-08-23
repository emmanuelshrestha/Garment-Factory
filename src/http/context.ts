/**
 * What a request handler needs to do its job: a database, and who is acting.
 *
 * Authentication is not built yet — the factory has one user, the owner, and
 * the system runs on the factory LAN. `currentUserId` is resolved once at
 * startup so that every `created_by` column is still populated correctly and
 * real logins can be added later without touching a single route.
 */

import type { Db } from '../db/sqlite.ts';
import { readOnly } from '../db/sqlite.ts';

export type AppContext = {
  db: Db;
  currentUserId: number;
};

/** The owner account. Created by the migrations or the seed script. */
export function resolveOwnerUserId(db: Db): number {
  const row = readOnly(db, (tx) =>
    tx.db.prepare("SELECT id FROM users WHERE role = 'owner' ORDER BY id LIMIT 1").get(),
  ) as { id: number } | undefined;
  if (!row) {
    throw new Error(
      'no owner user exists yet. Run `npm run seed` to create the owner account before starting the server.',
    );
  }
  return Number(row.id);
}

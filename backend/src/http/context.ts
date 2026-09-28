/**
 * What a request handler needs to do its job: a database, and who is acting.
 *
 * Provides functions to resolve the acting user from request session cookies,
 * falling back to the configured owner account when running without auth.
 */

import type { IncomingMessage } from 'node:http';
import type { Db } from '../db/sqlite.ts';
import { readOnly } from '../db/sqlite.ts';
import { getSessionUser, type UserView } from '../services/auth.ts';

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

/** Parse raw cookie header string into a key-value dictionary. */
export function parseCookies(req: { headers: { cookie?: string } }): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0]!.trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

/** Look up the currently authenticated user from the garment_session cookie. */
export function getRequestSessionUser(app: AppContext, req: IncomingMessage): UserView | null {
  const cookies = parseCookies(req);
  const sessionId = cookies['garment_session'];
  if (!sessionId) {
    return null;
  }
  return readOnly(app.db, (tx) => getSessionUser(tx, sessionId));
}

/**
 * Resolve the user ID for an operation:
 * returns the authenticated user ID if a valid session exists,
 * or falls back to app.currentUserId (e.g. during test runs).
 */
export function getRequestUserId(app: AppContext, req: IncomingMessage): number {
  const user = getRequestSessionUser(app, req);
  if (user) {
    return user.id;
  }
  return app.currentUserId;
}

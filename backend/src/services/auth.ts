/**
 * Authentication service.
 * Manages user logins, session tokens, and password verification using Node.js crypto.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Db, Tx } from '../db/sqlite.ts';
import { ValidationError, BusinessRuleError, NotFoundError } from '../domain/errors.ts';
import { nowTimestamp } from '../domain/dates.ts';

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const candidate = scryptSync(password, salt, 64);
    const stored = Buffer.from(hash, 'hex');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

export type UserView = {
  id: number;
  username: string;
  displayName: string;
  role: 'owner' | 'staff';
  isActive: boolean;
};

export function loginUser(
  tx: Tx,
  username: string,
  password: string,
  ttlHours = 12
): { sessionId: string; user: UserView } {
  const user = tx.db
    .prepare(
      'SELECT id, username, password_hash, password_salt, display_name, role, is_active FROM users WHERE username = ?'
    ).get(username) as {
      id: number;
      username: string;
      password_hash: string;
      password_salt: string;
      display_name: string;
      role: 'owner' | 'staff';
      is_active: number;
    } | undefined;

  if (!user || !user.is_active) {
    raiseInvalidCredentials();
  }

  const valid = verifyPassword(password, user.password_hash, user.password_salt);
  if (!valid) {
    raiseInvalidCredentials();
  }

  const sessionId = randomBytes(32).toString('hex');
  const createdAt = nowTimestamp();
  const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

  tx.db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, user.id, createdAt, expiresAt);

  return {
    sessionId,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      isActive: Boolean(user.is_active),
    },
  };
}

export function logoutUser(tx: Tx, sessionId: string): void {
  tx.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function getSessionUser(tx: Tx, sessionId: string): UserView | null {
  const row = tx.db.prepare(
    `SELECT u.id, u.username, u.display_name, u.role, u.is_active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`
  ).get(sessionId, nowTimestamp()) as {
    id: number;
    username: string;
    display_name: string;
    role: 'owner' | 'staff';
    is_active: number;
  } | undefined;

  if (!row || !row.is_active) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    isActive: Boolean(row.is_active),
  };
}

function raiseInvalidCredentials(): never {
  throw new BusinessRuleError('invalid_credentials', 'Invalid username or password');
}

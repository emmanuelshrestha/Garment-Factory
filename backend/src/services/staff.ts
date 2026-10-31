import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Db, Tx } from '../db/sqlite.ts';
import { BusinessRuleError, NotFoundError } from '../domain/errors.ts';
import { nowTimestamp } from '../domain/dates.ts';

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  try {
    const candidate = scryptSync(pin, salt, 64);
    const stored = Buffer.from(hash, 'hex');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

export type StaffUserView = { id: number; name: string; role: 'owner' | 'staff' };

export function authenticateStaff(tx: Tx, pin: string, ttlHours = 12) {
  const staffUsers = tx.db.prepare('SELECT id, name, pin_hash, role, active FROM staff_users WHERE active = 1').all() as any[];
  
  for (const staff of staffUsers) {
    const [hash, salt] = staff.pin_hash.split(':');
    if (verifyPin(pin, hash, salt)) {
      const sessionId = randomBytes(32).toString('hex');
      const createdAt = nowTimestamp();
      const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
      
      tx.db.prepare(
        'INSERT INTO staff_sessions (id, staff_user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
      ).run(sessionId, staff.id, createdAt, expiresAt);
      
      return { sessionId, staff: { id: staff.id, name: staff.name, role: staff.role } };
    }
  }
  throw new BusinessRuleError('invalid_pin', 'Invalid PIN');
}

export function getStaffSessionUser(tx: Tx, sessionId: string): StaffUserView | null {
  const row = tx.db.prepare(`
    SELECT u.id, u.name, u.role
    FROM staff_sessions s
    JOIN staff_users u ON u.id = s.staff_user_id
    WHERE s.id = ? AND s.expires_at > ?`
  ).get(sessionId, nowTimestamp()) as StaffUserView | undefined;
  
  return row || null;
}

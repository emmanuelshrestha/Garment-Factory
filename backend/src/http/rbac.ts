/**
 * Role-based access control.
 *
 * Floor staff may touch the physical side of the business — bags, cutting,
 * stock, deliveries — but never money. The guard lives here rather than in
 * each handler so a new financial route has one obvious place to declare
 * itself, and so the test suite can prove the lock in one pass.
 */

import type { AppContext } from './context.ts';
import { BusinessRuleError } from '../domain/errors.ts';

/**
 * Financial and management-only route families. A request whose path starts
 * with any of these prefixes is owner territory.
 */
export const OWNER_ONLY_PREFIXES: readonly string[] = [
  '/api/invoices',
  '/api/billable',
  '/api/payments',
  '/api/expenses',
  '/api/purchases',
  '/api/earnings',
  '/api/employees',
  '/api/dashboard',
  '/api/staff/users',
];

export function isOwnerOnlyPath(pathname: string): boolean {
  return OWNER_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  );
}

/**
 * Refuse the request when the actor is a staff member and the route is
 * financial. An unknown role (unit tests, no-auth development mode) is
 * treated as the owner, matching how `currentUserId` already falls back.
 */
export function requireOwner(ctx: AppContext, pathname: string): void {
  if (ctx.role === 'staff' && isOwnerOnlyPath(pathname)) {
    throw new BusinessRuleError(
      'staff_forbidden',
      'This section is for owners only.',
    );
  }
}

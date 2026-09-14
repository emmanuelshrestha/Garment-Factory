/**
 * Tenant identity rules that need no database.
 *
 * A factory is identified by a slug that becomes the subdomain:
 * `acme.yourapp.com` → slug `acme`. Slugs are lowercase, stable, and
 * never guessed from a request header — the Host name is the only input.
 */

import { ValidationError } from './errors.ts';

export const RESERVED_TENANT_SLUGS = [
  'www',
  'api',
  'admin',
  'app',
  'control',
  'mail',
  'ftp',
  'localhost',
  'static',
  'assets',
  'cdn',
  'status',
  'health',
  'staging',
  'prod',
  'production',
] as const;

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

export function isReservedTenantSlug(slug: string): boolean {
  return (RESERVED_TENANT_SLUGS as readonly string[]).includes(slug);
}

/**
 * A factory slug is 2–32 characters, lowercase letters/digits/hyphens,
 * and must start and end with a letter or digit. Reserved names that
 * would collide with platform hosts are refused.
 */
export function assertTenantSlug(value: unknown, field = 'slug'): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string, got ${JSON.stringify(value)}`, field);
  }
  const slug = value.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError(
      `${field} must be 2–32 characters of lowercase letters, digits, or hyphens, and must start and end with a letter or digit`,
      field,
    );
  }
  if (isReservedTenantSlug(slug)) {
    throw new ValidationError(`${field} '${slug}' is reserved for the platform`, field);
  }
  return slug;
}

/**
 * Pull the factory slug out of a Host header.
 *
 * Returns null when:
 * - multi-tenant is off (`baseDomain` empty) — the process has one database
 * - the host is the apex or `www`
 * - the host is not under the base domain
 * - the host has extra nested labels (`foo.bar.base` is refused)
 *
 * The slug is not validated here. An unknown or illegal slug is a 404 at
 * the HTTP layer, not a 400, so scanners cannot enumerate factories.
 */
export function tenantSlugFromHost(hostHeader: string | undefined, baseDomain: string): string | null {
  if (typeof baseDomain !== 'string' || baseDomain.trim().length === 0) {
    return null;
  }
  if (typeof hostHeader !== 'string' || hostHeader.trim().length === 0) {
    return null;
  }

  const host = stripPort(hostHeader.trim().toLowerCase());
  const base = stripPort(baseDomain.trim().toLowerCase());
  if (host.length === 0 || base.length === 0) {
    return null;
  }
  if (host === base || host === `www.${base}`) {
    return null;
  }
  const suffix = `.${base}`;
  if (!host.endsWith(suffix)) {
    return null;
  }
  const slug = host.slice(0, -suffix.length);
  if (slug.length === 0 || slug.includes('.')) {
    return null;
  }
  return slug;
}

function stripPort(host: string): string {
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(1, end);
  }
  const colon = host.lastIndexOf(':');
  if (colon > -1 && host.indexOf(':') === colon) {
    return host.slice(0, colon);
  }
  return host;
}

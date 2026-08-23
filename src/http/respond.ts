/**
 * HTTP plumbing: reading a JSON body, writing a JSON reply, and turning a
 * domain error into the right status code.
 *
 * There is no business logic in this file or anywhere else under `http/`.
 * Every route hands off to a service. The one job of this layer is to be a
 * faithful, boring translator between JSON and the services.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { BusinessRuleError, NotFoundError, ValidationError } from '../domain/errors.ts';

/** A request body larger than this is a mistake or an attack, not an order. */
export const MAX_BODY_BYTES = 1_000_000;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body, jsonSafe);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    // This is a single-user LAN application; nothing here should be cached.
    'cache-control': 'no-store',
  });
  res.end(text);
}

export function sendText(res: ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

/**
 * Map an error to a status code by its type.
 *
 * The distinction is the whole point: 400 means the caller sent nonsense, 409
 * means the request was well-formed but a business rule forbids it, and 500
 * means we have a bug. Collapsing them would make a real defect look like a
 * typo in a quantity box.
 *
 * A 500 never leaks the internal message to the client, but it is always
 * logged in full — hiding our own failures from ourselves is worse than
 * showing them to the owner.
 */
export function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof ValidationError) {
    sendJson(res, 400, {
      error: 'validation_error',
      message: error.message,
      field: error.field ?? null,
    });
    return;
  }
  if (error instanceof BusinessRuleError) {
    sendJson(res, 409, {
      error: error.rule,
      message: error.message,
      detail: error.detail ?? null,
    });
    return;
  }
  if (error instanceof NotFoundError) {
    sendJson(res, 404, { error: 'not_found', message: error.message });
    return;
  }
  if (error instanceof RangeError) {
    // Money or quantity outside the representable range. The caller's input
    // caused it, so it is a 400, but it is worth logging as well.
    console.error('[range]', error);
    sendJson(res, 400, { error: 'out_of_range', message: error.message });
    return;
  }

  console.error('[unhandled]', error);
  sendJson(res, 500, {
    error: 'internal_error',
    message: 'Something went wrong on the server. The details are in the server log.',
  });
}

/** Read and parse a JSON request body, refusing anything oversized or malformed. */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  let overflowed = false;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;

    if (overflowed) {
      // Keep reading, but discard. If the client is not merely mistaken but
      // flooding us, cut the connection instead of draining forever.
      if (size > MAX_BODY_BYTES * 8) {
        req.destroy();
        break;
      }
      continue;
    }

    if (size > MAX_BODY_BYTES) {
      // Refuse, but drain the rest of the upload before replying. Throwing
      // here and leaving the request unread would deadlock: the client would
      // still be writing while nothing was reading, and it would never see
      // the refusal.
      overflowed = true;
      chunks.length = 0;
      continue;
    }

    chunks.push(buffer);
  }

  if (overflowed) {
    throw new ValidationError(`request body exceeds ${MAX_BODY_BYTES} bytes`, 'body');
  }

  if (size === 0) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('request body is not valid JSON', 'body');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ValidationError('request body must be a JSON object', 'body');
  }
  return parsed as Record<string, unknown>;
}

/* ------------------------------------------------------- input coercion */

/**
 * Query strings and JSON both arrive untyped. These helpers refuse rather than
 * coerce: `Number('')` is 0 and `Number('abc')` is NaN, and either one
 * silently entering a quantity or a price would be a real problem.
 */

export function requireInt(value: unknown, field: string): number {
  const parsed = optionalInt(value, field);
  if (parsed === undefined) {
    throw new ValidationError(`${field} is required`, field);
  }
  return parsed;
}

export function optionalInt(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new ValidationError(`${field} must be a whole number, got ${value}`, field);
    }
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  throw new ValidationError(`${field} must be a whole number, got ${JSON.stringify(value)}`, field);
}

export function requireString(value: unknown, field: string): string {
  const parsed = optionalString(value, field);
  if (parsed === undefined) {
    throw new ValidationError(`${field} is required`, field);
  }
  return parsed;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be text, got ${JSON.stringify(value)}`, field);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  throw new ValidationError(`${field} must be true or false, got ${JSON.stringify(value)}`, field);
}

export function requireArray(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty array`, field);
  }
  return value.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ValidationError(`${field}[${index}] must be an object`, field);
    }
    return item as Record<string, unknown>;
  });
}

/**
 * BigInt cannot be serialised by JSON.stringify, and `node:sqlite` can hand
 * back integers as BigInt. Converting here rather than at a thousand call
 * sites stops a stray BigInt turning a working endpoint into a 500.
 */
function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value;
}

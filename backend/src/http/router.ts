/**
 * A router small enough to read in one sitting.
 *
 * Patterns look like `/api/orders/:id/confirm`. A `:name` segment captures one
 * path segment; nothing else is special. No regular expressions built from
 * user input, no wildcards, no middleware stack — this application has about
 * thirty endpoints and does not need a framework.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sendError, sendJson } from './respond.ts';

export type RouteContext = {
  req: IncomingMessage;
  res: ServerResponse;
  /** Captured `:name` path segments, already URL-decoded. */
  params: Record<string, string>;
  /** Parsed query string. Repeated keys keep the first value. */
  query: Record<string, string>;
};

export type Handler = (ctx: RouteContext) => Promise<void> | void;

export type Route = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** e.g. `/api/orders/:id/confirm` */
  pattern: string;
  handler: Handler;
};

type CompiledRoute = Route & { segments: string[] };

export class Router {
  private readonly routes: CompiledRoute[] = [];

  add(route: Route): this {
    this.routes.push({ ...route, segments: splitPath(route.pattern) });
    return this;
  }

  addAll(routes: readonly Route[]): this {
    for (const route of routes) {
      this.add(route);
    }
    return this;
  }

  /**
   * Dispatch one request.
   *
   * Returns false when no route matched, so the caller can fall through to
   * static files rather than the router deciding what a 404 looks like.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathSegments = splitPath(url.pathname);
    const query: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
      if (!(key in query)) {
        query[key] = value;
      }
    }

    let pathMatchedSomeRoute = false;

    for (const route of this.routes) {
      const params = matchSegments(route.segments, pathSegments);
      if (params === null) {
        continue;
      }
      pathMatchedSomeRoute = true;
      if (route.method !== req.method) {
        continue;
      }
      try {
        await route.handler({ req, res, params, query });
      } catch (error) {
        if (res.headersSent) {
          // A handler that already replied and then threw has a bug worth
          // seeing; the socket must still be closed.
          console.error('[after-reply]', error);
          res.end();
        } else {
          sendError(res, error);
        }
      }
      return true;
    }

    if (pathMatchedSomeRoute) {
      // The path exists but not for this verb. Saying so is more useful than
      // a 404 that suggests the endpoint does not exist at all.
      sendJson(res, 405, {
        error: 'method_not_allowed',
        message: `${req.method} is not allowed on ${url.pathname}`,
      });
      return true;
    }

    return false;
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const expected = pattern[i]!;
    const got = actual[i]!;
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = safeDecode(got);
      continue;
    }
    if (expected !== got) {
      return null;
    }
  }
  return params;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    // A malformed escape sequence is not worth a 500; the value simply will
    // not match anything downstream.
    return segment;
  }
}

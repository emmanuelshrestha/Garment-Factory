/**
 * The HTTP server: routes first, then the static console, then a 404.
 *
 * `createApiServer` takes an already-open database so tests can point it at a
 * temporary file and close it cleanly. Nothing in this file knows a business
 * rule.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import type { AppContext } from './context.ts';
import { Router } from './router.ts';
import { sendError, sendJson, sendText } from './respond.ts';
import { catalogueRoutes } from './routes/catalogue.ts';
import { customerRoutes } from './routes/customers.ts';
import { orderRoutes } from './routes/orders.ts';
import { stockRoutes } from './routes/stock.ts';

export type ServerOptions = {
  /** Directory holding the interim console. Omit to serve the API only. */
  staticDir?: string;
};

export function buildRouter(app: AppContext): Router {
  return new Router()
    .add({
      method: 'GET',
      pattern: '/api/health',
      handler: ({ res }) => sendJson(res, 200, { ok: true, time: new Date().toISOString() }),
    })
    .addAll(catalogueRoutes(app))
    .addAll(customerRoutes(app))
    .addAll(orderRoutes(app))
    .addAll(stockRoutes(app));
}

export function createApiServer(app: AppContext, options: ServerOptions = {}): Server {
  const router = buildRouter(app);

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (await router.handle(req, res)) {
        return;
      }
      if (options.staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
        if (await serveStatic(options.staticDir, req, res)) {
          return;
        }
      }
      sendJson(res, 404, {
        error: 'not_found',
        message: `no route for ${req.method} ${req.url}`,
      });
    } catch (error) {
      // The router already converts handler failures; reaching here means the
      // plumbing itself failed, which is always worth logging.
      if (res.headersSent) {
        console.error('[after-reply]', error);
        res.end();
        return;
      }
      sendError(res, error);
    }
  });
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * Serve one text file from `root`.
 *
 * The path is normalised and then checked to still be inside `root`, so
 * `/../../etc/passwd` cannot escape. Only the extensions above are served.
 */
async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  const relative = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(
    /^([/\\])+/,
    '',
  );
  const target = join(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    return false;
  }
  const extension = relative.slice(relative.lastIndexOf('.'));
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return false;
  }

  let body: string;
  try {
    body = await readFile(target, 'utf8');
  } catch {
    return false;
  }
  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-type': contentType, 'content-length': Buffer.byteLength(body) });
    res.end();
    return true;
  }
  sendText(res, 200, body, contentType);
  return true;
}

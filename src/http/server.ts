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
import { readOnly } from '../db/sqlite.ts';
import { parseCookies } from './routes/auth.ts';
import { getSessionUser } from '../services/auth.ts';
import { getTenantDb } from '../db/tenantManager.ts';
import { catalogueRoutes } from './routes/catalogue.ts';
import { customerRoutes } from './routes/customers.ts';
import { dashboardRoutes } from './routes/dashboard.ts';
import { deliveryRoutes } from './routes/deliveries.ts';
import { expenseRoutes } from './routes/expenses.ts';
import { invoiceRoutes } from './routes/invoices.ts';
import { orderRoutes } from './routes/orders.ts';
import { paymentRoutes } from './routes/payments.ts';
import { purchaseRoutes } from './routes/purchases.ts';
import { stockRoutes } from './routes/stock.ts';
import { cuttingStockRoutes } from './routes/cuttingStock.ts';
import { employeeRoutes } from './routes/employees.ts';
import { authRoutes } from './routes/auth.ts';

export type ServerOptions = {
  /** Directory holding the interim console or compiled React app. Omit to serve the API only. */
  staticDir?: string;
  /** Whether to enforce authentication on all non-public API routes. */
  requireAuth?: boolean;
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
    .addAll(dashboardRoutes(app))
    .addAll(deliveryRoutes(app))
    .addAll(expenseRoutes(app))
    .addAll(invoiceRoutes(app))
    .addAll(orderRoutes(app))
    .addAll(paymentRoutes(app))
    .addAll(purchaseRoutes(app))
    .addAll(stockRoutes(app))
    .addAll(cuttingStockRoutes(app))
    .addAll(employeeRoutes(app))
    .addAll(authRoutes(app));
}

export function createApiServer(app: AppContext, options: ServerOptions = {}): Server {
  const requireAuth =
    options.requireAuth ??
    (process.env.GARMENT_REQUIRE_AUTH === '1' || process.env.NODE_ENV === 'production');

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const pathname = url.pathname;
      const isPublicApi = pathname === '/api/health' || pathname.startsWith('/api/auth/');

      const tenantHeader = req.headers['x-tenant-slug'] ?? req.headers['x-tenant'];
      let tenantDb = app.db;
      if (typeof tenantHeader === 'string' && tenantHeader.trim().length > 0) {
        try {
          tenantDb = getTenantDb(tenantHeader.trim());
        } catch {
          sendJson(res, 404, {
            error: 'tenant_not_found',
            message: `Tenant '${tenantHeader.trim()}' was not found or is inactive.`,
          });
          return;
        }
      }

      let requestApp: AppContext = { db: tenantDb, currentUserId: app.currentUserId };
      if (pathname.startsWith('/api/') && !isPublicApi) {
        const cookies = parseCookies(req);
        const sessionId = cookies['garment_session'];
        const user = sessionId ? readOnly(tenantDb, (tx) => getSessionUser(tx, sessionId)) : null;

        if (requireAuth && !user) {
          sendJson(res, 401, {
            error: 'unauthenticated',
            message: 'Authentication required. Please log in.',
          });
          return;
        }

        if (user) {
          requestApp = { db: tenantDb, currentUserId: user.id };
        }
      }

      const router = buildRouter(requestApp);

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
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * Serve static files from `root`.
 *
 * Checks paths to stay inside `root`. For browser client-side routing,
 * non-API GET requests without file extensions fall back to `index.html`.
 */
async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  let relative = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(
    /^([/\\])+/,
    '',
  );
  let target = join(root, relative);
  if (target !== root && !target.startsWith(root + sep)) {
    return false;
  }

  let extension = relative.includes('.') ? relative.slice(relative.lastIndexOf('.')) : '';
  let contentType = CONTENT_TYPES[extension];

  // If not found and looks like a client-side navigation (no extension), fall back to index.html
  if (!contentType && !relative.includes('.')) {
    relative = 'index.html';
    target = join(root, 'index.html');
    contentType = CONTENT_TYPES['.html'];
  }

  if (!contentType) {
    return false;
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(target);
  } catch {
    // If the specific asset was not found, check if it was an SPA navigation
    if (relative !== 'index.html' && req.headers.accept?.includes('text/html')) {
      try {
        buffer = await readFile(join(root, 'index.html'));
        contentType = CONTENT_TYPES['.html'];
      } catch {
        return false;
      }
    } else {
      return false;
    }
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, { 'content-type': contentType, 'content-length': buffer.length });
    res.end();
    return true;
  }

  res.writeHead(200, { 'content-type': contentType, 'content-length': buffer.length });
  res.end(buffer);
  return true;
}

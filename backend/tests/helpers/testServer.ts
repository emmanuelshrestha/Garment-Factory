import type { AddressInfo } from 'node:net';
import { createApiServer, type ServerOptions } from '../../src/http/server.ts';
import { createTestDb, type TestDb } from './testDb.ts';

/**
 * A real HTTP server on an ephemeral port, over a real temporary database.
 *
 * The point of an HTTP test here is to prove the edge: status codes, JSON
 * shapes and refusals. The business rules themselves are already covered
 * against the services, so these tests stay deliberately few.
 */
export type TestServer = {
  db: TestDb;
  baseUrl: string;
  request: (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;
  cleanup: () => Promise<void>;
};

export async function startTestServer(options: ServerOptions = {}): Promise<TestServer> {
  const db = createTestDb();
  const server = createApiServer({ db: db.db, currentUserId: db.userId }, options);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    db,
    baseUrl,
    async request(method, path, body) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text.length === 0 ? null : JSON.parse(text),
      };
    },
    async cleanup() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.cleanup();
    },
  };
}

/** Raw request for cases where the body must not be valid JSON. */
export async function postRaw(
  baseUrl: string,
  path: string,
  body: string,
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? null : JSON.parse(text) };
}

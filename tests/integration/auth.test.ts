import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../helpers/testServer.ts';
import { transaction } from '../../src/db/sqlite.ts';
import { hashPassword } from '../../src/services/auth.ts';
import { nowTimestamp } from '../../src/domain/dates.ts';

describe('Authentication integration', () => {
  it('allows user login, session check, and logout', async () => {
    const server = await startTestServer();
    try {
      transaction(server.db.db, (tx) => {
        const { hash, salt } = hashPassword('secret123');
        tx.db.prepare(
          `INSERT INTO users (username, password_hash, password_salt, display_name, role, created_at)
           VALUES ('manager', ?, ?, 'Manager', 'staff', ?)`
        ).run(hash, salt, nowTimestamp());
      });

      const badLogin = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'manager', password: 'wrong' }),
      });
      assert.strictEqual(badLogin.status, 409);

      const loginRes = await fetch(`${server.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'manager', password: 'secret123' }),
      });
      assert.strictEqual(loginRes.status, 200);
      const loginBody = await loginRes.json() as any;
      assert.strictEqual(loginBody.user.username, 'manager');
      assert.strictEqual(loginBody.user.role, 'staff');

      const cookieHeader = loginRes.headers.get('set-cookie');
      assert.ok(cookieHeader);

      const meRes = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie: cookieHeader! },
      });
      assert.strictEqual(meRes.status, 200);
      const meBody = await meRes.json() as any;
      assert.strictEqual(meBody.user.username, 'manager');

      const logoutRes = await fetch(`${server.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie: cookieHeader! },
      });
      assert.strictEqual(logoutRes.status, 200);

      const meAfterRes = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie: cookieHeader! },
      });
      assert.strictEqual(meAfterRes.status, 200);
      const meAfterBody = await meAfterRes.json() as any;
      assert.strictEqual(meAfterBody.user, null);

    } finally {
      await server.cleanup();
    }
  });
});

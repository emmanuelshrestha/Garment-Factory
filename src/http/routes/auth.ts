/**
 * Auth HTTP routes: login, logout, get current user session.
 */

import { readOnly, transaction } from '../../db/sqlite.ts';
import { loginUser, logoutUser, getSessionUser } from '../../services/auth.ts';
import type { User } from '../../domain/user.ts';
import { config } from '../../config.ts';
import type { Route } from '../router.ts';
import { readJsonBody, requireString, sendJson } from '../respond.ts';

export function parseCookies(req: { headers: { cookie?: string } }): Record<string, string> {
  const list: Record<string, string> = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0]!.trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

export function authRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'POST',
      pattern: '/api/auth/login',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const username = requireString(body.username, 'username');
        const password = requireString(body.password, 'password');

        const { sessionId, user } = transaction(app.db, (tx) => {
          return loginUser(tx, username, password);
        });

        res.setHeader(
          'Set-Cookie',
          `garment_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}${config.baseDomain ? `; Domain=.${config.baseDomain}` : ''}`
        );
        sendJson(res, 200, { user });
      },
    },
    {
      method: 'POST',
      pattern: '/api/auth/logout',
      handler: async ({ req, res }) => {
        const cookies = parseCookies(req);
        const sessionId = cookies['garment_session'];
        if (sessionId) {
          transaction(app.db, (tx) => {
            logoutUser(tx, sessionId);
          });
        }
        res.setHeader(
          'Set-Cookie',
          `garment_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.baseDomain ? `; Domain=.${config.baseDomain}` : ''}`
        );
        sendJson(res, 200, { ok: true });
      },
    },
    {
      method: 'GET',
      pattern: '/api/auth/me',
      handler: ({ req, res }) => {
        const cookies = parseCookies(req);
        const sessionId = cookies['garment_session'];
        const user = sessionId
          ? readOnly(app.db, (tx) => getSessionUser(tx, sessionId))
          : null;
        sendJson(res, 200, { user });
      },
    },
  ];
}

import type { Route } from '../router.ts';
import { sendJson } from '../respond.ts';
import { transaction } from '../../db/sqlite.ts';
import { authenticateStaff } from '../../services/staff.ts';
import { readJsonBody } from '../respond.ts';

export function staffRoutes(app: any): Route[] {
  return [
    {
      method: 'POST',
      pattern: '/api/staff/login',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const pin = body.pin as string;
        const result = transaction(app.db, (tx) => authenticateStaff(tx, pin));
        res.setHeader('Set-Cookie', `staff_session=${result.sessionId}; HttpOnly; SameSite=Lax; Path=/`);
        sendJson(res, 200, result.staff);
      }
    }
  ];
}

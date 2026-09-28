import { readOnly } from '../../db/sqlite.ts';
import { getDashboardSummary } from '../../services/dashboard.ts';
import type { AppContext } from '../context.ts';
import { sendJson } from '../respond.ts';
import type { Route } from '../router.ts';

export function dashboardRoutes(app: AppContext): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/api/dashboard',
      handler: ({ res }) => {
        const summary = readOnly(app.db, (tx) => getDashboardSummary(tx));
        sendJson(res, 200, { dashboard: summary });
      },
    },
  ];
}

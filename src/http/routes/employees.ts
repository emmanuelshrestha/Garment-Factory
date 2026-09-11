import { readOnly, transaction } from '../../db/sqlite.ts';
import {
  listEmployees,
  createEmployee,
  toggleEmployeeActive,
} from '../../services/employees.ts';
import {
  recordEarnings,
  getMonthlySummary,
  getEmployeeYearlyHistory,
} from '../../services/employeeEarnings.ts';
import type { AppContext } from '../context.ts';
import type { Route } from '../router.ts';
import {
  readJsonBody,
  requireInt,
  requireString,
  optionalString,
  optionalInt,
  sendJson,
} from '../respond.ts';

const NEPALI_MONTH_NAMES = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

function resolveMonthName(input: string | number): string {
  if (typeof input === 'number' || /^\d+$/.test(String(input))) {
    const idx = parseInt(String(input), 10) - 1;
    return NEPALI_MONTH_NAMES[idx] || 'Baisakh';
  }
  return String(input);
}

export function employeeRoutes(app: AppContext): Route[] {
  return [
    // ── Employees ──────────────────────────────────────────────────────────
    {
      method: 'GET',
      pattern: '/api/employees',
      handler: ({ res, query }) => {
        const activeOnly = query.activeOnly === 'true';
        const employees = readOnly(app.db, (tx) =>
          listEmployees(tx, { activeOnly })
        );
        sendJson(res, 200, { employees });
      },
    },
    {
      method: 'POST',
      pattern: '/api/employees',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const id = transaction(app.db, (tx) =>
          createEmployee(tx, {
            tailorNumber: requireString(body.tailorNumber, 'tailorNumber'),
            name: requireString(body.name, 'name'),
          })
        );
        sendJson(res, 201, { id });
      },
    },
    {
      method: 'PATCH',
      pattern: '/api/employees/:id/toggle',
      handler: ({ res, params }) => {
        const id = requireInt(params.id, 'id');
        transaction(app.db, (tx) => toggleEmployeeActive(tx, id));
        sendJson(res, 200, { ok: true });
      },
    },

    // ── Earnings ────────────────────────────────────────────────────────────
    {
      method: 'GET',
      pattern: '/api/earnings/monthly',
      handler: ({ res, query }) => {
        const year = requireInt(query.year, 'year');
        const monthInput = query.month ?? 'Baisakh';
        const monthName = resolveMonthName(monthInput);
        const summary = readOnly(app.db, (tx) =>
          getMonthlySummary(tx, year, monthName)
        );
        sendJson(res, 200, { summary });
      },
    },
    {
      method: 'POST',
      pattern: '/api/earnings',
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const monthInput = body.month ?? body.monthName ?? 'Baisakh';
        const monthName = resolveMonthName(monthInput);
        const id = transaction(app.db, (tx) =>
          recordEarnings(tx, {
            employeeId: requireInt(body.employeeId, 'employeeId'),
            fiscalYear: requireInt(body.fiscalYear, 'fiscalYear'),
            monthName,
            quantity: optionalInt(body.quantity, 'quantity') ?? 0,
            totalEarned: requireInt(body.totalEarned, 'totalEarned'),
            advance: optionalInt(body.advance, 'advance') ?? 0,
            others: optionalInt(body.others, 'others') ?? 0,
            note: optionalString(body.note, 'note') ?? null,
          })
        );
        sendJson(res, 201, { id });
      },
    },
    {
      method: 'GET',
      pattern: '/api/earnings/employee/:id',
      handler: ({ res, params, query }) => {
        const employeeId = requireInt(params.id, 'id');
        const year = query.year ? requireInt(query.year, 'year') : undefined;
        const history = readOnly(app.db, (tx) =>
          getEmployeeYearlyHistory(tx, employeeId, year)
        );
        sendJson(res, 200, { history });
      },
    },
  ];
}

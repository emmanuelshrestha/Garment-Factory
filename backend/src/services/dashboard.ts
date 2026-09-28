/**
 * Dashboard & Morning Briefing service.
 *
 * Provides a single aggregated view of factory operations:
 * - Active orders & production shortages
 * - Deliveries pending
 * - Low-stock alerts (red / amber)
 * - Outstanding receivables per currency (NPR, INR, USD)
 * - Cheque drawer status
 * - Recent operational audit stream
 */

import type { Tx } from '../db/sqlite.ts';
import { assertCurrency, type Currency } from '../domain/money.ts';
import { listAudit, type AuditRow } from './audit.ts';
import { listStockSummaries } from './stock.ts';
import { listShortages } from './orders.ts';

export type CurrencyReceivable = {
  currency: Currency;
  invoicedMinor: number;
  settledMinor: number;
  outstandingMinor: number;
  advanceMinor: number;
  pendingChequeMinor: number;
};

export type DashboardSummary = {
  asOf: string;
  orders: {
    confirmedCount: number;
    partiallyDeliveredCount: number;
    shortagePiecesCount: number;
    shortageVariantsCount: number;
  };
  deliveries: {
    draftCount: number;
    dispatchedCount: number;
  };
  inventory: {
    totalVariants: number;
    redCount: number;
    amberCount: number;
    normalCount: number;
  };
  receivables: CurrencyReceivable[];
  cheques: {
    pendingCount: number;
    pendingAmountMinorNpr: number;
  };
  recentAudit: AuditRow[];
};

export function getDashboardSummary(tx: Tx): DashboardSummary {
  // 1. Orders and shortages
  const orderCounts = tx.db
    .prepare(
      `SELECT status, COUNT(*) AS count
         FROM orders
        WHERE status IN ('confirmed', 'partially_delivered')
        GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;

  const confirmedCount = orderCounts.find((o) => o.status === 'confirmed')?.count ?? 0;
  const partiallyDeliveredCount = orderCounts.find((o) => o.status === 'partially_delivered')?.count ?? 0;

  const shortages = listShortages(tx);
  const shortagePiecesCount = shortages.reduce((sum, s) => sum + s.shortageQty, 0);

  // 2. Deliveries
  const deliveryCounts = tx.db
    .prepare(
      `SELECT status, COUNT(*) AS count
         FROM deliveries
        GROUP BY status`,
    )
    .all() as Array<{ status: string; count: number }>;

  const draftDeliveries = deliveryCounts.find((d) => d.status === 'draft')?.count ?? 0;
  const dispatchedDeliveries = deliveryCounts.find((d) => d.status === 'dispatched')?.count ?? 0;

  // 3. Stock bands
  const summaries = listStockSummaries(tx, { activeOnly: true });
  const redCount = summaries.filter((s) => s.band === 'red').length;
  const amberCount = summaries.filter((s) => s.band === 'amber').length;
  const normalCount = summaries.filter((s) => s.band === 'green').length;

  // 4. Receivables by currency
  const currencies: Currency[] = ['NPR', 'INR', 'USD'];
  const receivables: CurrencyReceivable[] = currencies.map((curr) => {
    // Sum invoiced on non-void invoices
    const invoicedRow = tx.db
      .prepare(
        `SELECT COALESCE(SUM(total_minor), 0) AS total
           FROM invoices
          WHERE status = 'issued' AND currency = ?`,
      )
      .get(curr) as { total: number };

    // Sum settled via cleared payments
    const settledRow = tx.db
      .prepare(
        `SELECT COALESCE(SUM(pa.amount_minor), 0) AS total
           FROM payment_allocations pa
           JOIN payments p ON p.id = pa.payment_id
           JOIN invoices i ON i.id = pa.invoice_id
          WHERE p.status = 'cleared' AND i.currency = ?`,
      )
      .get(curr) as { total: number };

    // Sum unallocated advances from cleared payments
    const advanceRow = tx.db
      .prepare(
        `SELECT COALESCE(SUM(p.amount_minor - COALESCE(alloc.allocated, 0)), 0) AS total
           FROM payments p
           LEFT JOIN (
             SELECT payment_id, SUM(amount_minor) AS allocated
               FROM payment_allocations
              GROUP BY payment_id
           ) alloc ON alloc.payment_id = p.id
          WHERE p.status = 'cleared' AND p.currency = ?
            AND (p.amount_minor - COALESCE(alloc.allocated, 0)) > 0`,
      )
      .get(curr) as { total: number };

    // Pending cheques in this currency
    const pendingChequeRow = tx.db
      .prepare(
        `SELECT COALESCE(SUM(amount_minor), 0) AS total
           FROM payments
          WHERE status = 'pending' AND method = 'cheque' AND currency = ?`,
      )
      .get(curr) as { total: number };

    const invoiced = Number(invoicedRow.total);
    const settled = Number(settledRow.total);
    const outstanding = Math.max(0, invoiced - settled);

    return {
      currency: curr,
      invoicedMinor: invoiced,
      settledMinor: settled,
      outstandingMinor: outstanding,
      advanceMinor: Number(advanceRow.total),
      pendingChequeMinor: Number(pendingChequeRow.total),
    };
  }).filter((r) => r.invoicedMinor > 0 || r.settledMinor > 0 || r.advanceMinor > 0 || r.pendingChequeMinor > 0);

  // 5. Total pending cheques
  const pendingCheques = tx.db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount_minor), 0) AS total_npr
         FROM payments
        WHERE status = 'pending' AND method = 'cheque'`,
    )
    .get() as { count: number; total_npr: number };

  // 6. Recent audit entries
  const recentAudit = listAudit(tx, { limit: 15 });

  return {
    asOf: new Date().toISOString(),
    orders: {
      confirmedCount: Number(confirmedCount),
      partiallyDeliveredCount: Number(partiallyDeliveredCount),
      shortagePiecesCount,
      shortageVariantsCount: shortages.length,
    },
    deliveries: {
      draftCount: Number(draftDeliveries),
      dispatchedCount: Number(dispatchedDeliveries),
    },
    inventory: {
      totalVariants: summaries.length,
      redCount,
      amberCount,
      normalCount,
    },
    receivables,
    cheques: {
      pendingCount: Number(pendingCheques.count),
      pendingAmountMinorNpr: Number(pendingCheques.total_npr),
    },
    recentAudit,
  };
}

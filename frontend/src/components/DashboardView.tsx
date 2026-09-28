import React from 'react';
import { type DashboardSummary, formatMoney, formatDate } from '../api.ts';
import type { TabKey } from './Sidebar.tsx';
import { RefreshCw, Plus } from 'lucide-react';

interface DashboardViewProps {
  data: DashboardSummary | null;
  loading: boolean;
  onNavigate: (tab: TabKey) => void;
  onRefresh: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  onNavigate,
  onRefresh,
}) => {
  if (loading || !data) {
    return (
      <div className="py-20 text-center text-slate-500 dark:text-slate-400 font-medium animate-pulse">
        Loading morning operations briefing...
      </div>
    );
  }

  const { orders, deliveries, inventory, receivables, cheques, recentAudit } = data;

  return (
    <div className="space-y-4">
      {/* Top Banner / Welcome */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">Today's Factory Operations Briefing</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Single Location Operating Status • As of {formatDate(data.asOf)}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5"
          >
            <RefreshCw size={14} strokeWidth={1.75} /> Refresh
          </button>
          <button
            onClick={() => onNavigate('orders')}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} strokeWidth={2} /> New Order
          </button>
        </div>
      </div>

      {/* Clean Slate Onboarding Prompt */}
      {inventory.totalVariants === 0 && orders.confirmedCount === 0 && deliveries.draftCount === 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-blue-950 dark:text-blue-200">Clean Slate Factory System Ready</h3>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Your system is clean and ready for real data. Start by defining your products, colours, and sizes in the Catalogue, or enter customer orders.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onNavigate('catalogue')}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm"
            >
              Add Products & Colours
            </button>
            <button
              onClick={() => onNavigate('orders')}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 transition"
            >
              Create Order
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Orders & Shortages */}
        <div
          onClick={() => onNavigate('orders')}
          className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer transition shadow-2xs"
        >
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Active Orders</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100">
              {orders.confirmedCount + orders.partiallyDeliveredCount}
            </span>
            {orders.shortagePiecesCount > 0 ? (
              <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                {orders.shortagePiecesCount} pcs shortage
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                Fully Reserved
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            {orders.confirmedCount} confirmed, {orders.partiallyDeliveredCount} partly delivered
          </p>
        </div>

        {/* Inventory Thresholds */}
        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-red-300 dark:hover:border-red-700 cursor-pointer transition shadow-2xs"
        >
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock Alerts</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100">{inventory.totalVariants}</span>
            <div className="flex gap-1 text-[11px] font-semibold">
              {inventory.redCount > 0 && (
                <span className="bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded-full">
                  {inventory.redCount} Red
                </span>
              )}
              {inventory.amberCount > 0 && (
                <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-full">
                  {inventory.amberCount} Amb
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            {inventory.redCount} below min, {inventory.amberCount} approaching min
          </p>
        </div>

        {/* Deliveries */}
        <div
          onClick={() => onNavigate('deliveries')}
          className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 cursor-pointer transition shadow-2xs"
        >
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Deliveries</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100">{deliveries.draftCount}</span>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
              {deliveries.dispatchedCount} Dispatched
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            {deliveries.draftCount} packing lists ready for loading & dispatch
          </p>
        </div>

        {/* Cheque Drawer */}
        <div
          onClick={() => onNavigate('payments')}
          className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 cursor-pointer transition shadow-2xs"
        >
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cheques in Drawer</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100">{cheques.pendingCount}</span>
            <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
              {formatMoney(cheques.pendingAmountMinorNpr, 'NPR')}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            Pending bank clearing (does not reduce receivables until cleared)
          </p>
        </div>
      </div>

      {/* Receivables & Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Receivables Breakdown */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Outstanding Receivables</h3>
              <button
                onClick={() => onNavigate('payments')}
                className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                View Statements →
              </button>
            </div>
            {receivables.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center">No outstanding bills on file.</p>
            ) : (
              <div className="space-y-3">
                {receivables.map((r) => (
                  <div key={r.currency} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-center text-xs font-semibold">
                      <span className="text-slate-600 dark:text-slate-400 uppercase">{r.currency} Receivables</span>
                      <span className="text-slate-900 dark:text-slate-100 text-sm font-mono font-bold">
                        {formatMoney(r.outstandingMinor, r.currency)}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex justify-between">
                      <span>Billed: {formatMoney(r.outstandingMinor, r.currency)}</span>
                      <span>{r.invoiceCount} invoice{r.invoiceCount !== 1 ? 's' : ''}</span>
                    </div>
                    {(r as any).advanceMinor > 0 && (
                      <div className="mt-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded flex justify-between">
                        <span>Advance Held:</span>
                        <span className="font-mono">{formatMoney((r as any).advanceMinor, r.currency)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              onClick={() => onNavigate('payments')}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition"
            >
              + Record Payment Receipt
            </button>
          </div>
        </div>

        {/* Audit Log Stream */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-3 gap-2">
            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">Recent Factory Event Stream</h3>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Immutable Audit Trail</span>
          </div>
          {recentAudit.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center">No system events logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Time</th>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Action</th>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Target</th>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentAudit.map((log) => {
                    const actionBadge = log.action.includes('created')
                      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                      : log.action.includes('dispatched') || log.action.includes('issued') || log.action.includes('cleared')
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                      : log.action.includes('voided') || log.action.includes('bounced') || log.action.includes('cancelled')
                      ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDate(log.at)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-mono font-semibold text-[10px] border ${actionBadge}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300 uppercase text-[11px] whitespace-nowrap">
                          {log.entityType} #{log.entityId}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px] truncate max-w-xs">
                          {log.detail ? JSON.stringify(log.detail).replace(/[{"}]/g, ' ') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

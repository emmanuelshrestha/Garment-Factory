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
      <div className="py-20 text-center text-slate-500 font-medium animate-pulse">
        Loading morning operations briefing...
      </div>
    );
  }

  const { orders, deliveries, inventory, receivables, cheques, recentAudit } = data;

  return (
    <div className="space-y-4">
      {/* Top Banner / Welcome */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Today's Factory Operations Briefing</h2>
          <p className="text-xs text-slate-500 mt-1">
            Single Location Operating Status • As of {formatDate(data.asOf)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-600 transition flex items-center gap-1.5"
          >
            <RefreshCw size={14} strokeWidth={1.75} /> Refresh
          </button>
          <button
            onClick={() => onNavigate('orders')}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5"
          >
            <Plus size={14} strokeWidth={2} /> New Order
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Orders & Shortages */}
        <div
          onClick={() => onNavigate('orders')}
          className="bg-white p-4 rounded-xl border border-slate-200 hover:border-blue-300 cursor-pointer transition"
        >
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active Orders</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900">
              {orders.confirmedCount + orders.partiallyDeliveredCount}
            </span>
            {orders.shortagePiecesCount > 0 ? (
              <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                {orders.shortagePiecesCount} pcs shortage
              </span>
            ) : (
              <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Fully Reserved
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {orders.confirmedCount} confirmed, {orders.partiallyDeliveredCount} partly delivered
          </p>
        </div>

        {/* Inventory Thresholds */}
        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white p-4 rounded-xl border border-slate-200 hover:border-red-300 cursor-pointer transition"
        >
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Stock Alerts</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900">{inventory.totalVariants}</span>
            <div className="flex gap-1 text-[11px] font-medium">
              {inventory.redCount > 0 && (
                <span className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">
                  {inventory.redCount} Red
                </span>
              )}
              {inventory.amberCount > 0 && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                  {inventory.amberCount} Amb
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {inventory.redCount} below minimum, {inventory.amberCount} approaching minimum
          </p>
        </div>

        {/* Deliveries */}
        <div
          onClick={() => onNavigate('deliveries')}
          className="bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-300 cursor-pointer transition"
        >
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Deliveries</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900">{deliveries.draftCount}</span>
            <span className="text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
              {deliveries.dispatchedCount} Dispatched
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {deliveries.draftCount} packing lists ready for loading & dispatch
          </p>
        </div>

        {/* Cheque Drawer */}
        <div
          onClick={() => onNavigate('payments')}
          className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-300 cursor-pointer transition"
        >
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Cheques in Drawer</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-mono font-bold text-slate-900">{cheques.pendingCount}</span>
            <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
              {formatMoney(cheques.pendingAmountMinorNpr, 'NPR')}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Pending bank clearing (does not reduce receivables until cleared)
          </p>
        </div>
      </div>

      {/* Receivables & Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Receivables Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 className="font-semibold text-sm text-slate-900">Outstanding Receivables</h3>
              <button
                onClick={() => onNavigate('payments')}
                className="text-xs text-blue-600 font-medium hover:underline"
              >
                View Statements →
              </button>
            </div>
            {receivables.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No outstanding bills on file.</p>
            ) : (
              <div className="space-y-3">
                {receivables.map((r) => (
                  <div key={r.currency} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-center text-xs font-medium">
                      <span className="text-slate-600 uppercase">{r.currency} Receivables</span>
                      <span className="text-slate-900 text-sm font-mono font-bold">
                        {formatMoney(r.outstandingMinor, r.currency)}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 flex justify-between">
                      <span>Billed: {formatMoney(r.outstandingMinor, r.currency)}</span>
                      <span>{r.invoiceCount} invoice{r.invoiceCount !== 1 ? 's' : ''}</span>
                    </div>
                    {(r as any).advanceMinor > 0 && (
                      <div className="mt-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded flex justify-between">
                        <span>Advance Held:</span>
                        <span className="font-mono">{formatMoney((r as any).advanceMinor, r.currency)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200">
            <button
              onClick={() => onNavigate('payments')}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition"
            >
              + Record Payment Receipt
            </button>
          </div>
        </div>

        {/* Audit Log Stream */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
            <h3 className="font-semibold text-sm text-slate-900">Recent Factory Event Stream</h3>
            <span className="text-[11px] text-slate-400 font-mono">Immutable Audit Trail (D013)</span>
          </div>
          {recentAudit.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No system events logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Time</th>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Action</th>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Target</th>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentAudit.map((log) => {
                    const actionBadge = log.action.includes('created')
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : log.action.includes('dispatched') || log.action.includes('issued') || log.action.includes('cleared')
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : log.action.includes('voided') || log.action.includes('bounced') || log.action.includes('cancelled')
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : 'bg-slate-50 text-slate-600 border-slate-200';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {formatDate(log.at)}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-mono font-medium text-[10px] border ${actionBadge}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700 uppercase text-[11px]">
                          {log.entityType} #{log.entityId}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px] truncate max-w-xs">
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

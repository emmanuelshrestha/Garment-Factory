import React from 'react';
import { type DashboardSummary, formatMoney, formatDate } from '../api.ts';
import type { TabKey } from './Navbar.tsx';

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
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Today's Factory Operations Briefing</h2>
          <p className="text-xs text-slate-500 mt-1">
            Single Location Operating Status • As of {formatDate(data.asOf)}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onRefresh}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 hover:bg-slate-50 text-slate-700 transition"
          >
            ↻ Refresh State
          </button>
          <button
            onClick={() => onNavigate('orders')}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
          >
            + Create New Order
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Orders & Shortages */}
        <div
          onClick={() => onNavigate('orders')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-400 cursor-pointer transition"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Orders</span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold">Orders</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">
              {orders.confirmedCount + orders.partiallyDeliveredCount}
            </span>
            {orders.shortagePiecesCount > 0 ? (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                ⚠ {orders.shortagePiecesCount} pcs shortage
              </span>
            ) : (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                ✓ Fully Reserved
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {orders.confirmedCount} confirmed, {orders.partiallyDeliveredCount} partly delivered
          </p>
        </div>

        {/* Inventory Thresholds */}
        <div
          onClick={() => onNavigate('inventory')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-red-400 cursor-pointer transition"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Stock Alerts</span>
            <span className="p-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold">Stock</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{inventory.totalVariants}</span>
            <div className="flex space-x-1 text-xs font-bold">
              {inventory.redCount > 0 && (
                <span className="bg-red-500 text-white px-2 py-0.5 rounded">
                  {inventory.redCount} Red
                </span>
              )}
              {inventory.amberCount > 0 && (
                <span className="bg-amber-500 text-white px-2 py-0.5 rounded">
                  {inventory.amberCount} Amb
                </span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {inventory.redCount} below minimum, {inventory.amberCount} approaching minimum
          </p>
        </div>

        {/* Deliveries */}
        <div
          onClick={() => onNavigate('deliveries')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-400 cursor-pointer transition"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Deliveries</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold">Dispatch</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{deliveries.draftCount}</span>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              {deliveries.dispatchedCount} Dispatched
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            {deliveries.draftCount} packing lists ready for loading & dispatch
          </p>
        </div>

        {/* Cheque Drawer */}
        <div
          onClick={() => onNavigate('payments')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-indigo-400 cursor-pointer transition"
        >
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cheques in Drawer</span>
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">Cheques</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-black text-slate-900">{cheques.pendingCount}</span>
            <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
              {formatMoney(cheques.pendingAmountMinorNpr, 'NPR')}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Pending bank clearing (does not reduce receivables until cleared)
          </p>
        </div>
      </div>

      {/* Receivables & Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Receivables Breakdown */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-sm text-slate-900">Outstanding Receivables</h3>
              <button
                onClick={() => onNavigate('payments')}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                View Statements →
              </button>
            </div>
            {receivables.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No outstanding bills on file.</p>
            ) : (
              <div className="space-y-4">
                {receivables.map((r) => (
                  <div key={r.currency} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-slate-600 uppercase">{r.currency} Receivables</span>
                      <span className="text-slate-900 text-sm font-extrabold">
                        {formatMoney(r.outstandingMinor, r.currency)}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 flex justify-between">
                      <span>Billed: {formatMoney(r.outstandingMinor, r.currency)}</span>
                      <span>{r.invoiceCount} invoice{r.invoiceCount !== 1 ? 's' : ''}</span>
                    </div>
                    {(r as any).advanceMinor > 0 && (
                      <div className="mt-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded flex justify-between">
                        <span>Advance Held:</span>
                        <span>{formatMoney((r as any).advanceMinor, r.currency)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => onNavigate('payments')}
              className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition"
            >
              + Record Payment Receipt
            </button>
          </div>
        </div>

        {/* Audit Log Stream */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-sm text-slate-900">Recent Factory Event Stream</h3>
            <span className="text-[11px] text-slate-400 font-mono">Immutable Audit Trail (D013)</span>
          </div>
          {recentAudit.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">No system events logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-400 uppercase text-[10px] font-bold border-b border-slate-100">
                  <tr>
                    <th className="pb-2">Time</th>
                    <th className="pb-2">Action</th>
                    <th className="pb-2">Target</th>
                    <th className="pb-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentAudit.map((log) => {
                    const actionBadge = log.action.includes('created')
                      ? 'bg-blue-50 text-blue-700'
                      : log.action.includes('dispatched') || log.action.includes('issued') || log.action.includes('cleared')
                      ? 'bg-emerald-50 text-emerald-700'
                      : log.action.includes('voided') || log.action.includes('bounced') || log.action.includes('cancelled')
                      ? 'bg-red-50 text-red-700'
                      : 'bg-slate-100 text-slate-700';

                    return (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {formatDate(log.at)}
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${actionBadge}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 font-medium text-slate-700 uppercase text-[11px]">
                          {log.entityType} #{log.entityId}
                        </td>
                        <td className="py-2.5 text-slate-600 font-mono text-[11px] truncate max-w-xs">
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

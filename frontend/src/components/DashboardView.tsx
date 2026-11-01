import React, { useState, useMemo } from 'react';
import { type DashboardSummary, type Currency, formatMoney, formatDate } from '../api.ts';
import type { TabKey } from './Sidebar.tsx';
import {
  RefreshCw,
  Plus,
  Package,
  AlertTriangle,
  AlertCircle,
  Truck,
  Banknote,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Boxes,
  FileSpreadsheet,
  Search,
  ArrowRight,
  Scissors,
  Undo2,
  Users,
  Layers,
  FileText,
} from 'lucide-react';

interface DashboardViewProps {
  data: DashboardSummary | null;
  loading: boolean;
  onNavigate: (tab: TabKey) => void;
  onRefresh: () => void;
}

type AuditFilterCategory = 'all' | 'orders' | 'stock' | 'finance';

interface AttentionItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  metricLabel: string;
  actionLabel: string;
  targetTab: TabKey;
}

const CURRENCY_BADGE: Record<Currency, string> = {
  NPR: 'रू',
  INR: '₹',
  USD: '$',
};

function routeEntityToTab(entityType: string): TabKey {
  const normalized = entityType.toLowerCase();
  if (normalized.includes('order')) return 'orders';
  if (normalized.includes('deliver')) return 'deliveries';
  if (normalized.includes('invoice')) return 'invoices';
  if (normalized.includes('payment') || normalized.includes('cheque')) return 'payments';
  if (normalized.includes('return')) return 'returns';
  if (normalized.includes('cut')) return 'cutting';
  if (normalized.includes('expense') || normalized.includes('purchase')) return 'ledger';
  if (normalized.includes('employee') || normalized.includes('earning')) return 'earnings';
  if (
    normalized.includes('product') ||
    normalized.includes('colour') ||
    normalized.includes('size') ||
    normalized.includes('customer')
  ) {
    return 'catalogue';
  }
  return 'inventory';
}

function renderAuditDetails(detail: Record<string, unknown> | null): React.ReactNode {
  if (!detail) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }

  const entries = Object.entries(detail).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );

  if (entries.length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {entries.slice(0, 4).map(([key, value]) => (
        <span
          key={key}
          className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300"
        >
          <span className="text-zinc-500 dark:text-zinc-400 mr-1">{key}:</span>
          <span className="font-mono font-medium">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </span>
        </span>
      ))}
      {entries.length > 4 && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          +{entries.length - 4} more
        </span>
      )}
    </div>
  );
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  onNavigate,
  onRefresh,
}) => {
  const [auditCategory, setAuditCategory] = useState<AuditFilterCategory>('all');
  const [auditSearch, setAuditSearch] = useState('');

  const filteredAudit = useMemo(() => {
    const logs = data?.recentAudit ?? [];
    return logs.filter((log) => {
      const entity = (log.entityType || '').toLowerCase();
      const action = (log.action || '').toLowerCase();

      if (auditCategory === 'orders') {
        const matchesOrders =
          entity.includes('order') ||
          entity.includes('deliver') ||
          action.includes('dispatch');
        if (!matchesOrders) return false;
      } else if (auditCategory === 'stock') {
        const matchesStock =
          entity.includes('stock') ||
          entity.includes('variant') ||
          entity.includes('product') ||
          entity.includes('return') ||
          entity.includes('cut');
        if (!matchesStock) return false;
      } else if (auditCategory === 'finance') {
        const matchesFinance =
          entity.includes('invoice') ||
          entity.includes('payment') ||
          entity.includes('cheque') ||
          entity.includes('expense') ||
          entity.includes('purchase');
        if (!matchesFinance) return false;
      }

      if (auditSearch.trim() !== '') {
        const query = auditSearch.trim().toLowerCase();
        const detailText = log.detail ? JSON.stringify(log.detail).toLowerCase() : '';
        const idText = log.entityId !== null && log.entityId !== undefined ? String(log.entityId) : '';
        return (
          action.includes(query) ||
          entity.includes(query) ||
          idText.includes(query) ||
          detailText.includes(query)
        );
      }

      return true;
    });
  }, [data?.recentAudit, auditCategory, auditSearch]);

  const attentionItems = useMemo<AttentionItem[]>(() => {
    if (!data) return [];
    const items: AttentionItem[] = [];
    const orders = data.orders || ({} as any);
    const inventory = data.inventory || ({} as any);
    const deliveries = data.deliveries || ({} as any);
    const receivables = data.receivables || [];

    const shortagePcs = Number(orders.shortagePiecesCount || 0);
    const redStock = Number(inventory.redCount || 0);
    const amberStock = Number(inventory.amberCount || 0);
    const draftDeliv = Number(deliveries.draftCount || 0);

    if (shortagePcs > 0) {
      items.push({
        id: 'shortage',
        severity: 'critical',
        title: 'Production Shortage on Confirmed Orders',
        description: `${shortagePcs.toLocaleString()} pieces short. Available finished stock is insufficient to fulfil reserved customer demand.`,
        metricLabel: `${shortagePcs.toLocaleString()} pcs short`,
        actionLabel: 'Review Orders',
        targetTab: 'orders',
      });
    }

    if (redStock > 0) {
      items.push({
        id: 'red-stock',
        severity: 'critical',
        title: 'Critical Stock Below Minimum Threshold',
        description: `${redStock.toLocaleString()} SKU variant${redStock === 1 ? '' : 's'} at or below configured minimum stock levels.`,
        metricLabel: `${redStock.toLocaleString()} critical SKU${redStock === 1 ? '' : 's'}`,
        actionLabel: 'Open Stock Matrix',
        targetTab: 'inventory',
      });
    }

    const overdueCurrencies = receivables.filter((r) => Number(r.overdueMinor || 0) > 0);
    if (overdueCurrencies.length > 0) {
      const formattedOverdue = overdueCurrencies
        .map((r) => formatMoney(r.overdueMinor || 0, r.currency))
        .join(' • ');
      items.push({
        id: 'overdue-receivables',
        severity: 'critical',
        title: 'Overdue Customer Receivables',
        description: `Issued customer invoices have passed their payment due date (${formattedOverdue}).`,
        metricLabel: formattedOverdue,
        actionLabel: 'Review Collections',
        targetTab: 'payments',
      });
    }

    if (amberStock > 0) {
      items.push({
        id: 'amber-stock',
        severity: 'warning',
        title: 'Variants Approaching Minimum Stock',
        description: `${amberStock.toLocaleString()} SKU variant${amberStock === 1 ? '' : 's'} within 25% above minimum stock threshold.`,
        metricLabel: `${amberStock.toLocaleString()} low SKU${amberStock === 1 ? '' : 's'}`,
        actionLabel: 'Inspect Stock',
        targetTab: 'inventory',
      });
    }

    if (draftDeliv > 0) {
      items.push({
        id: 'draft-deliveries',
        severity: 'info',
        title: 'Staged Packing Lists Awaiting Dispatch',
        description: `${draftDeliv.toLocaleString()} draft delivery packing list${draftDeliv === 1 ? '' : 's'} created. Stock is deducted upon confirmed dispatch.`,
        metricLabel: `${draftDeliv.toLocaleString()} staged`,
        actionLabel: 'Go to Deliveries',
        targetTab: 'deliveries',
      });
    }

    return items;
  }, [data]);

  if (loading && !data) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="py-24 px-4 flex flex-col items-center justify-center text-center space-y-3"
      >
        <div className="w-8 h-8 border-2 border-zinc-300 dark:border-zinc-700 border-t-emerald-600 dark:border-t-emerald-400 rounded-full animate-spin motion-reduce:animate-none" />
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          Loading factory operations briefing...
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Fetching current stock matrix, order reservations, and receivables
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        role="alert"
        className="my-8 max-w-xl mx-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center shadow-xs space-y-4"
      >
        <div className="w-10 h-10 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/70 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <AlertCircle size={20} />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Unable to Load Dashboard Summary
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            The operational summary could not be retrieved from the server. Check your connection or retry.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
        >
          <RefreshCw size={15} />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  // Safe numerical extractions with fallbacks
  const orders = data.orders || ({} as any);
  const deliveries = data.deliveries || ({} as any);
  const inventory = data.inventory || ({} as any);
  const receivables = data.receivables || [];
  const cheques = data.cheques || ({} as any);
  const recentAudit = data.recentAudit || [];

  const confirmedCount = Number(orders.confirmedCount || 0);
  const partiallyDeliveredCount = Number(orders.partiallyDeliveredCount || 0);
  const shortagePiecesCount = Number(orders.shortagePiecesCount || 0);
  const totalActiveOrders = confirmedCount + partiallyDeliveredCount;

  const totalVariants = Number(inventory.totalVariants || 0);
  const redCount = Number(inventory.redCount || 0);
  const amberCount = Number(inventory.amberCount || 0);
  const healthyVariants =
    typeof inventory.normalCount === 'number'
      ? Number(inventory.normalCount)
      : Math.max(0, totalVariants - redCount - amberCount);

  const greenWidthPct = totalVariants > 0 ? (healthyVariants / totalVariants) * 100 : 0;
  const amberWidthPct = totalVariants > 0 ? (amberCount / totalVariants) * 100 : 0;
  const redWidthPct = totalVariants > 0 ? (redCount / totalVariants) * 100 : 0;

  const draftCount = Number(deliveries.draftCount || 0);
  const dispatchedCount = Number(deliveries.dispatchedCount || 0);

  const pendingChequeCount = Number(cheques.pendingCount || 0);
  const pendingChequeAmount = Number(cheques.pendingAmountMinorNpr || 0);

  const isDatabaseEmpty =
    totalVariants === 0 &&
    confirmedCount === 0 &&
    partiallyDeliveredCount === 0 &&
    draftCount === 0 &&
    dispatchedCount === 0 &&
    receivables.length === 0 &&
    pendingChequeCount === 0 &&
    recentAudit.length === 0;

  const pipelineStages: Array<{
    step: string;
    title: string;
    subtitle: string;
    tab: TabKey;
    icon: React.ReactNode;
  }> = [
    {
      step: '01',
      title: 'Orders',
      subtitle: 'Price snapshot & stock reservation',
      tab: 'orders',
      icon: <Package size={15} />,
    },
    {
      step: '02',
      title: 'Production / Shortage',
      subtitle: 'Cutting room & floor replenishment',
      tab: 'cutting',
      icon: <Scissors size={15} />,
    },
    {
      step: '03',
      title: 'Dispatch',
      subtitle: 'Packing list & physical shelf deduction',
      tab: 'deliveries',
      icon: <Truck size={15} />,
    },
    {
      step: '04',
      title: 'Receivables / Invoices',
      subtitle: 'Immutable billing on dispatched lines',
      tab: 'invoices',
      icon: <FileText size={15} />,
    },
    {
      step: '05',
      title: 'Cheques / Clearance',
      subtitle: 'Bank clearance settles customer balance',
      tab: 'payments',
      icon: <Banknote size={15} />,
    },
  ];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto pb-10">
      {/* ── HEADER ── */}
      <header className="bg-white dark:bg-zinc-900 rounded-xl p-5 sm:p-6 border border-zinc-200/90 dark:border-zinc-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                Operations Summary
              </span>
              {data.asOf && (
                <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Clock size={13} className="text-zinc-400 dark:text-zinc-500" />
                  <span>As of {formatDate(data.asOf)}</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-tight">
              Factory Operations & Ledger Command
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
              Finished garment stock matrix, order reservations, dispatch packing lists, and multi-currency receivables.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="px-3.5 py-2 rounded-lg text-sm font-medium bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700/80 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition flex items-center gap-2 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
            >
              <RefreshCw
                size={15}
                className={`text-zinc-500 dark:text-zinc-400 ${
                  loading ? 'animate-spin motion-reduce:animate-none' : ''
                }`}
              />
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="px-3.5 py-2 rounded-lg text-sm font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200/70 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-zinc-700 transition flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
            >
              <Boxes size={15} className="text-emerald-600 dark:text-emerald-400" />
              <span>Stock Matrix</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white transition flex items-center gap-2 shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900 cursor-pointer"
            >
              <Plus size={16} strokeWidth={2.25} />
              <span>New Customer Order</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── CLEAN SLATE BANNER ── */}
      {isDatabaseEmpty && (
        <section
          aria-label="Initial factory setup"
          className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="space-y-1">
            <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              Factory System Ready for Initial Setup
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300 max-w-2xl">
              No products, variants, orders, or transactions recorded yet. Start by configuring products, colours, and sizes in the Catalogue.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('catalogue')}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
            >
              Open Catalogue
            </button>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
            >
              Create Order
            </button>
          </div>
        </section>
      )}

      {/* ── NEEDS ATTENTION ── */}
      <section aria-labelledby="needs-attention-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="needs-attention-heading"
            className="text-base font-bold text-zinc-900 dark:text-zinc-100"
          >
            Needs Attention
          </h2>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {attentionItems.length === 0
              ? 'No active exceptions'
              : `${attentionItems.length} operational item${attentionItems.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {attentionItems.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  All Operations Within Normal Thresholds
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  No unbacked order shortages, critical stock variants, overdue invoices, or unshipped draft challans.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attentionItems.map((item) => {
              const styles =
                item.severity === 'critical'
                  ? {
                      border: 'border-rose-200 dark:border-rose-900/70',
                      bg: 'bg-white dark:bg-zinc-900',
                      iconBox:
                        'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800',
                      badge:
                        'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
                    }
                  : item.severity === 'warning'
                  ? {
                      border: 'border-amber-200 dark:border-amber-900/70',
                      bg: 'bg-white dark:bg-zinc-900',
                      iconBox:
                        'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800',
                      badge:
                        'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
                    }
                  : {
                      border: 'border-zinc-200 dark:border-zinc-800',
                      bg: 'bg-white dark:bg-zinc-900',
                      iconBox:
                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700',
                      badge:
                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700',
                    };

              return (
                <div
                  key={item.id}
                  className={`${styles.bg} ${styles.border} border rounded-xl p-4 shadow-2xs flex flex-col justify-between gap-3`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${styles.iconBox}`}
                      >
                        {item.severity === 'critical' ? (
                          <AlertCircle size={17} />
                        ) : item.severity === 'warning' ? (
                          <AlertTriangle size={17} />
                        ) : (
                          <Truck size={17} />
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                            {item.title}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-mono font-semibold border ${styles.badge}`}
                          >
                            {item.metricLabel}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => onNavigate(item.targetTab)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded px-2 py-1 cursor-pointer"
                    >
                      <span>{item.actionLabel}</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── FOUR PRIMARY KPI CARDS ── */}
      <section aria-label="Key operational metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Active Orders */}
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="group text-left bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-2xs flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="w-full">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  Active Orders
                </span>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/80 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <Package size={17} />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="text-3xl font-mono font-bold tabular-nums text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {totalActiveOrders.toLocaleString()}
                </span>
                {shortagePiecesCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 rounded-full">
                    <AlertTriangle size={12} />
                    {shortagePiecesCount.toLocaleString()} pcs short
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 size={12} />
                    Stock Reserved
                  </span>
                )}
              </div>

              <dl className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Confirmed</dt>
                  <dd className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {confirmedCount.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Part-Delivered</dt>
                  <dd className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {partiallyDeliveredCount.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="w-full mt-4 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200">
              <span>Manage order reservations</span>
              <ArrowUpRight size={14} />
            </div>
          </button>

          {/* KPI 2: Stock Matrix Health */}
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="group text-left bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-2xs flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="w-full">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  Stock Matrix Health
                </span>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/80 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <Boxes size={17} />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-3xl font-mono font-bold tabular-nums text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {totalVariants.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">
                    SKU variants
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    {healthyVariants} Healthy
                  </span>
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    {amberCount} Amber
                  </span>
                  <span className="text-rose-700 dark:text-rose-400 font-medium">
                    {redCount} Critical
                  </span>
                </div>
                <div
                  aria-label="Stock health distribution"
                  className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex"
                >
                  {greenWidthPct > 0 && (
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${greenWidthPct}%` }}
                    />
                  )}
                  {amberWidthPct > 0 && (
                    <div
                      className="bg-amber-500 h-full"
                      style={{ width: `${amberWidthPct}%` }}
                    />
                  )}
                  {redWidthPct > 0 && (
                    <div
                      className="bg-rose-500 h-full"
                      style={{ width: `${redWidthPct}%` }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="w-full mt-4 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200">
              <span>Open Colour × Size matrix</span>
              <ArrowUpRight size={14} />
            </div>
          </button>

          {/* KPI 3: Dispatch Status */}
          <button
            type="button"
            onClick={() => onNavigate('deliveries')}
            className="group text-left bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-2xs flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="w-full">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  Dispatch Status
                </span>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/80 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <Truck size={17} />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-3xl font-mono font-bold tabular-nums text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {draftCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">
                    staged challans
                  </span>
                </div>
              </div>

              <dl className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Draft / Staged</dt>
                  <dd className="font-mono font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {draftCount.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500 dark:text-zinc-400">Dispatched Total</dt>
                  <dd className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {dispatchedCount.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="w-full mt-4 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200">
              <span>Review packing lists & dispatch</span>
              <ArrowUpRight size={14} />
            </div>
          </button>

          {/* KPI 4: Cheque Drawer (PDC) */}
          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="group text-left bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition shadow-2xs flex flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="w-full">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  Cheque Drawer (PDC)
                </span>
                <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/80 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <Banknote size={17} />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-3xl font-mono font-bold tabular-nums text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {pendingChequeCount.toLocaleString()}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 ml-1.5">
                    pending cheques
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Pending Value (NPR)</span>
                  <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatMoney(pendingChequeAmount, 'NPR')}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Excluded from cleared cash until bank clearance
                </p>
              </div>
            </div>

            <div className="w-full mt-4 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200">
              <span>Manage cheque clearance</span>
              <ArrowUpRight size={14} />
            </div>
          </button>
        </div>
      </section>

      {/* ── FIVE-STAGE WORKFLOW STEPPER ── */}
      <nav
        aria-label="Factory operational workflow"
        className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3.5">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Operational & Financial Workflow
          </h2>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Select any stage to open the corresponding ledger module
          </span>
        </div>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {pipelineStages.map((stage, idx) => (
            <li key={stage.step} className="relative flex">
              <button
                type="button"
                onClick={() => onNavigate(stage.tab)}
                className="group w-full text-left p-3 rounded-lg bg-zinc-50/80 dark:bg-zinc-800/40 hover:bg-emerald-50/50 dark:hover:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/70 hover:border-emerald-300 dark:hover:border-emerald-700/80 transition flex items-start gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
              >
                <div className="w-7 h-7 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 transition-colors">
                  {stage.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-mono font-semibold text-zinc-400 dark:text-zinc-500">
                      Step {stage.step}
                    </span>
                    {idx < pipelineStages.length - 1 && (
                      <ArrowRight
                        size={12}
                        className="text-zinc-400 dark:text-zinc-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-transform"
                      />
                    )}
                  </div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                    {stage.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                    {stage.subtitle}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* ── FINANCIAL OVERVIEW & AUDIT ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Receivables */}
        <section
          aria-labelledby="receivables-heading"
          className="lg:col-span-4 bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-2xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3.5 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 flex items-center justify-center">
                  <FileSpreadsheet size={16} />
                </div>
                <div>
                  <h2
                    id="receivables-heading"
                    className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-tight"
                  >
                    Multi-Currency Receivables
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Separated by order billing currency
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('payments')}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded px-1.5 py-0.5 cursor-pointer"
              >
                Statements →
              </button>
            </div>

            {receivables.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                <CheckCircle2
                  size={22}
                  className="mx-auto text-emerald-600 dark:text-emerald-400 mb-2"
                />
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  No Outstanding Receivables
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  All issued customer invoices are currently settled.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {receivables.map((item) => {
                  const invCount = Number(item.invoiceCount || 0);
                  const outMinor = Number(item.outstandingMinor || 0);
                  const ovdMinor = Number(item.overdueMinor || 0);

                  return (
                    <button
                      key={item.currency}
                      type="button"
                      onClick={() => onNavigate('payments')}
                      className="w-full text-left p-4 bg-zinc-50/80 dark:bg-zinc-800/40 hover:bg-zinc-100/80 dark:hover:bg-zinc-800 rounded-lg border border-zinc-200/80 dark:border-zinc-700/70 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono font-bold text-sm flex items-center justify-center shrink-0">
                            {CURRENCY_BADGE[item.currency] ?? item.currency}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                {item.currency} Balance
                              </span>
                              <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                                {invCount.toLocaleString()} invoice{invCount === 1 ? '' : 's'}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                              Issued minus cleared allocations
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-base font-mono font-bold tabular-nums text-zinc-900 dark:text-zinc-100 block">
                            {formatMoney(outMinor, item.currency)}
                          </span>
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            Outstanding
                          </span>
                        </div>
                      </div>

                      {ovdMinor > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-zinc-200/70 dark:border-zinc-700/60 flex items-center justify-between text-xs">
                          <span className="text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                            <AlertCircle size={13} />
                            Overdue Balance
                          </span>
                          <span className="font-mono font-bold tabular-nums text-rose-700 dark:text-rose-400">
                            {formatMoney(ovdMinor, item.currency)}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="flex-1 py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
            >
              <Plus size={14} />
              <span>Record Payment Receipt</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('invoices')}
              className="py-2.5 px-3 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
            >
              <span>View Invoices</span>
            </button>
          </div>
        </section>

        {/* Right Column: Recent Activity */}
        <section
          aria-labelledby="recent-activity-heading"
          className="lg:col-span-8 bg-white dark:bg-zinc-900 p-5 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-2xs flex flex-col justify-between"
        >
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3.5 mb-4 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="recent-activity-heading"
                    className="text-base font-bold text-zinc-900 dark:text-zinc-100"
                  >
                    Recent Factory Activity
                  </h2>
                  <span className="text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded-md border border-zinc-200 dark:border-zinc-700">
                    {filteredAudit.length} event{filteredAudit.length === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Recorded operational and financial movements
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
                />
                <input
                  type="search"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  aria-label="Filter recent factory activity"
                  placeholder="Search action, ID, details..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div
              role="group"
              aria-label="Filter activity by category"
              className="flex flex-wrap items-center gap-1.5 mb-4"
            >
              {(
                [
                  { key: 'all', label: 'All Activity' },
                  { key: 'orders', label: 'Orders & Dispatch' },
                  { key: 'stock', label: 'Stock & Production' },
                  { key: 'finance', label: 'Invoices & Payments' },
                ] as const
              ).map((tab) => {
                const active = auditCategory === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setAuditCategory(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer ${
                      active
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/80 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {filteredAudit.length === 0 ? (
              <div className="py-12 text-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  No matching activity events
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Adjust your search query or switch category filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-800/90 border-b border-zinc-200 dark:border-zinc-700 z-10">
                    <tr className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                      <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                        Time
                      </th>
                      <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                        Operation
                      </th>
                      <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                        Record
                      </th>
                      <th scope="col" className="py-2.5 px-3">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70 text-xs">
                    {filteredAudit.map((log) => {
                      const actionLower = (log.action || '').toLowerCase();
                      const isPositive =
                        actionLower.includes('created') ||
                        actionLower.includes('confirmed') ||
                        actionLower.includes('dispatched') ||
                        actionLower.includes('issued') ||
                        actionLower.includes('cleared') ||
                        actionLower.includes('return');
                      const isNegative =
                        actionLower.includes('voided') ||
                        actionLower.includes('bounced') ||
                        actionLower.includes('cancelled');

                      const badgeStyle = isPositive
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                        : isNegative
                        ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                        : 'bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700';

                      const targetTab = routeEntityToTab(log.entityType || '');
                      const entityLabel = `${log.entityType || 'Record'}${
                        log.entityId !== null && log.entityId !== undefined ? ` #${log.entityId}` : ''
                      }`;

                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                        >
                          <td className="py-3 px-3 font-mono text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {formatDate(log.at)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md font-mono font-medium text-xs border ${badgeStyle}`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onNavigate(targetTab)}
                              className="inline-flex items-center gap-1 font-semibold text-zinc-800 dark:text-zinc-200 hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 rounded px-1 py-0.5 cursor-pointer"
                              aria-label={`Inspect ${entityLabel}`}
                            >
                              <span className="capitalize">{log.entityType}</span>
                              {log.entityId !== null && log.entityId !== undefined && (
                                <span className="font-mono text-zinc-500 dark:text-zinc-400">
                                  #{log.entityId}
                                </span>
                              )}
                              <ArrowUpRight size={12} className="text-zinc-400" />
                            </button>
                          </td>
                          <td className="py-3 px-3 min-w-[200px]">
                            {renderAuditDetails(log.detail)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── FLOOR & LEDGER SHORTCUTS ── */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <h2
          id="quick-actions-heading"
          className="text-base font-bold text-zinc-900 dark:text-zinc-100"
        >
          Factory Floor & Ledger Shortcuts
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => onNavigate('cutting')}
            className="group p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex items-center justify-between text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                <Scissors size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Cutting Room Ledger
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Raw cuts & finished transfers
                </p>
              </div>
            </div>
            <ArrowUpRight
              size={16}
              className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors shrink-0"
            />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('returns')}
            className="group p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex items-center justify-between text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                <Undo2 size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Goods Returns (चलन फिर्ता)
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Restock & void-and-reissue bills
                </p>
              </div>
            </div>
            <ArrowUpRight
              size={16}
              className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors shrink-0"
            />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('earnings')}
            className="group p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex items-center justify-between text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                <Users size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Tailor Piece-Rate Wages
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Monthly production payouts
                </p>
              </div>
            </div>
            <ArrowUpRight
              size={16}
              className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors shrink-0"
            />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('catalogue')}
            className="group p-4 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition flex items-center justify-between text-left shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                <Layers size={18} />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Catalogue & Price Rules
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Styles, size overrides & clients
                </p>
              </div>
            </div>
            <ArrowUpRight
              size={16}
              className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors shrink-0"
            />
          </button>
        </div>
      </section>
    </div>
  );
};
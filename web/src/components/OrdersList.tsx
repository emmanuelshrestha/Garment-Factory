import React, { useState, useEffect } from 'react';
import { api, type Order, type Invoice, type Customer, formatMoney, formatDate } from '../api.ts';
import { downloadCSV } from '../utils/csv.ts';

interface OrdersListProps {
  orders: Order[];
  customers: Customer[];
  invoices: Invoice[];
  onRefresh: () => void;
  onCreateDelivery: (order: Order) => void;
}

export const OrdersList: React.FC<OrdersListProps> = ({
  orders,
  customers,
  invoices,
  onRefresh,
  onCreateDelivery,
}) => {
  // Modal state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [loadingFilters, setLoadingFilters] = useState<boolean>(false);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>(orders);

  // Keep filteredOrders in sync when parent refreshes
  useEffect(() => {
    setFilteredOrders(orders);
  }, [orders]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const applyFilters = async () => {
    setLoadingFilters(true);
    setError(null);
    try {
      const { orders: filtered } = await api.getOrders({
        customerId: filterCustomerId ? Number(filterCustomerId) : undefined,
        fromDate: filterFrom || undefined,
        toDate: filterTo || undefined,
      });
      setFilteredOrders(filtered);
    } catch (err: any) {
      setError(err.message || 'Failed to filter orders');
    } finally {
      setLoadingFilters(false);
    }
  };

  const clearFilters = async () => {
    setFilterCustomerId('');
    setFilterFrom('');
    setFilterTo('');
    setFilteredOrders(orders);
  };

  const handleExport = () => {
    const headers = ['Order No', 'Order Date', 'Customer', 'Status', 'Total Pieces', 'Total Amount', 'Currency'];
    const data = filteredOrders.map(o => [
      o.orderNo,
      o.orderDate,
      o.customerName,
      o.status,
      (o.lines ?? []).reduce((s, l) => s + l.qtyOrdered, 0),
      (o.totalMinor / 100).toFixed(2),
      o.currency,
    ]);
    downloadCSV(`orders_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const handlePrintInvoice = async (orderId: number) => {
    const invoice = invoices.find(i => i.orderId === orderId && i.status === 'issued');
    if (!invoice) {
      alert('No issued invoice found for this order.');
      return;
    }
    try {
      const { invoice: fullInvoice } = await api.getInvoice(invoice.id);
      setPrintInvoice(fullInvoice);
    } catch {
      alert('Failed to load invoice details.');
    }
  };

  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !cancelReason.trim()) return;
    setActionLoading(true);
    setError(null);
    try {
      await api.cancelOrder(selectedOrder.id, cancelReason.trim());
      setShowCancelModal(false);
      setCancelReason('');
      setSelectedOrder(null);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel order');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: Order['status']) => {
    switch (status) {
      case 'draft':             return 'bg-slate-100 text-slate-700';
      case 'confirmed':         return 'bg-blue-100 text-blue-800';
      case 'partially_delivered': return 'bg-amber-100 text-amber-800';
      case 'delivered':         return 'bg-emerald-100 text-emerald-800';
      case 'closed':            return 'bg-slate-800 text-white';
      case 'cancelled':         return 'bg-red-100 text-red-800 line-through';
      default:                  return 'bg-slate-100 text-slate-700';
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Customer */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Customer</label>
            <select
              value={filterCustomerId}
              onChange={e => setFilterCustomerId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none"
            >
              <option value="">All Customers</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Order Date From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={e => setFilterFrom(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* To Date */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Order Date To</label>
            <input
              type="date"
              value={filterTo}
              onChange={e => setFilterTo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              disabled={loadingFilters}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-50"
            >
              {loadingFilters ? 'Filtering…' : '🔍 Apply Filter'}
            </button>
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
            >
              ✕ Clear
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
            >
              ⬇ Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Orders Table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-extrabold text-base text-slate-900">Orders List</h3>
          <span className="text-xs text-slate-500">{filteredOrders.length} orders</span>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Pieces</th>
                <th className="py-3 px-4 text-right">Shortage</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">
                    No orders found.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => {
                  const lines = ord.lines ?? [];
                  const totalPieces = lines.reduce((s, l) => s + l.qtyOrdered, 0);
                  const totalShortage = lines.reduce((s, l) => s + ((l as any).qtyShortage ?? 0), 0);
                  const isDeliverable = ord.status === 'confirmed' || ord.status === 'partially_delivered';

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-blue-800 text-xs">{ord.orderNo}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{formatDate(ord.orderDate)}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{ord.customerName}</td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${getStatusBadge(ord.status)}`}>
                          {ord.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-800">{totalPieces}</td>
                      <td className="py-3 px-4 text-right">
                        {totalShortage > 0 ? (
                          <span className="text-amber-600 font-bold text-xs">{totalShortage}</span>
                        ) : (
                          <span className="text-emerald-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatMoney(ord.totalMinor, ord.currency)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {isDeliverable && (
                            <button
                              onClick={async () => {
                                setActionLoading(true);
                                try {
                                  const { order: fullOrder } = await api.getOrder(ord.id);
                                  onCreateDelivery(fullOrder);
                                } catch (err) {
                                  alert('Failed to load order details for dispatch.');
                                } finally {
                                  setActionLoading(false);
                                }
                              }}
                              disabled={actionLoading}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                            >
                              {actionLoading ? 'Loading...' : 'Dispatch →'}
                            </button>
                          )}
                          {invoices.some(i => i.orderId === ord.id && i.status === 'issued') && (
                            <button
                              onClick={() => handlePrintInvoice(ord.id)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold"
                            >
                              🖨 Print Bill
                            </button>
                          )}
                          {(ord.status === 'draft' || ord.status === 'confirmed') && (
                            <button
                              onClick={() => { setSelectedOrder(ord); setShowCancelModal(true); setError(null); }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 rounded-lg text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Cancel Order Modal ───────────────────────────────────────────────── */}
      {showCancelModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900">Cancel Order {selectedOrder.orderNo}</h4>
                <p className="text-xs text-slate-500 mt-0.5">Releases all active stock reservations back to inventory.</p>
              </div>
              <button onClick={() => setShowCancelModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleCancelOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Cancellation (Required):</label>
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="e.g. Customer cancelled order"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:border-blue-600 focus:outline-none"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowCancelModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Back</button>
                <button type="submit" disabled={actionLoading} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
                  {actionLoading ? 'Cancelling…' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Print Invoice Modal ──────────────────────────────────────────────── */}
      {printInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="font-bold text-sm text-slate-600">Commercial Invoice</span>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">🖨 Print</button>
                <button onClick={() => setPrintInvoice(null)} className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Close</button>
              </div>
            </div>
            <div className="space-y-5 text-slate-900">
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-2xl font-black tracking-tight">GARMENT FACTORY</h1>
                  <p className="text-xs text-slate-500">Jacket & Apparel Manufacturing</p>
                </div>
                <div className="text-right">
                  <span className="text-base font-mono font-black text-blue-900 block">{printInvoice.invoiceNo}</span>
                  <span className="text-xs text-slate-500 block">Date: {formatDate(printInvoice.invoiceDate)}</span>
                  {printInvoice.dueDate && <span className="text-xs font-bold text-slate-700 block">Due: {formatDate(printInvoice.dueDate)}</span>}
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl flex justify-between text-xs">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Bill To</span>
                  <span className="font-extrabold text-sm text-slate-900 block mt-0.5">{printInvoice.customerName}</span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 font-bold uppercase text-[10px] block">Currency</span>
                  <span className="font-extrabold text-sm text-slate-900 block mt-0.5">{printInvoice.currency}</span>
                </div>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-slate-500 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3 text-right">Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(printInvoice.lines ?? []).map(l => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3 font-semibold">{l.description}</td>
                      <td className="py-2.5 px-3 text-right font-bold">{l.qty}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{formatMoney(l.unitPriceMinor, printInvoice.currency)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">{formatMoney(l.lineTotalMinor, printInvoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-900">
                  <tr>
                    <td colSpan={3} className="py-2 px-3 text-right font-bold">Subtotal</td>
                    <td className="py-2 px-3 text-right font-mono font-bold">{formatMoney(printInvoice.subtotalMinor, printInvoice.currency)}</td>
                  </tr>
                  {printInvoice.discountMinor > 0 && (
                    <tr>
                      <td colSpan={3} className="py-1 px-3 text-right text-red-600">Discount ({printInvoice.discountReason})</td>
                      <td className="py-1 px-3 text-right font-mono font-bold text-red-600">-{formatMoney(printInvoice.discountMinor, printInvoice.currency)}</td>
                    </tr>
                  )}
                  <tr className="font-black text-sm bg-slate-100">
                    <td colSpan={3} className="py-3 px-3 text-right">Grand Total</td>
                    <td className="py-3 px-3 text-right font-mono">{formatMoney(printInvoice.totalMinor, printInvoice.currency)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="pt-6 text-center text-xs text-slate-400">
                Thank you for your business • Authorized Signature: _______________________
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

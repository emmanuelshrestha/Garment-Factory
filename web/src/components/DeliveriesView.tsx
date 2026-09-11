import React, { useState, useEffect } from 'react';
import { api, type Delivery, type Order, type Customer, formatDate } from '../api';
import { downloadCSV } from '../utils/csv.ts';

interface DeliveriesViewProps {
  deliveries: Delivery[];
  orders: Order[];
  customers: Customer[];
  onRefresh: () => void;
  selectedOrderForDispatch?: Order | null;
  onClearSelectedOrder?: () => void;
}

export const DeliveriesView: React.FC<DeliveriesViewProps> = ({
  deliveries,
  customers,
  onRefresh,
  selectedOrderForDispatch,
  onClearSelectedOrder,
}) => {
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [dispatchLines, setDispatchLines] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [printDelivery, setPrintDelivery] = useState<Delivery | null>(null);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [filteredDeliveries, setFilteredDeliveries] = useState<Delivery[]>(deliveries);

  useEffect(() => { setFilteredDeliveries(deliveries); }, [deliveries]);

  const applyFilters = () => {
    let result = deliveries;
    if (filterCustomerId) {
      result = result.filter(d => String(d.customerId) === filterCustomerId);
    }
    if (filterFrom) {
      result = result.filter(d => (d.deliveredAt ?? '') >= filterFrom);
    }
    if (filterTo) {
      result = result.filter(d => (d.deliveredAt ?? '') <= filterTo + 'T23:59:59');
    }
    setFilteredDeliveries(result);
  };

  const clearFilters = () => {
    setFilterCustomerId('');
    setFilterFrom('');
    setFilterTo('');
    setFilteredDeliveries(deliveries);
  };

  const handleExport = () => {
    const headers = ['Delivery #', 'Dispatched Date', 'Order #', 'Customer', 'Status', 'Total Qty'];
    const data = filteredDeliveries.map(d => [
      d.deliveryNo,
      d.deliveredAt ? d.deliveredAt.split('T')[0] : '',
      d.orderNo,
      d.customerName,
      d.status,
      d.totalQty,
    ]);
    downloadCSV(`deliveries_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const openCreateForOrder = (ord: Order) => {
    const initialQuantities: Record<number, number> = {};
    (ord.lines ?? []).forEach((l) => {
      const remaining = l.qtyOrdered - l.qtyDelivered;
      if (remaining > 0) initialQuantities[l.id] = remaining;
    });
    setDispatchLines(initialQuantities);
    setError(null);
    setShowDispatchModal(true);
  };

  const handleCreateAndDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const order = selectedOrderForDispatch;
    if (!order) return;
    const lines = Object.entries(dispatchLines)
      .map(([olId, qty]) => ({ orderLineId: Number(olId), qty }))
      .filter((l) => l.qty > 0);
    if (lines.length === 0) { setError('Please specify at least one piece to deliver.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const { delivery } = await api.createDelivery({ orderId: order.id, lines });
      const dispatchedResult = await api.dispatchDelivery(delivery.id);
      setShowDispatchModal(false);
      if (onClearSelectedOrder) onClearSelectedOrder();
      onRefresh();
      setPrintDelivery(dispatchedResult.delivery);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch delivery');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-lg text-slate-900">Deliveries & Dispatch</h3>
          <p className="text-xs text-slate-500 mt-0.5">Physical stock shipments. Dispatching writes outward movements to the ledger.</p>
        </div>
        {selectedOrderForDispatch && (
          <button onClick={() => openCreateForOrder(selectedOrderForDispatch)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition">
            + Dispatch for Order {selectedOrderForDispatch.orderNo}
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Customer</label>
            <select value={filterCustomerId} onChange={e => setFilterCustomerId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none">
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Dispatch Date From</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Dispatch Date To</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl">🔍 Apply Filter</button>
            <button onClick={clearFilters} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">✕ Clear</button>
            <button onClick={handleExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl">⬇ Export CSV</button>
          </div>
        </div>
      </div>

      {/* Deliveries Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="font-extrabold text-sm text-slate-900">Dispatched Deliveries</h4>
          <span className="text-xs text-slate-500">{filteredDeliveries.length} deliveries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
              <tr>
                <th className="py-3 px-4">Delivery #</th>
                <th className="py-3 px-4">Dispatched</th>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Total Qty</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDeliveries.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-xs">No deliveries found.</td></tr>
              ) : (
                filteredDeliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-xs text-blue-900">{d.deliveryNo}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{d.deliveredAt ? formatDate(d.deliveredAt.split('T')[0]) : '—'}</td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">{d.orderNo}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{d.customerName}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${d.status === 'dispatched' ? 'bg-emerald-100 text-emerald-800' : d.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold">{d.totalQty} pcs</td>
                    <td className="py-3 px-4 text-center">
                      {d.status === 'dispatched' && (
                        <button onClick={() => setPrintDelivery(d)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold">🖨 Print Slip</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispatch Modal */}
      {showDispatchModal && selectedOrderForDispatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900">Dispatch for Order {selectedOrderForDispatch.orderNo}</h4>
                <p className="text-xs text-slate-500 mt-0.5">Set quantities to dispatch. Dispatching writes outward stock movements.</p>
              </div>
              <button onClick={() => setShowDispatchModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleCreateAndDispatch} className="space-y-3">
              {(selectedOrderForDispatch.lines ?? []).filter(l => l.qtyOrdered - l.qtyDelivered > 0).map(l => (
                <div key={l.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <span className="text-xs font-bold text-slate-800">{l.productName} — {l.colour} / {l.size}</span>
                    <span className="text-[10px] text-slate-500 block">Remaining: {l.qtyOrdered - l.qtyDelivered} pcs</span>
                  </div>
                  <input
                    type="number" min="0" max={l.qtyOrdered - l.qtyDelivered}
                    value={dispatchLines[l.id] ?? 0}
                    onChange={e => setDispatchLines(prev => ({ ...prev, [l.id]: Number(e.target.value) }))}
                    className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-sm font-bold text-right"
                  />
                </div>
              ))}
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowDispatchModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                  {submitting ? 'Dispatching…' : 'Confirm Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Slip Modal */}
      {printDelivery && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="font-bold text-sm text-slate-600">Packing / Delivery Slip</span>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">🖨 Print</button>
                <button onClick={() => setPrintDelivery(null)} className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Close</button>
              </div>
            </div>
            <div className="space-y-4 text-slate-900">
              <div className="flex justify-between border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-2xl font-black">GARMENT FACTORY</h1>
                  <p className="text-xs text-slate-500">Jacket & Apparel Manufacturing</p>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-blue-900 block">{printDelivery.deliveryNo}</span>
                  <span className="text-xs text-slate-500 block">Order: {printDelivery.orderNo}</span>
                  {printDelivery.deliveredAt && <span className="text-xs text-slate-500 block">{formatDate(printDelivery.deliveredAt.split('T')[0])}</span>}
                </div>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl text-xs">
                <span className="text-slate-400 font-bold uppercase text-[10px] block">Deliver To</span>
                <span className="font-extrabold text-sm text-slate-900 block mt-0.5">{printDelivery.customerName}</span>
              </div>
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300 text-slate-500 uppercase text-[10px]">
                    <th className="py-2 px-3">Product</th>
                    <th className="py-2 px-3">Colour</th>
                    <th className="py-2 px-3">Size</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(printDelivery.lines ?? []).map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 px-3 font-semibold">{l.productName}</td>
                      <td className="py-2.5 px-3">{l.colour}</td>
                      <td className="py-2.5 px-3 font-bold">{l.size}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">{l.qty} pcs</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 font-extrabold text-sm">
                    <td colSpan={3} className="py-3 px-3">Total Garments Dispatched</td>
                    <td className="py-3 px-3 text-right">{printDelivery.totalQty} pcs</td>
                  </tr>
                </tfoot>
              </table>
              <div className="grid grid-cols-2 gap-8 pt-6 text-center text-xs text-slate-500">
                <div className="border-t border-slate-300 pt-2">Dispatched By (Factory)</div>
                <div className="border-t border-slate-300 pt-2">Received By (Customer)</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

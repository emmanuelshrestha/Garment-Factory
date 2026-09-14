import React, { useState, useEffect } from 'react';
import { api, type Invoice, type BillableDeliveryLine, type Customer, formatMoney, formatDate } from '../api.ts';
import { downloadCSV } from '../utils/csv.ts';

interface InvoicesViewProps {
  invoices: Invoice[];
  customers: Customer[];
  onRefresh: () => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({ invoices, customers, onRefresh }) => {
  const [billableLines, setBillableLines] = useState<BillableDeliveryLine[]>([]);
  const [_loadingBillable, setLoadingBillable] = useState<boolean>(false);
  const [showBillingModal, setShowBillingModal] = useState<boolean>(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [discountRupees, setDiscountRupees] = useState<string>('');
  // Discount entered in rupees; converted to minor units (paisa) on submit.
  const discountMinor = Math.round((parseFloat(discountRupees) || 0) * 100);
  const [discountReason, setDiscountReason] = useState<string>('');
  const [showVoidModal, setShowVoidModal] = useState<boolean>(false);
  const [voidInvoiceId, setVoidInvoiceId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState<string>('');
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>(invoices);

  useEffect(() => { setFilteredInvoices(invoices); }, [invoices]);

  const applyFilters = () => {
    let result = invoices;
    if (filterCustomerId) result = result.filter(i => String(i.customerId) === filterCustomerId);
    if (filterStatus) result = result.filter(i => i.status === filterStatus);
    if (filterFrom) result = result.filter(i => i.invoiceDate >= filterFrom);
    if (filterTo) result = result.filter(i => i.invoiceDate <= filterTo);
    setFilteredInvoices(result);
  };

  const clearFilters = () => {
    setFilterCustomerId(''); setFilterStatus(''); setFilterFrom(''); setFilterTo('');
    setFilteredInvoices(invoices);
  };

  const handleExport = () => {
    const headers = ['Invoice #', 'Invoice Date', 'Due Date', 'Customer', 'Status', 'Subtotal', 'Discount', 'Total', 'Currency'];
    const data = filteredInvoices.map(i => [
      i.invoiceNo, i.invoiceDate, i.dueDate ?? '', i.customerName, i.status,
      (i.subtotalMinor / 100).toFixed(2), (i.discountMinor / 100).toFixed(2),
      (i.totalMinor / 100).toFixed(2), i.currency,
    ]);
    downloadCSV(`invoices_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const fetchBillables = async () => {
    setLoadingBillable(true);
    try { const res = await api.getBillableDeliveries(); setBillableLines(res.lines); }
    catch (err) { console.error('Failed to load billable deliveries:', err); }
    finally { setLoadingBillable(false); }
  };

  useEffect(() => { fetchBillables(); }, [invoices]);

  const billableDeliveriesMap = new Map<number, { deliveryNo: string; customerName: string; currency: string; totalMinor: number; lines: BillableDeliveryLine[] }>();
  billableLines.forEach((l) => {
    const existing = billableDeliveriesMap.get(l.deliveryId) || { deliveryNo: l.deliveryNo, customerName: l.customerName, currency: l.currency, totalMinor: 0, lines: [] };
    existing.totalMinor += l.lineTotalMinor;
    existing.lines.push(l);
    billableDeliveriesMap.set(l.deliveryId, existing);
  });

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeliveryId) return;
    if (discountMinor > 0 && !discountReason.trim()) { setError('A reason is required whenever a discount is applied.'); return; }
    setSubmitting(true); setError(null);
    try {
      await api.createInvoiceForDelivery(selectedDeliveryId, { invoiceDate, dueDate: dueDate || undefined, discountMinor: discountMinor > 0 ? discountMinor : undefined, discountReason: discountReason.trim() || undefined });
      setShowBillingModal(false); setSelectedDeliveryId(null); setDiscountRupees(''); setDiscountReason('');
      onRefresh(); fetchBillables();
    } catch (err: any) { setError(err.message || 'Failed to create invoice'); }
    finally { setSubmitting(false); }
  };

  const handleVoidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidInvoiceId || !voidReason.trim()) return;
    setSubmitting(true); setError(null);
    try {
      await api.voidInvoice(voidInvoiceId, voidReason.trim());
      setShowVoidModal(false); setVoidInvoiceId(null); setVoidReason('');
      onRefresh();
    } catch (err: any) { setError(err.message || 'Failed to void invoice'); }
    finally { setSubmitting(false); }
  };

  const handlePrint = async (inv: Invoice) => {
    try { const { invoice: full } = await api.getInvoice(inv.id); setPrintInvoice(full); }
    catch { alert('Failed to load invoice for printing.'); }
  };

  const statusBadge = (s: Invoice['status']) =>
    s === 'issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : s === 'void' ? 'bg-red-50 text-red-600 border-red-200 line-through' : 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-lg text-slate-900">Invoices & Billing</h3>
          <p className="text-xs text-slate-500 mt-0.5">Issued invoices are immutable. Corrections via void-and-reissue only.</p>
        </div>
        <button onClick={() => { setShowBillingModal(true); setError(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm">
          + Create Invoice
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Customer</label>
            <select value={filterCustomerId} onChange={e => setFilterCustomerId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none">
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none">
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="void">Void</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Invoice Date From</label>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-bold text-slate-600 mb-1">Invoice Date To</label>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl">Apply</button>
            <button onClick={clearFilters} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">✕ Clear</button>
            <button onClick={handleExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl">Export CSV</button>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h4 className="font-extrabold text-sm text-slate-900">Invoice Ledger</h4>
          <span className="text-xs text-slate-500">{filteredInvoices.length} invoices</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Invoice #</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Date</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Customer</th>
                <th className="py-2.5 px-4 text-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">Status</th>
                <th className="py-2.5 px-4 text-right text-[11px] uppercase tracking-wider text-slate-500 font-medium">Total</th>
                <th className="py-2.5 px-4 text-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-slate-400 text-xs">No invoices found.</td></tr>
              ) : (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-xs text-blue-900">{inv.invoiceNo}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{inv.customerName}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadge(inv.status)}`}>{inv.status.toUpperCase()}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">{formatMoney(inv.totalMinor, inv.currency)}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center gap-1 flex-wrap">
                        {inv.status === 'issued' && (
                          <>
                            <button onClick={() => handlePrint(inv)} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">Print</button>
                            <button onClick={() => { setVoidInvoiceId(inv.id); setShowVoidModal(true); setError(null); }} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold">Void</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Invoice Modal */}
      {showBillingModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900">Create Invoice from Delivery</h4>
                <p className="text-xs text-slate-500 mt-0.5">Select a dispatched, unbilled delivery to invoice.</p>
              </div>
              <button onClick={() => setShowBillingModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            {billableDeliveriesMap.size === 0 ? (
              <p className="text-sm text-slate-500 py-4 text-center">No unbilled dispatched deliveries found.</p>
            ) : (
              <form onSubmit={handleCreateInvoice} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Select Delivery</label>
                  <select value={selectedDeliveryId ?? ''} onChange={e => setSelectedDeliveryId(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold" required>
                    <option value="">— Select —</option>
                    {Array.from(billableDeliveriesMap.entries()).map(([dId, d]) => (
                      <option key={dId} value={dId}>{d.deliveryNo} — {d.customerName} ({formatMoney(d.totalMinor, d.currency as any)})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Invoice Date</label>
                    <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Due Date (Optional)</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Discount (Rupees)</label>
                    <input type="number" step="0.01" min="0" value={discountRupees} onChange={e => setDiscountRupees(e.target.value)} placeholder="e.g. 500" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Discount Reason</label>
                    <input type="text" value={discountReason} onChange={e => setDiscountReason(e.target.value)} placeholder="Required if discount > 0" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                  <button type="button" onClick={() => setShowBillingModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                  <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                    {submitting ? 'Creating…' : 'Create & Issue Invoice'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Void Invoice Modal */}
      {showVoidModal && voidInvoiceId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900">Void Invoice</h4>
                <p className="text-xs text-slate-500 mt-0.5">The invoice will be marked void. Re-issue a corrected one after.</p>
              </div>
              <button onClick={() => setShowVoidModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleVoidInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Voiding (Required)</label>
                <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} rows={3} placeholder="Why is this invoice being voided?" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" required />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowVoidModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">
                  {submitting ? 'Voiding…' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Invoice Modal */}
      {printInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="font-bold text-sm text-slate-600">Commercial Invoice</span>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">Print</button>
                <button onClick={() => setPrintInvoice(null)} className="px-3 py-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold">Close</button>
              </div>
            </div>
            <div className="space-y-5 text-slate-900">
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-2xl font-black">GARMENT FACTORY</h1>
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
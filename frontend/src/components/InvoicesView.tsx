import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Printer, AlertTriangle, PlusCircle
} from 'lucide-react';
import { api, type Invoice, type BillableDeliveryLine, type Customer, formatMoney, formatDate } from '../api.ts';
import { downloadCSV } from '../utils/csv.ts';

interface InvoicesViewProps {
  invoices: Invoice[];
  customers: Customer[];
  onRefresh: () => void;
}

/**
 * Isolated A4 Multi-Page Print Engine for Invoices.
 * Guarantees pure white background and natural pagination regardless of dark mode.
 */
function printDocumentContent(title: string, htmlContent: string) {
  let iframe = document.getElementById('garment-invoice-print-iframe') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'garment-invoice-print-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
  }

  const doc = iframe.contentWindow?.document;
  if (!doc) return;

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm 15mm 15mm;
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        html, body {
          background-color: #ffffff !important;
          color: #000000 !important;
          color-scheme: light !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 11px;
          line-height: 1.45;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          page-break-inside: auto;
        }
        thead {
          display: table-header-group !important;
        }
        tfoot {
          display: table-footer-group !important;
        }
        tr {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .page-break-avoid {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        th, td {
          padding: 6px 8px;
          border-bottom: 1px solid #d1d5db;
        }
        th {
          background-color: #f3f4f6 !important;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.05em;
          border-bottom: 2px solid #000000;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 250);
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({ invoices, customers, onRefresh }) => {
  const [billableLines, setBillableLines] = useState<BillableDeliveryLine[]>([]);
  const [_loadingBillable, setLoadingBillable] = useState<boolean>(false);
  const [showBillingModal, setShowBillingModal] = useState<boolean>(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<number | null>(null);
  
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState<string>('');
  const [discountRupees, setDiscountRupees] = useState<string>('');
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredInvoices, setFilteredInvoices] = useState<Invoice[]>(invoices);

  useEffect(() => { 
    setFilteredInvoices(invoices); 
  }, [invoices]);

  const applyFilters = () => {
    let result = invoices;
    if (filterCustomerId) result = result.filter(i => String(i.customerId) === filterCustomerId);
    if (filterStatus) result = result.filter(i => i.status === filterStatus);
    if (filterFrom) result = result.filter(i => i.invoiceDate >= filterFrom);
    if (filterTo) result = result.filter(i => i.invoiceDate <= filterTo);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => 
        i.invoiceNo.toLowerCase().includes(q) ||
        i.customerName.toLowerCase().includes(q)
      );
    }
    setFilteredInvoices(result);
  };

  const clearFilters = () => {
    setFilterCustomerId(''); 
    setFilterStatus(''); 
    setFilterFrom(''); 
    setFilterTo('');
    setSearchQuery('');
    setFilteredInvoices(invoices);
  };

  const handleExport = () => {
    const headers = ['Invoice #', 'Invoice Date', 'Due Date', 'Customer', 'Status', 'Subtotal', 'Discount', 'Total', 'Currency'];
    const data = filteredInvoices.map(i => [
      i.invoiceNo, 
      i.invoiceDate, 
      i.dueDate ?? 'Undefined', 
      i.customerName, 
      i.status,
      (i.subtotalMinor / 100).toFixed(2), 
      (i.discountMinor / 100).toFixed(2),
      (i.totalMinor / 100).toFixed(2), 
      i.currency,
    ]);
    downloadCSV(`commercial_invoices_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const fetchBillables = async () => {
    setLoadingBillable(true);
    try { 
      const res = await api.getBillableDeliveries(); 
      setBillableLines(res.lines); 
    } catch (err) { 
      console.error('Failed to load billable deliveries:', err); 
    } finally { 
      setLoadingBillable(false); 
    }
  };

  useEffect(() => { 
    fetchBillables(); 
  }, [invoices]);

  const billableDeliveriesMap = useMemo(() => {
    const map = new Map<number, { deliveryNo: string; customerName: string; currency: string; totalMinor: number; totalQty: number; lines: BillableDeliveryLine[] }>();
    billableLines.forEach((l) => {
      const existing = map.get(l.deliveryId) || { 
        deliveryNo: l.deliveryNo, 
        customerName: l.customerName, 
        currency: l.currency, 
        totalMinor: 0, 
        totalQty: 0,
        lines: [] 
      };
      existing.totalMinor += l.lineTotalMinor;
      existing.totalQty += l.qty;
      existing.lines.push(l);
      map.set(l.deliveryId, existing);
    });
    return map;
  }, [billableLines]);

  const setPaymentTermDays = (days: number) => {
    const base = invoiceDate ? new Date(invoiceDate) : new Date();
    base.setDate(base.getDate() + days);
    setDueDate(base.toISOString().split('T')[0]);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeliveryId) return;
    if (discountMinor > 0 && !discountReason.trim()) { 
      setError('A reason is required whenever a discount is applied.'); 
      return; 
    }
    setSubmitting(true); 
    setError(null);
    try {
      await api.createInvoiceForDelivery(
        selectedDeliveryId, 
        { 
          invoiceDate, 
          dueDate: dueDate || undefined, 
          discountMinor: discountMinor > 0 ? discountMinor : undefined, 
          discountReason: discountReason.trim() || undefined 
        }
      );
      setShowBillingModal(false); 
      setSelectedDeliveryId(null); 
      setDiscountRupees(''); 
      setDiscountReason('');
      onRefresh(); 
      fetchBillables();
    } catch (err: any) { 
      setError(err.message || 'Failed to create invoice'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleVoidInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidInvoiceId || !voidReason.trim()) return;
    setSubmitting(true); 
    setError(null);
    try {
      await api.voidInvoice(voidInvoiceId, voidReason.trim());
      setShowVoidModal(false); 
      setVoidInvoiceId(null); 
      setVoidReason('');
      onRefresh();
    } catch (err: any) { 
      setError(err.message || 'Failed to void invoice'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handlePrint = async (inv: Invoice) => {
    try { 
      const { invoice: full } = await api.getInvoice(inv.id); 
      setPrintInvoice(full); 
    } catch { 
      alert('Failed to load invoice details for printing.'); 
    }
  };

  const handleExecutePrintInvoice = () => {
    const el = document.getElementById('invoice-printable-doc');
    if (el) {
      printDocumentContent(`Tax_Invoice_${printInvoice?.invoiceNo || 'Bill'}`, el.innerHTML);
    }
  };

  const invoiceMetrics = useMemo(() => {
    let totalBilled = 0;
    let issuedCount = 0;
    filteredInvoices.forEach(i => {
      if (i.status === 'issued') {
        totalBilled += i.totalMinor;
        issuedCount++;
      }
    });
    return { totalBilled, issuedCount, totalInvoices: filteredInvoices.length };
  }, [filteredInvoices]);

  const selectedDeliveryInfo = selectedDeliveryId ? billableDeliveriesMap.get(selectedDeliveryId) : null;

  return (
    <div className="space-y-4 font-sans">
      {/* Top Banner */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText size={20} className="text-blue-600 dark:text-blue-400" />
            <span>Commercial Invoicing & Accounts Receivable</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Issue immutable sales invoices from delivered stock challans. Automatic customer credit ledger integration[cite: 10].
          </p>
        </div>

        <button 
          onClick={() => { setShowBillingModal(true); setError(null); }} 
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
        >
          <PlusCircle size={14} />
          <span>Create Invoice</span>
        </button>
      </div>

      {/* Aggregate Metrics Bar */}
      <div className="grid grid-cols-3 gap-3 text-xs font-mono">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Invoices Issued</span>
          <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
            {invoiceMetrics.issuedCount} Active Bills
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-emerald-600 uppercase font-sans font-bold block">Total Billed Revenue</span>
          <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
            {formatMoney(invoiceMetrics.totalBilled)}
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-sans font-bold block">Unbilled Deliveries</span>
          <span className="text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5 block">
            {billableDeliveriesMap.size} Pending
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Customer</label>
            <select 
              value={filterCustomerId} 
              onChange={e => setFilterCustomerId(e.target.value)} 
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none cursor-pointer" 
            >
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-[130px]">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Status</label>
            <select 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)} 
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none cursor-pointer" 
            >
              <option value="">All Statuses</option>
              <option value="issued">Issued</option>
              <option value="draft">Draft</option>
              <option value="void">Void</option>
            </select>
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Invoice Date From</label>
            <input 
              type="date" 
              value={filterFrom} 
              onChange={e => setFilterFrom(e.target.value)} 
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
            />
          </div>

          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Invoice Date To</label>
            <input 
              type="date" 
              value={filterTo} 
              onChange={e => setFilterTo(e.target.value)} 
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer">Apply</button>
            <button onClick={clearFilters} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer">✕ Clear</button>
            <button onClick={handleExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer">Export CSV</button>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">Commercial Invoices</h4>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{filteredInvoices.length} invoices</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
              <tr>
                <th className="py-2.5 px-3 sm:px-4">Invoice #</th>
                <th className="py-2.5 px-3 sm:px-4">Billing Date</th>
                <th className="py-2.5 px-3 sm:px-4">Payment Due</th>
                <th className="py-2.5 px-3 sm:px-4 min-w-[150px]">Customer</th>
                <th className="py-2.5 px-3 sm:px-4 text-center">Status</th>
                <th className="py-2.5 px-3 sm:px-4 text-right">Subtotal</th>
                <th className="py-2.5 px-3 sm:px-4 text-right">Discount</th>
                <th className="py-2.5 px-3 sm:px-4 text-right font-bold">Total Bill</th>
                <th className="py-2.5 px-3 sm:px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-sans">
                    No commercial invoices found.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3 sm:px-4 font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                      {inv.invoiceNo}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-slate-500 whitespace-nowrap">
                      {formatDate(inv.invoiceDate)}
                    </td>
                    <td className="py-3 px-3 sm:px-4 whitespace-nowrap">
                      {inv.dueDate ? (
                        <span className="text-slate-600 dark:text-slate-300 font-medium">
                          {formatDate(inv.dueDate)}
                        </span>
                      ) : (
                        <span className="text-[10px] font-sans font-semibold text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          Undefined
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 sm:px-4 font-sans font-bold text-slate-900 dark:text-slate-100">
                      {inv.customerName}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-center font-sans whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        inv.status === 'issued' 
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                          : inv.status === 'void' 
                          ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 line-through' 
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                      }`}>
                        {inv.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right text-slate-700 dark:text-slate-300">
                      {formatMoney(inv.subtotalMinor, inv.currency)}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right text-amber-600 dark:text-amber-400">
                      {inv.discountMinor > 0 ? `-${formatMoney(inv.discountMinor, inv.currency)}` : '—'}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {formatMoney(inv.totalMinor, inv.currency)}
                    </td>
                    <td className="py-3 px-3 sm:px-4 text-center font-sans">
                      <div className="flex justify-center gap-1.5 flex-wrap">
                        {inv.status === 'issued' && (
                          <>
                            <button 
                              onClick={() => handlePrint(inv)} 
                              className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                            >
                              <Printer size={12} />
                              <span>Bill</span>
                            </button>
                            <button 
                              onClick={() => { setVoidInvoiceId(inv.id); setShowVoidModal(true); setError(null); }} 
                              className="px-2.5 py-1 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-xs font-semibold transition cursor-pointer"
                            >
                              Void
                            </button>
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
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  Generate Invoice from Dispatched Delivery
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Select a dispatched delivery challan to bill into the customer receivables ledger[cite: 10].
                </p>
              </div>
              <button 
                onClick={() => setShowBillingModal(false)} 
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {billableDeliveriesMap.size === 0 ? (
              <div className="py-8 text-center text-slate-500 dark:text-slate-400 space-y-2">
                <p className="text-sm font-semibold">No unbilled dispatched deliveries available.</p>
                <p className="text-xs text-slate-400">All current deliveries have already been invoiced.</p>
              </div>
            ) : (
              <form onSubmit={handleCreateInvoice} className="space-y-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Select Dispatched Delivery Challan *
                  </label>
                  <select 
                    value={selectedDeliveryId ?? ''} 
                    onChange={e => setSelectedDeliveryId(Number(e.target.value))} 
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-none cursor-pointer" 
                    required
                  >
                    <option value="">— Select Delivery Challan —</option>
                    {Array.from(billableDeliveriesMap.entries()).map(([dId, d]) => (
                      <option key={dId} value={dId}>
                        {d.deliveryNo} — {d.customerName} ({d.totalQty} pcs • {formatMoney(d.totalMinor, d.currency as any)})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedDeliveryInfo && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 font-mono">
                    <div className="flex justify-between text-xs">
                      <span className="font-sans text-slate-500">Party / Store:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{selectedDeliveryInfo.customerName}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="font-sans text-slate-500">Total Pieces Delivered:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{selectedDeliveryInfo.totalQty} pcs</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-slate-200 dark:border-slate-700 pt-1.5">
                      <span className="font-sans text-slate-500">Delivery Amount:</span>
                      <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                        {formatMoney(selectedDeliveryInfo.totalMinor, selectedDeliveryInfo.currency as any)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Invoice Billing Date
                    </label>
                    <input 
                      type="date" 
                      value={invoiceDate} 
                      onChange={e => setInvoiceDate(e.target.value)} 
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
                      required 
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="font-bold text-slate-700 dark:text-slate-300">
                        Payment Due Date
                      </label>
                      <div className="space-x-1 text-[10px] text-blue-600 dark:text-blue-400 font-bold">
                        <button 
                          type="button" 
                          onClick={() => setDueDate('')} 
                          className={`px-1.5 py-0.5 rounded cursor-pointer ${!dueDate ? 'bg-blue-600 text-white' : 'hover:underline'}`}
                          title="No set due date (rolling open khata)"
                        >
                          Undefined
                        </button>
                        <span>•</span>
                        <button type="button" onClick={() => setPaymentTermDays(0)} className="hover:underline cursor-pointer">Due Now</button>
                        <span>•</span>
                        <button type="button" onClick={() => setPaymentTermDays(15)} className="hover:underline cursor-pointer">+15d</button>
                        <span>•</span>
                        <button type="button" onClick={() => setPaymentTermDays(30)} className="hover:underline cursor-pointer">+30d</button>
                        <span>•</span>
                        <button type="button" onClick={() => setPaymentTermDays(60)} className="hover:underline cursor-pointer">+60d</button>
                      </div>
                    </div>
                    <input 
                      type="date" 
                      value={dueDate} 
                      onChange={e => setDueDate(e.target.value)} 
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
                    />
                    {!dueDate && (
                      <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                        Open Credit / Undefined Due Date
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Trade Discount / Concession (Rs.)
                    </label>
                    <input 
                      type="number" 
                      step="0.01" 
                      min="0" 
                      value={discountRupees} 
                      onChange={e => setDiscountRupees(e.target.value)} 
                      placeholder="e.g. 500.00" 
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono font-bold focus:border-blue-600 focus:outline-none" 
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      {'Discount Reason (Required if > 0)'}
                    </label>
                    <input 
                      type="text" 
                      value={discountReason} 
                      onChange={e => setDiscountReason(e.target.value)} 
                      placeholder="e.g. Volume discount, freight concession" 
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:border-blue-600 focus:outline-none" 
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button 
                    type="button" 
                    onClick={() => setShowBillingModal(false)} 
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting || !selectedDeliveryId} 
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-xs cursor-pointer"
                  >
                    {submitting ? 'Creating Invoice…' : 'Issue Invoice & Post to Ledger'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Void Invoice Modal */}
      {showVoidModal && voidInvoiceId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">Void Commercial Invoice</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  The invoice will be marked void in customer khata. A corrected one can be re-issued after[cite: 10].
                </p>
              </div>
              <button onClick={() => setShowVoidModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg p-1 cursor-pointer">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleVoidInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason for Voiding *</label>
                <textarea 
                  value={voidReason} 
                  onChange={e => setVoidReason(e.target.value)} 
                  rows={3} 
                  placeholder="Explain why this invoice is being voided (for audit log)..." 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:border-blue-600 focus:outline-none" 
                  required 
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowVoidModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition shadow-xs cursor-pointer">
                  {submitting ? 'Voiding…' : 'Confirm Void Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── PRISTINE WHITE INVOICE PREVIEW & ISOLATED MULTI-PAGE PRINT ENGINE ─── */}
      {printInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="relative max-w-3xl w-full my-auto flex flex-col items-center">
            
            {/* Top Toolbar */}
            <div className="w-full bg-slate-900 text-white px-5 py-3 rounded-t-2xl flex items-center justify-between border border-slate-700 shadow-lg">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-blue-400" />
                <span className="font-bold text-sm">Commercial Invoice Preview</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  ({printInvoice.lines?.length || 0} line items)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExecutePrintInvoice}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintInvoice(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Pristine White Sheet of Paper on Screen (Immune to App Dark Mode) */}
            <div 
              style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }}
              className="w-full p-6 sm:p-10 rounded-b-2xl shadow-2xl border-x border-b border-slate-300 overflow-y-auto max-h-[82vh]"
            >
              <div id="invoice-printable-doc" style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }} className="space-y-4 text-xs">
                
                {/* Formal Company Header */}
                <div style={{ borderColor: '#000000' }} className="flex justify-between items-start border-b-2 pb-3">
                  <div>
                    <h1 style={{ color: '#000000' }} className="text-2xl font-black uppercase tracking-tight">GARMENT FACTORY</h1>
                    <p style={{ color: '#4b5563' }} className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">
                      Garment & Apparel Manufacturing Division
                    </p>
                    <p style={{ color: '#6b7280' }} className="text-[10px] mt-0.5">
                      Raniban, Kathmandu, Nepal • Phone: +977-1-4880000
                    </p>
                  </div>

                  <div className="text-right">
                    <div style={{ backgroundColor: '#000000', color: '#ffffff' }} className="inline-block px-3 py-1 font-mono font-extrabold text-xs uppercase tracking-wider rounded">
                      COMMERCIAL TAX INVOICE
                    </div>
                    <div className="mt-2 font-mono text-xs space-y-0.5">
                      <span style={{ color: '#000000' }} className="font-black text-sm block">Invoice #: {printInvoice.invoiceNo}</span>
                      <span style={{ color: '#4b5563' }} className="block">Date: {formatDate(printInvoice.invoiceDate)}</span>
                      {printInvoice.dueDate ? (
                        <span style={{ color: '#000000' }} className="font-bold block">Due Date: {formatDate(printInvoice.dueDate)}</span>
                      ) : (
                        <span style={{ color: '#4b5563' }} className="block">Due Date: Undefined (Open Credit)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bill To & Currency Box */}
                <div style={{ borderColor: '#000000', backgroundColor: '#f9fafb' }} className="grid grid-cols-2 gap-3 border rounded-lg p-3 text-xs">
                  <div>
                    <span style={{ color: '#6b7280' }} className="text-[10px] font-bold uppercase tracking-wider block">
                      INVOICE TO (BUYER):
                    </span>
                    <span style={{ color: '#000000' }} className="font-black text-sm block mt-0.5">{printInvoice.customerName}</span>
                    <span style={{ color: '#4b5563' }} className="block mt-0.5">Wholesale Commercial Account</span>
                  </div>

                  <div style={{ borderColor: '#d1d5db' }} className="border-l pl-3 font-mono space-y-0.5 text-right">
                    <span style={{ color: '#6b7280' }} className="text-[10px] font-bold font-sans uppercase tracking-wider block">
                      PAYMENT TERMS & STATUS
                    </span>
                    <span style={{ color: '#000000' }} className="font-bold block">Currency: {printInvoice.currency}</span>
                    <span style={{ color: '#4b5563' }} className="block">
                      Terms: {printInvoice.dueDate ? `Due on ${formatDate(printInvoice.dueDate)}` : 'Open Credit (Undefined)'}
                    </span>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="overflow-x-auto pt-1">
                  <table style={{ width: '100%', borderColor: '#d1d5db' }} className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: '#f3f4f6', borderColor: '#000000', color: '#000000' }} className="border-b-2 uppercase font-mono text-[10px]">
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 w-10 text-center font-bold">#</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 font-bold">Garment Particulars / Description</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 text-right font-bold">Quantity</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-3 text-right font-bold">Unit Price</th>
                        <th style={{ backgroundColor: '#f3f4f6', color: '#000000' }} className="py-2 px-4 text-right font-bold">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody style={{ borderColor: '#d1d5db' }} className="divide-y font-mono text-xs">
                      {(printInvoice.lines ?? []).map((l, idx) => (
                        <tr key={l.id || idx}>
                          <td style={{ color: '#6b7280' }} className="py-2.5 px-3 text-center">{idx + 1}</td>
                          <td style={{ color: '#000000' }} className="py-2.5 px-3 font-sans font-bold">{l.description}</td>
                          <td style={{ color: '#111827' }} className="py-2.5 px-3 text-right font-bold">{l.qty} pcs</td>
                          <td style={{ color: '#111827' }} className="py-2.5 px-3 text-right">{formatMoney(l.unitPriceMinor, printInvoice.currency)}</td>
                          <td style={{ color: '#000000' }} className="py-2.5 px-4 text-right font-bold">{formatMoney(l.lineTotalMinor, printInvoice.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ borderColor: '#000000' }} className="border-t-2 font-mono">
                      <tr>
                        <td colSpan={4} className="py-2 px-3 text-right font-sans font-bold">
                          Gross Subtotal:
                        </td>
                        <td style={{ color: '#000000' }} className="py-2 px-4 text-right font-bold">
                          {formatMoney(printInvoice.subtotalMinor, printInvoice.currency)}
                        </td>
                      </tr>
                      {printInvoice.discountMinor > 0 && (
                        <tr>
                          <td colSpan={4} className="py-1.5 px-3 text-right text-red-700 font-sans">
                            Trade Discount ({printInvoice.discountReason || 'Agreed Discount'}):
                          </td>
                          <td className="py-1.5 px-4 text-right text-red-700 font-bold">
                            -{formatMoney(printInvoice.discountMinor, printInvoice.currency)}
                          </td>
                        </tr>
                      )}
                      <tr style={{ borderColor: '#000000', backgroundColor: '#f9fafb', color: '#000000' }} className="border-t-2 text-sm font-black">
                        <td colSpan={4} className="py-2.5 px-3 font-sans text-right uppercase">
                          Net Amount Payable:
                        </td>
                        <td style={{ color: '#000000' }} className="py-2.5 px-4 text-right">
                          {formatMoney(printInvoice.totalMinor, printInvoice.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Remittance & Bank Instructions Box */}
                <div style={{ backgroundColor: '#f9fafb', borderColor: '#d1d5db', color: '#374151' }} className="p-3 border rounded text-[10px] font-sans space-y-1 page-break-avoid">
                  <span style={{ color: '#000000' }} className="font-bold block uppercase tracking-wider text-[11px]">
                    Payment Remittance & Banking Details:
                  </span>
                  <p>
                    Please remit invoice balance via Bank Transfer (Account Payee Cheque or Interbank IPS/Fonepay) 
                    quoting Invoice Ref: <strong>{printInvoice.invoiceNo}</strong>.
                  </p>
                  <div style={{ color: '#1f2937' }} className="font-mono text-[10px] pt-1">
                    <span><strong>Bank:</strong> Standard Commercial Bank</span> • 
                    <span className="ml-1"><strong>A/C Name:</strong> Garment Factory</span> • 
                    <span className="ml-1"><strong>A/C No:</strong> 0140-XXXXXXXXXXXX</span>
                  </div>
                </div>

                {/* Terms and Signatory Area */}
                <div style={{ borderColor: '#000000', color: '#000000' }} className="grid grid-cols-2 gap-6 pt-10 text-[10px] font-sans border-t mt-6 page-break-avoid">
                  <div style={{ color: '#6b7280' }} className="text-[9px] leading-relaxed">
                    <strong>Terms & Conditions:</strong><br />
                    {printInvoice.dueDate ? (
                      `1. Payment is due strictly on or before ${formatDate(printInvoice.dueDate)}.`
                    ) : (
                      '1. Payment terms: Open credit / as per mutual agreement.'
                    )}<br />
                    2. Discrepancies in delivered quantity or rates must be reported within 7 business days.
                  </div>
                  <div className="text-center">
                    <div style={{ borderColor: '#000000' }} className="border-b w-36 mx-auto mb-1.5"></div>
                    <span className="font-bold block uppercase">Authorized Factory Signatory</span>
                    <span style={{ color: '#6b7280' }} className="text-[9px]">(Accounts & Finance Department)</span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
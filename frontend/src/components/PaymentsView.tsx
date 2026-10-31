import React, { useState, useEffect, useMemo } from 'react';
import {
  api, type Customer, type Payment, type Invoice,
  type Currency, type PaymentMethod, type CustomerStatement,
  type Delivery, type Order,
  formatMoney, formatDate,
} from '../api.ts';
import { downloadCSV } from '../utils/csv.ts';
import { 
  DollarSign, AlertTriangle, Printer, 
  Sparkles, ArrowRight, 
  ShieldCheck, Layers, Search, Plus, Eye, User, Phone, MapPin, ArrowLeft
} from 'lucide-react';

interface PaymentsViewProps {
  customers: Customer[];
  payments: Payment[];
  invoices: Invoice[];
  onRefresh: () => void;
}

interface PaymentAllocationDetail {
  invoiceId: number;
  invoiceNo: string;
  invoiceDate?: string;
  invoiceTotalMinor?: number;
  amountMinor: number;
}

function printDocumentContent(title: string, htmlContent: string) {
  let iframe = document.getElementById('garment-receipt-print-iframe') as HTMLIFrameElement;
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'garment-receipt-print-iframe';
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
          margin: 15mm 15mm 15mm 15mm;
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
          padding: 7px 10px;
          border-bottom: 1px solid #d1d5db;
        }
        th {
          background-color: #f3f4f6 !important;
          color: #000000 !important;
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

export const PaymentsView: React.FC<PaymentsViewProps> = ({ 
  customers = [], 
  payments = [], 
  invoices = [], 
  onRefresh 
}) => {
  const [subTab, setSubTab] = useState<'receipts' | 'cheques' | 'directory'>('receipts');
  const [showRecordModal, setShowRecordModal] = useState<boolean>(false);
  
  // Allocation Modal State
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [loadingCandidateInvoices, setLoadingCandidateInvoices] = useState<boolean>(false);
  const [realInvoiceBalances, setRealInvoiceBalances] = useState<Record<number, number>>({});
  const [allocations, setAllocations] = useState<Record<number, number>>({});

  // Allocation Inspector (View where money was allocated)
  const [showInspectorModal, setShowInspectorModal] = useState<boolean>(false);
  const [inspectingPayment, setInspectingPayment] = useState<Payment | null>(null);
  const [inspectingAllocations, setInspectingAllocations] = useState<PaymentAllocationDetail[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState<boolean>(false);

  // Record payment form
  const [customerId, setCustomerId] = useState<number>(customers.length > 0 ? customers[0].id : 0);
  const [amountMajor, setAmountMajor] = useState<string>('');
  const [currency, setCurrency] = useState<Currency>('NPR');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [receivedAt, setReceivedAt] = useState<string>(new Date().toISOString().split('T')[0]);
  const [chequeNo, setChequeNo] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>('');
  const [bankReference, setBankReference] = useState<string>('');
  const [note, setNote] = useState<string>('');

  // Cheque actions & Confirmation dialogs
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);
  const [chequeToClear, setChequeToClear] = useState<Payment | null>(null);
  const [showBounceModal, setShowBounceModal] = useState<boolean>(false);
  const [bouncePaymentId, setBouncePaymentId] = useState<number | null>(null);
  const [bounceReason, setBounceReason] = useState<string>('');
  const [chequeFilter, setChequeFilter] = useState<'all' | 'matured' | 'future'>('all');

  // Customer Directory & 360° History State
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>('');
  const [selectedCustomerDossier, setSelectedCustomerDossier] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [customerDeliveries, setCustomerDeliveries] = useState<Delivery[]>([]);
  const [loadingDossier, setLoadingDossier] = useState<boolean>(false);
  const [dossierSubTab, setDossierSubTab] = useState<'khata' | 'invoices' | 'payments' | 'deliveries'>('khata');

  // Official Receipt Print Preview
  const [printPayment, setPrintPayment] = useState<Payment | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state for receipts log
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>(payments);

  useEffect(() => { 
    setFilteredPayments(payments); 
  }, [payments]);

  useEffect(() => {
    if ((!customerId || customerId === 0) && customers.length > 0) {
      setCustomerId(customers[0].id);
      setCurrency(customers[0].defaultCurrency || 'NPR');
    }
  }, [customers]);

  const applyFilters = () => {
    let result = payments;
    if (filterCustomerId) result = result.filter(p => String(p.customerId) === filterCustomerId);
    if (filterMethod) result = result.filter(p => p.method === filterMethod);
    if (filterFrom) result = result.filter(p => (p.receivedAt || '') >= filterFrom);
    if (filterTo) result = result.filter(p => (p.receivedAt || '') <= filterTo + 'T23:59:59');
    setFilteredPayments(result);
  };

  const clearFilters = () => {
    setFilterCustomerId(''); 
    setFilterMethod(''); 
    setFilterFrom(''); 
    setFilterTo('');
    setFilteredPayments(payments);
  };

  const handleExport = () => {
    const headers = ['Receipt #', 'Date', 'Customer', 'Method', 'Status', 'Amount', 'Currency', 'Cheque #', 'Note'];
    const data = (filteredPayments || []).map(p => [
      p.paymentNo, 
      (p.receivedAt || '').split('T')[0], 
      p.customerName,
      p.method.replace('_', ' '), 
      p.status,
      (p.amountMinor / 100).toFixed(2), 
      p.currency,
      p.chequeNo ?? '', 
      p.note ?? '',
    ]);
    downloadCSV(`collections_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const pendingCheques = useMemo(() => {
    return (payments || []).filter(p => p.status === 'pending' && p.method === 'cheque');
  }, [payments]);

  const maturedCheques = useMemo(() => {
    return pendingCheques.filter(p => p.chequeDate && p.chequeDate <= todayStr);
  }, [pendingCheques, todayStr]);

  const futurePDCs = useMemo(() => {
    return pendingCheques.filter(p => !p.chequeDate || p.chequeDate > todayStr);
  }, [pendingCheques, todayStr]);

  const displayedCheques = useMemo(() => {
    if (chequeFilter === 'matured') return maturedCheques;
    if (chequeFilter === 'future') return futurePDCs;
    return pendingCheques;
  }, [chequeFilter, maturedCheques, futurePDCs, pendingCheques]);

  // Open candidate invoices modal with verified balances
  const openApplyPaymentModal = async (payment: Payment) => {
    setSelectedPayment(payment);
    setAllocations({});
    setError(null);
    setShowApplyModal(true);
    setLoadingCandidateInvoices(true);

    try {
      // 1. Fetch customer's full payments to calculate actual paid totals per invoice
      const customerPayments = (payments || []).filter(p => p.customerId === payment.customerId && p.status === 'cleared');
      
      const paymentDetails = await Promise.all(
        customerPayments.map(p => api.getPayment(p.id).catch(() => ({ payment: p })))
      );

      const allocatedByInvoiceId: Record<number, number> = {};
      paymentDetails.forEach((res: any) => {
        const allocs = res.payment?.allocations || (res as any).allocations || [];
        allocs.forEach((a: any) => {
          const invId = Number(a.invoiceId || a.invoice_id);
          const amt = Number(a.amountMinor || a.amount_minor || 0);
          allocatedByInvoiceId[invId] = (allocatedByInvoiceId[invId] || 0) + amt;
        });
      });

      // 2. Compute exact remaining balance for each candidate invoice
      const balances: Record<number, number> = {};
      (invoices || [])
        .filter(i => i.customerId === payment.customerId && i.status === 'issued' && i.currency === payment.currency)
        .forEach(inv => {
          const paidSoFar = allocatedByInvoiceId[inv.id] || 0;
          const remainingMinor = Math.max(0, inv.totalMinor - paidSoFar);
          balances[inv.id] = remainingMinor;
        });

      setRealInvoiceBalances(balances);
    } catch (err: any) {
      console.error('Failed to compute invoice balances:', err);
    } finally {
      setLoadingCandidateInvoices(false);
    }
  };

  // Only invoices with actual balance remaining > 0
  const payableInvoices = useMemo(() => {
    if (!selectedPayment) return [];
    return (invoices || [])
      .filter(i => {
        if (i.customerId !== selectedPayment.customerId || i.status !== 'issued' || i.currency !== selectedPayment.currency) {
          return false;
        }
        const remainingMinor = realInvoiceBalances[i.id];
        // If balances are still loading, omit to prevent 0-debt attempts
        if (remainingMinor === undefined) return false;
        return remainingMinor > 0;
      })
      .sort((a, b) => (a.invoiceDate || '').localeCompare(b.invoiceDate || '')); // Chronological (Oldest First)
  }, [invoices, selectedPayment, realInvoiceBalances]);

  // 1-Click Auto-FIFO (Oldest Invoices First)
  const handleAutoFIFO = () => {
    if (!selectedPayment) return;
    let poolMinor = selectedPayment.unappliedMinor || 0;
    const newAlloc: Record<number, number> = {};

    for (const inv of payableInvoices) {
      if (poolMinor <= 0) break;
      const dueMinor = realInvoiceBalances[inv.id] || 0;
      if (dueMinor <= 0) continue;

      const allocMinor = Math.min(poolMinor, dueMinor);
      newAlloc[inv.id] = allocMinor / 100;
      poolMinor -= allocMinor;
    }

    setAllocations(newAlloc);
  };

  const handleAllocateMaxForInvoice = (invId: number, dueMajor: number) => {
    if (!selectedPayment) return;
    const pool = (selectedPayment.unappliedMinor || 0) / 100;
    const otherAllocated = Object.entries(allocations)
      .filter(([id]) => Number(id) !== invId)
      .reduce((sum, [, val]) => sum + (Number(val) || 0), 0);

    const availableToThis = Math.max(0, pool - otherAllocated);
    const fillAmount = Math.min(dueMajor, availableToThis);

    setAllocations(prev => ({
      ...prev,
      [invId]: Math.round(fillAmount * 100) / 100,
    }));
  };

  const handleClearAllocations = () => {
    setAllocations({});
  };

  const totalAllocatedMajor = useMemo(() => {
    return Object.values(allocations).reduce((sum, val) => sum + (Number(val) || 0), 0);
  }, [allocations]);

  const unappliedPoolMajor = selectedPayment ? (selectedPayment.unappliedMinor || 0) / 100 : 0;
  const remainingPoolMajor = Math.max(0, unappliedPoolMajor - totalAllocatedMajor);
  const isOverAllocated = totalAllocatedMajor > unappliedPoolMajor;

  const handleApplyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;
    if (isOverAllocated) {
      setError('Allocated amount cannot exceed the unapplied receipt balance.');
      return;
    }

    const allocList = Object.entries(allocations)
      .map(([invId, amt]) => ({ invoiceId: Number(invId), amountMinor: Math.round(amt * 100) }))
      .filter(a => a.amountMinor > 0);

    if (allocList.length === 0) { 
      setError('Please allocate an amount to at least one invoice.'); 
      return; 
    }

    setSubmitting(true); 
    setError(null);
    try { 
      await api.applyPayment(selectedPayment.id, allocList); 
      setShowApplyModal(false); 
      setSelectedPayment(null); 
      onRefresh(); 
    } catch (err: any) { 
      setError(err.message || 'Failed to apply payment allocations'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  // Inspect Allocations Breakdown (Shows settled invoices)
  const handleInspectPaymentAllocations = async (payment: Payment) => {
    setInspectingPayment(payment);
    setShowInspectorModal(true);
    setLoadingAllocations(true);

    try {
      const res = await api.getPayment(payment.id);
      const allocs = res.payment?.allocations || (res as any).allocations || [];
      
      const enriched: PaymentAllocationDetail[] = allocs.map((a: any) => {
        const inv = invoices.find(i => i.id === (a.invoiceId || a.invoice_id));
        return {
          invoiceId: a.invoiceId || a.invoice_id,
          invoiceNo: a.invoiceNo || a.invoice_no || inv?.invoiceNo || `INV-#${a.invoiceId || a.invoice_id}`,
          invoiceDate: a.invoiceDate || a.invoice_date || inv?.invoiceDate,
          invoiceTotalMinor: a.invoiceTotalMinor || a.invoice_total_minor || inv?.totalMinor,
          amountMinor: a.amountMinor || a.amount_minor || 0,
        };
      });

      setInspectingAllocations(enriched);
    } catch (err) {
      console.error('Failed to inspect allocations:', err);
      setInspectingAllocations([]);
    } finally {
      setLoadingAllocations(false);
    }
  };

  // Customer Directory & 360° History Loader
  const handleOpenCustomerDossier = async (customer: Customer) => {
    setSelectedCustomerDossier(customer);
    setLoadingDossier(true);
    setDossierSubTab('khata');

    try {
      const [statementRes, ordersRes, deliveriesRes] = await Promise.all([
        api.getCustomerStatement(customer.id).catch(() => ({ statement: null })),
        api.getOrders({ customerId: customer.id }).catch(() => ({ orders: [] })),
        api.getDeliveries().catch(() => ({ deliveries: [] })),
      ]);

      setStatement(statementRes.statement);
      setCustomerOrders(ordersRes.orders || []);
      setCustomerDeliveries((deliveriesRes.deliveries || []).filter(d => d.customerId === customer.id));
    } catch (err) {
      console.error('Failed to load customer dossier:', err);
    } finally {
      setLoadingDossier(false);
    }
  };

  const filteredCustomerList = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  }, [customers, customerSearchQuery]);

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(amountMajor);
    if (isNaN(amountVal) || amountVal <= 0) { 
      setError('Please enter a valid positive collection amount.'); 
      return; 
    }
    if (method === 'cheque' && (!chequeNo.trim() || !chequeDate)) { 
      setError('Cheque number and cheque maturity date are required.'); 
      return; 
    }

    setSubmitting(true); 
    setError(null);

    const fullNoteParts: string[] = [];
    if (bankReference.trim()) fullNoteParts.push(`Ref: ${bankReference.trim()}`);
    if (note.trim()) fullNoteParts.push(note.trim());
    const finalNote = fullNoteParts.join(' | ');

    try {
      await api.recordPayment({ 
        customerId, 
        amountMinor: Math.round(amountVal * 100), 
        currency, 
        method, 
        receivedAt, 
        chequeNo: method === 'cheque' ? chequeNo.trim() : undefined, 
        chequeDate: method === 'cheque' ? chequeDate : undefined, 
        note: finalNote || undefined 
      });
      setShowRecordModal(false); 
      setAmountMajor(''); 
      setChequeNo(''); 
      setChequeDate(''); 
      setBankReference(''); 
      setNote('');
      onRefresh();
    } catch (err: any) { 
      setError(err.message || 'Failed to record payment receipt'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleConfirmClearCheque = async () => {
    if (!chequeToClear) return;
    setSubmitting(true);
    try { 
      await api.clearCheque(chequeToClear.id); 
      setShowClearConfirmModal(false);
      setChequeToClear(null);
      onRefresh(); 
    } catch (err: any) { 
      setError(err.message || 'Failed to clear cheque'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleBounceCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bouncePaymentId || !bounceReason.trim()) return;
    setSubmitting(true); 
    setError(null);
    try { 
      await api.bounceCheque(bouncePaymentId, bounceReason.trim()); 
      setShowBounceModal(false); 
      setBouncePaymentId(null); 
      setBounceReason(''); 
      onRefresh(); 
    } catch (err: any) { 
      setError(err.message || 'Failed to record bounce'); 
    } finally { 
      setSubmitting(false); 
    }
  };

  const handleExecutePrintReceipt = () => {
    const el = document.getElementById('receipt-printable-doc');
    if (el) {
      printDocumentContent(`Money_Receipt_${printPayment?.paymentNo || 'Payment'}`, el.innerHTML);
    }
  };

  return (
    <div className="space-y-4 font-sans">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <DollarSign size={20} className="text-blue-600 dark:text-blue-400" />
            <span>Customer Collections & Cheques</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cash receipts, bank transfers, post-dated cheque (PDC) vault, and multi-invoice FIFO allocations.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto no-scrollbar text-xs">
            {(['receipts', 'cheques', 'directory'] as const).map(t => (
              <button 
                key={t} 
                onClick={() => { 
                  setSubTab(t); 
                  if (t === 'directory') setSelectedCustomerDossier(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold transition capitalize whitespace-nowrap shrink-0 cursor-pointer ${
                  subTab === t 
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {t === 'cheques' ? (
                  <span className="flex items-center gap-1.5">
                    <span>Cheque Vault (PDC)</span>
                    {pendingCheques.length > 0 && (
                      <span className="bg-blue-600 text-white px-1.5 py-0.2 rounded-full text-[10px]">
                        {pendingCheques.length}
                      </span>
                    )}
                  </span>
                ) : t === 'receipts' ? (
                  'All Receipts Log'
                ) : (
                  <span className="flex items-center gap-1.5">
                    <User size={13} />
                    <span>Customer Accounts & Khata ({customers.length})</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <button 
            type="button"
            onClick={() => { setShowRecordModal(true); setError(null); }} 
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            <span>Record Money In</span>
          </button>
        </div>
      </div>

      {/* Receipts Tab */}
      {subTab === 'receipts' && (
        <div className="space-y-4">
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
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Method</label>
                <select 
                  value={filterMethod} 
                  onChange={e => setFilterMethod(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none cursor-pointer"
                >
                  <option value="">All Methods</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer / Fonepay</option>
                  <option value="cheque">Cheque (PDC)</option>
                </select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Receipt Date From</label>
                <input 
                  type="date" 
                  value={filterFrom} 
                  onChange={e => setFilterFrom(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Receipt Date To</label>
                <input 
                  type="date" 
                  value={filterTo} 
                  onChange={e => setFilterTo(e.target.value)} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]" 
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer">Apply</button>
                <button onClick={clearFilters} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer">Clear</button>
                <button onClick={handleExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer">Export CSV</button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">Customer Collections Log</h4>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{filteredPayments.length} receipts</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4">Receipt #</th>
                    <th className="py-2.5 px-3 sm:px-4">Date</th>
                    <th className="py-2.5 px-3 sm:px-4 min-w-[150px]">Customer</th>
                    <th className="py-2.5 px-3 sm:px-4">Method / Cheque #</th>
                    <th className="py-2.5 px-3 sm:px-4 text-center">Status</th>
                    <th className="py-2.5 px-3 sm:px-4 text-right">Amount Received</th>
                    <th className="py-2.5 px-3 sm:px-4 text-right">Unallocated Balance</th>
                    <th className="py-2.5 px-3 sm:px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {filteredPayments.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-sans">No payment records found.</td></tr>
                  ) : (
                    filteredPayments.map(p => {
                      const hasAllocations = (p.amountMinor - (p.unappliedMinor || 0)) > 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 sm:px-4 font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">{p.paymentNo}</td>
                          <td className="py-3 px-3 sm:px-4 text-slate-500 whitespace-nowrap">{formatDate((p.receivedAt || '').split('T')[0])}</td>
                          <td className="py-3 px-3 sm:px-4 font-sans font-bold text-slate-900 dark:text-slate-100">{p.customerName}</td>
                          <td className="py-3 px-3 sm:px-4 capitalize text-slate-700 dark:text-slate-300 font-sans">
                            {p.method.replace('_', ' ')}
                            {p.chequeNo && <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] block">#{p.chequeNo}</span>}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-center font-sans whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              p.status === 'cleared' 
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
                                : p.status === 'pending' 
                                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' 
                                : 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 line-through'
                            }`}>
                              {p.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {formatMoney(p.amountMinor, p.currency)}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-right whitespace-nowrap">
                            {p.unappliedMinor > 0 ? (
                              <span className="text-blue-700 dark:text-blue-300 font-bold bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 text-[11px]">
                                {formatMoney(p.unappliedMinor, p.currency)}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-sans italic">Fully Allocated</span>
                            )}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-center font-sans">
                            <div className="flex items-center justify-center gap-1.5">
                              {p.unappliedMinor > 0 && p.status === 'cleared' && (
                                <button 
                                  onClick={() => openApplyPaymentModal(p)} 
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                                >
                                  Allocate Bills
                                </button>
                              )}
                              {hasAllocations && (
                                <button
                                  type="button"
                                  onClick={() => handleInspectPaymentAllocations(p)}
                                  className="px-2 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-semibold transition cursor-pointer"
                                  title="View settled invoices"
                                >
                                  Allocations
                                </button>
                              )}
                              <button
                                onClick={() => setPrintPayment(p)}
                                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                title="Print official money receipt"
                              >
                                <Printer size={12} />
                                <span>Receipt</span>
                              </button>
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
        </div>
      )}

      {/* Cheques Tab (PDC Vault) */}
      {subTab === 'cheques' && (
        <div className="space-y-4">
          {maturedCheques.length > 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0">
                  <AlertTriangle size={18} />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-amber-900 dark:text-amber-100">
                    {maturedCheques.length} Cheque(s) Matured & Due for Bank Deposit Today!
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-mono mt-0.5">
                    Total maturing value: <strong>{formatMoney(maturedCheques.reduce((sum, c) => sum + (c.amountMinor || 0), 0), currency)}</strong>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setChequeFilter('matured')}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs transition cursor-pointer"
              >
                View Matured Only ({maturedCheques.length})
              </button>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  Post-Dated Cheques (PDC) Vault & Drawer
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Physical cheques held in safe locker. Outstanding market balance deducts once marked cleared by the bank.
                </p>
              </div>

              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setChequeFilter('all')}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    chequeFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All ({pendingCheques.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChequeFilter('matured')}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    chequeFilter === 'matured'
                      ? 'bg-amber-500 text-white shadow-2xs'
                      : 'text-amber-700 dark:text-amber-400'
                  }`}
                >
                  Due Today ({maturedCheques.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChequeFilter('future')}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
                    chequeFilter === 'future'
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  In Safe Locker ({futurePDCs.length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 sm:px-4">Receipt #</th>
                    <th className="py-2.5 px-3 sm:px-4">Cheque #</th>
                    <th className="py-2.5 px-3 sm:px-4">Maturity Date</th>
                    <th className="py-2.5 px-3 sm:px-4 min-w-[150px]">Customer</th>
                    <th className="py-2.5 px-3 sm:px-4 text-center">Locker Status</th>
                    <th className="py-2.5 px-3 sm:px-4 text-right">Cheque Amount</th>
                    <th className="py-2.5 px-3 sm:px-4 text-center">Bank Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {displayedCheques.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs font-sans">
                        No cheques found in this vault category.
                      </td>
                    </tr>
                  ) : (
                    displayedCheques.map(c => {
                      const isMatured = c.chequeDate && c.chequeDate <= todayStr;
                      return (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-3 sm:px-4 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{c.paymentNo}</td>
                          <td className="py-3 px-3 sm:px-4 font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">{c.chequeNo}</td>
                          <td className="py-3 px-3 sm:px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{c.chequeDate ? formatDate(c.chequeDate) : '—'}</td>
                          <td className="py-3 px-3 sm:px-4 font-sans font-bold text-slate-900 dark:text-slate-100">{c.customerName}</td>
                          <td className="py-3 px-3 sm:px-4 text-center font-sans whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isMatured 
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-800' 
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}>
                              {isMatured ? 'Matured / Deposit Today' : 'In Safe Locker (PDC)'}
                            </span>
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-right font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {formatMoney(c.amountMinor, c.currency)}
                          </td>
                          <td className="py-3 px-3 sm:px-4 text-center font-sans">
                            <div className="flex items-center justify-center gap-1.5">
                              <button 
                                onClick={() => { setChequeToClear(c); setShowClearConfirmModal(true); }} 
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                              >
                                Cleared
                              </button>
                              <button 
                                onClick={() => { setBouncePaymentId(c.id); setShowBounceModal(true); setError(null); }} 
                                className="px-2.5 py-1 bg-red-50 dark:bg-red-950/60 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg text-xs font-semibold transition cursor-pointer"
                              >
                                Bounced
                              </button>
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
        </div>
      )}

      {/* ─── 360° CUSTOMER DIRECTORY & KHATA DOSSIER ─── */}
      {subTab === 'directory' && (
        <div className="space-y-4">
          {!selectedCustomerDossier ? (
            /* Master Customer Directory View */
            <div className="space-y-4">
              {/* Directory Top Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Wholesale Buyers</span>
                  <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
                    {customers.length} Parties
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] text-blue-600 uppercase font-sans font-bold block">Orders Billed</span>
                  <span className="text-base sm:text-lg font-bold text-blue-600 mt-0.5 block">
                    {invoices.length} Invoices
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] text-emerald-600 uppercase font-sans font-bold block">Collections Recorded</span>
                  <span className="text-base sm:text-lg font-bold text-emerald-600 mt-0.5 block">
                    {payments.length} Receipts
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                  <span className="text-[10px] text-amber-600 uppercase font-sans font-bold block">PDCs In Locker</span>
                  <span className="text-base sm:text-lg font-bold text-amber-600 mt-0.5 block">
                    {pendingCheques.length} Cheques
                  </span>
                </div>
              </div>

              {/* Customer Directory Table */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                      Wholesale Customer Directory
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select any buyer to view their complete 360° financial ledger, order history, deliveries, and payment records.
                    </p>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      placeholder="Search customer, code, phone..."
                      value={customerSearchQuery}
                      onChange={e => setCustomerSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:border-blue-600 focus:outline-none"
                    />
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase text-slate-500 tracking-wider">
                      <tr>
                        <th className="py-2.5 px-4">Party Code</th>
                        <th className="py-2.5 px-4 min-w-[180px]">Company / Store Name</th>
                        <th className="py-2.5 px-4">Contact Phone</th>
                        <th className="py-2.5 px-4">Market Location</th>
                        <th className="py-2.5 px-4 text-center">Currency</th>
                        <th className="py-2.5 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredCustomerList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                            No customers found matching search criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredCustomerList.map(c => (
                          <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                            <td className="py-3 px-4 font-mono font-bold text-blue-700 dark:text-blue-400">{c.code}</td>
                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-slate-100">{c.name}</td>
                            <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">{c.phone || '—'}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{c.address || '—'}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold">{c.defaultCurrency}</td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenCustomerDossier(c)}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-2xs transition flex items-center gap-1 mx-auto cursor-pointer"
                              >
                                <span>360° Khata</span>
                                <ArrowRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Selected Customer 360° History Dossier */
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedCustomerDossier(null)}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    title="Back to Customer Directory"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <div>
                    <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{selectedCustomerDossier.name}</span>
                      <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800">
                        {selectedCustomerDossier.code}
                      </span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1 font-mono">
                      {selectedCustomerDossier.phone && (
                        <span className="flex items-center gap-1">
                          <Phone size={12} /> {selectedCustomerDossier.phone}
                        </span>
                      )}
                      {selectedCustomerDossier.address && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} /> {selectedCustomerDossier.address}
                        </span>
                      )}
                      <span>Currency: {selectedCustomerDossier.defaultCurrency}</span>
                    </div>
                  </div>
                </div>

                {/* Sub-Tabs across customer history */}
                <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs overflow-x-auto no-scrollbar">
                  {(['khata', 'invoices', 'payments', 'deliveries'] as const).map(tabKey => (
                    <button
                      key={tabKey}
                      type="button"
                      onClick={() => setDossierSubTab(tabKey)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition capitalize cursor-pointer whitespace-nowrap ${
                        dossierSubTab === tabKey
                          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {tabKey === 'khata' && 'Financial Khata'}
                      {tabKey === 'invoices' && `Invoices (${(invoices || []).filter(i => i.customerId === selectedCustomerDossier.id).length})`}
                      {tabKey === 'payments' && `Collections (${(payments || []).filter(p => p.customerId === selectedCustomerDossier.id).length})`}
                      {tabKey === 'deliveries' && `Deliveries (${customerDeliveries.length})`}
                    </button>
                  ))}
                </div>
              </div>

              {loadingDossier ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading complete customer record...</div>
              ) : (
                <>
                  {/* Financial Balances Strip */}
                  {statement && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(statement.balances || []).map(b => (
                        <div key={b.currency} className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
                          <span className="text-[10px] text-slate-400 uppercase font-bold font-mono block">
                            {b.currency} Current Balance
                          </span>
                          <span className="text-2xl font-black text-slate-900 dark:text-slate-100 block font-mono">
                            {formatMoney(b.outstandingMinor, b.currency)}
                          </span>
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 font-mono text-[11px] text-slate-500 space-y-1">
                            <div className="flex justify-between"><span>Total Billed:</span><span>{formatMoney(b.invoicedMinor, b.currency)}</span></div>
                            <div className="flex justify-between"><span>Total Cleared:</span><span>{formatMoney(b.settledMinor, b.currency)}</span></div>
                            {b.pendingChequeMinor > 0 && (
                              <div className="flex justify-between text-amber-600 font-bold">
                                <span>PDCs in Locker:</span>
                                <span>{formatMoney(b.pendingChequeMinor, b.currency)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 1. KHATA ROLLING STATEMENT VIEW */}
                  {dossierSubTab === 'khata' && statement && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs p-4 sm:p-6 space-y-4">
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Rolling Credit Khata Overview</h4>
                      <p className="text-xs text-slate-500">
                        Tracks open commercial liabilities, received cheques, and total cleared factory revenues for this party.
                      </p>
                    </div>
                  )}

                  {/* 2. INVOICES HISTORY VIEW */}
                  {dossierSubTab === 'invoices' && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-sm">
                        Invoices Issued to {selectedCustomerDossier.name}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse font-mono">
                          <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="p-2.5">Invoice #</th>
                              <th className="p-2.5">Billing Date</th>
                              <th className="p-2.5">Due Date</th>
                              <th className="p-2.5 text-center">Status</th>
                              <th className="p-2.5 text-right">Total Bill</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {(invoices || []).filter(i => i.customerId === selectedCustomerDossier.id).map(inv => (
                              <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-2.5 font-bold text-blue-600">{inv.invoiceNo}</td>
                                <td className="p-2.5 text-slate-500">{formatDate(inv.invoiceDate)}</td>
                                <td className="p-2.5 text-slate-500">{inv.dueDate ? formatDate(inv.dueDate) : 'Undefined'}</td>
                                <td className="p-2.5 text-center uppercase font-sans font-bold">{inv.status}</td>
                                <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{formatMoney(inv.totalMinor, inv.currency)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 3. COLLECTIONS & RECEIPTS VIEW */}
                  {dossierSubTab === 'payments' && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-sm">
                        Collections Received from {selectedCustomerDossier.name}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse font-mono">
                          <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="p-2.5">Receipt #</th>
                              <th className="p-2.5">Date</th>
                              <th className="p-2.5">Method</th>
                              <th className="p-2.5 text-center">Status</th>
                              <th className="p-2.5 text-right">Amount Received</th>
                              <th className="p-2.5 text-right">Unallocated</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {(payments || []).filter(p => p.customerId === selectedCustomerDossier.id).map(p => (
                              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-2.5 font-bold text-blue-600">{p.paymentNo}</td>
                                <td className="p-2.5 text-slate-500">{formatDate((p.receivedAt || '').split('T')[0])}</td>
                                <td className="p-2.5 capitalize font-sans">{p.method.replace('_', ' ')}</td>
                                <td className="p-2.5 text-center uppercase font-sans font-bold">{p.status}</td>
                                <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-100">{formatMoney(p.amountMinor, p.currency)}</td>
                                <td className="p-2.5 text-right">{p.unappliedMinor > 0 ? formatMoney(p.unappliedMinor, p.currency) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 4. DELIVERIES VIEW */}
                  {dossierSubTab === 'deliveries' && (
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
                      <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-bold text-sm">
                        Cartons & Challans Dispatched to {selectedCustomerDossier.name}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse font-mono">
                          <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="p-2.5">Challan #</th>
                              <th className="p-2.5">Date</th>
                              <th className="p-2.5">Order Ref</th>
                              <th className="p-2.5 text-right">Total Pieces</th>
                              <th className="p-2.5 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {customerDeliveries.map(d => (
                              <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <td className="p-2.5 font-bold text-blue-600">{d.deliveryNo}</td>
                                <td className="p-2.5 text-slate-500">{d.deliveredAt ? formatDate(d.deliveredAt.split('T')[0]) : '—'}</td>
                                <td className="p-2.5">{d.orderNo}</td>
                                <td className="p-2.5 text-right font-bold">{d.totalQty} pcs</td>
                                <td className="p-2.5 text-center uppercase font-sans font-bold">{d.status}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── ALLOCATION INSPECTOR MODAL (Where Did The Money Go?) ─── */}
      {showInspectorModal && inspectingPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-xs font-sans">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Eye size={16} className="text-blue-600" />
                  Allocations for Receipt {inspectingPayment.paymentNo}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Party: <strong className="text-slate-900 dark:text-slate-100">{inspectingPayment.customerName}</strong> • Breakdown of invoices settled by this payment.
                </p>
              </div>
              <button onClick={() => setShowInspectorModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer">✕</button>
            </div>

            {loadingAllocations ? (
              <div className="py-8 text-center text-slate-400">Loading allocation records...</div>
            ) : inspectingAllocations.length === 0 ? (
              <div className="py-8 text-center text-slate-500 italic">
                No invoices have been allocated to this payment receipt yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse font-mono">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-2.5">Invoice #</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Bill Total</th>
                        <th className="p-2.5 text-right font-bold text-emerald-600">Settled from Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {inspectingAllocations.map(a => (
                        <tr key={a.invoiceId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 font-bold text-blue-600">{a.invoiceNo}</td>
                          <td className="p-2.5 text-slate-500">{a.invoiceDate ? formatDate(a.invoiceDate) : '—'}</td>
                          <td className="p-2.5 text-right text-slate-600">
                            {a.invoiceTotalMinor ? formatMoney(a.invoiceTotalMinor, inspectingPayment.currency) : '—'}
                          </td>
                          <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(a.amountMinor, inspectingPayment.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 font-bold">
                      <tr>
                        <td colSpan={3} className="p-2.5 text-right font-sans">Total Allocated to Invoices:</td>
                        <td className="p-2.5 text-right text-slate-900 dark:text-slate-100">
                          {formatMoney(inspectingAllocations.reduce((sum, a) => sum + a.amountMinor, 0), inspectingPayment.currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-[11px] text-slate-500 font-mono flex justify-between">
                  <span>Remaining Unapplied in Receipt:</span>
                  <strong className="text-blue-600">{formatMoney(inspectingPayment.unappliedMinor, inspectingPayment.currency)}</strong>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowInspectorModal(false)}
                className="px-4 py-2 rounded-xl font-bold bg-slate-900 text-white hover:bg-black transition cursor-pointer"
              >
                Close Breakdown
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DUAL ALLOCATION MODAL: ZERO-DEBT INVOICES FILTERED OUT ─── */}
      {showApplyModal && selectedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-xs font-sans">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers size={16} className="text-blue-600" />
                  Allocate Receipt {selectedPayment.paymentNo} to Invoices
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Party: <strong className="text-slate-900 dark:text-slate-100">{selectedPayment.customerName}</strong> • Only invoices with active unpaid balances are listed.
                </p>
              </div>
              <button onClick={() => setShowApplyModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 cursor-pointer">✕</button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Quick Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoFIFO}
                  disabled={loadingCandidateInvoices || payableInvoices.length === 0}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Automatically clear oldest outstanding bills first"
                >
                  <Sparkles size={13} />
                  <span>1-Click Auto-FIFO (Oldest Invoices First)</span>
                </button>

                {totalAllocatedMajor > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllocations}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              <div className="font-mono text-xs">
                <span className="text-slate-500 font-sans">Unapplied Pool: </span>
                <strong className="text-slate-900 dark:text-slate-100">{formatMoney(selectedPayment.unappliedMinor, selectedPayment.currency)}</strong>
              </div>
            </div>

            <form onSubmit={handleApplyPayment} className="space-y-4">
              {loadingCandidateInvoices ? (
                <div className="py-8 text-center text-slate-400">Verifying customer invoice balances...</div>
              ) : payableInvoices.length === 0 ? (
                <div className="py-8 text-center text-slate-500 italic">
                  No invoices currently owe money for this customer! All issued bills have already been 100% settled.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase font-mono text-[10px] sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="p-2.5">Invoice #</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right">Bill Total</th>
                        <th className="p-2.5 text-right">Remaining Due</th>
                        <th className="p-2.5 text-right w-44">Allocate (Rupees)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                      {payableInvoices.map(inv => {
                        const dueMajor = (realInvoiceBalances[inv.id] || 0) / 100;
                        const currentAlloc = allocations[inv.id] ?? '';

                        return (
                          <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-2.5 font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                              {inv.invoiceNo}
                            </td>
                            <td className="p-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatDate(inv.invoiceDate)}
                            </td>
                            <td className="p-2.5 text-right text-slate-700 dark:text-slate-300">
                              {formatMoney(inv.totalMinor, inv.currency)}
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-900 dark:text-slate-100">
                              Rs. {dueMajor.toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <input 
                                  type="number" 
                                  step="0.01" 
                                  min="0" 
                                  max={dueMajor} 
                                  value={currentAlloc} 
                                  placeholder="0.00" 
                                  onChange={e => {
                                    const val = parseFloat(e.target.value);
                                    const safe = isNaN(val) ? 0 : Math.min(dueMajor, Math.max(0, val));
                                    setAllocations(prev => ({ ...prev, [inv.id]: safe }));
                                  }} 
                                  className="w-24 px-2 py-1 text-right font-mono font-bold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg focus:border-blue-600 focus:outline-none" 
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAllocateMaxForInvoice(inv.id, dueMajor)}
                                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-1 cursor-pointer"
                                  title="Allocate full balance of this invoice"
                                >
                                  Full
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Live Allocation Pool Calculator */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 font-mono text-xs">
                <div>
                  <span className="text-slate-500 font-sans block text-[11px]">Allocated to Bills:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    Rs. {totalAllocatedMajor.toFixed(2)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 font-sans block text-[11px]">Remaining Unallocated:</span>
                  <span className={`font-bold text-sm ${remainingPoolMajor === 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                    Rs. {remainingPoolMajor.toFixed(2)}
                  </span>
                </div>

                {isOverAllocated && (
                  <span className="text-red-600 font-bold font-sans text-xs">
                    Allocated exceeds receipt balance!
                  </span>
                )}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowApplyModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">Cancel</button>
                <button 
                  type="submit" 
                  disabled={submitting || totalAllocatedMajor === 0 || isOverAllocated} 
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-xs cursor-pointer"
                >
                  {submitting ? 'Applying…' : `Confirm Allocations (Rs. ${totalAllocatedMajor.toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clear Cheque Confirmation Dialog */}
      {showClearConfirmModal && chequeToClear && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-xs font-sans">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 shrink-0">
                <ShieldCheck size={22} />
              </div>
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  Mark Cheque as Cleared?
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs">
                  Has <strong>Cheque #{chequeToClear.chequeNo}</strong> for <strong>{formatMoney(chequeToClear.amountMinor, chequeToClear.currency)}</strong> from <strong>{chequeToClear.customerName}</strong> been credited into your bank account?
                </p>
                <p className="text-[11px] text-slate-500 font-mono mt-1">
                  Confirming will deduct this amount from the customer's market dues ledger.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => { setShowClearConfirmModal(false); setChequeToClear(null); }}
                className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearCheque}
                disabled={submitting}
                className="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs cursor-pointer"
              >
                {submitting ? 'Updating…' : 'Yes, Cheque is Cleared'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bounce Modal */}
      {showBounceModal && bouncePaymentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 text-xs font-sans">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">Record Cheque Bounce</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Restores customer receivable and logs return reason.</p>
              </div>
              <button onClick={() => setShowBounceModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg p-1 cursor-pointer">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleBounceCheque} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason for Bounce *</label>
                <textarea 
                  value={bounceReason} 
                  onChange={e => setBounceReason(e.target.value)} 
                  rows={3} 
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs focus:border-blue-600 focus:outline-none" 
                  placeholder="e.g. Insufficient funds, signature mismatch" 
                  required 
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowBounceModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition shadow-xs cursor-pointer">{submitting ? 'Recording…' : 'Confirm Bounce'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── OFFICIAL MONEY RECEIPT PRINT ENGINE (A4 ISOLATED) ─── */}
      {printPayment && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="relative max-w-2xl w-full my-auto flex flex-col items-center">
            
            <div className="w-full bg-slate-900 text-white px-5 py-3 rounded-t-2xl flex items-center justify-between border border-slate-700 shadow-lg">
              <div className="flex items-center gap-2">
                <Printer size={16} className="text-blue-400" />
                <span className="font-bold text-sm">Money Receipt Preview</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  ({printPayment.paymentNo})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExecutePrintReceipt}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintPayment(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Pristine White Sheet of Paper on Screen */}
            <div 
              style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }}
              className="w-full p-6 sm:p-8 rounded-b-2xl shadow-2xl border-x border-b border-slate-300 overflow-y-auto max-h-[82vh]"
            >
              <div id="receipt-printable-doc" style={{ backgroundColor: '#ffffff', color: '#000000', colorScheme: 'light' }} className="space-y-4 text-xs">
                
                {/* Header */}
                <div style={{ borderColor: '#000000' }} className="flex justify-between items-start border-b-2 pb-3">
                  <div>
                    <h1 style={{ color: '#000000' }} className="text-2xl font-black uppercase tracking-tight">GARMENT FACTORY</h1>
                    <p style={{ color: '#4b5563' }} className="text-[10px] font-semibold uppercase tracking-wider mt-0.5">
                      Accounts & Cashier Department
                    </p>
                    <p style={{ color: '#6b7280' }} className="text-[10px] mt-0.5">
                      Raniban, Kathmandu, Nepal • Phone: +977-1-4880000
                    </p>
                  </div>

                  <div className="text-right">
                    <div style={{ backgroundColor: '#000000', color: '#ffffff' }} className="inline-block px-3 py-1 font-mono font-extrabold text-xs uppercase tracking-wider rounded">
                      OFFICIAL MONEY RECEIPT
                    </div>
                    <div className="mt-2 font-mono text-xs space-y-0.5">
                      <span style={{ color: '#000000' }} className="font-black text-sm block">Receipt #: {printPayment.paymentNo}</span>
                      <span style={{ color: '#4b5563' }} className="block">Date: {formatDate((printPayment.receivedAt || '').split('T')[0])}</span>
                      <span style={{ color: '#4b5563' }} className="block uppercase">Status: {printPayment.status}</span>
                    </div>
                  </div>
                </div>

                {/* Received From Box */}
                <div style={{ borderColor: '#000000', backgroundColor: '#f9fafb' }} className="p-3 border rounded-lg space-y-1">
                  <div className="flex justify-between">
                    <span style={{ color: '#6b7280' }} className="text-[10px] font-bold uppercase tracking-wider">RECEIVED FROM:</span>
                    <span style={{ color: '#111827' }} className="font-mono text-[10px]">Currency: {printPayment.currency}</span>
                  </div>
                  <span style={{ color: '#000000' }} className="font-black text-base block">{printPayment.customerName}</span>
                </div>

                {/* Amount Highlight */}
                <div style={{ borderColor: '#000000', backgroundColor: '#f3f4f6' }} className="p-4 border-2 rounded-xl flex items-center justify-between">
                  <span style={{ color: '#374151' }} className="font-bold uppercase text-xs">Total Amount Received:</span>
                  <span style={{ color: '#000000' }} className="text-2xl font-mono font-black">
                    {formatMoney(printPayment.amountMinor, printPayment.currency)}
                  </span>
                </div>

                {/* Method Breakdown */}
                <div style={{ borderColor: '#e5e7eb' }} className="p-3 border rounded-lg space-y-1.5 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span style={{ color: '#6b7280' }} className="font-sans">Payment Channel:</span>
                    <strong style={{ color: '#111827' }} className="capitalize font-sans">{printPayment.method.replace('_', ' ')}</strong>
                  </div>
                  {printPayment.chequeNo && (
                    <div className="flex justify-between">
                      <span style={{ color: '#6b7280' }} className="font-sans">Cheque Particulars:</span>
                      <span style={{ color: '#111827' }}>Cheque #{printPayment.chequeNo} • Due: {formatDate(printPayment.chequeDate || '')}</span>
                    </div>
                  )}
                  {printPayment.note && (
                    <div className="flex justify-between">
                      <span style={{ color: '#6b7280' }} className="font-sans">Transaction Note / Ref:</span>
                      <span style={{ color: '#111827' }}>{printPayment.note}</span>
                    </div>
                  )}
                </div>

                <p style={{ color: '#6b7280' }} className="text-[10px] italic pt-1">
                  * Note: Cheque payments are subject to physical realization in the bank account before final credit settlement.
                </p>

                {/* Signatory Area */}
                <div style={{ borderColor: '#000000', color: '#000000' }} className="grid grid-cols-2 gap-6 pt-10 text-[10px] font-sans border-t mt-6 page-break-avoid">
                  <div>
                    <span style={{ color: '#4b5563' }} className="text-[9px]">Computer Generated Official Receipt</span>
                  </div>
                  <div className="text-center">
                    <div style={{ borderColor: '#000000' }} className="border-b w-36 mx-auto mb-1.5"></div>
                    <span className="font-bold block uppercase">Authorized Cashier / Accountant</span>
                    <span style={{ color: '#6b7280' }} className="text-[9px]">(Garment Factory)</span>
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
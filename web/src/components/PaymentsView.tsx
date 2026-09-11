import React, { useState, useEffect } from 'react';
import {
  api, type Customer, type Payment, type Invoice,
  type Currency, type PaymentMethod, type CustomerStatement,
  formatMoney, formatDate,
} from '../api.ts';
import { downloadCSV } from '../utils/csv.ts';

interface PaymentsViewProps {
  customers: Customer[];
  payments: Payment[];
  invoices: Invoice[];
  onRefresh: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({ customers, payments, invoices, onRefresh }) => {
  const [subTab, setSubTab] = useState<'receipts' | 'cheques' | 'statements'>('receipts');
  const [showRecordModal, setShowRecordModal] = useState<boolean>(false);
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  // Record payment form
  const [customerId, setCustomerId] = useState<number>(customers.length > 0 ? customers[0].id : 0);
  const [amountMajor, setAmountMajor] = useState<string>('');
  const [currency, setCurrency] = useState<Currency>('NPR');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [receivedAt, setReceivedAt] = useState<string>(new Date().toISOString().split('T')[0]);
  const [chequeNo, setChequeNo] = useState<string>('');
  const [chequeDate, setChequeDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [allocations, setAllocations] = useState<Record<number, number>>({});

  // Cheque actions
  const [showBounceModal, setShowBounceModal] = useState<boolean>(false);
  const [bouncePaymentId, setBouncePaymentId] = useState<number | null>(null);
  const [bounceReason, setBounceReason] = useState<string>('');

  // Statements
  const [statementCustomerId, setStatementCustomerId] = useState<number>(customers.length > 0 ? customers[0].id : 0);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [loadingStatement, setLoadingStatement] = useState<boolean>(false);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [filterCustomerId, setFilterCustomerId] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>(payments);

  useEffect(() => { setFilteredPayments(payments); }, [payments]);

  const applyFilters = () => {
    let result = payments;
    if (filterCustomerId) result = result.filter(p => String(p.customerId) === filterCustomerId);
    if (filterMethod) result = result.filter(p => p.method === filterMethod);
    if (filterFrom) result = result.filter(p => p.receivedAt >= filterFrom);
    if (filterTo) result = result.filter(p => p.receivedAt <= filterTo + 'T23:59:59');
    setFilteredPayments(result);
  };

  const clearFilters = () => {
    setFilterCustomerId(''); setFilterMethod(''); setFilterFrom(''); setFilterTo('');
    setFilteredPayments(payments);
  };

  const handleExport = () => {
    const headers = ['Receipt #', 'Date', 'Customer', 'Method', 'Status', 'Amount', 'Currency', 'Cheque #', 'Note'];
    const data = filteredPayments.map(p => [
      p.paymentNo, p.receivedAt.split('T')[0], p.customerName,
      p.method.replace('_', ' '), p.status,
      (p.amountMinor / 100).toFixed(2), p.currency,
      p.chequeNo ?? '', p.note ?? '',
    ]);
    downloadCSV(`payments_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const pendingCheques = payments.filter(p => p.status === 'pending' && p.method === 'cheque');

  const fetchStatement = async (cId: number) => {
    if (!cId) return;
    setLoadingStatement(true);
    try { const res = await api.getCustomerStatement(cId); setStatement(res.statement); }
    catch (err) { console.error('Failed to load statement:', err); }
    finally { setLoadingStatement(false); }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(amountMajor);
    if (isNaN(amountVal) || amountVal <= 0) { setError('Please enter a valid positive payment amount.'); return; }
    if (method === 'cheque' && (!chequeNo.trim() || !chequeDate)) { setError('Cheque number and cheque date are required.'); return; }
    setSubmitting(true); setError(null);
    try {
      await api.recordPayment({ customerId, amountMinor: Math.round(amountVal * 100), currency, method, receivedAt, chequeNo: method === 'cheque' ? chequeNo.trim() : undefined, chequeDate: method === 'cheque' ? chequeDate : undefined, note: note.trim() || undefined });
      setShowRecordModal(false); setAmountMajor(''); setChequeNo(''); setChequeDate(''); setNote('');
      onRefresh();
    } catch (err: any) { setError(err.message || 'Failed to record payment'); }
    finally { setSubmitting(false); }
  };

  const handleApplyPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;
    const allocList = Object.entries(allocations).map(([invId, amt]) => ({ invoiceId: Number(invId), amountMinor: amt })).filter(a => a.amountMinor > 0);
    if (allocList.length === 0) { setError('Please allocate an amount to at least one invoice.'); return; }
    setSubmitting(true); setError(null);
    try { await api.applyPayment(selectedPayment.id, allocList); setShowApplyModal(false); setSelectedPayment(null); onRefresh(); }
    catch (err: any) { setError(err.message || 'Failed to apply payment'); }
    finally { setSubmitting(false); }
  };

  const handleClearCheque = async (paymentId: number) => {
    if (!confirm('Mark this cheque as cleared by the bank?')) return;
    try { await api.clearCheque(paymentId); onRefresh(); }
    catch (err: any) { alert(err.message || 'Failed to clear cheque'); }
  };

  const handleBounceCheque = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bouncePaymentId || !bounceReason.trim()) return;
    setSubmitting(true); setError(null);
    try { await api.bounceCheque(bouncePaymentId, bounceReason.trim()); setShowBounceModal(false); setBouncePaymentId(null); setBounceReason(''); onRefresh(); }
    catch (err: any) { setError(err.message || 'Failed to record bounce'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-lg text-slate-900">Payments & Receivables</h3>
          <p className="text-xs text-slate-500 mt-0.5">Cash, Bank Transfers, and Cheque Drawer lifecycle.</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
            {(['receipts', 'cheques', 'statements'] as const).map(t => (
              <button key={t} onClick={() => { setSubTab(t); if (t === 'statements') fetchStatement(statementCustomerId); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize ${subTab === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}>
                {t === 'cheques' ? <>Cheque Drawer {pendingCheques.length > 0 && <span className="bg-blue-600 text-white px-1.5 rounded-full text-[10px] ml-1">{pendingCheques.length}</span>}</> : t === 'receipts' ? 'All Receipts' : 'Statements'}
              </button>
            ))}
          </div>
          <button onClick={() => { setShowRecordModal(true); setError(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm">+ Record Money In</button>
        </div>
      </div>

      {/* Receipts Tab */}
      {subTab === 'receipts' && (
        <div className="space-y-4">
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
                <label className="block text-xs font-bold text-slate-600 mb-1">Method</label>
                <select value={filterMethod} onChange={e => setFilterMethod(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none">
                  <option value="">All Methods</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">Receipt Date From</label>
                <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">Receipt Date To</label>
                <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={applyFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl">🔍 Apply</button>
                <button onClick={clearFilters} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">✕ Clear</button>
                <button onClick={handleExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl">⬇ Export CSV</button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900">Payment Receipts Log</h4>
              <span className="text-xs text-slate-500">{filteredPayments.length} receipts</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-right">Unallocated</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.length === 0 ? (
                    <tr><td colSpan={8} className="py-10 text-center text-slate-400 text-xs">No payments found.</td></tr>
                  ) : (
                    filteredPayments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-xs text-blue-900">{p.paymentNo}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">{formatDate(p.receivedAt.split('T')[0])}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{p.customerName}</td>
                        <td className="py-3 px-4 capitalize text-xs">{p.method.replace('_', ' ')}{p.chequeNo && <span className="text-slate-400 font-mono text-[10px] block">#{p.chequeNo}</span>}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${p.status === 'cleared' ? 'bg-emerald-100 text-emerald-800' : p.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800 line-through'}`}>{p.status.toUpperCase()}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold">{formatMoney(p.amountMinor, p.currency)}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-500">
                          {p.unappliedMinor > 0 ? <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded">{formatMoney(p.unappliedMinor, p.currency)}</span> : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {p.unappliedMinor > 0 && p.status === 'cleared' && (
                            <button onClick={() => { setSelectedPayment(p); setAllocations({}); setError(null); setShowApplyModal(true); }} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">Apply to Bills →</button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cheques Tab */}
      {subTab === 'cheques' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-amber-50/50">
            <h4 className="font-extrabold text-sm text-slate-900">Pending Cheques in Drawer</h4>
            <p className="text-xs text-slate-500 mt-0.5">Cheques held awaiting clearance. Does NOT reduce outstanding until marked cleared.</p>
          </div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Cheque #</th>
                  <th className="py-3 px-4">Cheque Date</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingCheques.length === 0 ? (
                  <tr><td colSpan={6} className="py-10 text-center text-slate-400 text-xs">No pending cheques.</td></tr>
                ) : (
                  pendingCheques.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-xs">{c.paymentNo}</td>
                      <td className="py-3 px-4 font-mono font-bold text-xs text-blue-900">{c.chequeNo}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{formatDate(c.chequeDate || '')}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{c.customerName}</td>
                      <td className="py-3 px-4 text-right font-mono font-black">{formatMoney(c.amountMinor, c.currency)}</td>
                      <td className="py-3 px-4 text-center space-x-2">
                        <button onClick={() => handleClearCheque(c.id)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">✓ Cleared</button>
                        <button onClick={() => { setBouncePaymentId(c.id); setShowBounceModal(true); setError(null); }} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-semibold">⚠ Bounced</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Statements Tab */}
      {subTab === 'statements' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center space-x-4">
            <label className="text-xs font-bold text-slate-500 uppercase">Select Customer:</label>
            <select value={statementCustomerId} onChange={e => { const id = Number(e.target.value); setStatementCustomerId(id); fetchStatement(id); }} className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-semibold bg-white">
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          </div>
          {loadingStatement ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading statement...</div>
          ) : statement ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <h4 className="text-lg font-black text-slate-900">{statement.customerName}</h4>
                <span className="text-xs text-slate-400">Customer Statement</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {statement.balances.map(b => (
                  <div key={b.currency} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 uppercase block mb-1">{b.currency} Balance</span>
                    <span className="text-xl font-black text-slate-900 block">{formatMoney(b.outstandingMinor, b.currency)}</span>
                    <div className="mt-3 text-[11px] text-slate-500 space-y-1">
                      <div className="flex justify-between"><span>Total Invoiced:</span><span>{formatMoney(b.invoicedMinor, b.currency)}</span></div>
                      <div className="flex justify-between"><span>Cleared:</span><span>{formatMoney(b.settledMinor, b.currency)}</span></div>
                      {b.advanceMinor > 0 && <div className="flex justify-between text-emerald-700 font-semibold bg-emerald-50 px-1 rounded"><span>Advance Held:</span><span>{formatMoney(b.advanceMinor, b.currency)}</span></div>}
                      {b.pendingChequeMinor > 0 && <div className="flex justify-between text-amber-700 font-semibold bg-amber-50 px-1 rounded"><span>Pending Cheques:</span><span>{formatMoney(b.pendingChequeMinor, b.currency)}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Record Payment Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div><h4 className="font-extrabold text-base text-slate-900">Record Payment Receipt</h4><p className="text-xs text-slate-500 mt-0.5">Records money received into the factory books.</p></div>
              <button onClick={() => setShowRecordModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer</label>
                <select value={customerId} onChange={e => { const c = customers.find(x => x.id === Number(e.target.value)); setCustomerId(Number(e.target.value)); if (c) setCurrency(c.defaultCurrency); }} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold" required>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Amount</label>
                  <input type="number" step="0.01" min="0.01" value={amountMajor} onChange={e => setAmountMajor(e.target.value)} placeholder="e.g. 50000.00" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value as Currency)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold">
                    <option value="NPR">NPR</option><option value="INR">INR</option><option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                  <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold">
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque (Pending)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Receipt Date</label>
                  <input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold" required />
                </div>
              </div>
              {method === 'cheque' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cheque Number</label>
                    <input type="text" value={chequeNo} onChange={e => setChequeNo(e.target.value)} placeholder="e.g. CHQ-998811" className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Cheque Date</label>
                    <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs" required />
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Note (Optional)</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Deposit for winter jacket order" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowRecordModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{submitting ? 'Recording…' : 'Record Payment Receipt'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apply Payment Modal */}
      {showApplyModal && selectedPayment && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900">Allocate Receipt {selectedPayment.paymentNo}</h4>
                <p className="text-xs text-slate-500 mt-0.5">Available: <span className="font-bold text-slate-900">{formatMoney(selectedPayment.unappliedMinor, selectedPayment.currency)}</span></p>
              </div>
              <button onClick={() => setShowApplyModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleApplyPayment} className="space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase"><tr><th className="p-2.5">Invoice #</th><th className="p-2.5">Date</th><th className="p-2.5 text-right">Total</th><th className="p-2.5 text-right">Allocate (Paisa)</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.filter(i => i.customerId === selectedPayment.customerId && i.status === 'issued' && i.currency === selectedPayment.currency).map(inv => (
                      <tr key={inv.id}>
                        <td className="p-2.5 font-mono font-bold text-blue-900">{inv.invoiceNo}</td>
                        <td className="p-2.5 text-slate-500">{formatDate(inv.invoiceDate)}</td>
                        <td className="p-2.5 text-right font-mono">{formatMoney(inv.totalMinor, inv.currency)}</td>
                        <td className="p-2.5 text-right"><input type="number" min="0" max={inv.totalMinor} value={allocations[inv.id] ?? 0} onChange={e => setAllocations(prev => ({ ...prev, [inv.id]: parseInt(e.target.value, 10) || 0 }))} className="w-24 px-2 py-1 text-right font-mono font-bold border border-slate-300 rounded-lg" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowApplyModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{submitting ? 'Applying…' : 'Apply Allocations'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bounce Modal */}
      {showBounceModal && bouncePaymentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div><h4 className="font-extrabold text-base text-slate-900">Record Cheque Bounce</h4><p className="text-xs text-slate-500 mt-0.5">Restores customer receivable and logs return reason.</p></div>
              <button onClick={() => setShowBounceModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleBounceCheque} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Bounce (Required)</label>
                <textarea value={bounceReason} onChange={e => setBounceReason(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" required />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowBounceModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">{submitting ? 'Recording…' : 'Confirm Bounce'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

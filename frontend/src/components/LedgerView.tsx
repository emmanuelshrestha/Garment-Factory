import React, { useState, useEffect } from 'react';
import { api, type Expense, type Purchase, type PaymentMethod, type Currency, formatMoney, formatDate } from '../api.ts';
import { downloadCSV } from '../utils/csv.ts';

interface LedgerViewProps {
  expenses: Expense[];
  purchases: Purchase[];
  onRefresh: () => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({ expenses, purchases, onRefresh }) => {
  const [tab, setTab] = useState<'expenses' | 'purchases'>('expenses');
  const [showExpenseModal, setShowExpenseModal] = useState<boolean>(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState<boolean>(false);

  // Expense form
  const [expCategory, setExpCategory] = useState<string>('factory_supplies');
  const [expAmountMajor, setExpAmountMajor] = useState<string>('');
  const [expCurrency, _setExpCurrency] = useState<Currency>('NPR');
  const [expMethod, setExpMethod] = useState<PaymentMethod>('cash');
  const [expPayee, setExpPayee] = useState<string>('');
  const [expNote, setExpNote] = useState<string>('');

  // Purchase form
  const [purSupplier, setPurSupplier] = useState<string>('');
  const [purDesc, setPurDesc] = useState<string>('');
  const [purAmountMajor, setPurAmountMajor] = useState<string>('');
  const [purCurrency, _setPurCurrency] = useState<Currency>('NPR');
  const [purNote, setPurNote] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state — Expenses
  const [expFilterCategory, setExpFilterCategory] = useState<string>('');
  const [expFilterFrom, setExpFilterFrom] = useState<string>('');
  const [expFilterTo, setExpFilterTo] = useState<string>('');
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>(expenses);

  // Filter state — Purchases
  const [purFilterFrom, setPurFilterFrom] = useState<string>('');
  const [purFilterTo, setPurFilterTo] = useState<string>('');
  const [filteredPurchases, setFilteredPurchases] = useState<Purchase[]>(purchases);

  useEffect(() => { setFilteredExpenses(expenses); }, [expenses]);
  useEffect(() => { setFilteredPurchases(purchases); }, [purchases]);

  const applyExpenseFilters = () => {
    let result = expenses;
    if (expFilterCategory) result = result.filter(e => e.category === expFilterCategory);
    if (expFilterFrom) result = result.filter(e => e.expenseDate >= expFilterFrom);
    if (expFilterTo) result = result.filter(e => e.expenseDate <= expFilterTo + 'T23:59:59');
    setFilteredExpenses(result);
  };

  const clearExpenseFilters = () => {
    setExpFilterCategory(''); setExpFilterFrom(''); setExpFilterTo('');
    setFilteredExpenses(expenses);
  };

  const handleExpenseExport = () => {
    const headers = ['Date', 'Category', 'Payee', 'Method', 'Amount', 'Currency', 'Note'];
    const data = filteredExpenses.map(e => [
      e.expenseDate.split('T')[0], e.category, e.payee ?? '',
      e.method.replace('_', ' '), (e.amountMinor / 100).toFixed(2), e.currency, e.note ?? '',
    ]);
    downloadCSV(`expenses_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const applyPurchaseFilters = () => {
    let result = purchases;
    if (purFilterFrom) result = result.filter(p => p.purchaseDate >= purFilterFrom);
    if (purFilterTo) result = result.filter(p => p.purchaseDate <= purFilterTo + 'T23:59:59');
    setFilteredPurchases(result);
  };

  const clearPurchaseFilters = () => {
    setPurFilterFrom(''); setPurFilterTo('');
    setFilteredPurchases(purchases);
  };

  const handlePurchaseExport = () => {
    const headers = ['Date', 'Supplier', 'Description', 'Amount', 'Currency', 'Note'];
    const data = filteredPurchases.map(p => [
      p.purchaseDate.split('T')[0], p.supplierName, p.description,
      (p.amountMinor / 100).toFixed(2), p.currency, p.note ?? '',
    ]);
    downloadCSV(`purchases_${new Date().toISOString().split('T')[0]}.csv`, headers, data);
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(expAmountMajor);
    if (isNaN(amountVal) || amountVal <= 0) { setError('Please enter a valid amount.'); return; }
    setSubmitting(true); setError(null);
    try {
      await api.createExpense({ category: expCategory, amountMinor: Math.round(amountVal * 100), currency: expCurrency, method: expMethod, payee: expPayee.trim() || undefined, note: expNote.trim() || undefined });
      setShowExpenseModal(false); setExpAmountMajor(''); setExpPayee(''); setExpNote('');
      onRefresh();
    } catch (err: any) { setError(err.message || 'Failed to record expense'); }
    finally { setSubmitting(false); }
  };

  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(purAmountMajor);
    if (isNaN(amountVal) || amountVal <= 0) { setError('Please enter a valid amount.'); return; }
    setSubmitting(true); setError(null);
    try {
      await api.createPurchase({ supplierName: purSupplier.trim(), description: purDesc.trim(), amountMinor: Math.round(amountVal * 100), currency: purCurrency, note: purNote.trim() || undefined });
      setShowPurchaseModal(false); setPurSupplier(''); setPurDesc(''); setPurAmountMajor(''); setPurNote('');
      onRefresh();
    } catch (err: any) { setError(err.message || 'Failed to record purchase'); }
    finally { setSubmitting(false); }
  };

  const expenseCategories = ['factory_supplies', 'utilities', 'transport', 'maintenance', 'salary', 'rent', 'other'];

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-lg text-slate-900 dark:text-slate-100">Expenses & Purchases</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Factory running costs and raw material / fabric purchases.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(['expenses', 'purchases'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize ${tab === t ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}`}>
                {t}
              </button>
            ))}
          </div>
          {tab === 'expenses' ? (
            <button onClick={() => { setShowExpenseModal(true); setError(null); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition">+ Record Expense</button>
          ) : (
            <button onClick={() => { setShowPurchaseModal(true); setError(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition">+ Record Purchase</button>
          )}
        </div>
      </div>

      {/* Expenses Tab */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Category</label>
                <select value={expFilterCategory} onChange={e => setExpFilterCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none">
                  <option value="">All Categories</option>
                  {expenseCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Date From</label>
                <input type="date" value={expFilterFrom} onChange={e => setExpFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Date To</label>
                <input type="date" value={expFilterTo} onChange={e => setExpFilterTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button onClick={applyExpenseFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition">Apply</button>
                <button onClick={clearExpenseFilters} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition">Clear</button>
                <button onClick={handleExpenseExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition">Export CSV</button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Expense Log</h4>
              <span className="text-xs text-slate-500 dark:text-slate-400">{filteredExpenses.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Date</th>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Category</th>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Payee</th>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Method</th>
                    <th className="py-2.5 px-4 text-right text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Amount</th>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredExpenses.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">No expenses found.</td></tr>
                  ) : (
                    filteredExpenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDate(exp.expenseDate.split('T')[0])}</td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-bold capitalize">{exp.category.replace('_', ' ')}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-sm whitespace-nowrap">{exp.payee ?? '—'}</td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 capitalize whitespace-nowrap">{exp.method.replace('_', ' ')}</td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-red-600 dark:text-red-400 whitespace-nowrap">{formatMoney(exp.amountMinor, exp.currency)}</td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">{exp.note ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Purchases Tab */}
      {tab === 'purchases' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Date From</label>
                <input type="date" value={purFilterFrom} onChange={e => setPurFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex-1 min-w-[130px]">
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Date To</label>
                <input type="date" value={purFilterTo} onChange={e => setPurFilterTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button onClick={applyPurchaseFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition">Apply</button>
                <button onClick={clearPurchaseFilters} className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition">Clear</button>
                <button onClick={handlePurchaseExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition">Export CSV</button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">Purchase Log</h4>
              <span className="text-xs text-slate-500 dark:text-slate-400">{filteredPurchases.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Date</th>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Supplier</th>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Description</th>
                    <th className="py-2.5 px-4 text-right text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Amount</th>
                    <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPurchases.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400 dark:text-slate-500 text-xs">No purchases found.</td></tr>
                  ) : (
                    filteredPurchases.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                        <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDate(p.purchaseDate.split('T')[0])}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{p.supplierName}</td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{p.description}</td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-600 dark:text-blue-400 whitespace-nowrap">{formatMoney(p.amountMinor, p.currency)}</td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">{p.note ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Record Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div><h4 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Record Factory Expense</h4><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Running costs paid out of factory funds.</p></div>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg p-1">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 rounded-xl text-xs font-semibold border border-red-200 dark:border-red-900/60">{error}</div>}
            <form onSubmit={handleCreateExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Category</label>
                <select value={expCategory} onChange={e => setExpCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-500">
                  {expenseCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (Rs.)</label>
                  <input type="number" step="0.01" min="0.01" value={expAmountMajor} onChange={e => setExpAmountMajor(e.target.value)} placeholder="e.g. 5000.00" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Method</label>
                  <select value={expMethod} onChange={e => setExpMethod(e.target.value as PaymentMethod)} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-500">
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payee (Optional)</label>
                <input type="text" value={expPayee} onChange={e => setExpPayee(e.target.value)} placeholder="e.g. Electricity Board, Mechanic" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Note (Optional)</label>
                <input type="text" value={expNote} onChange={e => setExpNote(e.target.value)} placeholder="e.g. August electricity bill" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-xs transition disabled:opacity-50">{submitting ? 'Saving…' : 'Record Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div><h4 className="font-extrabold text-base text-slate-900 dark:text-slate-100">Record Raw Material Purchase</h4><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Fabric, thread, accessories, or other inputs bought.</p></div>
              <button onClick={() => setShowPurchaseModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg p-1">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 rounded-xl text-xs font-semibold border border-red-200 dark:border-red-900/60">{error}</div>}
            <form onSubmit={handleCreatePurchase} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Supplier Name</label>
                <input type="text" value={purSupplier} onChange={e => setPurSupplier(e.target.value)} placeholder="e.g. Kathmandu Fabric House" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-500" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
                <input type="text" value={purDesc} onChange={e => setPurDesc(e.target.value)} placeholder="e.g. 500m fleece fabric (blue)" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:border-blue-500" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (Rs.)</label>
                <input type="number" step="0.01" min="0.01" value={purAmountMajor} onChange={e => setPurAmountMajor(e.target.value)} placeholder="e.g. 125000.00" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-500" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Note (Optional)</label>
                <input type="text" value={purNote} onChange={e => setPurNote(e.target.value)} placeholder="e.g. Invoice #FH-2209" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowPurchaseModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition disabled:opacity-50">{submitting ? 'Saving…' : 'Record Purchase'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

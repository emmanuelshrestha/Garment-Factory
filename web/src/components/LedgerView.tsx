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
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-extrabold text-lg text-slate-900">Expenses & Purchases</h3>
          <p className="text-xs text-slate-500 mt-0.5">Factory running costs and raw material / fabric purchases.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
            {(['expenses', 'purchases'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition capitalize ${tab === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'}`}>
                {t}
              </button>
            ))}
          </div>
          {tab === 'expenses' ? (
            <button onClick={() => { setShowExpenseModal(true); setError(null); }} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl">+ Record Expense</button>
          ) : (
            <button onClick={() => { setShowPurchaseModal(true); setError(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl">+ Record Purchase</button>
          )}
        </div>
      </div>

      {/* Expenses Tab */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">Category</label>
                <select value={expFilterCategory} onChange={e => setExpFilterCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none">
                  <option value="">All Categories</option>
                  {expenseCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">Date From</label>
                <input type="date" value={expFilterFrom} onChange={e => setExpFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">Date To</label>
                <input type="date" value={expFilterTo} onChange={e => setExpFilterTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={applyExpenseFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl">🔍 Apply</button>
                <button onClick={clearExpenseFilters} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">✕ Clear</button>
                <button onClick={handleExpenseExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl">⬇ Export CSV</button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900">Expense Log</h4>
              <span className="text-xs text-slate-500">{filteredExpenses.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Payee</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-slate-400 text-xs">No expenses found.</td></tr>
                  ) : (
                    filteredExpenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-xs text-slate-600">{formatDate(exp.expenseDate.split('T')[0])}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold capitalize">{exp.category.replace('_', ' ')}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 text-sm">{exp.payee ?? '—'}</td>
                        <td className="py-3 px-4 text-xs text-slate-500 capitalize">{exp.method.replace('_', ' ')}</td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-red-700">{formatMoney(exp.amountMinor, exp.currency)}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{exp.note ?? '—'}</td>
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
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">Date From</label>
                <input type="date" value={purFilterFrom} onChange={e => setPurFilterFrom(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-bold text-slate-600 mb-1">Date To</label>
                <input type="date" value={purFilterTo} onChange={e => setPurFilterTo(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-600 focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={applyPurchaseFilters} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl">🔍 Apply</button>
                <button onClick={clearPurchaseFilters} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">✕ Clear</button>
                <button onClick={handlePurchaseExport} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl">⬇ Export CSV</button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h4 className="font-extrabold text-sm text-slate-900">Purchase Log</h4>
              <span className="text-xs text-slate-500">{filteredPurchases.length} entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchases.length === 0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-slate-400 text-xs">No purchases found.</td></tr>
                  ) : (
                    filteredPurchases.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 text-xs text-slate-600">{formatDate(p.purchaseDate.split('T')[0])}</td>
                        <td className="py-3 px-4 font-semibold text-slate-800">{p.supplierName}</td>
                        <td className="py-3 px-4 text-slate-700">{p.description}</td>
                        <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-800">{formatMoney(p.amountMinor, p.currency)}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{p.note ?? '—'}</td>
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div><h4 className="font-extrabold text-base text-slate-900">Record Factory Expense</h4><p className="text-xs text-slate-500 mt-0.5">Running costs paid out of factory funds.</p></div>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleCreateExpense} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <select value={expCategory} onChange={e => setExpCategory(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold">
                  {expenseCategories.map(c => <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Amount (Rs.)</label>
                  <input type="number" step="0.01" min="0.01" value={expAmountMajor} onChange={e => setExpAmountMajor(e.target.value)} placeholder="e.g. 5000.00" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                  <select value={expMethod} onChange={e => setExpMethod(e.target.value as PaymentMethod)} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold">
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payee (Optional)</label>
                <input type="text" value={expPayee} onChange={e => setExpPayee(e.target.value)} placeholder="e.g. Electricity Board, Mechanic" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Note (Optional)</label>
                <input type="text" value={expNote} onChange={e => setExpNote(e.target.value)} placeholder="e.g. August electricity bill" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowExpenseModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50">{submitting ? 'Saving…' : 'Record Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Purchase Modal */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div><h4 className="font-extrabold text-base text-slate-900">Record Raw Material Purchase</h4><p className="text-xs text-slate-500 mt-0.5">Fabric, thread, accessories, or other inputs bought.</p></div>
              <button onClick={() => setShowPurchaseModal(false)} className="text-slate-400 hover:text-slate-700 font-bold text-lg">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleCreatePurchase} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Supplier Name</label>
                <input type="text" value={purSupplier} onChange={e => setPurSupplier(e.target.value)} placeholder="e.g. Kathmandu Fabric House" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                <input type="text" value={purDesc} onChange={e => setPurDesc(e.target.value)} placeholder="e.g. 500m fleece fabric (blue)" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount (Rs.)</label>
                <input type="number" step="0.01" min="0.01" value={purAmountMajor} onChange={e => setPurAmountMajor(e.target.value)} placeholder="e.g. 125000.00" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Note (Optional)</label>
                <input type="text" value={purNote} onChange={e => setPurNote(e.target.value)} placeholder="e.g. Invoice #FH-2209" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowPurchaseModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">{submitting ? 'Saving…' : 'Record Purchase'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

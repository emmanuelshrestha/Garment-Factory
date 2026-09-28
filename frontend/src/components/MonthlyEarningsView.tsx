import React, { useState, useEffect } from 'react';
import { api, formatMoney, type MonthlyEarningsSummary, type Employee } from '../api.ts';

const NEPALI_MONTHS = [
  { value: 1, label: 'Baisakh' },
  { value: 2, label: 'Jestha' },
  { value: 3, label: 'Ashadh' },
  { value: 4, label: 'Shrawan' },
  { value: 5, label: 'Bhadra' },
  { value: 6, label: 'Ashwin' },
  { value: 7, label: 'Kartik' },
  { value: 8, label: 'Mangsir' },
  { value: 9, label: 'Poush' },
  { value: 10, label: 'Magh' },
  { value: 11, label: 'Falgun' },
  { value: 12, label: 'Chaitra' },
];

// Current Nepali fiscal year (2081/2082 as of Sep 2025)
const CURRENT_FISCAL_YEAR = 2082;

interface MonthlyEarningsViewProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  onEarningsChanged?: () => void;
}

export const MonthlyEarningsView: React.FC<MonthlyEarningsViewProps> = ({ employees, onSelectEmployee, onEarningsChanged }) => {
  const [fiscalYear, setFiscalYear] = useState<number>(CURRENT_FISCAL_YEAR);
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1); // Current Nepali month
  
  const [summary, setSummary] = useState<MonthlyEarningsSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // For adding/editing earnings
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [showEarningsForm, setShowEarningsForm] = useState<boolean>(false);
  const [formData, setFormData] = useState({
    quantity: '',
    totalEarned: '',
    advance: '',
    others: '',
    note: '',
  });

  const loadMonthlyEarnings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getMonthlyEarnings(fiscalYear, month);
      setSummary(response.summary || []);
    } catch (err: any) {
      console.error('Failed to load monthly earnings:', err);
      setError(err.message || 'Failed to load earnings data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthlyEarnings();
  }, [fiscalYear, month]);

  const handleOpenEarningsForm = (employeeId: number) => {
    setSelectedEmployeeId(employeeId);
    setFormData({
      quantity: '',
      totalEarned: '',
      advance: '',
      others: '',
      note: '',
    });
    setShowEarningsForm(true);
  };

  const handleSaveEarnings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    const quantity = parseInt(formData.quantity) || 0;
    const totalEarned = parseFloat(formData.totalEarned) * 100 || 0;
    const advance = parseFloat(formData.advance) * 100 || 0;
    const others = parseFloat(formData.others) * 100 || 0;

    if (quantity === 0 && totalEarned === 0 && advance === 0 && others === 0) {
      setError('Please enter at least one value');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      
      await api.recordEarnings({
        employeeId: selectedEmployeeId,
        fiscalYear,
        month,
        quantity,
        totalEarned,
        advance,
        others,
        note: formData.note.trim() || undefined,
      });

      setShowEarningsForm(false);
      setSelectedEmployeeId(null);
      loadMonthlyEarnings();
      
      if (onEarningsChanged) onEarningsChanged();
    } catch (err: any) {
      console.error('Failed to save earnings:', err);
      setError(err.message || 'Failed to save earnings');
    } finally {
      setSaving(false);
    }
  };

  const currentMonthLabel = NEPALI_MONTHS.find(m => m.value === month)?.label || '';

  // Calculate totals
  const totalQuantity = summary.reduce((sum, s) => sum + s.quantity, 0);
  const totalEarned = summary.reduce((sum, s) => sum + s.totalEarned, 0);
  const totalAdvance = summary.reduce((sum, s) => sum + s.advance, 0);
  const totalOthers = summary.reduce((sum, s) => sum + s.others, 0);
  const totalDue = summary.reduce((sum, s) => sum + s.closingDue, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Monthly Earnings</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Track tailor earnings and dues by month</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Fiscal Year
            </label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(parseInt(e.target.value))}
              className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {[...Array(10)].map((_, i) => {
                const year = CURRENT_FISCAL_YEAR - i;
                return (
                  <option key={year} value={year}>
                    {year}
                  </option>
                );
              })}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Month
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {NEPALI_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={loadMonthlyEarnings}
              className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/60 text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Quantity</div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{totalQuantity.toLocaleString()}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Earned</div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatMoney(totalEarned)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Advance</div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatMoney(totalAdvance)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Other Deductions</div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatMoney(totalOthers)}</div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs col-span-2 sm:col-span-1">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Due</div>
          <div className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400 mt-1">{formatMoney(totalDue)}</div>
        </div>
      </div>

      {/* Earnings Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              {currentMonthLabel} {fiscalYear}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {summary.length} active employee{summary.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Loading earnings...</p>
          </div>
        ) : summary.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <p className="text-slate-600 dark:text-slate-400">No earnings recorded for this month</p>
            <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Add employees first, then record their monthly earnings</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
                  <th className="py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Tailor #
                  </th>
                  <th className="py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Name
                  </th>
                  <th className="text-right py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Qty
                  </th>
                  <th className="text-right py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Total
                  </th>
                  <th className="text-right py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Advance
                  </th>
                  <th className="text-right py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Others
                  </th>
                  <th className="text-right py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Due
                  </th>
                  <th className="py-3.5 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {summary.map((entry) => (
                  <tr key={entry.employeeId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                      <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                        {entry.tailorNumber}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{entry.employeeName}</div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">{entry.quantity.toLocaleString()}</div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">{formatMoney(entry.totalEarned)}</div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="text-sm font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                        {entry.advance > 0 ? formatMoney(entry.advance) : '-'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className="text-sm font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                        {entry.others > 0 ? formatMoney(entry.others) : '-'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                      <div className={`text-sm font-mono tabular-nums font-bold ${
                        entry.closingDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {formatMoney(entry.closingDue)}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEarningsForm(entry.employeeId)}
                          className="px-3 py-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition"
                        >
                          {entry.quantity > 0 || entry.totalEarned > 0 ? 'Edit' : 'Add'}
                        </button>
                        <button
                          onClick={() => {
                            const emp = employees.find(e => e.id === entry.employeeId) || {
                              id: entry.employeeId,
                              tailorNumber: entry.tailorNumber,
                              name: entry.employeeName,
                              isActive: true,
                              createdAt: '',
                              updatedAt: ''
                            };
                            onSelectEmployee(emp);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition"
                        >
                          History
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Earnings Form Modal */}
      {showEarningsForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100">Record Earnings</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {currentMonthLabel} {fiscalYear}
                </p>
              </div>
              <button onClick={() => setShowEarningsForm(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-bold text-lg p-1">✕</button>
            </div>
            
            <form onSubmit={handleSaveEarnings} className="p-5 sm:p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Quantity Produced
                </label>
                <input
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                  min="0"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Total Earned (NPR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.totalEarned}
                  onChange={(e) => setFormData(prev => ({ ...prev, totalEarned: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  min="0"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Advance (NPR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.advance}
                  onChange={(e) => setFormData(prev => ({ ...prev, advance: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Others / Deductions (NPR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.others}
                  onChange={(e) => setFormData(prev => ({ ...prev, others: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0.00"
                  min="0"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Note (optional)
                </label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))}
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add any notes..."
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEarningsForm(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Earnings'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
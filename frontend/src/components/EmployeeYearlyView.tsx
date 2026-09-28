import React, { useState, useEffect } from 'react';
import { api, formatMoney, type EarningsEntry, type Employee } from '../api.ts';

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

interface EmployeeYearlyViewProps {
  employee: Employee;
  onBack: () => void;
}

export const EmployeeYearlyView: React.FC<EmployeeYearlyViewProps> = ({ employee, onBack }) => {
  const [history, setHistory] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadEmployeeHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getEmployeeHistory(employee.id);
      setHistory(response.history || []);
    } catch (err: any) {
      console.error('Failed to load employee history:', err);
      setError(err.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeHistory();
  }, [employee.id]);

  const getMonthLabel = (month: number) => {
    return NEPALI_MONTHS.find(m => m.value === month)?.label || `Month ${month}`;
  };

  // Calculate yearly totals grouped by fiscal year
  const yearlyTotals = history.reduce((acc, entry) => {
    if (!acc[entry.fiscalYear]) {
      acc[entry.fiscalYear] = {
        quantity: 0,
        totalEarned: 0,
        advance: 0,
        others: 0,
      };
    }
    acc[entry.fiscalYear].quantity += entry.quantity;
    acc[entry.fiscalYear].totalEarned += entry.totalEarned;
    acc[entry.fiscalYear].advance += entry.advance;
    acc[entry.fiscalYear].others += entry.others;
    return acc;
  }, {} as Record<number, { quantity: number; totalEarned: number; advance: number; others: number }>);

  const sortedYears = Object.keys(yearlyTotals)
    .map(Number)
    .sort((a, b) => b - a); // Most recent first

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1"
            >
              <span>← Back</span>
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {employee.name} <span className="text-sm font-normal text-slate-500 dark:text-slate-400">(#{employee.tailorNumber})</span>
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Yearly Earnings & Dues History</p>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/60 text-sm font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Loading history...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-xs">
          <svg className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-600 dark:text-slate-400">No earnings history found</p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Record monthly earnings to see the history here</p>
        </div>
      ) : (
        <div className="space-y-6 sm:space-y-8">
          {/* Yearly Summary Cards */}
          {sortedYears.map((year) => {
            const totals = yearlyTotals[year];
            const openingDue = history
              .filter(h => h.fiscalYear === year)
              .sort((a, b) => a.month - b.month)[0]?.openingDue || 0;
            const closingDue = history
              .filter(h => h.fiscalYear === year)
              .sort((a, b) => b.month - a.month)[0]?.closingDue || 0;

            return (
              <div key={year} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                <div className="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100">
                        Year {year}
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                        {history.filter(h => h.fiscalYear === year).length} month(s) recorded
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Opening Due</div>
                      <div className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{formatMoney(openingDue)}</div>
                    </div>
                  </div>
                </div>

                {/* Yearly Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Qty</div>
                    <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {totals.quantity.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Earned</div>
                    <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {formatMoney(totals.totalEarned)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Advances</div>
                    <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {formatMoney(totals.advance)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Closing Due</div>
                    <div className={`text-base sm:text-lg font-bold mt-1 ${
                      closingDue > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                      {formatMoney(closingDue)}
                    </div>
                  </div>
                </div>

                {/* Monthly Details */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
                        <th className="py-3 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          Month
                        </th>
                        <th className="text-right py-3 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          Qty
                        </th>
                        <th className="text-right py-3 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          Earned
                        </th>
                        <th className="text-right py-3 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          Advance
                        </th>
                        <th className="text-right py-3 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          Others
                        </th>
                        <th className="text-right py-3 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          Due
                        </th>
                        <th className="py-3 px-4 sm:px-6 text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          Note
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {history
                        .filter(h => h.fiscalYear === year)
                        .sort((a, b) => b.month - a.month)
                        .map((entry) => (
                          <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                            <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                              <div className="font-medium text-slate-900 dark:text-slate-100">
                                {getMonthLabel(entry.month)}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                              <div className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                                {entry.quantity.toLocaleString()}
                              </div>
                            </td>
                            <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                              <div className="text-sm font-mono tabular-nums font-medium text-slate-900 dark:text-slate-100">
                                {formatMoney(entry.totalEarned)}
                              </div>
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
                            <td className="py-3.5 px-4 sm:px-6">
                              <div className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">
                                {entry.note || '-'}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Formula Reference */}
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
        <strong className="text-slate-900 dark:text-slate-100">Formula:</strong> Closing Due = Opening Due + Total Earned + Others - Advance
      </div>
    </div>
  );
};
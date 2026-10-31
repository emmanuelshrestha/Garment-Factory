import React, { useState, useEffect, useMemo } from 'react';
import { 
  Printer, Search, X, Check, Save, RefreshCw, 
  GripVertical 
} from 'lucide-react';
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

function getCurrentNepaliDate(): { year: number; month: number } {
  const now = new Date();
  const adYear = now.getFullYear();
  const adMonth = now.getMonth();
  const adDay = now.getDate();

  const cutoffs = [15, 13, 14, 14, 15, 15, 16, 17, 17, 17, 16, 16];
  const isAfterCutoff = adDay >= cutoffs[adMonth];

  let bsMonth: number;
  switch (adMonth) {
    case 0:  bsMonth = isAfterCutoff ? 10 : 9;  break;
    case 1:  bsMonth = isAfterCutoff ? 11 : 10; break;
    case 2:  bsMonth = isAfterCutoff ? 12 : 11; break;
    case 3:  bsMonth = isAfterCutoff ? 1  : 12; break;
    case 4:  bsMonth = isAfterCutoff ? 2  : 1;  break;
    case 5:  bsMonth = isAfterCutoff ? 3  : 2;  break;
    case 6:  bsMonth = isAfterCutoff ? 4  : 3;  break;
    case 7:  bsMonth = isAfterCutoff ? 5  : 4;  break;
    case 8:  bsMonth = isAfterCutoff ? 6  : 5;  break;
    case 9:  bsMonth = isAfterCutoff ? 7  : 6;  break;
    case 10: bsMonth = isAfterCutoff ? 8  : 7;  break;
    case 11: bsMonth = isAfterCutoff ? 9  : 8;  break;
    default: bsMonth = 1;
  }

  const isNewNepaliYear = adMonth > 3 || (adMonth === 3 && adDay >= 14);
  const bsYear = adYear + (isNewNepaliYear ? 57 : 56);

  return { year: bsYear, month: bsMonth };
}

interface MonthlyEarningsViewProps {
  employees: Employee[];
  onSelectEmployee: (emp: Employee) => void;
  onEarningsChanged?: () => void;
}

interface EditableRow {
  employeeId: number;
  tailorNumber: string;
  employeeName: string;
  openingDue: number;
  grossEarnedInput: string;
  advanceInput: string;
  othersInput: string;
  paidInput: string;
  noteInput: string;
  isDirty: boolean;
  isSaving: boolean;
}

function parseNotePayload(rawNote: string | undefined, totalAdvancePaisa: number) {
  if (!rawNote) {
    return {
      advance: totalAdvancePaisa > 0 ? (totalAdvancePaisa / 100).toString() : '',
      paid: '',
      note: '',
    };
  }
  const match = rawNote.match(/^\[Adv:\s*([\d.]+)\s*\|\s*Paid:\s*([\d.]+)\]\s*(.*)$/s);
  if (match) {
    return {
      advance: match[1] === '0' ? '' : match[1],
      paid: match[2] === '0' ? '' : match[2],
      note: match[3] || '',
    };
  }
  return {
    advance: totalAdvancePaisa > 0 ? (totalAdvancePaisa / 100).toString() : '',
    paid: '',
    note: rawNote,
  };
}

function buildNotePayload(advanceStr: string, paidStr: string, userNote: string) {
  const adv = parseFloat(advanceStr) || 0;
  const paid = parseFloat(paidStr) || 0;
  const cleanNote = userNote.trim();
  if (adv > 0 || paid > 0) {
    const prefix = `[Adv: ${adv} | Paid: ${paid}]`;
    return cleanNote ? `${prefix} ${cleanNote}` : prefix;
  }
  return cleanNote;
}

export const MonthlyEarningsView: React.FC<MonthlyEarningsViewProps> = ({
  employees,
  onSelectEmployee,
  onEarningsChanged,
}) => {
  const initialDate = useMemo(() => getCurrentNepaliDate(), []);
  const [fiscalYear, setFiscalYear] = useState<number>(initialDate.year);
  const [month, setMonth] = useState<number>(initialDate.month);

  const availableYears = useMemo(() => {
    const currentYear = getCurrentNepaliDate().year;
    const minYear = 2080;
    const maxYear = Math.max(currentYear + 2, fiscalYear);
    const years: number[] = [];
    for (let y = maxYear; y >= Math.min(minYear, fiscalYear); y--) {
      years.push(y);
    }
    return years;
  }, [fiscalYear]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const [gridData, setGridData] = useState<Record<number, EditableRow>>({});
  const [bulkSaving, setBulkSaving] = useState(false);

  // Persistent Custom Order State
  const [orderedIds, setOrderedIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('tailor_custom_display_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Drag and drop state
  const [draggedEmpId, setDraggedEmpId] = useState<number | null>(null);
  const [dragOverEmpId, setDragOverEmpId] = useState<number | null>(null);

  // Printable Settlement Slip Modal
  const [slipData, setSlipData] = useState<{
    tailorNumber: string;
    employeeName: string;
    openingDue: number;
    grossEarned: number;
    advance: number;
    others: number;
    netPayable: number;
    paidAmount: number;
    remainingDue: number;
    note: string;
  } | null>(null);

  const currentMonthLabel = NEPALI_MONTHS.find((m) => m.value === month)?.label || '';

  const loadMonthlyData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getMonthlyEarnings(fiscalYear, month);
      const summaries: MonthlyEarningsSummary[] = response.summary || [];

      const initialRows: Record<number, EditableRow> = {};
      const incomingIds: number[] = [];

      summaries.forEach((s) => {
        incomingIds.push(s.employeeId);
        const { advance, paid, note } = parseNotePayload(s.note ?? undefined, s.advance);

        initialRows[s.employeeId] = {
          employeeId: s.employeeId,
          tailorNumber: s.tailorNumber,
          employeeName: s.employeeName,
          openingDue: s.openingDue || 0,
          grossEarnedInput: s.totalEarned > 0 ? (s.totalEarned / 100).toString() : '',
          advanceInput: advance,
          othersInput: s.others !== 0 ? (s.others / 100).toString() : '',
          paidInput: paid,
          noteInput: note,
          isDirty: false,
          isSaving: false,
        };
      });

      setGridData(initialRows);

      // Merge newly added employees into the order array
      setOrderedIds((prev) => {
        const existingSet = new Set(prev);
        const newUnordered = incomingIds.filter((id) => !existingSet.has(id));
        if (newUnordered.length > 0) {
          const updated = [...prev, ...newUnordered];
          localStorage.setItem('tailor_custom_display_order', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    } catch (err: any) {
      console.error('Failed to load monthly earnings:', err);
      setError(err.message || 'Failed to load ledger data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonthlyData();
  }, [fiscalYear, month]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedEmpId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id.toString());
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (id !== dragOverEmpId) {
      setDragOverEmpId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedEmpId === null || draggedEmpId === targetId) {
      setDraggedEmpId(null);
      setDragOverEmpId(null);
      return;
    }

    setOrderedIds((prev) => {
      const currentList = [...prev];
      const sourceIndex = currentList.indexOf(draggedEmpId);
      const targetIndex = currentList.indexOf(targetId);

      if (sourceIndex === -1 || targetIndex === -1) return prev;

      currentList.splice(sourceIndex, 1);
      currentList.splice(targetIndex, 0, draggedEmpId);

      localStorage.setItem('tailor_custom_display_order', JSON.stringify(currentList));
      return currentList;
    });

    setDraggedEmpId(null);
    setDragOverEmpId(null);
  };

  const handleDragEnd = () => {
    setDraggedEmpId(null);
    setDragOverEmpId(null);
  };

  const handleCellChange = (
    employeeId: number,
    field: 'grossEarnedInput' | 'advanceInput' | 'othersInput' | 'paidInput' | 'noteInput',
    value: string
  ) => {
    setGridData((prev) => {
      const row = prev[employeeId];
      if (!row) return prev;
      return {
        ...prev,
        [employeeId]: {
          ...row,
          [field]: value,
          isDirty: true,
        },
      };
    });
  };

  const handlePayInFull = (employeeId: number, netPayableRupees: number) => {
    handleCellChange(employeeId, 'paidInput', Math.max(0, netPayableRupees).toString());
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    fieldKey: string,
    filteredLength: number
  ) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = rowIndex + 1;
      if (nextRow < filteredLength) {
        const nextInput = document.querySelector<HTMLInputElement>(
          `input[data-row="${nextRow}"][data-field="${fieldKey}"]`
        );
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = rowIndex - 1;
      if (prevRow >= 0) {
        const prevInput = document.querySelector<HTMLInputElement>(
          `input[data-row="${prevRow}"][data-field="${fieldKey}"]`
        );
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      }
    }
  };

  const saveRow = async (employeeId: number) => {
    const row = gridData[employeeId];
    if (!row) return;

    const grossEarnedPaisa = Math.round((parseFloat(row.grossEarnedInput) || 0) * 100);
    const advancePaisa = Math.round((parseFloat(row.advanceInput) || 0) * 100);
    const othersPaisa = Math.round((parseFloat(row.othersInput) || 0) * 100);
    const paidPaisa = Math.round((parseFloat(row.paidInput) || 0) * 100);

    const totalDeductedPaisa = advancePaisa + paidPaisa;
    const combinedNote = buildNotePayload(row.advanceInput, row.paidInput, row.noteInput);

    setGridData((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], isSaving: true },
    }));

    try {
      await api.recordEarnings({
        employeeId: row.employeeId,
        fiscalYear,
        month,
        quantity: 0,
        totalEarned: grossEarnedPaisa,
        advance: totalDeductedPaisa,
        others: othersPaisa,
        note: combinedNote || undefined,
      });

      setGridData((prev) => ({
        ...prev,
        [employeeId]: { ...prev[employeeId], isDirty: false, isSaving: false },
      }));

      setSuccessMessage(`Saved Tailor #${row.tailorNumber}`);
      setTimeout(() => setSuccessMessage(null), 2500);

      if (onEarningsChanged) onEarningsChanged();
    } catch (err: any) {
      setError(err.message || `Failed to save Tailor #${row.tailorNumber}`);
      setGridData((prev) => ({
        ...prev,
        [employeeId]: { ...prev[employeeId], isSaving: false },
      }));
    }
  };

  const saveAllDirtyRows = async () => {
    const dirtyRows = Object.values(gridData).filter((r) => r.isDirty);
    if (dirtyRows.length === 0) return;

    setBulkSaving(true);
    setError(null);

    try {
      for (const row of dirtyRows) {
        const grossEarnedPaisa = Math.round((parseFloat(row.grossEarnedInput) || 0) * 100);
        const advancePaisa = Math.round((parseFloat(row.advanceInput) || 0) * 100);
        const othersPaisa = Math.round((parseFloat(row.othersInput) || 0) * 100);
        const paidPaisa = Math.round((parseFloat(row.paidInput) || 0) * 100);

        const totalDeductedPaisa = advancePaisa + paidPaisa;
        const combinedNote = buildNotePayload(row.advanceInput, row.paidInput, row.noteInput);

        await api.recordEarnings({
          employeeId: row.employeeId,
          fiscalYear,
          month,
          quantity: 0,
          totalEarned: grossEarnedPaisa,
          advance: totalDeductedPaisa,
          others: othersPaisa,
          note: combinedNote || undefined,
        });
      }

      setGridData((prev) => {
        const updated = { ...prev };
        dirtyRows.forEach((r) => {
          if (updated[r.employeeId]) {
            updated[r.employeeId] = { ...updated[r.employeeId], isDirty: false };
          }
        });
        return updated;
      });

      setSuccessMessage(`Saved ${dirtyRows.length} tailor record(s)`);
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadMonthlyData();

      if (onEarningsChanged) onEarningsChanged();
    } catch (err: any) {
      setError(err.message || 'Failed to save some rows.');
    } finally {
      setBulkSaving(false);
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveAllDirtyRows();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  // Sort rows based on custom drag-and-drop order
  const filteredRows = useMemo(() => {
    const list = Object.values(gridData);

    const orderMap = new Map<number, number>();
    orderedIds.forEach((id, index) => {
      orderMap.set(id, index);
    });

    list.sort((a, b) => {
      const posA = orderMap.has(a.employeeId) ? orderMap.get(a.employeeId)! : 99999;
      const posB = orderMap.has(b.employeeId) ? orderMap.get(b.employeeId)! : 99999;
      return posA - posB;
    });

    if (!searchFilter.trim()) return list;
    const q = searchFilter.toLowerCase();
    return list.filter(
      (r) =>
        r.tailorNumber.toLowerCase().includes(q) ||
        r.employeeName.toLowerCase().includes(q)
    );
  }, [gridData, searchFilter, orderedIds]);

  const totals = useMemo(() => {
    let grossTotal = 0;
    let advanceTotal = 0;
    let payableTotal = 0;
    let paidTotal = 0;
    let remainingDueTotal = 0;

    Object.values(gridData).forEach((r) => {
      const gross = (parseFloat(r.grossEarnedInput) || 0) * 100;
      const adv = (parseFloat(r.advanceInput) || 0) * 100;
      const oth = (parseFloat(r.othersInput) || 0) * 100;
      const paid = (parseFloat(r.paidInput) || 0) * 100;

      const netPayable = r.openingDue + gross - adv + oth;
      const remainingDue = netPayable - paid;

      grossTotal += gross;
      advanceTotal += adv;
      payableTotal += netPayable;
      paidTotal += paid;
      remainingDueTotal += remainingDue;
    });

    return { grossTotal, advanceTotal, payableTotal, paidTotal, remainingDueTotal };
  }, [gridData]);

  const dirtyCount = useMemo(
    () => Object.values(gridData).filter((r) => r.isDirty).length,
    [gridData]
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto font-sans">
      {/* Header Banner */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Monthly Earnings & Settlements
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tally notebook batch records, apply advances, log cash payouts, and track carried dues. Drag handle to reorder rows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {dirtyCount > 0 && (
            <button
              type="button"
              onClick={saveAllDirtyRows}
              disabled={bulkSaving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <Save size={14} />
              <span>{bulkSaving ? 'Saving...' : `Save All (${dirtyCount})`}</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadMonthlyData}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
            title="Reload from Database"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Period Selection & Search */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">Year:</span>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(parseInt(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-600"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">Month:</span>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-600"
            >
              {NEPALI_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input
            type="text"
            placeholder="Search Tailor # or name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-600"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}
      {successMessage && (
        <div className="p-3 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-900 text-xs font-semibold flex items-center gap-1.5">
          <Check size={14} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Overview Totals Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 text-xs font-mono">
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Gross Earned</span>
          <span className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5 block truncate">
            {formatMoney(totals.grossTotal)}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Advances Deducted</span>
          <span className="text-sm sm:text-base font-bold text-rose-600 dark:text-rose-400 mt-0.5 block truncate">
            {formatMoney(totals.advanceTotal)}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-sans font-bold block">Total Cash Paid Out</span>
          <span className="text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block truncate">
            {formatMoney(totals.paidTotal)}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-sans font-bold block">Remaining Owed (Dues)</span>
          <span className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5 block truncate">
            {formatMoney(totals.remainingDueTotal)}
          </span>
        </div>
      </div>

      {/* -------------------- MOBILE LAYOUT: DRAGGABLE CARDS -------------------- */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading ledger records...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No tailor records found.</div>
        ) : (
          filteredRows.map((row) => {
            const grossPaisa = (parseFloat(row.grossEarnedInput) || 0) * 100;
            const advPaisa = (parseFloat(row.advanceInput) || 0) * 100;
            const othPaisa = (parseFloat(row.othersInput) || 0) * 100;
            const paidPaisa = (parseFloat(row.paidInput) || 0) * 100;

            const netPayable = row.openingDue + grossPaisa - advPaisa + othPaisa;
            const remainingDue = netPayable - paidPaisa;
            const netPayableRupees = netPayable / 100;

            const isBeingDragged = draggedEmpId === row.employeeId;
            const isDragOverTarget = dragOverEmpId === row.employeeId;

            return (
              <div
                key={row.employeeId}
                draggable={!searchFilter}
                onDragStart={(e) => handleDragStart(e, row.employeeId)}
                onDragOver={(e) => handleDragOver(e, row.employeeId)}
                onDrop={(e) => handleDrop(e, row.employeeId)}
                onDragEnd={handleDragEnd}
                className={`p-3.5 bg-white dark:bg-slate-900 rounded-2xl border transition-all duration-150 shadow-2xs space-y-3 ${
                  isBeingDragged ? 'opacity-40 scale-[0.98]' : 'opacity-100'
                } ${
                  isDragOverTarget
                    ? 'border-t-4 border-t-blue-600 dark:border-t-blue-400'
                    : row.isDirty
                    ? 'border-amber-400 dark:border-amber-600/80'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {/* Mobile Header with 6-Dot Drag Handle */}
                <div className="flex justify-between items-start pb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div
                      className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded touch-none"
                      title="Drag to reorder tailor"
                    >
                      <GripVertical size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400">
                          #{row.tailorNumber}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {row.employeeName}
                        </h4>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 block">
                        Opening Owed: {formatMoney(row.openingDue)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Remaining Due</span>
                    <span
                      className={`text-sm font-mono font-bold ${
                        remainingDue > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : remainingDue < 0
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {formatMoney(remainingDue)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Gross Earned
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={row.grossEarnedInput}
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellChange(row.employeeId, 'grossEarnedInput', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Advance (Notebook)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={row.advanceInput}
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellChange(row.employeeId, 'advanceInput', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono font-bold text-rose-600 dark:text-rose-400 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-sans block">Net Payable to Worker</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                      {formatMoney(netPayable)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePayInFull(row.employeeId, netPayableRupees)}
                    className="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-[11px] hover:bg-blue-200 transition active:scale-95"
                  >
                    Pay Full
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] font-bold text-emerald-600 uppercase block mb-1">
                      Cash Paid Today
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={row.paidInput}
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellChange(row.employeeId, 'paidInput', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Others (+ / -)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={row.othersInput}
                      draggable={false}
                      onDragStart={(e) => e.stopPropagation()}
                      onChange={(e) => handleCellChange(row.employeeId, 'othersInput', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {row.isDirty && (
                    <button
                      type="button"
                      onClick={() => saveRow(row.employeeId)}
                      disabled={row.isSaving}
                      className="flex-1 py-1.5 bg-blue-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1"
                    >
                      <Save size={13} />
                      <span>{row.isSaving ? 'Saving...' : 'Save'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setSlipData({
                        tailorNumber: row.tailorNumber,
                        employeeName: row.employeeName,
                        openingDue: row.openingDue,
                        grossEarned: grossPaisa,
                        advance: advPaisa,
                        others: othPaisa,
                        netPayable,
                        paidAmount: paidPaisa,
                        remainingDue,
                        note: row.noteInput,
                      })
                    }
                    className="p-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 text-xs"
                    title="Print Settlement Slip"
                  >
                    <Printer size={15} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const emp = employees.find((e) => e.id === row.employeeId) || {
                        id: row.employeeId,
                        tailorNumber: row.tailorNumber,
                        name: row.employeeName,
                        isActive: true,
                        createdAt: '',
                        updatedAt: '',
                      };
                      onSelectEmployee(emp);
                    }}
                    className="p-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 text-xs font-semibold"
                  >
                    History
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* -------------------- DESKTOP SPREADSHEET TABLE -------------------- */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800 dark:text-slate-200">
            {currentMonthLabel} {fiscalYear} Ledger ({filteredRows.length} tailors)
          </span>
          <span className="text-[11px] text-slate-500">
            Drag the <GripVertical size={13} className="inline -mt-0.5" /> handle to reorder rows. Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono text-[10px]">Enter</kbd> or <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono text-[10px]">↓</kbd> to move down. Press <kbd className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded font-mono text-[10px]">Ctrl+S</kbd> to save.
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">Loading ledger records...</div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">No tailors registered.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/90 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  <th className="py-2.5 pl-3 pr-1 w-8 text-center"></th>
                  <th className="py-2.5 px-2 w-16">Tailor #</th>
                  <th className="py-2.5 px-3 min-w-[120px]">Name</th>
                  <th className="py-2.5 px-2 text-right w-24">Opening Owed</th>
                  <th className="py-2.5 px-2 text-right w-28">Gross Earned</th>
                  <th className="py-2.5 px-2 text-right w-28">Advance</th>
                  <th className="py-2.5 px-2 text-right w-24">Others (+/-)</th>
                  <th className="py-2.5 px-2 text-right w-28 text-blue-600 dark:text-blue-400 font-bold">Net Payable</th>
                  <th className="py-2.5 px-2 text-right w-32 text-emerald-600 dark:text-emerald-400 font-bold">Amount Paid</th>
                  <th className="py-2.5 px-2 text-right w-28 text-amber-600 dark:text-amber-400 font-bold">Remaining Due</th>
                  <th className="py-2.5 px-2.5 min-w-[120px]">Notes</th>
                  <th className="py-2.5 px-3 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {filteredRows.map((row, idx) => {
                  const grossPaisa = (parseFloat(row.grossEarnedInput) || 0) * 100;
                  const advPaisa = (parseFloat(row.advanceInput) || 0) * 100;
                  const othPaisa = (parseFloat(row.othersInput) || 0) * 100;
                  const paidPaisa = (parseFloat(row.paidInput) || 0) * 100;

                  const netPayable = row.openingDue + grossPaisa - advPaisa + othPaisa;
                  const remainingDue = netPayable - paidPaisa;
                  const netPayableRupees = netPayable / 100;

                  const isBeingDragged = draggedEmpId === row.employeeId;
                  const isDragOverTarget = dragOverEmpId === row.employeeId;

                  return (
                    <tr
                      key={row.employeeId}
                      draggable={!searchFilter}
                      onDragStart={(e) => handleDragStart(e, row.employeeId)}
                      onDragOver={(e) => handleDragOver(e, row.employeeId)}
                      onDrop={(e) => handleDrop(e, row.employeeId)}
                      onDragEnd={handleDragEnd}
                      className={`transition-colors duration-150 ${
                        isBeingDragged ? 'opacity-30 bg-slate-100 dark:bg-slate-800' : 'opacity-100'
                      } ${
                        isDragOverTarget
                          ? 'border-t-2 border-t-blue-600 dark:border-t-blue-400 bg-blue-50/20 dark:bg-blue-950/30'
                          : row.isDirty
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50/60'
                          : 'hover:bg-blue-50/30 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {/* Six Dots Drag Handle */}
                      <td className="py-2 pl-3 pr-1 text-center">
                        <div
                          className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 inline-flex items-center justify-center p-0.5 rounded"
                          title="Drag up or down to reorder"
                        >
                          <GripVertical size={15} />
                        </div>
                      </td>

                      {/* Tailor Number */}
                      <td className="py-2 px-2 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        #{row.tailorNumber}
                      </td>

                      {/* Name */}
                      <td className="py-2 px-3 font-sans font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {row.employeeName}
                        {row.isDirty && (
                          <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />
                        )}
                      </td>

                      {/* Opening Due */}
                      <td className="py-2 px-2 text-right text-slate-500">
                        {formatMoney(row.openingDue)}
                      </td>

                      {/* Gross Earned Input */}
                      <td className="py-1 px-1">
                        <input
                          type="number"
                          step="0.01"
                          data-row={idx}
                          data-field="grossEarned"
                          placeholder="0.00"
                          value={row.grossEarnedInput}
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleCellChange(row.employeeId, 'grossEarnedInput', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'grossEarned', filteredRows.length)}
                          className="w-full text-right px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-600 shadow-2xs"
                        />
                      </td>

                      {/* Advance Input */}
                      <td className="py-1 px-1">
                        <input
                          type="number"
                          step="0.01"
                          data-row={idx}
                          data-field="advance"
                          placeholder="0.00"
                          value={row.advanceInput}
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleCellChange(row.employeeId, 'advanceInput', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'advance', filteredRows.length)}
                          className="w-full text-right px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold text-rose-600 dark:text-rose-400 text-xs focus:outline-none focus:border-blue-600 shadow-2xs"
                        />
                      </td>

                      {/* Others Input */}
                      <td className="py-1 px-1">
                        <input
                          type="number"
                          step="0.01"
                          data-row={idx}
                          data-field="others"
                          placeholder="0.00"
                          value={row.othersInput}
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => handleCellChange(row.employeeId, 'othersInput', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'others', filteredRows.length)}
                          className="w-full text-right px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 text-xs focus:outline-none focus:border-blue-600 shadow-2xs"
                        />
                      </td>

                      {/* Net Payable */}
                      <td className="py-2 px-2 text-right font-bold text-blue-600 dark:text-blue-400">
                        {formatMoney(netPayable)}
                      </td>

                      {/* Cash Paid Today */}
                      <td className="py-1 px-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            data-row={idx}
                            data-field="paid"
                            placeholder="0.00"
                            value={row.paidInput}
                            draggable={false}
                            onDragStart={(e) => e.stopPropagation()}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => handleCellChange(row.employeeId, 'paidInput', e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, idx, 'paid', filteredRows.length)}
                            className="w-full text-right px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 font-bold text-emerald-600 dark:text-emerald-400 text-xs focus:outline-none focus:border-blue-600 shadow-2xs"
                          />
                          <button
                            type="button"
                            onClick={() => handlePayInFull(row.employeeId, netPayableRupees)}
                            className="px-1.5 py-1 text-[10px] font-sans font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"
                            title="Set full payable as paid"
                          >
                            Full
                          </button>
                        </div>
                      </td>

                      {/* Remaining Due */}
                      <td className="py-2 px-2 text-right font-bold">
                        <span
                          className={
                            remainingDue > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : remainingDue < 0
                              ? 'text-rose-600'
                              : 'text-emerald-600'
                          }
                        >
                          {formatMoney(remainingDue)}
                        </span>
                      </td>

                      {/* Notes */}
                      <td className="py-1 px-1">
                        <input
                          type="text"
                          data-row={idx}
                          data-field="note"
                          placeholder="Optional..."
                          value={row.noteInput}
                          draggable={false}
                          onDragStart={(e) => e.stopPropagation()}
                          onChange={(e) => handleCellChange(row.employeeId, 'noteInput', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'note', filteredRows.length)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 font-sans text-xs focus:outline-none focus:border-blue-600"
                        />
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-center whitespace-nowrap font-sans">
                        <div className="flex items-center justify-center gap-1">
                          {row.isDirty && (
                            <button
                              type="button"
                              onClick={() => saveRow(row.employeeId)}
                              disabled={row.isSaving}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition"
                            >
                              {row.isSaving ? '...' : 'Save'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setSlipData({
                                tailorNumber: row.tailorNumber,
                                employeeName: row.employeeName,
                                openingDue: row.openingDue,
                                grossEarned: grossPaisa,
                                advance: advPaisa,
                                others: othPaisa,
                                netPayable,
                                paidAmount: paidPaisa,
                                remainingDue,
                                note: row.noteInput,
                              })
                            }
                            className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                            title="Print Settlement Slip"
                          >
                            <Printer size={14} />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const emp = employees.find((e) => e.id === row.employeeId) || {
                                id: row.employeeId,
                                tailorNumber: row.tailorNumber,
                                name: row.employeeName,
                                isActive: true,
                                createdAt: '',
                                updatedAt: '',
                              };
                              onSelectEmployee(emp);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                          >
                            History
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
      </div>

      {/* Printable Tailor Settlement Slip */}
      {slipData && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 relative">
            <button
              onClick={() => setSlipData(null)}
              className="no-print absolute top-3 right-3 text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={16} />
            </button>

            <div className="space-y-3 font-sans text-xs">
              <div className="text-center border-b pb-2.5 border-slate-200">
                <h3 className="font-bold text-base uppercase tracking-tight">Garment Factory</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                  Tailor Settlement Voucher
                </p>
                <div className="mt-1 font-mono text-[11px] font-bold text-slate-700">
                  {currentMonthLabel} {fiscalYear}
                </div>
              </div>

              <div className="flex justify-between border-b pb-2 border-slate-100 font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans">TAILOR NAME</span>
                  <span className="font-bold text-sm text-slate-900 font-sans">{slipData.employeeName}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block font-sans">TAILOR #</span>
                  <span className="font-bold text-sm text-slate-900">#{slipData.tailorNumber}</span>
                </div>
              </div>

              <div className="space-y-1.5 font-mono text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Opening Balance (Owed):</span>
                  <span>{formatMoney(slipData.openingDue)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Gross Stitched Work:</span>
                  <span>+{formatMoney(slipData.grossEarned)}</span>
                </div>
                <div className="flex justify-between text-rose-600">
                  <span>Notebook Advances Deducted:</span>
                  <span>-{formatMoney(slipData.advance)}</span>
                </div>
                {slipData.others !== 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Other Adjustments:</span>
                    <span>{formatMoney(slipData.others)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-blue-700">
                  <span>Net Payable Earnings:</span>
                  <span>{formatMoney(slipData.netPayable)}</span>
                </div>
                <div className="flex justify-between font-bold text-emerald-600">
                  <span>Cash Handed Over Today:</span>
                  <span>-{formatMoney(slipData.paidAmount)}</span>
                </div>
                <div className="border-t-2 border-slate-900 pt-2 flex justify-between font-bold text-sm">
                  <span>Remaining Balance Owed:</span>
                  <span className="text-amber-700">{formatMoney(slipData.remainingDue)}</span>
                </div>
              </div>

              {slipData.note && (
                <div className="text-[10px] bg-slate-50 p-2 rounded-lg border border-slate-200 text-slate-600 font-sans">
                  Remark: {slipData.note}
                </div>
              )}

              <div className="pt-6 grid grid-cols-2 text-center text-[10px] border-t border-slate-200 mt-4 text-slate-500 font-sans">
                <div>
                  <div className="border-b border-slate-300 w-24 mx-auto mb-1"></div>
                  <span>Tailor Signature</span>
                </div>
                <div>
                  <div className="border-b border-slate-300 w-24 mx-auto mb-1"></div>
                  <span>Owner / Master</span>
                </div>
              </div>
            </div>

            <div className="no-print mt-4 pt-3 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSlipData(null)}
                className="px-3 py-1.5 text-xs text-slate-600 font-semibold rounded-lg hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-1.5 text-xs bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
              >
                <Printer size={13} />
                <span>Print Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Printer, ArrowLeft, X, CheckCircle2, Clock, 
  TrendingUp, ArrowDownLeft, ArrowUpRight, Scale, RefreshCw 
} from 'lucide-react';
import { api, formatMoney, type EarningsEntry, type Employee } from '../api.ts';

const NEPALI_MONTH_NAMES = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

function getCurrentNepaliYear(): number {
  const now = new Date();
  const adYear = now.getFullYear();
  const adMonth = now.getMonth();
  const adDay = now.getDate();
  const isNewNepaliYear = adMonth > 3 || (adMonth === 3 && adDay >= 14);
  return adYear + (isNewNepaliYear ? 57 : 56);
}

function getMonthIndex(input: string | number): number {
  if (typeof input === 'number') return input;
  const parsed = parseInt(String(input), 10);
  if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) return parsed;
  const idx = NEPALI_MONTH_NAMES.findIndex(
    (name) => name.toLowerCase() === String(input).toLowerCase().trim()
  );
  return idx !== -1 ? idx + 1 : 1;
}

interface EmployeeYearlyViewProps {
  employee: Employee;
  onBack: () => void;
}

function parseStoredNote(rawNote: string | undefined, totalAdvancePaisa: number) {
  if (!rawNote) {
    return {
      advancePaisa: totalAdvancePaisa,
      paidPaisa: 0,
      userNote: '',
    };
  }
  const match = rawNote.match(/^\[Adv:\s*([\d.]+)\s*\|\s*Paid:\s*([\d.]+)\]\s*(.*)$/s);
  if (match) {
    return {
      advancePaisa: Math.round((parseFloat(match[1]) || 0) * 100),
      paidPaisa: Math.round((parseFloat(match[2]) || 0) * 100),
      userNote: match[3] || '',
    };
  }
  return {
    advancePaisa: totalAdvancePaisa,
    paidPaisa: 0,
    userNote: rawNote,
  };
}

export const EmployeeYearlyView: React.FC<EmployeeYearlyViewProps> = ({ employee, onBack }) => {
  const [history, setHistory] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = useMemo(() => getCurrentNepaliYear(), []);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const availableYears = useMemo(() => {
    const list: number[] = [];
    const max = Math.max(currentYear + 2, selectedYear);
    for (let y = max; y >= 2080; y--) {
      list.push(y);
    }
    return list;
  }, [currentYear, selectedYear]);

  // Printable Settlement Slip Modal
  const [slipData, setSlipData] = useState<{
    tailorNumber: string;
    employeeName: string;
    monthLabel: string;
    fiscalYear: number;
    openingDue: number;
    grossEarned: number;
    advance: number;
    others: number;
    netPayable: number;
    paidAmount: number;
    remainingDue: number;
    note: string;
  } | null>(null);

  const loadEmployeeHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getEmployeeHistory(employee.id);
      const entries: EarningsEntry[] = response.history || [];
      setHistory(entries);

      if (entries.length > 0 && !entries.some((e) => e.fiscalYear === currentYear)) {
        const latestRecordedYear = Math.max(...entries.map((e) => e.fiscalYear));
        setSelectedYear(latestRecordedYear);
      }
    } catch (err: any) {
      console.error('Failed to load employee history:', err);
      setError(err.message || 'Failed to load historical ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployeeHistory();
  }, [employee.id]);

  // Career Totals
  const careerStats = useMemo(() => {
    let grossEarned = 0;
    let advancesTaken = 0;
    let cashPaid = 0;

    history.forEach((entry) => {
      const parsed = parseStoredNote(entry.note ?? undefined, entry.advance);
      grossEarned += entry.totalEarned;
      advancesTaken += parsed.advancePaisa;
      cashPaid += parsed.paidPaisa;
    });

    const latestClosingDue = history.length > 0
      ? history.slice().sort((a, b) => b.fiscalYear - a.fiscalYear || getMonthIndex(b.month) - getMonthIndex(a.month))[0].closingDue
      : 0;

    return { grossEarned, advancesTaken, cashPaid, latestClosingDue };
  }, [history]);

  // 12-month calendar grid for selected fiscal year
  const fullYearMonths = useMemo(() => {
    const recordedMap = new Map<number, EarningsEntry>();
    history
      .filter((h) => h.fiscalYear === selectedYear)
      .forEach((entry) => {
        recordedMap.set(getMonthIndex(entry.month), entry);
      });

    return NEPALI_MONTH_NAMES.map((name, idx) => {
      const monthNum = idx + 1;
      const record = recordedMap.get(monthNum) || null;
      const parsed = record ? parseStoredNote(record.note ?? undefined, record.advance) : null;
      const netPayable = record
        ? record.openingDue + record.totalEarned - (parsed?.advancePaisa || 0) + record.others
        : 0;

      return {
        monthNumber: monthNum,
        monthLabel: name,
        isRecorded: !!record,
        record,
        openingDue: record ? record.openingDue : 0,
        grossEarned: record ? record.totalEarned : 0,
        advance: parsed ? parsed.advancePaisa : 0,
        others: record ? record.others : 0,
        netPayable,
        cashPaid: parsed ? parsed.paidPaisa : 0,
        closingDue: record ? record.closingDue : 0,
        note: parsed ? parsed.userNote : '',
      };
    });
  }, [history, selectedYear]);

  // Year-specific metrics
  const yearStats = useMemo(() => {
    let gross = 0;
    let advances = 0;
    let paid = 0;
    let settledMonths = 0;

    fullYearMonths.forEach((m) => {
      if (m.isRecorded) {
        settledMonths++;
        gross += m.grossEarned;
        advances += m.advance;
        paid += m.cashPaid;
      }
    });

    const recordedMonths = fullYearMonths.filter((m) => m.isRecorded);
    const initialOpening = recordedMonths.length > 0
      ? recordedMonths.slice().sort((a, b) => a.monthNumber - b.monthNumber)[0].openingDue
      : 0;

    const finalClosing = recordedMonths.length > 0
      ? recordedMonths.slice().sort((a, b) => b.monthNumber - a.monthNumber)[0].closingDue
      : 0;

    return { gross, advances, paid, settledMonths, initialOpening, finalClosing };
  }, [fullYearMonths]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto font-sans">
      {/* Header Profile Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition shrink-0"
            title="Return to Monthly Ledger"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                #{employee.tailorNumber}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                {employee.name}
              </h2>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                  employee.isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}
              >
                {employee.isActive ? 'Active Tailor' : 'Inactive'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Annual Settlement Passbook & Khata History
            </p>
          </div>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-bold text-slate-500 uppercase text-[10px]">Fiscal Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent font-bold text-slate-900 dark:text-slate-100 text-xs focus:outline-none cursor-pointer"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr} className="bg-white dark:bg-slate-900">
                  {yr} B.S.
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={loadEmployeeHistory}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
            title="Reload records"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Career Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
            <span>Career Gross Earned</span>
            <TrendingUp size={14} className="text-blue-500" />
          </div>
          <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 block truncate">
            {formatMoney(careerStats.grossEarned)}
          </span>
          <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
            Total piecework stitched
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
            <span>Career Advances Taken</span>
            <ArrowDownLeft size={14} className="text-rose-500" />
          </div>
          <span className="text-base sm:text-lg font-bold text-rose-600 dark:text-rose-400 mt-1 block truncate">
            {formatMoney(careerStats.advancesTaken)}
          </span>
          <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
            Peshki logged from notebook
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
            <span>Career Cash Paid Out</span>
            <ArrowUpRight size={14} className="text-emerald-500" />
          </div>
          <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 block truncate">
            {formatMoney(careerStats.cashPaid)}
          </span>
          <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
            Month-end cash payouts
          </span>
        </div>

        <div
          className={`p-3.5 rounded-2xl border shadow-2xs ${
            careerStats.latestClosingDue > 0
              ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
              : careerStats.latestClosingDue < 0
              ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
              : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
          }`}
        >
          <div className="flex items-center justify-between font-sans text-[10px] font-bold uppercase">
            <span
              className={
                careerStats.latestClosingDue > 0
                  ? 'text-amber-700 dark:text-amber-400'
                  : careerStats.latestClosingDue < 0
                  ? 'text-rose-700 dark:text-rose-400'
                  : 'text-emerald-700 dark:text-emerald-400'
              }
            >
              {careerStats.latestClosingDue > 0
                ? 'Factory Owes Tailor'
                : careerStats.latestClosingDue < 0
                ? 'Tailor Owes Factory'
                : 'Account Balanced'}
            </span>
            <Scale
              size={14}
              className={
                careerStats.latestClosingDue > 0
                  ? 'text-amber-600'
                  : careerStats.latestClosingDue < 0
                  ? 'text-rose-600'
                  : 'text-emerald-600'
              }
            />
          </div>
          <span
            className={`text-base sm:text-lg font-bold mt-1 block truncate ${
              careerStats.latestClosingDue > 0
                ? 'text-amber-700 dark:text-amber-400'
                : careerStats.latestClosingDue < 0
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {formatMoney(Math.abs(careerStats.latestClosingDue))}
          </span>
          <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">
            {careerStats.latestClosingDue > 0
              ? 'Unpaid earnings held in factory'
              : careerStats.latestClosingDue < 0
              ? 'Advance deficit to be adjusted'
              : 'Zero pending balance'}
          </span>
        </div>
      </div>

      {/* Year Progress Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Year Progress</span>
          <span className="font-bold text-slate-800 dark:text-slate-200 font-sans">
            {yearStats.settledMonths} of 12 Months Tallied
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Opening Year Balance</span>
          <span className="font-bold text-slate-600 dark:text-slate-300">
            {formatMoney(yearStats.initialOpening)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Year Gross Work</span>
          <span className="font-bold text-slate-900 dark:text-slate-100">
            +{formatMoney(yearStats.gross)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Year Advances</span>
          <span className="font-bold text-rose-600 dark:text-rose-400">
            -{formatMoney(yearStats.advances)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Year Cash Disbursed</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            -{formatMoney(yearStats.paid)}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-sans font-bold block">Year-End Standing</span>
          <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
            {formatMoney(yearStats.finalClosing)}
          </span>
        </div>
      </div>

      {/* Mobile Passbook Cards */}
      <div className="block md:hidden space-y-2.5">
        {fullYearMonths.map((m) => (
          <div
            key={m.monthNumber}
            className={`p-3.5 bg-white dark:bg-slate-900 rounded-2xl border shadow-2xs space-y-2.5 text-xs font-mono transition ${
              m.isRecorded
                ? 'border-slate-200 dark:border-slate-800'
                : 'border-slate-200/60 dark:border-slate-800/60 opacity-60'
            }`}
          >
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 font-sans">
                  {m.monthLabel} {selectedYear}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold font-sans border ${
                    m.isRecorded
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {m.isRecorded ? (
                    <>
                      <CheckCircle2 size={11} /> Settled
                    </>
                  ) : (
                    <>
                      <Clock size={11} /> Not Tallied
                    </>
                  )}
                </span>
              </div>

              {m.isRecorded && (
                <button
                  type="button"
                  onClick={() =>
                    setSlipData({
                      tailorNumber: employee.tailorNumber,
                      employeeName: employee.name,
                      monthLabel: m.monthLabel,
                      fiscalYear: selectedYear,
                      openingDue: m.openingDue,
                      grossEarned: m.grossEarned,
                      advance: m.advance,
                      others: m.others,
                      netPayable: m.netPayable,
                      paidAmount: m.cashPaid,
                      remainingDue: m.closingDue,
                      note: m.note,
                    })
                  }
                  className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  title="Print Settlement Slip"
                >
                  <Printer size={14} />
                </button>
              )}
            </div>

            {m.isRecorded ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Gross Work:</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{formatMoney(m.grossEarned)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Advance Deducted:</span>
                    <span className="font-bold text-rose-600 dark:text-rose-400">
                      {m.advance > 0 ? `-${formatMoney(m.advance)}` : '—'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] text-emerald-600 block font-sans">Cash Paid:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(m.cashPaid)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-600 block font-sans">Carried Due:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">{formatMoney(m.closingDue)}</span>
                  </div>
                </div>

                {m.note && (
                  <div className="text-[10px] text-slate-500 font-sans bg-slate-50 dark:bg-slate-950 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                    Remark: {m.note}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-2 text-center text-slate-400 italic font-sans text-[11px]">
                No notebook records tallied for this month yet.
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop 12-Month Table */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                <th className="py-3 px-4 font-sans font-bold w-32">Month</th>
                <th className="py-3 px-3 w-28 font-sans">Status</th>
                <th className="py-3 px-3 text-right w-24">Opening Owed</th>
                <th className="py-3 px-3 text-right w-28">Gross Work</th>
                <th className="py-3 px-3 text-right w-24">Advance</th>
                <th className="py-3 px-3 text-right w-20">Others</th>
                <th className="py-3 px-3 text-right w-28 text-blue-600 dark:text-blue-400 font-bold">Net Payable</th>
                <th className="py-3 px-3 text-right w-28 text-emerald-600 dark:text-emerald-400 font-bold">Amount Paid</th>
                <th className="py-3 px-3 text-right w-28 text-amber-600 dark:text-amber-400 font-bold">Carried Due</th>
                <th className="py-3 px-4 font-sans min-w-[120px]">Notes</th>
                <th className="py-3 px-3 text-center w-16 font-sans">Slip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
              {fullYearMonths.map((m) => (
                <tr
                  key={m.monthNumber}
                  className={`transition ${
                    m.isRecorded
                      ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      : 'opacity-40 hover:opacity-60 bg-slate-50/30 dark:bg-slate-950/20'
                  }`}
                >
                  <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {m.monthLabel}
                  </td>

                  <td className="py-3 px-3 font-sans">
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                        m.isRecorded
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {m.isRecorded ? 'Settled' : 'Not Tallied'}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right text-slate-500">
                    {m.isRecorded ? formatMoney(m.openingDue) : '—'}
                  </td>

                  <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                    {m.isRecorded ? formatMoney(m.grossEarned) : '—'}
                  </td>

                  <td className="py-3 px-3 text-right text-rose-600 dark:text-rose-400">
                    {m.isRecorded && m.advance > 0 ? `-${formatMoney(m.advance)}` : '—'}
                  </td>

                  <td className="py-3 px-3 text-right text-slate-500">
                    {m.isRecorded && m.others !== 0 ? formatMoney(m.others) : '—'}
                  </td>

                  <td className="py-3 px-3 text-right font-bold text-blue-600 dark:text-blue-400">
                    {m.isRecorded ? formatMoney(m.netPayable) : '—'}
                  </td>

                  <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {m.isRecorded && m.cashPaid > 0 ? formatMoney(m.cashPaid) : '—'}
                  </td>

                  <td className="py-3 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                    {m.isRecorded ? formatMoney(m.closingDue) : '—'}
                  </td>

                  <td className="py-3 px-4 font-sans text-slate-500 text-[11px] max-w-xs truncate">
                    {m.isRecorded && m.note ? m.note : '—'}
                  </td>

                  <td className="py-3 px-3 text-center font-sans">
                    {m.isRecorded ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSlipData({
                            tailorNumber: employee.tailorNumber,
                            employeeName: employee.name,
                            monthLabel: m.monthLabel,
                            fiscalYear: selectedYear,
                            openingDue: m.openingDue,
                            grossEarned: m.grossEarned,
                            advance: m.advance,
                            others: m.others,
                            netPayable: m.netPayable,
                            paidAmount: m.cashPaid,
                            remainingDue: m.closingDue,
                            note: m.note,
                          })
                        }
                        className="p-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                        title="Print Voucher"
                      >
                        <Printer size={14} />
                      </button>
                    ) : (
                      <span className="text-slate-300 dark:text-slate-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Printable Settlement Voucher Modal */}
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
                  {slipData.monthLabel} {slipData.fiscalYear} B.S.
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
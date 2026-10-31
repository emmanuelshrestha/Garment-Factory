import React, { useState, useEffect, useMemo } from 'react';
import { 
  PlusCircle, Search, X, RefreshCw, 
  CreditCard, Calendar, Tag, FileText, Check,
  Building2, Truck, Scissors, Coffee, Zap,
  ArrowDownLeft, ArrowUpRight,
  Scale
} from 'lucide-react';
import { api, formatMoney, formatDate, type Expense, type PaymentMethod } from '../api.ts';

export const FACTORY_EXPENSE_CATEGORIES = [
  { id: 'Outwork / Printing & Embroidery', label: 'Job-Work: Printing, Embroidery & Washing', icon: Scissors },
  { id: 'Machine Parts & Maintenance', label: 'Machine Parts, Needles & Oil Maintenance', icon: Building2 },
  { id: 'Thread & Floor Consumables', label: 'Thread Cones, Chalk, Scissors & Packaging', icon: Tag },
  { id: 'Factory Floor Rent', label: 'Factory Floor & Godown Rent', icon: Building2 },
  { id: 'Electricity & Generator Fuel', label: 'NEA Electricity & Generator Fuel (Diesel)', icon: Zap },
  { id: 'Van Fuel & Cargo Freight', label: 'Delivery Van Fuel, Cargo & Transport', icon: Truck },
  { id: 'Courier & Sample Shipping', label: 'Courier Services & Sample Deliveries', icon: Truck },
  { id: 'Floor Tea & Snacks (Khaja)', label: 'Floor Tea, Snacks (Khaja) & Refreshments', icon: Coffee },
  { id: 'Office & Admin Supplies', label: 'Stationery, Billbooks & Admin Expense', icon: FileText },
  { id: 'Other Operating Expense', label: 'Other Miscellaneous Overheads', icon: Tag },
];

const NEPALI_MONTH_NAMES = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
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

function getNepaliDateFromIso(isoDate: string): { year: number; month: number } {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return getCurrentNepaliDate();
  const adYear = d.getFullYear();
  const adMonth = d.getMonth();
  const adDay = d.getDate();

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

interface ExpensesViewProps {
  expenses?: Expense[];
  onRefresh?: () => void;
}

interface ParsedExpense {
  id: number;
  expenseNo: string;
  actualDate: string;
  bsYear: number;
  bsMonth: number;
  category: string;
  payee: string;
  amountMinor: number;
  method: PaymentMethod;
  type: 'bill' | 'payment';
  userNote: string;
}

function parseExpenseItem(item: Expense): ParsedExpense {
  const rawNote = item.note || '';
  
  // Extract custom date from note payload to prevent defaulting to today's date
  const dateMatch = rawNote.match(/\[Date:\s*([\d-]+)\]/);
  const actualDate = dateMatch 
    ? dateMatch[1] 
    : (item.expenseDate || (item.createdAt ? item.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]));
  
  const nepaliDate = getNepaliDateFromIso(actualDate);

  let type: 'bill' | 'payment' = 'bill';
  if (rawNote.includes('[Type: Payment]')) {
    type = 'payment';
  } else if (rawNote.includes('[Type: Bill]')) {
    type = 'bill';
  } else {
    // Default legacy classification
    type = (item.method === 'bank_transfer' || item.method === 'cheque') ? 'payment' : 'bill';
  }

  const cleanNote = rawNote
    .replace(/\[Type:\s*\w+\]\s*/g, '')
    .replace(/\[Date:\s*[\d-]+\]\s*/g, '')
    .trim();

  return {
    id: item.id,
    expenseNo: item.expenseNo,
    actualDate,
    bsYear: nepaliDate.year,
    bsMonth: nepaliDate.month,
    category: item.category || 'General Overhead',
    payee: item.payee || '',
    amountMinor: item.amountMinor,
    method: item.method || 'cash',
    type,
    userNote: cleanNote,
  };
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({ expenses: propExpenses, onRefresh: propOnRefresh }) => {
  const [internalExpenses, setInternalExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Top View Navigation: 'monthly' (Summary Calendar) | 'bills' (Incurred Expenses) | 'payments' (Cash & Bank Payments)
  const [currentTab, setCurrentTab] = useState<'monthly' | 'bills' | 'payments'>('monthly');

  // Fiscal Year Selection
  const initialNepaliDate = useMemo(() => getCurrentNepaliDate(), []);
  const [selectedYear, setSelectedYear] = useState<number>(initialNepaliDate.year);
  const availableYears = useMemo(() => [2085, 2084, 2083, 2082, 2081, 2080], []);

  // Filter in detailed logs
  const [monthFilter, setMonthFilter] = useState<number | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  // Modals
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Bill Form State
  const [billCategory, setBillCategory] = useState(FACTORY_EXPENSE_CATEGORIES[0].id);
  const [billAmount, setBillAmount] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [billPayee, setBillPayee] = useState('');
  const [billNote, setBillNote] = useState('');

  // Payment Form State
  const [payCategory, setPayCategory] = useState(FACTORY_EXPENSE_CATEGORIES[0].id);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payPayee, setPayPayee] = useState('');
  const [payNote, setPayNote] = useState('');

  const loadExpenses = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getExpenses();
      setInternalExpenses(res.expenses || []);
    } catch (err: any) {
      console.error('Failed to load expenses:', err);
      setError(err.message || 'Failed to load expense records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (propExpenses) {
      setInternalExpenses(propExpenses);
      setLoading(false);
    } else {
      loadExpenses();
    }
  }, [propExpenses]);

  const rawList = propExpenses || internalExpenses;

  // Normalize all expense entries
  const parsedList = useMemo(() => {
    return rawList.map(parseExpenseItem);
  }, [rawList]);

  // Aggregate 12 Months for the Monthly Summary
  const monthlySummaries = useMemo(() => {
    const yearRecords = parsedList.filter((e) => e.bsYear === selectedYear);

    const monthMap = new Map<number, {
      billsTotal: number;
      paymentsTotal: number;
      billsCount: number;
      paymentsCount: number;
      topCategory: string;
      categoriesMap: Record<string, number>;
    }>();

    for (let m = 1; m <= 12; m++) {
      monthMap.set(m, {
        billsTotal: 0,
        paymentsTotal: 0,
        billsCount: 0,
        paymentsCount: 0,
        topCategory: '—',
        categoriesMap: {},
      });
    }

    yearRecords.forEach((item) => {
      const bucket = monthMap.get(item.bsMonth);
      if (bucket) {
        if (item.type === 'bill') {
          bucket.billsTotal += item.amountMinor;
          bucket.billsCount += 1;
          bucket.categoriesMap[item.category] = (bucket.categoriesMap[item.category] || 0) + item.amountMinor;
        } else if (item.type === 'payment') {
          bucket.paymentsTotal += item.amountMinor;
          bucket.paymentsCount += 1;
        }
      }
    });

    return NEPALI_MONTH_NAMES.map((name, idx) => {
      const monthNum = idx + 1;
      const data = monthMap.get(monthNum)!;
      let topCat = '—';
      let highestCatAmount = 0;
      Object.entries(data.categoriesMap).forEach(([cat, amt]) => {
        if (amt > highestCatAmount) {
          highestCatAmount = amt;
          topCat = cat;
        }
      });

      return {
        monthNumber: monthNum,
        monthLabel: name,
        hasActivity: data.billsCount > 0 || data.paymentsCount > 0,
        billsTotal: data.billsTotal,
        paymentsTotal: data.paymentsTotal,
        netDue: data.billsTotal - data.paymentsTotal,
        billsCount: data.billsCount,
        paymentsCount: data.paymentsCount,
        topCategory: topCat,
      };
    });
  }, [parsedList, selectedYear]);

  // Year Aggregate Totals
  const yearTotals = useMemo(() => {
    let totalBills = 0;
    let totalPayments = 0;
    let activeMonths = 0;

    monthlySummaries.forEach((m) => {
      totalBills += m.billsTotal;
      totalPayments += m.paymentsTotal;
      if (m.hasActivity) activeMonths++;
    });

    return {
      totalBills,
      totalPayments,
      netPending: totalBills - totalPayments,
      activeMonths,
    };
  }, [monthlySummaries]);

  // Strict Chronological Date-Bucket Sorting: Date ASC -> ID ASC
  const dateSortedBuckets = useMemo(() => {
    if (currentTab === 'monthly') return [];

    const targetType = currentTab === 'bills' ? 'bill' : 'payment';

    const filtered = parsedList.filter((item) => {
      if (item.type !== targetType) return false;
      if (item.bsYear !== selectedYear) return false;
      if (monthFilter !== 'ALL' && item.bsMonth !== monthFilter) return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (methodFilter !== 'ALL' && item.method !== methodFilter) return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          item.payee.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.userNote.toLowerCase().includes(q) ||
          item.expenseNo.toLowerCase().includes(q)
        );
      }
      return true;
    });

    // Date ASC -> ID ASC
    filtered.sort((a, b) => {
      const timeA = new Date(a.actualDate).getTime();
      const timeB = new Date(b.actualDate).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.id - b.id;
    });

    // Group into visual date buckets
    const buckets: Array<{ date: string; items: ParsedExpense[]; dayTotal: number }> = [];
    const bucketMap = new Map<string, { date: string; items: ParsedExpense[]; dayTotal: number }>();

    filtered.forEach((item) => {
      const existing = bucketMap.get(item.actualDate);
      if (existing) {
        existing.items.push(item);
        existing.dayTotal += item.amountMinor;
      } else {
        const newB = { date: item.actualDate, items: [item], dayTotal: item.amountMinor };
        bucketMap.set(item.actualDate, newB);
        buckets.push(newB);
      }
    });

    return buckets;
  }, [parsedList, currentTab, selectedYear, monthFilter, categoryFilter, methodFilter, searchFilter]);

  // Action: Save Bill
  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(billAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Please enter a valid bill amount.');
      return;
    }

    const notePayload = `[Type: Bill] [Date: ${billDate}] ${billNote.trim()}`;

    try {
      setIsSaving(true);
      setError(null);
      await api.createExpense({
        category: billCategory,
        amountMinor: Math.round(amountVal * 100),
        currency: 'NPR',
        method: 'cash',
        payee: billPayee.trim() || undefined,
        note: notePayload,
      });

      setIsBillModalOpen(false);
      setBillAmount('');
      setBillPayee('');
      setBillNote('');
      setSuccessMessage('Overhead bill recorded.');
      setTimeout(() => setSuccessMessage(null), 3000);

      if (propOnRefresh) propOnRefresh();
      await loadExpenses();
    } catch (err: any) {
      setError(err.message || 'Failed to record bill');
    } finally {
      setIsSaving(false);
    }
  };

  // Action: Save Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(payAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

    const notePayload = `[Type: Payment] [Date: ${payDate}] ${payNote.trim()}`;

    try {
      setIsSaving(true);
      setError(null);
      await api.createExpense({
        category: payCategory,
        amountMinor: Math.round(amountVal * 100),
        currency: 'NPR',
        method: payMethod,
        payee: payPayee.trim() || undefined,
        note: notePayload,
      });

      setIsPaymentModalOpen(false);
      setPayAmount('');
      setPayPayee('');
      setPayNote('');
      setSuccessMessage('Disbursed payment recorded.');
      setTimeout(() => setSuccessMessage(null), 3000);

      if (propOnRefresh) propOnRefresh();
      await loadExpenses();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto font-sans">
      {/* ══════════════════════ TOP HEADER & NAVIGATION ══════════════════════ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-blue-600 dark:text-blue-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Factory Operating Expenses & Overheads
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Decoupled monthly fiscal ledger, separated bills vs. payments, and date-bucket sorting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Fiscal Year Dropdown */}
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
            onClick={() => setIsBillModalOpen(true)}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <PlusCircle size={15} />
            <span>Record Bill</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95"
          >
            <CreditCard size={15} />
            <span>Record Payment</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (propOnRefresh) propOnRefresh();
              loadExpenses();
            }}
            className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
            title="Reload"
          >
            <RefreshCw size={15} />
          </button>
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

      {/* ══════════════════════ TOP SUB-TAB NAVIGATION ══════════════════════ */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto no-scrollbar text-xs">
        <button
          type="button"
          onClick={() => setCurrentTab('monthly')}
          className={`px-4 py-2 rounded-xl font-bold transition whitespace-nowrap shrink-0 ${
            currentTab === 'monthly'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          📅 12-Month Calendar Overview
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('bills')}
          className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            currentTab === 'bills'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>📋 Incurred Expenses & Bills</span>
          <span className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
            {parsedList.filter(e => e.type === 'bill' && e.bsYear === selectedYear).length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentTab('payments')}
          className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
            currentTab === 'payments'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <span>💳 Cash & Bank Payments</span>
          <span className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
            {parsedList.filter(e => e.type === 'payment' && e.bsYear === selectedYear).length}
          </span>
        </button>
      </div>

      {/* ══════════════════════ TAB 1: 12-MONTH CALENDAR OVERVIEW ══════════════════════ */}
      {currentTab === 'monthly' && (
        <div className="space-y-4">
          {/* Highlights */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 text-xs font-mono">
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
                <span>Total Incurred Bills</span>
                <ArrowDownLeft size={14} className="text-blue-500" />
              </div>
              <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 block truncate">
                {formatMoney(yearTotals.totalBills)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Total operating charges
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
                <span>Total Payments Paid</span>
                <ArrowUpRight size={14} className="text-emerald-500" />
              </div>
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 block truncate">
                {formatMoney(yearTotals.totalPayments)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Cash & bank outflows
              </span>
            </div>

            <div
              className={`p-3.5 rounded-2xl border shadow-2xs col-span-2 sm:col-span-1 ${
                yearTotals.netPending > 0
                  ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                  : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
              }`}
            >
              <div className="flex items-center justify-between font-sans text-[10px] font-bold uppercase">
                <span className={yearTotals.netPending > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
                  {yearTotals.netPending > 0 ? 'Pending Overheads Due' : 'All Settled'}
                </span>
                <Scale size={14} className={yearTotals.netPending > 0 ? 'text-amber-600' : 'text-emerald-600'} />
              </div>
              <span className={`text-base sm:text-lg font-bold mt-1 block truncate ${yearTotals.netPending > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {formatMoney(Math.abs(yearTotals.netPending))}
              </span>
              <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">
                {yearTotals.netPending > 0 ? 'Unpaid liabilities' : 'Zero unsettled expenses'}
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Active Months</span>
              <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 block">
                {yearTotals.activeMonths} of 12 Months
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Recorded in {selectedYear} B.S.
              </span>
            </div>
          </div>

          {/* 12-Month Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                12-Month Expense Calendar • Fiscal Year {selectedYear} B.S.
              </span>
              <span className="text-[11px] text-slate-400">
                Click links on any month to view separated bills or payments
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <th className="py-3 px-4 font-sans font-bold w-32">Month</th>
                    <th className="py-3 px-3 w-28 font-sans">Status</th>
                    <th className="py-3 px-3 text-right w-32">Incurred Bills</th>
                    <th className="py-3 px-3 text-right w-32 text-emerald-600">Payments Out</th>
                    <th className="py-3 px-3 text-right w-32 text-amber-600 font-bold">Unsettled Due</th>
                    <th className="py-3 px-4 font-sans min-w-[160px]">Top Category</th>
                    <th className="py-3 px-4 text-right w-44 font-sans">Direct Links</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlySummaries.map((m) => (
                    <tr
                      key={m.monthNumber}
                      className={`transition ${
                        m.hasActivity
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
                            m.hasActivity
                              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {m.hasActivity ? `${m.billsCount} Bills, ${m.paymentsCount} Pymts` : 'No Activity'}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {m.billsTotal > 0 ? formatMoney(m.billsTotal) : '—'}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {m.paymentsTotal > 0 ? `-${formatMoney(m.paymentsTotal)}` : '—'}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                        {m.netDue !== 0 ? formatMoney(m.netDue) : '—'}
                      </td>

                      <td className="py-3 px-4 font-sans text-slate-600 dark:text-slate-300 truncate max-w-xs">
                        {m.topCategory}
                      </td>

                      <td className="py-3 px-4 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedYear(selectedYear);
                              setMonthFilter(m.monthNumber);
                              setCurrentTab('bills');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-[11px] hover:bg-blue-100 transition"
                          >
                            Bills ({m.billsCount}) →
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedYear(selectedYear);
                              setMonthFilter(m.monthNumber);
                              setCurrentTab('payments');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] hover:bg-emerald-100 transition"
                          >
                            Payments ({m.paymentsCount}) →
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ TAB 2 & 3: SEPARATED LOGS WITH STRICT DATE SORTING ══════════════════════ */}
      {(currentTab === 'bills' || currentTab === 'payments') && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                Viewing {currentTab === 'bills' ? 'Incurred Bills' : 'Disbursed Payments'}:
              </span>

              {/* Month Filter */}
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-xs focus:outline-none"
              >
                <option value="ALL">All Months ({selectedYear} B.S.)</option>
                {NEPALI_MONTH_NAMES.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>

              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-xs focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                {FACTORY_EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id}
                  </option>
                ))}
              </select>

              {/* Method Filter for Payments */}
              {currentTab === 'payments' && (
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-xs focus:outline-none"
                >
                  <option value="ALL">All Methods</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank / Fonepay</option>
                  <option value="cheque">Cheque</option>
                </select>
              )}
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Search payee, note..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Date-Bucket Chronological List */}
          {dateSortedBuckets.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              No {currentTab === 'bills' ? 'bills' : 'payments'} found matching the current filters.
            </div>
          ) : (
            <div className="space-y-4">
              {dateSortedBuckets.map((bucket) => (
                <div
                  key={bucket.date}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden"
                >
                  {/* Date Header Strip */}
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-blue-600 dark:text-blue-400" />
                      <span className="font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {formatDate(bucket.date)}
                      </span>
                      <span className="text-[11px] text-slate-400 font-sans">
                        ({bucket.items.length} {currentTab === 'bills' ? 'bill' : 'payment'}{bucket.items.length !== 1 ? 's' : ''})
                      </span>
                    </div>

                    <div className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                      Day Total: {formatMoney(bucket.dayTotal)}
                    </div>
                  </div>

                  {/* Transaction Rows for this Date */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                    {bucket.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-sans font-bold text-slate-900 dark:text-slate-100 text-sm">
                              {item.category}
                            </span>
                            {item.payee && (
                              <span className="text-[11px] text-slate-500 font-sans">
                                • Party: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.payee}</span>
                              </span>
                            )}
                          </div>
                          {item.userNote && (
                            <p className="text-[11px] text-slate-500 font-sans">
                              {item.userNote}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 justify-between sm:justify-end">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase font-sans bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {item.method.replace('_', ' ')}
                          </span>
                          <span
                            className={`text-sm font-bold ${
                              item.type === 'bill'
                                ? 'text-slate-900 dark:text-slate-100'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {item.type === 'bill' ? formatMoney(item.amountMinor) : `-${formatMoney(item.amountMinor)}`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------------------- MODAL: RECORD OVERHEAD BILL -------------------- */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <PlusCircle size={16} className="text-blue-600" />
                Record Incurred Overhead Bill / Expense
              </h3>
              <button onClick={() => setIsBillModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveBill} className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  1. Expense Category
                </label>
                <select
                  value={billCategory}
                  onChange={(e) => setBillCategory(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                >
                  {FACTORY_EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    2. Bill Amount (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 14000"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    3. Bill Date
                  </label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  4. Vendor / Supplier / Party Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NEA, Ram Screen Printers, House Owner"
                  value={billPayee}
                  onChange={(e) => setBillPayee(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  5. Bill / Invoice # or Particulars (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Electricity Meter #401, 300 chest prints"
                  value={billNote}
                  onChange={(e) => setBillNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsBillModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Recording...' : 'Record Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: RECORD PAYMENT DISBURSEMENT -------------------- */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CreditCard size={16} className="text-emerald-600" />
                Record Cash / Bank Payment Out
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  1. Payment Amount (Rs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 14000"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-emerald-600 font-mono text-sm font-bold focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    2. Payment Method
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank / Fonepay</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    3. Payment Date
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  4. Category
                </label>
                <select
                  value={payCategory}
                  onChange={(e) => setPayCategory(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                >
                  {FACTORY_EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  5. Paid To (Beneficiary / Shop / Vendor)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NEA Counter, Ram Printing, Landlord"
                  value={payPayee}
                  onChange={(e) => setPayPayee(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  6. Cheque # / Fonepay Ref / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fonepay ref #9084, Cheque #00412"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-xl"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50"
                >
                  {isSaving ? 'Processing...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
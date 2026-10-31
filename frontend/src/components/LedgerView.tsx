import React, { useState, useMemo } from 'react';
import { 
  PlusCircle, UserPlus, Search, X, Check, RefreshCw, 
  CreditCard, ArrowDownLeft, ArrowUpRight, Building2, 
  Tag, Layers, DollarSign, Calendar, ChevronRight, 
  Printer, ArrowLeft, FileText, Scale, Phone, MapPin
} from 'lucide-react';
import { api, formatMoney, type Purchase, type Expense } from '../api.ts';

export const RAW_MATERIAL_CATEGORIES = [
  'Fabric (Fleece, Terry & Twill)',
  'Zippers & Pullers',
  'Ribbing & Elastic',
  'Drawstrings & Cords',
  'Labels, Tags & Badges',
  'Buttons & Rivets',
  'Packaging Polybags & Cartons',
  'Sewing & Overlock Thread',
  'Other Raw Materials',
];

export const NEPALI_MONTH_NAMES = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

// ─── Precise AD to BS Converter ───────────────────────────────────────────────

const BS_CALENDAR_DATA: Record<number, { days: number[]; startAd: string }> = {
  2078: { days: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30], startAd: '2021-04-14' },
  2079: { days: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], startAd: '2022-04-14' },
  2080: { days: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30], startAd: '2023-04-14' },
  2081: { days: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30], startAd: '2024-04-13' },
  2082: { days: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31], startAd: '2025-04-14' },
  2083: { days: [31, 31, 32, 31, 31, 30, 30, 29, 30, 29, 30, 30], startAd: '2026-04-14' },
  2084: { days: [31, 31, 32, 31, 31, 30, 30, 30, 29, 30, 29, 31], startAd: '2027-04-14' },
  2085: { days: [31, 32, 31, 32, 30, 31, 30, 29, 30, 29, 30, 30], startAd: '2028-04-13' },
  2086: { days: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 30], startAd: '2029-04-14' },
};

export function adToBs(isoDate: string): { year: number; month: number; day: number; str: string; fullStr: string } {
  const targetDate = new Date(isoDate);
  if (isNaN(targetDate.getTime())) {
    return { year: 2083, month: 7, day: 1, str: 'Kartik 01', fullStr: 'Kartik 01, 2083' };
  }

  const targetUtc = Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

  for (let bsYear = 2086; bsYear >= 2078; bsYear--) {
    const yearData = BS_CALENDAR_DATA[bsYear];
    if (!yearData) continue;

    const [sY, sM, sD] = yearData.startAd.split('-').map(Number);
    const startUtc = Date.UTC(sY, sM - 1, sD);

    if (targetUtc >= startUtc) {
      let diffDays = Math.floor((targetUtc - startUtc) / (1000 * 60 * 60 * 24));

      for (let mIdx = 0; mIdx < 12; mIdx++) {
        const monthDays = yearData.days[mIdx];
        if (diffDays < monthDays) {
          const day = diffDays + 1;
          const month = mIdx + 1;
          const monthName = NEPALI_MONTH_NAMES[mIdx];
          return {
            year: bsYear,
            month,
            day,
            str: `${monthName} ${day}`,
            fullStr: `${monthName} ${day}, ${bsYear}`,
          };
        }
        diffDays -= monthDays;
      }
    }
  }

  return { year: 2083, month: 7, day: 14, str: 'Kartik 14', fullStr: 'Kartik 14, 2083' };
}

export function formatNepaliDate(isoDate: string, includeYear = true): string {
  const converted = adToBs(isoDate);
  return includeYear ? converted.fullStr : converted.str;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface LedgerViewProps {
  expenses?: Expense[];
  purchases: Purchase[];
  onRefresh: () => void;
  selectedSupplier?: string | null;
  onSelectSupplier?: (name: string) => void;
  onBack?: () => void;
}

interface SupplierProfile {
  name: string;
  category: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

interface ParsedPurchase {
  id: number;
  purchaseNo: string;
  supplierName: string;
  purchaseDate: string;
  nepaliYear: number;
  nepaliMonth: number;
  nepaliDay: number;
  nepaliDateStr: string;
  description: string;
  amountMinor: number;
  rawNote: string;
  type: 'bill' | 'payment';
  category: string;
  billAmountMinor: number;
  paidAmountMinor: number;
  dueAmountMinor: number;
  paymentMethod: string;
  userNote: string;
}

function parsePurchase(p: Purchase): ParsedPurchase {
  const rawNote = p.note || '';

  const dateMatch = rawNote.match(/\[Date:\s*([\d-]+)\]/);
  const actualDate = dateMatch 
    ? dateMatch[1] 
    : (p.purchaseDate ? p.purchaseDate.split('T')[0] : new Date().toISOString().split('T')[0]);
  
  const nepaliDate = adToBs(actualDate);

  const paymentMatch = rawNote.match(/\[Type:\s*Payment\s*\|\s*Paid:\s*([\d.]+)\s*\|\s*Method:\s*([\w_]+)\]\s*(.*)$/s);
  if (paymentMatch) {
    const paidMinor = Math.round((parseFloat(paymentMatch[1]) || 0) * 100);
    return {
      id: p.id,
      purchaseNo: p.purchaseNo,
      supplierName: p.supplierName,
      purchaseDate: actualDate,
      nepaliYear: nepaliDate.year,
      nepaliMonth: nepaliDate.month,
      nepaliDay: nepaliDate.day,
      nepaliDateStr: nepaliDate.str,
      description: p.description,
      amountMinor: p.amountMinor,
      rawNote,
      type: 'payment',
      category: 'Supplier Payment',
      billAmountMinor: 0,
      paidAmountMinor: paidMinor || p.amountMinor,
      dueAmountMinor: 0,
      paymentMethod: paymentMatch[2] || 'bank_transfer',
      userNote: paymentMatch[3]?.replace(/\[Date:\s*[\d-]+\]\s*/, '') || '',
    };
  }

  const billMatch = rawNote.match(/\[Bill:\s*([\d.]+)\s*\|\s*Paid:\s*([\d.]+)\s*\|\s*Due:\s*([\d.]+)\s*\|\s*Cat:\s*([^|]+)\s*\|\s*Method:\s*([\w_]+)\]\s*(.*)$/s);
  if (billMatch) {
    const billMinor = Math.round((parseFloat(billMatch[1]) || 0) * 100);
    const paidMinor = Math.round((parseFloat(billMatch[2]) || 0) * 100);
    const dueMinor = Math.round((parseFloat(billMatch[3]) || 0) * 100);
    return {
      id: p.id,
      purchaseNo: p.purchaseNo,
      supplierName: p.supplierName,
      purchaseDate: actualDate,
      nepaliYear: nepaliDate.year,
      nepaliMonth: nepaliDate.month,
      nepaliDay: nepaliDate.day,
      nepaliDateStr: nepaliDate.str,
      description: p.description,
      amountMinor: p.amountMinor,
      rawNote,
      type: 'bill',
      category: billMatch[4].trim() || 'Fabric & Raw Materials',
      billAmountMinor: billMinor || p.amountMinor,
      paidAmountMinor: paidMinor,
      dueAmountMinor: dueMinor,
      paymentMethod: billMatch[5] || 'credit',
      userNote: billMatch[6]?.replace(/\[Date:\s*[\d-]+\]\s*/, '') || '',
    };
  }

  return {
    id: p.id,
    purchaseNo: p.purchaseNo,
    supplierName: p.supplierName,
    purchaseDate: actualDate,
    nepaliYear: nepaliDate.year,
    nepaliMonth: nepaliDate.month,
    nepaliDay: nepaliDate.day,
    nepaliDateStr: nepaliDate.str,
    description: p.description,
    amountMinor: p.amountMinor,
    rawNote,
    type: 'bill',
    category: 'Fabric & Raw Materials',
    billAmountMinor: p.amountMinor,
    paidAmountMinor: p.amountMinor,
    dueAmountMinor: 0,
    paymentMethod: 'cash',
    userNote: rawNote.replace(/\[Date:\s*[\d-]+\]\s*/, ''),
  };
}

export const LedgerView: React.FC<LedgerViewProps> = ({ 
  purchases, 
  onRefresh, 
  selectedSupplier: propSelectedSupplier, 
  onSelectSupplier, 
  onBack 
}) => {
  const [internalSelectedSupplier, setInternalSelectedSupplier] = useState<string | null>(null);
  const selectedSupplierName = propSelectedSupplier !== undefined ? propSelectedSupplier : internalSelectedSupplier;

  const handleSelectSupplier = (name: string) => {
    if (onSelectSupplier) onSelectSupplier(name);
    setInternalSelectedSupplier(name);
    setSupplierSubTab('passbook');
  };

  const handleClearSupplier = () => {
    if (onBack) onBack();
    setInternalSelectedSupplier(null);
  };

  const [supplierSubTab, setSupplierSubTab] = useState<'passbook' | 'bills' | 'payments'>('passbook');
  const [mainTab, setMainTab] = useState<'suppliers' | 'all_bills' | 'all_payments'>('suppliers');

  const currentNepaliToday = useMemo(() => adToBs(new Date().toISOString()), []);
  const [selectedYear, setSelectedYear] = useState<number>(currentNepaliToday.year);
  const availableYears = useMemo(() => [2085, 2084, 2083, 2082, 2081, 2080], []);

  const [monthFilter, setMonthFilter] = useState<number | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');

  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierCategory, setNewSupplierCategory] = useState(RAW_MATERIAL_CATEGORIES[0]);
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [newSupplierOpeningDue, setNewSupplierOpeningDue] = useState('');
  const [newSupplierNotes, setNewSupplierNotes] = useState('');

  const [billSupplier, setBillSupplier] = useState('');
  const [billCategory, setBillCategory] = useState(RAW_MATERIAL_CATEGORIES[0]);
  const [billDescription, setBillDescription] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billPaidNow, setBillPaidNow] = useState('');
  const [billMethod, setBillMethod] = useState<'cash' | 'bank_transfer' | 'cheque' | 'credit'>('credit');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [billNote, setBillNote] = useState('');

  const [paySupplier, setPaySupplier] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'bank_transfer' | 'cash' | 'cheque'>('bank_transfer');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payNote, setPayNote] = useState('');

  const [registeredSuppliers, setRegisteredSuppliers] = useState<Record<string, SupplierProfile>>(() => {
    try {
      const saved = localStorage.getItem('garment_registered_suppliers_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const parsedRecords = useMemo(() => {
    return purchases.map(parsePurchase);
  }, [purchases]);

  const existingSuppliers = useMemo(() => {
    const set = new Set<string>();
    Object.keys(registeredSuppliers).forEach((name) => set.add(name));
    purchases.forEach((p) => {
      if (p.supplierName && p.supplierName.trim()) {
        set.add(p.supplierName.trim());
      }
    });
    return Array.from(set).sort();
  }, [purchases, registeredSuppliers]);

  const supplierAccounts = useMemo(() => {
    const map = new Map<string, {
      supplierName: string;
      category: string;
      phone?: string;
      address?: string;
      notes?: string;
      totalBilledMinor: number;
      totalPaidMinor: number;
      outstandingDueMinor: number;
      transactionCount: number;
      lastActivityDate: string;
    }>();

    Object.values(registeredSuppliers).forEach((profile) => {
      const name = profile.name.trim();
      map.set(name, {
        supplierName: name,
        category: profile.category,
        phone: profile.phone,
        address: profile.address,
        notes: profile.notes,
        totalBilledMinor: 0,
        totalPaidMinor: 0,
        outstandingDueMinor: 0,
        transactionCount: 0,
        lastActivityDate: profile.createdAt || new Date().toISOString(),
      });
    });

    parsedRecords.forEach((item) => {
      const name = item.supplierName.trim();
      if (!name) return;

      const profile = registeredSuppliers[name];
      const current = map.get(name) || {
        supplierName: name,
        category: profile?.category || item.category || 'Fabric & Raw Materials',
        phone: profile?.phone,
        address: profile?.address,
        notes: profile?.notes,
        totalBilledMinor: 0,
        totalPaidMinor: 0,
        outstandingDueMinor: 0,
        transactionCount: 0,
        lastActivityDate: item.purchaseDate,
      };

      if (item.type === 'bill') {
        current.totalBilledMinor += item.billAmountMinor;
        current.totalPaidMinor += item.paidAmountMinor;
        current.outstandingDueMinor += item.dueAmountMinor;
      } else if (item.type === 'payment') {
        current.totalPaidMinor += item.paidAmountMinor;
        current.outstandingDueMinor -= item.paidAmountMinor;
      }

      current.transactionCount += 1;
      if (new Date(item.purchaseDate) > new Date(current.lastActivityDate)) {
        current.lastActivityDate = item.purchaseDate;
      }

      map.set(name, current);
    });

    return Array.from(map.values()).sort((a, b) => b.outstandingDueMinor - a.outstandingDueMinor);
  }, [parsedRecords, registeredSuppliers]);

  const globalMetrics = useMemo(() => {
    let totalPurchased = 0;
    let totalPaid = 0;
    let totalOwed = 0;

    supplierAccounts.forEach((acc) => {
      totalPurchased += acc.totalBilledMinor;
      totalPaid += acc.totalPaidMinor;
      if (acc.outstandingDueMinor > 0) {
        totalOwed += acc.outstandingDueMinor;
      }
    });

    return { totalPurchased, totalPaid, totalOwed, supplierCount: supplierAccounts.length };
  }, [supplierAccounts]);

  const selectedSupplierAccount = useMemo(() => {
    if (!selectedSupplierName) return null;
    return supplierAccounts.find(
      (s) => s.supplierName.toLowerCase() === selectedSupplierName.toLowerCase()
    ) || null;
  }, [supplierAccounts, selectedSupplierName]);

  const fullYearSupplierMonths = useMemo(() => {
    if (!selectedSupplierName) return [];

    const recordsInYear = parsedRecords.filter(
      (r) => r.supplierName.toLowerCase() === selectedSupplierName.toLowerCase() && r.nepaliYear === selectedYear
    );

    const monthBuckets = new Map<number, {
      grossBilled: number;
      paidAmount: number;
      billsCount: number;
      paymentsCount: number;
      notes: string[];
    }>();

    for (let m = 1; m <= 12; m++) {
      monthBuckets.set(m, { grossBilled: 0, paidAmount: 0, billsCount: 0, paymentsCount: 0, notes: [] });
    }

    recordsInYear.forEach((r) => {
      const bucket = monthBuckets.get(r.nepaliMonth);
      if (bucket) {
        if (r.type === 'bill') {
          bucket.grossBilled += r.billAmountMinor;
          bucket.paidAmount += r.paidAmountMinor;
          bucket.billsCount += 1;
        } else if (r.type === 'payment') {
          bucket.paidAmount += r.paidAmountMinor;
          bucket.paymentsCount += 1;
        }
        if (r.description) bucket.notes.push(r.description);
      }
    });

    let runningBalance = 0;
    return NEPALI_MONTH_NAMES.map((name, idx) => {
      const monthNum = idx + 1;
      const data = monthBuckets.get(monthNum)!;
      const opening = runningBalance;
      const netChange = data.grossBilled - data.paidAmount;
      runningBalance += netChange;
      const closing = runningBalance;
      const hasActivity = data.billsCount > 0 || data.paymentsCount > 0;

      return {
        monthNumber: monthNum,
        monthLabel: name,
        hasActivity,
        openingOwed: opening,
        grossBilled: data.grossBilled,
        paidAmount: data.paidAmount,
        netPayable: opening + data.grossBilled - data.paidAmount,
        closingDue: closing,
        billsCount: data.billsCount,
        paymentsCount: data.paymentsCount,
        notes: data.notes.slice(0, 2).join(', '),
      };
    });
  }, [parsedRecords, selectedSupplierName, selectedYear]);

  const supplierYearStats = useMemo(() => {
    let grossBilled = 0;
    let paidAmount = 0;
    let activeMonths = 0;

    fullYearSupplierMonths.forEach((m) => {
      if (m.hasActivity) {
        activeMonths++;
        grossBilled += m.grossBilled;
        paidAmount += m.paidAmount;
      }
    });

    const initialOpening = fullYearSupplierMonths[0]?.openingOwed || 0;
    const finalClosing = fullYearSupplierMonths[11]?.closingDue || 0;

    return { grossBilled, paidAmount, activeMonths, initialOpening, finalClosing };
  }, [fullYearSupplierMonths]);

  // Date-Bucket Sorting: Date ASC -> ID ASC
  const supplierDateBuckets = useMemo(() => {
    if (!selectedSupplierName || supplierSubTab === 'passbook') return [];

    const targetType = supplierSubTab === 'bills' ? 'bill' : 'payment';

    const filtered = parsedRecords.filter((item) => {
      if (item.supplierName.toLowerCase() !== selectedSupplierName.toLowerCase()) return false;
      if (item.type !== targetType) return false;
      if (item.nepaliYear !== selectedYear) return false;
      if (monthFilter !== 'ALL' && item.nepaliMonth !== monthFilter) return false;
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;

      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        return (
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.userNote.toLowerCase().includes(q)
        );
      }
      return true;
    });

    filtered.sort((a, b) => {
      const timeA = new Date(a.purchaseDate).getTime();
      const timeB = new Date(b.purchaseDate).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.id - b.id;
    });

    const buckets: Array<{ date: string; nepaliLabel: string; items: ParsedPurchase[]; dayTotal: number }> = [];
    const map = new Map<string, { date: string; nepaliLabel: string; items: ParsedPurchase[]; dayTotal: number }>();

    filtered.forEach((item) => {
      const itemAmt = item.type === 'bill' ? item.billAmountMinor : item.paidAmountMinor;
      const existing = map.get(item.purchaseDate);
      if (existing) {
        existing.items.push(item);
        existing.dayTotal += itemAmt;
      } else {
        const newB = { 
          date: item.purchaseDate, 
          nepaliLabel: formatNepaliDate(item.purchaseDate, false),
          items: [item], 
          dayTotal: itemAmt 
        };
        map.set(item.purchaseDate, newB);
        buckets.push(newB);
      }
    });

    return buckets;
  }, [parsedRecords, selectedSupplierName, supplierSubTab, selectedYear, monthFilter, categoryFilter, searchFilter]);

  const handleOpenAddSupplier = () => {
    setNewSupplierName('');
    setNewSupplierCategory(RAW_MATERIAL_CATEGORIES[0]);
    setNewSupplierPhone('');
    setNewSupplierAddress('');
    setNewSupplierOpeningDue('');
    setNewSupplierNotes('');
    setError(null);
    setIsAddSupplierModalOpen(true);
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newSupplierName.trim();
    if (!trimmedName) {
      setError('Supplier name is required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const updatedProfile: SupplierProfile = {
        name: trimmedName,
        category: newSupplierCategory,
        phone: newSupplierPhone.trim() || undefined,
        address: newSupplierAddress.trim() || undefined,
        notes: newSupplierNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      const updatedMap = { ...registeredSuppliers, [trimmedName]: updatedProfile };
      setRegisteredSuppliers(updatedMap);
      localStorage.setItem('garment_registered_suppliers_v1', JSON.stringify(updatedMap));

      const openingDueVal = parseFloat(newSupplierOpeningDue) || 0;
      if (openingDueVal > 0) {
        const todayStr = new Date().toISOString().split('T')[0];
        const notePayload = `[Date: ${todayStr}] [Bill: ${openingDueVal} | Paid: 0 | Due: ${openingDueVal} | Cat: ${newSupplierCategory} | Method: credit] Opening Balance Setup`;
        await api.createPurchase({
          supplierName: trimmedName,
          description: `Opening Balance (${newSupplierCategory})`,
          amountMinor: Math.round(openingDueVal * 100),
          currency: 'NPR',
          purchaseDate: todayStr,
          note: notePayload,
        });
      }

      setIsAddSupplierModalOpen(false);
      setSuccessMessage(`Supplier "${trimmedName}" registered successfully.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to register supplier');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenNewBill = (defaultSupplierName?: string) => {
    setBillSupplier(defaultSupplierName || selectedSupplierName || '');
    setBillCategory(RAW_MATERIAL_CATEGORIES[0]);
    setBillDescription('');
    setBillAmount('');
    setBillPaidNow('');
    setBillMethod('credit');
    setBillDate(new Date().toISOString().split('T')[0]);
    setBillNote('');
    setError(null);
    setIsBillModalOpen(true);
  };

  const handleOpenPayment = (defaultSupplierName?: string) => {
    setPaySupplier(defaultSupplierName || selectedSupplierName || existingSuppliers[0] || '');
    setPayAmount('');
    setPayMethod('bank_transfer');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNote('');
    setError(null);
    setIsPaymentModalOpen(true);
  };

  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const billVal = parseFloat(billAmount);
    if (!billSupplier.trim()) {
      setError('Supplier name is required.');
      return;
    }
    if (isNaN(billVal) || billVal <= 0) {
      setError('Please enter a valid bill amount.');
      return;
    }

    const paidVal = parseFloat(billPaidNow) || 0;
    const dueVal = Math.max(0, billVal - paidVal);

    const notePayload = `[Date: ${billDate}] [Bill: ${billVal} | Paid: ${paidVal} | Due: ${dueVal} | Cat: ${billCategory} | Method: ${billMethod}] ${billNote.trim()}`;

    try {
      setIsSaving(true);
      setError(null);

      await api.createPurchase({
        supplierName: billSupplier.trim(),
        description: billDescription.trim() || `${billCategory} Purchase`,
        amountMinor: Math.round(billVal * 100),
        currency: 'NPR',
        purchaseDate: billDate,
        note: notePayload,
      });

      setIsBillModalOpen(false);
      setSuccessMessage(`Raw material bill recorded for ${billSupplier.trim()}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to record purchase bill');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const paidVal = parseFloat(payAmount);
    if (!paySupplier.trim()) {
      setError('Please select a supplier.');
      return;
    }
    if (isNaN(paidVal) || paidVal <= 0) {
      setError('Please enter a valid payment amount.');
      return;
    }

    const notePayload = `[Date: ${payDate}] [Type: Payment | Paid: ${paidVal} | Method: ${payMethod}] ${payNote.trim()}`;

    try {
      setIsSaving(true);
      setError(null);

      await api.createPurchase({
        supplierName: paySupplier.trim(),
        description: `Payment to ${paySupplier.trim()}`,
        amountMinor: Math.round(paidVal * 100),
        currency: 'NPR',
        purchaseDate: payDate,
        note: notePayload,
      });

      setIsPaymentModalOpen(false);
      setSuccessMessage(`Payment of Rs. ${paidVal.toLocaleString()} recorded for ${paySupplier.trim()}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to record supplier payment');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    if (!searchFilter.trim()) return supplierAccounts;
    const q = searchFilter.toLowerCase();
    return supplierAccounts.filter((s) => s.supplierName.toLowerCase().includes(q));
  }, [supplierAccounts, searchFilter]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto font-sans">
      {/* ══════════════════════ CASE A: SUPPLIER DEDICATED HISTORY VIEW ══════════════════════ */}
      {selectedSupplierAccount ? (
        <div className="space-y-4">
          {/* Header Profile Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClearSupplier}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition shrink-0"
                title="Back to All Suppliers"
              >
                <ArrowLeft size={16} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                    {selectedSupplierAccount.category}
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedSupplierAccount.supplierName}
                  </h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold border bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                    Active Supplier
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedSupplierAccount.phone && (
                    <span className="flex items-center gap-1 font-mono">
                      <Phone size={11} /> {selectedSupplierAccount.phone}
                    </span>
                  )}
                  {selectedSupplierAccount.address && (
                    <span className="flex items-center gap-1">
                      <MapPin size={11} /> {selectedSupplierAccount.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

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
                onClick={() => handleOpenNewBill(selectedSupplierAccount.supplierName)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs"
              >
                <PlusCircle size={13} />
                <span>+ Bill</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenPayment(selectedSupplierAccount.supplierName)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-xs"
              >
                <CreditCard size={13} />
                <span>Pay</span>
              </button>

              <button
                type="button"
                onClick={() => setIsStatementOpen(true)}
                className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                title="Print Statement"
              >
                <Printer size={15} />
              </button>
            </div>
          </div>

          {/* Highlights Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
                <span>Career Materials Billed</span>
                <ArrowDownLeft size={14} className="text-blue-500" />
              </div>
              <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-1 block truncate">
                {formatMoney(selectedSupplierAccount.totalBilledMinor)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Total inward raw materials
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
                <span>Career Payments Made</span>
                <ArrowUpRight size={14} className="text-emerald-500" />
              </div>
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 block truncate">
                {formatMoney(selectedSupplierAccount.totalPaidMinor)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Cash & bank disbursements
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center justify-between text-slate-400 font-sans text-[10px] font-bold uppercase">
                <span>Year Payments Paid Out</span>
                <DollarSign size={14} className="text-emerald-500" />
              </div>
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 block truncate">
                {formatMoney(supplierYearStats.paidAmount)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Disbursed in {selectedYear} B.S.
              </span>
            </div>

            <div
              className={`p-3.5 rounded-2xl border shadow-2xs ${
                selectedSupplierAccount.outstandingDueMinor > 0
                  ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                  : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
              }`}
            >
              <div className="flex items-center justify-between font-sans text-[10px] font-bold uppercase">
                <span className={selectedSupplierAccount.outstandingDueMinor > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
                  {selectedSupplierAccount.outstandingDueMinor > 0 ? 'Factory Owes Supplier' : 'Account Balanced'}
                </span>
                <Scale size={14} className={selectedSupplierAccount.outstandingDueMinor > 0 ? 'text-amber-600' : 'text-emerald-600'} />
              </div>
              <span className={`text-base sm:text-lg font-bold mt-1 block truncate ${selectedSupplierAccount.outstandingDueMinor > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {formatMoney(Math.abs(selectedSupplierAccount.outstandingDueMinor))}
              </span>
              <span className="text-[10px] text-slate-500 font-sans mt-0.5 block">
                {selectedSupplierAccount.outstandingDueMinor > 0 ? 'Credit balance owed' : 'Zero pending dues'}
              </span>
            </div>
          </div>

          {/* Year Progress Bar Strip */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Year Progress</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 font-sans">
                {supplierYearStats.activeMonths} of 12 Months Active
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Opening Year Balance</span>
              <span className="font-bold text-slate-600 dark:text-slate-300">
                {formatMoney(supplierYearStats.initialOpening)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Year Gross Billed</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                +{formatMoney(supplierYearStats.grossBilled)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Year Payments</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                -{formatMoney(supplierYearStats.paidAmount)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-sans font-bold block">Year-End Standing</span>
              <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                {formatMoney(supplierYearStats.finalClosing)}
              </span>
            </div>
          </div>

          {/* Sub-Tabs Inside Supplier History */}
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar text-xs">
            <button
              type="button"
              onClick={() => {
                setSupplierSubTab('passbook');
                setMonthFilter('ALL');
              }}
              className={`px-4 py-2 rounded-xl font-bold transition whitespace-nowrap shrink-0 ${
                supplierSubTab === 'passbook'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              📅 12-Month Passbook
            </button>

            <button
              type="button"
              onClick={() => setSupplierSubTab('bills')}
              className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                supplierSubTab === 'bills'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>📋 Inward Material Bills</span>
              <span className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
                {parsedRecords.filter(r => r.supplierName.toLowerCase() === selectedSupplierAccount.supplierName.toLowerCase() && r.type === 'bill' && r.nepaliYear === selectedYear).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSupplierSubTab('payments')}
              className={`px-4 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                supplierSubTab === 'payments'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>💳 Payments to Supplier</span>
              <span className="bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.2 rounded-full text-[10px]">
                {parsedRecords.filter(r => r.supplierName.toLowerCase() === selectedSupplierAccount.supplierName.toLowerCase() && r.type === 'payment' && r.nepaliYear === selectedYear).length}
              </span>
            </button>
          </div>

          {/* ════════════ 12-MONTH PASSBOOK WITH DIRECT DRILL-DOWN LINKS ════════════ */}
          {supplierSubTab === 'passbook' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                      <th className="py-3 px-4 font-sans font-bold w-32">Month</th>
                      <th className="py-3 px-3 w-28 font-sans">Status</th>
                      <th className="py-3 px-3 text-right w-24">Opening Owed</th>
                      <th className="py-3 px-3 text-right w-28">Gross Billed</th>
                      <th className="py-3 px-3 text-right w-28 text-emerald-600">Paid Out</th>
                      <th className="py-3 px-3 text-right w-28 text-blue-600 dark:text-blue-400 font-bold">Net Payable</th>
                      <th className="py-3 px-3 text-right w-28 text-amber-600 font-bold">Carried Due</th>
                      <th className="py-3 px-4 font-sans min-w-[140px]">Notes</th>
                      <th className="py-3 px-4 text-right w-44 font-sans">Direct Links</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {fullYearSupplierMonths.map((m) => (
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
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {m.hasActivity ? 'Settled' : 'Not Tallied'}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right text-slate-500">
                          {m.hasActivity ? formatMoney(m.openingOwed) : '—'}
                        </td>

                        <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                          {m.hasActivity && m.grossBilled > 0 ? formatMoney(m.grossBilled) : '—'}
                        </td>

                        <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {m.hasActivity && m.paidAmount > 0 ? `-${formatMoney(m.paidAmount)}` : '—'}
                        </td>

                        <td className="py-3 px-3 text-right font-bold text-blue-600 dark:text-blue-400">
                          {m.hasActivity ? formatMoney(m.netPayable) : '—'}
                        </td>

                        <td className="py-3 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                          {m.hasActivity ? formatMoney(m.closingDue) : '—'}
                        </td>

                        <td className="py-3 px-4 font-sans text-slate-500 text-[11px] max-w-xs truncate">
                          {m.hasActivity && m.notes ? m.notes : '—'}
                        </td>

                        <td className="py-3 px-4 text-right font-sans">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setMonthFilter(m.monthNumber);
                                setSupplierSubTab('bills');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold text-[11px] hover:bg-blue-100 transition"
                            >
                              Bills ({m.billsCount}) →
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMonthFilter(m.monthNumber);
                                setSupplierSubTab('payments');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[11px] hover:bg-emerald-100 transition"
                            >
                              Paid ({m.paymentsCount}) →
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════════════ SEPARATED LOGS WITH NEPALI DATE BUCKETS ════════════ */}
          {(supplierSubTab === 'bills' || supplierSubTab === 'payments') && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    Viewing {supplierSubTab === 'bills' ? 'Material Bills' : 'Payments Out'}:
                  </span>

                  <select
                    value={monthFilter}
                    onChange={(e) => setMonthFilter(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                    className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Months ({selectedYear} B.S.)</option>
                    {NEPALI_MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>

                  {supplierSubTab === 'bills' && (
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">All Categories</option>
                      {RAW_MATERIAL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                  <input
                    type="text"
                    placeholder="Search material, note..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none"
                  />
                  {searchFilter && (
                    <button onClick={() => setSearchFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {supplierDateBuckets.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  No {supplierSubTab === 'bills' ? 'material bills' : 'payments'} recorded for this period.
                </div>
              ) : (
                <div className="space-y-4">
                  {supplierDateBuckets.map((bucket) => (
                    <div
                      key={bucket.date}
                      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden"
                    >
                      {/* Nepali Date Header Strip */}
                      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} className="text-blue-600 dark:text-blue-400" />
                          <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                            {bucket.nepaliLabel}
                          </span>
                          <span className="text-[11px] text-slate-400 font-sans">
                            ({bucket.items.length} {supplierSubTab === 'bills' ? 'bill' : 'payment'}{bucket.items.length !== 1 ? 's' : ''})
                          </span>
                        </div>

                        <div className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                          Day Total: {formatMoney(bucket.dayTotal)}
                        </div>
                      </div>

                      {/* Entries strictly sorted Date ASC -> ID ASC */}
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                        {bucket.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-sans font-bold text-slate-900 dark:text-slate-100 text-sm">
                                  {item.description}
                                </span>
                                {item.category && item.type === 'bill' && (
                                  <span className="text-[11px] text-blue-600 dark:text-blue-400 font-sans font-semibold">
                                    • {item.category}
                                  </span>
                                )}
                              </div>
                              {item.userNote && (
                                <p className="text-[11px] text-slate-500 font-sans">
                                  {item.userNote}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-4 justify-between sm:justify-end">
                              {item.type === 'bill' ? (
                                <div className="text-right">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm block">
                                    +{formatMoney(item.billAmountMinor)}
                                  </span>
                                  {item.paidAmountMinor > 0 && (
                                    <span className="text-[10px] text-emerald-600 block">
                                      Paid: {formatMoney(item.paidAmountMinor)}
                                    </span>
                                  )}
                                  {item.dueAmountMinor > 0 && (
                                    <span className="text-[10px] text-amber-600 block">
                                      Due: {formatMoney(item.dueAmountMinor)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="text-right">
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm block">
                                    -{formatMoney(item.paidAmountMinor)}
                                  </span>
                                  <span className="text-[10px] uppercase font-sans px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {item.paymentMethod.replace('_', ' ')}
                                  </span>
                                </div>
                              )}
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
        </div>
      ) : (
        /* ══════════════════════ CASE B: MAIN DIRECTORY ══════════════════════ */
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers size={20} className="text-blue-600 dark:text-blue-400" />
                <span>Raw Materials & Supplier Khata</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Track fabric rolls, trims, zippers, credit purchases, and merchant balance ledgers.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAddSupplier}
                className="px-3.5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95"
              >
                <UserPlus size={15} />
                <span>+ Add Supplier</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenNewBill()}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95"
              >
                <PlusCircle size={15} />
                <span>+ Material Bill</span>
              </button>

              <button
                type="button"
                onClick={() => handleOpenPayment()}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs active:scale-95"
              >
                <CreditCard size={15} />
                <span>Pay Supplier</span>
              </button>

              <button
                type="button"
                onClick={onRefresh}
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition"
                title="Reload data"
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 text-xs font-mono">
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">Total Materials Purchased</span>
              <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5 block truncate">
                {formatMoney(globalMetrics.totalPurchased)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Across {globalMetrics.supplierCount} merchants
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
              <span className="text-[10px] text-emerald-600 uppercase font-sans font-bold block">Total Paid to Suppliers</span>
              <span className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block truncate">
                {formatMoney(globalMetrics.totalPaid)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Cash & bank settlements
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-sans font-bold block">
                Current Debt Owed to Suppliers
              </span>
              <span className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5 block truncate">
                {formatMoney(globalMetrics.totalOwed)}
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Unpaid material credit balances
              </span>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs col-span-2 sm:col-span-1">
              <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-sans font-bold block">
                Active Supplier Accounts
              </span>
              <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5 block">
                {globalMetrics.supplierCount} Vendors
              </span>
              <span className="text-[10px] text-slate-400 font-sans mt-0.5 block">
                Textile & trims merchants
              </span>
            </div>
          </div>

          {/* Subtabs and Search */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setMainTab('suppliers')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mainTab === 'suppliers'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Supplier Accounts ({supplierAccounts.length})
              </button>

              <button
                type="button"
                onClick={() => setMainTab('all_bills')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mainTab === 'all_bills'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                📋 All Material Bills ({parsedRecords.filter(r => r.type === 'bill').length})
              </button>

              <button
                type="button"
                onClick={() => setMainTab('all_payments')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                  mainTab === 'all_payments'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                💳 All Supplier Payments ({parsedRecords.filter(r => r.type === 'payment').length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Search supplier or material..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-blue-600"
              />
              {searchFilter && (
                <button onClick={() => setSearchFilter('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Cards Grid */}
          {mainTab === 'suppliers' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSuppliers.length === 0 ? (
                <div className="col-span-full p-12 text-center text-xs text-slate-500 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                  No supplier accounts found. Click "+ Add Supplier" to register your first supplier.
                </div>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <div
                    key={supplier.supplierName}
                    className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-blue-400 transition flex flex-col justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {supplier.supplierName}
                          </h4>
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold block mt-0.5">
                            {supplier.category}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1">
                            {supplier.phone && (
                              <span className="flex items-center gap-0.5 font-mono">
                                <Phone size={11} /> {supplier.phone}
                              </span>
                            )}
                            {supplier.address && (
                              <span className="flex items-center gap-0.5">
                                <MapPin size={11} /> {supplier.address}
                              </span>
                            )}
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            supplier.outstandingDueMinor > 0
                              ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {supplier.outstandingDueMinor > 0 ? 'Credit Balance' : 'Settled'}
                        </span>
                      </div>

                      <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1 font-mono text-xs">
                        <div className="flex justify-between text-slate-500">
                          <span>Total Billed:</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatMoney(supplier.totalBilledMinor)}
                          </span>
                        </div>
                        <div className="flex justify-between text-emerald-600">
                          <span>Total Paid:</span>
                          <span className="font-semibold">
                            -{formatMoney(supplier.totalPaidMinor)}
                          </span>
                        </div>
                        <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-amber-600 dark:text-amber-400">
                          <span>Balance Owed:</span>
                          <span>{formatMoney(supplier.outstandingDueMinor)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleSelectSupplier(supplier.supplierName)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs transition flex items-center justify-center gap-1"
                      >
                        <span>View Ledger History</span>
                        <ChevronRight size={13} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenPayment(supplier.supplierName)}
                        className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition"
                      >
                        Pay
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 font-mono text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                      <th className="py-3 px-4 w-32">Nepali Date</th>
                      <th className="py-3 px-4 min-w-[140px]">Supplier</th>
                      <th className="py-3 px-4 min-w-[200px]">Description</th>
                      {mainTab === 'all_bills' ? (
                        <>
                          <th className="py-3 px-3 text-right w-28">Bill Total</th>
                          <th className="py-3 px-3 text-right w-28 text-emerald-600">Paid Now</th>
                          <th className="py-3 px-3 text-right w-28 text-amber-600 font-bold">Credit Due</th>
                        </>
                      ) : (
                        <>
                          <th className="py-3 px-3 w-32">Payment Method</th>
                          <th className="py-3 px-3 text-right w-32 text-emerald-600 font-bold">Amount Paid</th>
                        </>
                      )}
                      <th className="py-3 px-4 font-sans min-w-[140px]">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {parsedRecords
                      .filter((r) => r.type === (mainTab === 'all_bills' ? 'bill' : 'payment'))
                      .sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime() || a.id - b.id)
                      .map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-bold whitespace-nowrap">
                            {item.nepaliDateStr}
                          </td>
                          <td className="py-3 px-4 font-sans font-bold text-slate-900 dark:text-slate-100 truncate">
                            <button
                              type="button"
                              onClick={() => handleSelectSupplier(item.supplierName)}
                              className="hover:underline text-blue-600 dark:text-blue-400"
                            >
                              {item.supplierName}
                            </button>
                          </td>
                          <td className="py-3 px-4 font-sans text-slate-700 dark:text-slate-300">
                            {item.description}
                          </td>
                          {mainTab === 'all_bills' ? (
                            <>
                              <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-slate-100">
                                {formatMoney(item.billAmountMinor)}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                {item.paidAmountMinor > 0 ? formatMoney(item.paidAmountMinor) : '—'}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                                {item.dueAmountMinor > 0 ? formatMoney(item.dueAmountMinor) : '—'}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3 px-3 font-sans">
                                <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                  {item.paymentMethod.replace('_', ' ')}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                -{formatMoney(item.paidAmountMinor)}
                              </td>
                            </>
                          )}
                          <td className="py-3 px-4 font-sans text-slate-500 text-[11px] max-w-xs truncate">
                            {item.userNote || '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -------------------- MODAL: ADD NEW SUPPLIER -------------------- */}
      {isAddSupplierModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <UserPlus size={16} className="text-blue-600" />
                Register New Supplier / Vendor
              </h3>
              <button onClick={() => setIsAddSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  1. Company / Merchant Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Suraj Textiles, Everest Zippers"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  2. Primary Material Category
                </label>
                <select
                  value={newSupplierCategory}
                  onChange={(e) => setNewSupplierCategory(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                >
                  {RAW_MATERIAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    3. Contact Phone (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9841XXXXXX"
                    value={newSupplierPhone}
                    onChange={(e) => setNewSupplierPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    4. Market Address (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. New Road, Kathmandu"
                    value={newSupplierAddress}
                    onChange={(e) => setNewSupplierAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  5. Existing Opening Debt Owed (Rs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={newSupplierOpeningDue}
                  onChange={(e) => setNewSupplierOpeningDue(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 font-mono text-sm font-bold focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  6. Notes / Payment Terms (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 30 days credit term, delivered via transporter"
                  value={newSupplierNotes}
                  onChange={(e) => setNewSupplierNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierModalOpen(false)}
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
                  {isSaving ? 'Registering...' : 'Register Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------- MODAL: RECORD MATERIAL BILL -------------------- */}
      {isBillModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <PlusCircle size={16} className="text-blue-600" />
                Record Raw Material Purchase Bill
              </h3>
              <button onClick={() => setIsBillModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveBill} className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  1. Supplier / Merchant Name
                </label>
                <input
                  type="text"
                  list="suppliersList"
                  placeholder="e.g. Suraj Textiles, Everest Trims"
                  value={billSupplier}
                  onChange={(e) => setBillSupplier(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
                <datalist id="suppliersList">
                  {existingSuppliers.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    2. Material Category
                  </label>
                  <select
                    value={billCategory}
                    onChange={(e) => setBillCategory(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  >
                    {RAW_MATERIAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
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
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-1 block">
                    Nepali Date: {formatNepaliDate(billDate)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  4. Material Description / Item Details
                </label>
                <input
                  type="text"
                  placeholder="e.g. 10 Rolls Black French Terry (280kg @ Rs. 620)"
                  value={billDescription}
                  onChange={(e) => setBillDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    5. Total Bill Amount (Rs.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 173600"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm font-bold focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-bold">
                      6. Paid Now (Rs.)
                    </label>
                    <button
                      type="button"
                      onClick={() => setBillPaidNow(billAmount)}
                      className="text-[10px] text-blue-600 hover:underline font-bold"
                    >
                      Paid Full
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={billPaidNow}
                    onChange={(e) => setBillPaidNow(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-mono text-sm font-bold focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {parseFloat(billPaidNow) > 0 && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Payment Method for Paid Amount
                  </label>
                  <select
                    value={billMethod}
                    onChange={(e) => setBillMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  >
                    <option value="bank_transfer">Bank Transfer / Fonepay</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex justify-between items-center font-mono text-xs">
                <span className="text-slate-500 font-sans">Remaining Credit Due:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400 text-sm">
                  Rs. {Math.max(0, (parseFloat(billAmount) || 0) - (parseFloat(billPaidNow) || 0)).toLocaleString()}
                </span>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Challan / Bill # or Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Challan #4402, 30 days credit"
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

      {/* -------------------- MODAL: RECORD PAYMENT TO SUPPLIER -------------------- */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-800 space-y-3.5 text-xs">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CreditCard size={16} className="text-emerald-600" />
                Record Payment to Supplier
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  1. Select Supplier
                </label>
                <select
                  value={paySupplier}
                  onChange={(e) => setPaySupplier(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  required
                >
                  {existingSuppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  2. Payment Amount (Rs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="e.g. 50000"
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
                    3. Payment Method
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:outline-none focus:border-blue-600"
                  >
                    <option value="bank_transfer">Bank Transfer / Fonepay</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    4. Payment Date
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:border-blue-600"
                    required
                  />
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 block">
                    Nepali Date: {formatNepaliDate(payDate)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  5. Reference / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fonepay ref #9082, Cheque #00421"
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

      {/* -------------------- MODAL: PRINTABLE SUPPLIER STATEMENT -------------------- */}
      {isStatementOpen && selectedSupplierAccount && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-3">
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsStatementOpen(false)}
              className="no-print absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={18} />
            </button>

            <div className="space-y-4 font-sans text-xs">
              <div className="text-center border-b pb-3 border-slate-200">
                <h3 className="font-bold text-lg uppercase tracking-tight">Garment Factory</h3>
                <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                  Supplier Statement of Account
                </p>
                <span className="inline-block mt-1 text-[11px] font-mono text-slate-600">
                  Year {selectedYear} B.S. • Generated on {formatNepaliDate(new Date().toISOString())}
                </span>
              </div>

              <div className="flex justify-between border-b pb-3 border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">VENDOR / MERCHANT</span>
                  <span className="font-bold text-base text-slate-900">{selectedSupplierAccount.supplierName}</span>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {selectedSupplierAccount.category}
                    {selectedSupplierAccount.phone && ` • Phone: ${selectedSupplierAccount.phone}`}
                    {selectedSupplierAccount.address && ` • ${selectedSupplierAccount.address}`}
                  </div>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[10px] text-slate-400 block font-sans uppercase font-bold">CLOSING BALANCE OWED</span>
                  <span className="font-bold text-base text-amber-700">
                    {formatMoney(supplierYearStats.finalClosing)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-center">
                <div>
                  <span className="text-[10px] text-slate-500 font-sans block">Year Inward Bills</span>
                  <span className="font-bold text-slate-900">{formatMoney(supplierYearStats.grossBilled)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-emerald-700 font-sans block">Year Payments</span>
                  <span className="font-bold text-emerald-700">-{formatMoney(supplierYearStats.paidAmount)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-amber-700 font-sans block">Net Closing Due</span>
                  <span className="font-bold text-amber-700">{formatMoney(supplierYearStats.finalClosing)}</span>
                </div>
              </div>

              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-300 text-[10px] uppercase text-slate-500">
                      <th className="py-1.5 px-2">Month</th>
                      <th className="py-1.5 px-2 text-right">Billed (+)</th>
                      <th className="py-1.5 px-2 text-right">Paid (-)</th>
                      <th className="py-1.5 px-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {fullYearSupplierMonths.filter(m => m.hasActivity).map((m) => (
                      <tr key={m.monthNumber}>
                        <td className="py-1.5 px-2 font-sans font-bold">{m.monthLabel}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-slate-900">{m.grossBilled > 0 ? formatMoney(m.grossBilled) : '—'}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-emerald-600">{m.paidAmount > 0 ? formatMoney(m.paidAmount) : '—'}</td>
                        <td className="py-1.5 px-2 text-right font-bold text-amber-600">{formatMoney(m.closingDue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-8 grid grid-cols-2 text-center text-[10px] border-t border-slate-200 mt-6 text-slate-500 font-sans">
                <div>
                  <div className="border-b border-slate-300 w-28 mx-auto mb-1"></div>
                  <span>Factory Authorized Sign</span>
                </div>
                <div>
                  <div className="border-b border-slate-300 w-28 mx-auto mb-1"></div>
                  <span>Supplier Confirmation</span>
                </div>
              </div>
            </div>

            <div className="no-print mt-5 pt-3 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsStatementOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 font-semibold rounded-lg hover:bg-slate-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-1.5 text-xs bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
              >
                <Printer size={13} />
                <span>Print Statement</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
import React, { useState, useEffect, useMemo } from 'react';
import { 
  api, 
  type Customer, 
  type Product, 
  type ProductVariant, 
  type StockSummary, 
  type Currency, 
  type CustomerStatement,
  formatMoney 
} from '../api.ts';
import { 
  User, UserPlus, Tag, Calendar, AlertTriangle, CheckCircle2, 
  RotateCcw, Sparkles, Plus, Trash2, Edit3, ShoppingCart, 
  Scale, X
} from 'lucide-react';

interface OrderEntryMatrixProps {
  customers: Customer[];
  products: Product[];
  variants: ProductVariant[];
  stock: StockSummary[];
  onOrderCreated: () => void;
}

interface StagedStyle {
  productId: number;
  productCode: string;
  productName: string;
  unitPriceMinor: number;
  currency: Currency;
  quantities: Record<number, number>; // variantId -> qty
  totalPieces: number;
  allocatedPieces: number;
  shortagePieces: number;
  totalAmountMinor: number;
}

export const OrderEntryMatrix: React.FC<OrderEntryMatrixProps> = ({
  customers: initialCustomers,
  products,
  variants,
  stock,
  onOrderCreated,
}) => {
  // Local Customer Registry (allows newly created customers to appear immediately)
  const [customerList, setCustomerList] = useState<Customer[]>(initialCustomers);

  useEffect(() => {
    setCustomerList(initialCustomers);
  }, [initialCustomers]);

  // Order Header State
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(
    initialCustomers.length > 0 ? initialCustomers[0].id : 0,
  );
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [requiredDate, setRequiredDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Customer Financial Statement Snapshot
  const [customerStatement, setCustomerStatement] = useState<CustomerStatement | null>(null);

  // Active Matrix Working State
  const [selectedProductId, setSelectedProductId] = useState<number>(
    products.length > 0 ? products[0].id : 0,
  );
  const [priceOverride, setPriceOverride] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});

  // Multi-Style Staging Buffer
  const [stagedStyles, setStagedStyles] = useState<StagedStyle[]>([]);

  // Modals & Submissions
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Customer Modal State
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustCode, setNewCustCode] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustCurrency, setNewCustCurrency] = useState<Currency>('NPR');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerModalError, setCustomerModalError] = useState<string | null>(null);

  const selectedCustomer = customerList.find((c) => c.id === selectedCustomerId);
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const currency: Currency = selectedCustomer?.defaultCurrency ?? 'NPR';

  // Fetch live credit snapshot whenever the customer changes
  useEffect(() => {
    if (selectedCustomerId) {
      api.getCustomerStatement(selectedCustomerId)
        .then((res) => setCustomerStatement(res.statement))
        .catch(() => setCustomerStatement(null));
    } else {
      setCustomerStatement(null);
    }
  }, [selectedCustomerId]);

  // Sync unit price when product selection changes
  useEffect(() => {
    if (selectedProduct) {
      const defaultPrice = selectedProduct.defaultPriceMinor 
        ? (selectedProduct.defaultPriceMinor / 100).toFixed(2) 
        : '';
      setPriceOverride(defaultPrice);
    }
  }, [selectedProductId, selectedProduct]);

  // Variants for selected product
  const productVariants = useMemo(
    () => variants.filter((v) => v.productId === selectedProductId),
    [variants, selectedProductId],
  );

  const sizes = useMemo(
    () => Array.from(new Set(productVariants.map((v) => v.size))),
    [productVariants],
  );
  const colours = useMemo(
    () => Array.from(new Set(productVariants.map((v) => v.colour))),
    [productVariants],
  );

  const stockMap = useMemo(() => {
    const map = new Map<number, StockSummary>();
    stock.forEach((s) => map.set(s.variantId, s));
    return map;
  }, [stock]);

  const variantByColourSize = (colour: string, size: string) =>
    productVariants.find((v) => v.colour === colour && v.size === size);

  // Active matrix cell change
  const handleQtyChange = (variantId: number, qtyStr: string) => {
    const val = parseInt(qtyStr, 10);
    setQuantities((prev) => ({
      ...prev,
      [variantId]: isNaN(val) || val < 0 ? 0 : val,
    }));
  };

  // Quick fill buttons
  const handleFillAvailable = () => {
    const filled: Record<number, number> = {};
    productVariants.forEach((v) => {
      const st = stockMap.get(v.id);
      const avail = st ? Math.max(0, st.available) : 0;
      if (avail > 0) filled[v.id] = avail;
    });
    setQuantities(filled);
  };

  const handleFillUniform = (pcs: number) => {
    const filled: Record<number, number> = {};
    productVariants.forEach((v) => {
      filled[v.id] = pcs;
    });
    setQuantities(filled);
  };

  const handleClearMatrix = () => {
    setQuantities({});
  };

  // Calculate metrics for currently active matrix
  const currentMatrixMetrics = useMemo(() => {
    let totalPieces = 0;
    let allocatedPieces = 0;
    let shortagePieces = 0;
    const parsedPriceMinor = priceOverride.trim() !== '' 
      ? Math.round(parseFloat(priceOverride) * 100) 
      : (selectedProduct?.defaultPriceMinor ?? 0);

    Object.entries(quantities).forEach(([vIdStr, qty]) => {
      const vId = Number(vIdStr);
      if (qty > 0) {
        totalPieces += qty;
        const st = stockMap.get(vId);
        const avail = st ? Math.max(0, st.available) : 0;
        allocatedPieces += Math.min(qty, avail);
        shortagePieces += Math.max(0, qty - avail);
      }
    });

    const totalAmountMinor = totalPieces * (isNaN(parsedPriceMinor) ? 0 : parsedPriceMinor);

    return {
      totalPieces,
      allocatedPieces,
      shortagePieces,
      totalAmountMinor,
      unitPriceMinor: isNaN(parsedPriceMinor) ? 0 : parsedPriceMinor,
    };
  }, [quantities, priceOverride, selectedProduct, stockMap]);

  // Multi-style staging handlers
  const handleStageCurrentStyle = () => {
    if (!selectedProduct) return;
    if (currentMatrixMetrics.totalPieces === 0) {
      setError('Please enter at least one quantity before adding style to order.');
      return;
    }

    setError(null);
    const newStagedStyle: StagedStyle = {
      productId: selectedProduct.id,
      productCode: selectedProduct.code,
      productName: selectedProduct.name,
      unitPriceMinor: currentMatrixMetrics.unitPriceMinor,
      currency,
      quantities: { ...quantities },
      totalPieces: currentMatrixMetrics.totalPieces,
      allocatedPieces: currentMatrixMetrics.allocatedPieces,
      shortagePieces: currentMatrixMetrics.shortagePieces,
      totalAmountMinor: currentMatrixMetrics.totalAmountMinor,
    };

    setStagedStyles((prev) => {
      const filtered = prev.filter((s) => s.productId !== selectedProduct.id);
      return [...filtered, newStagedStyle];
    });

    setQuantities({});
  };

  const handleEditStagedStyle = (style: StagedStyle) => {
    setSelectedProductId(style.productId);
    setPriceOverride((style.unitPriceMinor / 100).toFixed(2));
    setQuantities({ ...style.quantities });
  };

  const handleRemoveStagedStyle = (productId: number) => {
    setStagedStyles((prev) => prev.filter((s) => s.productId !== productId));
    if (selectedProductId === productId) {
      setQuantities({});
    }
  };

  // Grand totals across all staged items + active working matrix
  const masterOrderSummary = useMemo(() => {
    const stagedExcludingCurrent = stagedStyles.filter(
      (s) => s.productId !== selectedProductId,
    );

    let grandPieces = currentMatrixMetrics.totalPieces;
    let grandAllocated = currentMatrixMetrics.allocatedPieces;
    let grandShortage = currentMatrixMetrics.shortagePieces;
    let grandTotalAmount = currentMatrixMetrics.totalAmountMinor;

    stagedExcludingCurrent.forEach((s) => {
      grandPieces += s.totalPieces;
      grandAllocated += s.allocatedPieces;
      grandShortage += s.shortagePieces;
      grandTotalAmount += s.totalAmountMinor;
    });

    const activeStylesCount = (currentMatrixMetrics.totalPieces > 0 ? 1 : 0) + stagedExcludingCurrent.length;

    return {
      grandPieces,
      grandAllocated,
      grandShortage,
      grandTotalAmount,
      activeStylesCount,
    };
  }, [stagedStyles, currentMatrixMetrics, selectedProductId]);

  // Robust Customer Financial Snapshot (Gracefully handles 0 or sparse data)
  const customerFinancials = useMemo(() => {
    if (!selectedCustomer) return null;

    const balances = customerStatement?.balances || [];
    const currentBalance = balances.find((b) => b.currency === currency) || balances[0];

    const outstanding = currentBalance?.outstandingMinor ?? 0;
    const pendingCheques = currentBalance?.pendingChequeMinor ?? 0;
    const invoiceCount = currentBalance?.invoiceCount ?? 0;
    const netExposure = outstanding + pendingCheques;

    return {
      outstanding,
      pendingCheques,
      netExposure,
      invoiceCount,
      hasRisk: outstanding > 0,
      isClean: outstanding === 0 && pendingCheques === 0,
    };
  }, [selectedCustomer, customerStatement, currency]);

  // Quick Open Add Customer Modal
  const handleOpenAddCustomer = () => {
    const nextSeq = customerList.length + 1;
    setNewCustCode(`CUST-${nextSeq.toString().padStart(2, '0')}`);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
    setNewCustCurrency('NPR');
    setNewCustNotes('');
    setCustomerModalError(null);
    setIsAddCustomerOpen(true);
  };

  // Create Customer Handler
  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustCode.trim() || !newCustName.trim()) {
      setCustomerModalError('Customer code and company name are required.');
      return;
    }

    try {
      setSavingCustomer(true);
      setCustomerModalError(null);

      const res = await api.createCustomer({
        code: newCustCode.trim().toUpperCase(),
        name: newCustName.trim(),
        phone: newCustPhone.trim() || undefined,
        address: newCustAddress.trim() || undefined,
        defaultCurrency: newCustCurrency,
        notes: newCustNotes.trim() || undefined,
      });

      const created = res.customer;
      setCustomerList((prev) => [...prev, created]);
      setSelectedCustomerId(created.id);
      setIsAddCustomerOpen(false);
      setSuccessMsg(`Customer "${created.name}" created and selected.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setCustomerModalError(err.message || 'Failed to register customer');
    } finally {
      setSavingCustomer(false);
    }
  };

  // Master Submission Handler
  const handleSubmitMasterOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }

    const stagedExcludingCurrent = stagedStyles.filter((s) => s.productId !== selectedProductId);
    const linesToSubmit: { variantId: number; qtyOrdered: number; unitPriceMinor?: number }[] = [];

    // 1. Add all staged styles
    stagedExcludingCurrent.forEach((style) => {
      Object.entries(style.quantities).forEach(([vIdStr, qty]) => {
        if (qty > 0) {
          linesToSubmit.push({
            variantId: Number(vIdStr),
            qtyOrdered: qty,
            unitPriceMinor: style.unitPriceMinor > 0 ? style.unitPriceMinor : undefined,
          });
        }
      });
    });

    // 2. Add current active matrix
    Object.entries(quantities).forEach(([vIdStr, qty]) => {
      if (qty > 0) {
        linesToSubmit.push({
          variantId: Number(vIdStr),
          qtyOrdered: qty,
          unitPriceMinor: currentMatrixMetrics.unitPriceMinor > 0 ? currentMatrixMetrics.unitPriceMinor : undefined,
        });
      }
    });

    if (linesToSubmit.length === 0) {
      setError('Please enter quantities for at least one garment style.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const { order: draftOrder } = await api.createOrder({
        customerId: selectedCustomerId,
        orderDate,
        requiredDate: requiredDate || undefined,
        currency,
        notes: notes.trim() || undefined,
        lines: linesToSubmit,
      });

      const { order } = await api.confirmOrder(draftOrder.id);

      setSuccessMsg(
        `Order ${order.orderNo} confirmed for ${order.customerName}! ${
          order.totalShortageQty > 0
            ? `${order.totalShortageQty} pieces queued for cutting production.`
            : 'All pieces successfully allocated from on-hand stock.'
        }`,
      );
      setStagedStyles([]);
      setQuantities({});
      setNotes('');
      onOrderCreated();
    } catch (err: any) {
      setError(err.message || 'Failed to submit order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs font-sans">
      {/* Top Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
            Fast Matrix Order Entry
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Stage multiple garment styles into a single master delivery order. Live stock reservation and cutting room queue.
          </p>
        </div>

        {stagedStyles.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold text-xs border border-blue-200 dark:border-blue-800 flex items-center gap-1.5">
              <ShoppingCart size={13} />
              <span>{stagedStyles.length} Style{stagedStyles.length !== 1 ? 's' : ''} Staged</span>
            </span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmitMasterOrder} className="p-4 sm:p-6 space-y-5">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. Customer Selection Bar with "+ New Customer" Action */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                <User size={12} strokeWidth={2} /> Wholesale Customer
              </label>
              <button
                type="button"
                onClick={handleOpenAddCustomer}
                className="text-blue-600 dark:text-blue-400 hover:underline font-bold text-[11px] flex items-center gap-1"
              >
                <UserPlus size={12} />
                <span>+ New Customer</span>
              </button>
            </div>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none cursor-pointer"
              required
            >
              {customerList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) — {c.defaultCurrency}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <Calendar size={12} strokeWidth={2} /> Order Date
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <Calendar size={12} strokeWidth={2} /> Due Date
              </label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Transport / Delivery Note
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Sajha Transport counter, 30 days credit term"
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {/* 2. Customer Credit & Financial Health Snapshot (Always active) */}
        {customerFinancials && (
          <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono transition ${
            customerFinancials.hasRisk 
              ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60' 
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="flex items-center gap-2.5">
              <Scale size={16} className={customerFinancials.hasRisk ? 'text-amber-600' : 'text-slate-400'} />
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 font-sans">
                  {selectedCustomer?.name} Credit Snapshot:
                </span>
                <span className="text-[11px] font-sans ml-1.5">
                  {customerFinancials.isClean ? (
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      First-Time Buyer / Clean Ledger (Zero Outstanding Dues)
                    </span>
                  ) : customerFinancials.hasRisk ? (
                    <span className="text-amber-700 dark:text-amber-400 font-semibold">
                      Warning: Past Unpaid Invoices Pending
                    </span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">
                      Standard Credit Profile
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block uppercase font-bold">Unpaid Dues</span>
                <span className={`font-bold ${customerFinancials.outstanding > 0 ? 'text-amber-600 dark:text-amber-400 text-sm' : 'text-slate-700 dark:text-slate-300'}`}>
                  {formatMoney(customerFinancials.outstanding, currency)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-sans block uppercase font-bold">Cheques in Safe</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {formatMoney(customerFinancials.pendingCheques, currency)}
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-sans block uppercase font-bold">Total Exposure</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  {formatMoney(customerFinancials.netExposure, currency)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 3. Staged Items Tray (Multi-Style Staging) */}
        {stagedStyles.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase font-mono tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <ShoppingCart size={14} className="text-blue-600" />
                Staged Styles in this Order ({stagedStyles.length})
              </span>
              <span className="text-[11px] text-slate-400 font-sans">
                These styles will be submitted together under one unified packing challan
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {stagedStyles.map((st) => (
                <div
                  key={st.productId}
                  className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between gap-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono font-bold text-blue-600 text-[11px] block">{st.productCode}</span>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate max-w-[170px]">{st.productName}</h4>
                    </div>
                    <div className="text-right font-mono">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">{formatMoney(st.totalAmountMinor, st.currency)}</span>
                      <span className="text-[10px] text-slate-400 font-sans block">{formatMoney(st.unitPriceMinor, st.currency)}/pc</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 font-mono text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{st.totalPieces} pcs</span>
                    <span className="text-emerald-600 font-semibold">{st.allocatedPieces} stock</span>
                    {st.shortagePieces > 0 ? (
                      <span className="text-amber-600 font-bold">+{st.shortagePieces} cut</span>
                    ) : (
                      <span className="text-slate-400">0 cut</span>
                    )}

                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        onClick={() => handleEditStagedStyle(st)}
                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500 hover:text-slate-800"
                        title="Edit style quantities"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveStagedStyle(st.productId)}
                        className="p-1 hover:bg-red-50 dark:hover:bg-red-950/60 rounded text-slate-400 hover:text-red-600"
                        title="Remove style from order"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Active Style Selection & Matrix Entry */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Tag size={13} className="text-blue-600 dark:text-blue-400" />
                <span className="font-bold text-slate-700 dark:text-slate-300 uppercase text-[11px]">
                  Garment Style:
                </span>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(Number(e.target.value));
                    setQuantities({});
                  }}
                  className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-bold focus:outline-none cursor-pointer"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 font-mono">
                <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400 font-bold uppercase">
                  Agreed Rate:
                </span>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={priceOverride}
                    onChange={(e) => setPriceOverride(e.target.value)}
                    placeholder="Rate"
                    className="w-24 pl-6 pr-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl font-bold text-xs focus:border-blue-600 focus:outline-none"
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-sans">
                    Rs.
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Fill Ratios */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={handleFillAvailable}
                className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] flex items-center gap-1 transition"
                title="Fill cell quantities with free available inventory"
              >
                <Sparkles size={12} className="text-blue-500" />
                <span>Fill Stock</span>
              </button>
              <button
                type="button"
                onClick={() => handleFillUniform(12)}
                className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition"
                title="Fill 12 pcs across all variants"
              >
                +12 All
              </button>
              <button
                type="button"
                onClick={() => handleFillUniform(24)}
                className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition"
                title="Fill 24 pcs across all variants"
              >
                +24 All
              </button>
              {currentMatrixMetrics.totalPieces > 0 && (
                <button
                  type="button"
                  onClick={handleClearMatrix}
                  className="px-2 py-1 text-slate-400 hover:text-red-600 text-[11px] font-semibold"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Matrix Grid (High Contrast Dark Mode) */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-28 p-2.5 text-left text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 uppercase bg-slate-100 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700">
                    Colour
                  </th>
                  {sizes.map((s) => (
                    <th
                      key={s}
                      className="min-w-[90px] w-24 p-2.5 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 uppercase bg-slate-100 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700 text-center"
                    >
                      {s}
                    </th>
                  ))}
                  <th className="min-w-[70px] w-20 p-2.5 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 uppercase bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-center">
                    Row Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {colours.map((colour) => {
                  let rowQty = 0;
                  return (
                    <tr key={colour} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="sticky left-0 z-10 p-2.5 text-left text-[11px] font-mono font-bold text-slate-800 dark:text-slate-200 uppercase border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 shadow-[1px_0_0_0_rgba(0,0,0,0.08)]">
                        {colour}
                      </td>

                      {sizes.map((size) => {
                        const variant = variantByColourSize(colour, size);
                        if (!variant) {
                          return (
                            <td
                              key={size}
                              className="p-2 text-slate-300 dark:text-slate-600 text-xs border-r border-slate-100 dark:border-slate-800 text-center font-mono"
                            >
                              —
                            </td>
                          );
                        }

                        const qty = quantities[variant.id] || 0;
                        rowQty += qty;
                        const stockInfo = stockMap.get(variant.id);
                        const avail = stockInfo ? Math.max(0, stockInfo.available) : 0;
                        const isShortage = qty > avail && qty > 0;
                        const shortageCount = isShortage ? qty - avail : 0;

                        return (
                          <td
                            key={size}
                            className="p-1.5 border-r border-slate-100 dark:border-slate-800 text-center align-top"
                          >
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                value={qty === 0 ? '' : qty}
                                onChange={(e) => handleQtyChange(variant.id, e.target.value)}
                                placeholder="0"
                                className={`w-16 px-2 py-1.5 text-center font-mono text-sm rounded-xl border focus:outline-none transition font-bold ${
                                  qty > 0
                                    ? isShortage
                                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-100 ring-1 ring-amber-400'
                                      : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-400'
                                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-blue-600'
                                }`}
                              />

                              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                                Avail:{' '}
                                <span
                                  className={
                                    avail > 0
                                      ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                                      : 'text-slate-400 dark:text-slate-500'
                                  }
                                >
                                  {avail}
                                </span>
                              </span>

                              {qty > 0 && (
                                <div className="text-[9px] font-mono font-bold leading-tight">
                                  {isShortage ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                                      Cut: +{shortageCount}
                                    </span>
                                  ) : (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800">
                                      In Stock
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      <td className="p-2.5 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 text-center bg-slate-50/50 dark:bg-slate-800/50">
                        {rowQty}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Style Action Bar (Add to Order Sheet Buffer) */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 font-mono">
              <span className="text-slate-500 font-sans">Current Style Subtotal:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">{currentMatrixMetrics.totalPieces} pcs</span>
              <span className="text-slate-400">•</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{formatMoney(currentMatrixMetrics.totalAmountMinor, currency)}</span>
            </div>

            <button
              type="button"
              onClick={handleStageCurrentStyle}
              disabled={currentMatrixMetrics.totalPieces === 0}
              className="px-4 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-bold rounded-xl shadow-xs transition disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Style to Order Sheet</span>
            </button>
          </div>
        </div>

        {/* 5. Master Order Confirmation Bar */}
        <div className="p-4 sm:p-5 bg-slate-900 dark:bg-slate-800 border border-slate-800 dark:border-slate-700 text-white rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-md font-mono">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 text-[10px] block uppercase font-sans font-bold">
                Total Ordered ({masterOrderSummary.activeStylesCount} styles)
              </span>
              <span className="text-lg font-bold text-white mt-0.5 block">
                {masterOrderSummary.grandPieces} pcs
              </span>
            </div>

            <div>
              <span className="text-emerald-400 text-[10px] block uppercase font-sans font-bold">
                Stock Allocated
              </span>
              <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
                {masterOrderSummary.grandAllocated} pcs
              </span>
            </div>

            <div>
              <span className="text-amber-400 text-[10px] block uppercase font-sans font-bold">
                Cutting Queue
              </span>
              <span className="text-lg font-bold text-amber-400 mt-0.5 block">
                {masterOrderSummary.grandShortage > 0 ? `+${masterOrderSummary.grandShortage} pcs` : '0 pcs'}
              </span>
            </div>

            <div>
              <span className="text-slate-400 text-[10px] block uppercase font-sans font-bold">
                Total Order Value
              </span>
              <span className="text-lg font-bold text-blue-300 mt-0.5 block truncate">
                {formatMoney(masterOrderSummary.grandTotalAmount, currency)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || masterOrderSummary.grandPieces === 0}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl disabled:opacity-50 transition shadow-xs cursor-pointer font-sans"
          >
            {submitting 
              ? 'Confirming Order…' 
              : `Confirm Order (${masterOrderSummary.grandPieces} pcs)`}
          </button>
        </div>
      </form>

      {/* ─── MODAL: REGISTER NEW WHOLESALE CUSTOMER ─── */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <UserPlus size={16} className="text-blue-600" />
                  Register New Wholesale Customer
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add wholesale buyer on the fly without leaving the order entry matrix.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddCustomerOpen(false)} 
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 font-bold"
              >
                <X size={16} />
              </button>
            </div>

            {customerModalError && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">
                {customerModalError}
              </div>
            )}

            <form onSubmit={handleCreateCustomerSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Customer Code *
                  </label>
                  <input
                    type="text"
                    value={newCustCode}
                    onChange={(e) => setNewCustCode(e.target.value.toUpperCase())}
                    placeholder="e.g. CUST-01"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-mono text-sm font-bold focus:outline-none focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Billing Currency
                  </label>
                  <select
                    value={newCustCurrency}
                    onChange={(e) => setNewCustCurrency(e.target.value as Currency)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-bold focus:outline-none focus:border-blue-600"
                  >
                    <option value="NPR">NPR (Rs.)</option>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Customer / Store Name *
                </label>
                <input
                  type="text"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Everest Outfitters, New Road Collection"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-semibold text-sm focus:outline-none focus:border-blue-600"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Contact Phone (Optional)
                  </label>
                  <input
                    type="text"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="e.g. 9841XXXXXX"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl font-mono focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    Market Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={newCustAddress}
                    onChange={(e) => setNewCustAddress(e.target.value)}
                    placeholder="e.g. New Road, Pokhara"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  Payment Terms / Transport Note (Optional)
                </label>
                <textarea
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  placeholder="e.g. 30 days credit term, preferred cargo: Sajha Transport"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  disabled={savingCustomer}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-xs"
                >
                  {savingCustomer ? 'Registering…' : 'Register Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
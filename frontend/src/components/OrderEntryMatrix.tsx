import React, { useState } from 'react';
import { api, type Customer, type Product, type ProductVariant, type StockSummary, type Currency, formatMoney } from '../api.ts';
import { User, Tag, Calendar } from 'lucide-react';

interface OrderEntryMatrixProps {
  customers: Customer[];
  products: Product[];
  variants: ProductVariant[];
  stock: StockSummary[];
  onOrderCreated: () => void;
}

export const OrderEntryMatrix: React.FC<OrderEntryMatrixProps> = ({
  customers,
  products,
  variants,
  stock,
  onOrderCreated,
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(
    customers.length > 0 ? customers[0].id : 0,
  );
  const [selectedProductId, setSelectedProductId] = useState<number>(
    products.length > 0 ? products[0].id : 0,
  );
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [requiredDate, setRequiredDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const currency: Currency = selectedCustomer?.defaultCurrency ?? 'NPR';

  // Variants for selected product
  const productVariants = variants.filter((v) => v.productId === selectedProductId);
  const sizes = Array.from(new Set(productVariants.map((v) => v.size)));
  const colours = Array.from(new Set(productVariants.map((v) => v.colour)));

  const stockMap = new Map<number, StockSummary>();
  stock.forEach((s) => stockMap.set(s.variantId, s));

  const variantByColourSize = (colour: string, size: string) =>
    productVariants.find((v) => v.colour === colour && v.size === size);

  const handleQtyChange = (variantId: number, qtyStr: string) => {
    const val = parseInt(qtyStr, 10);
    setQuantities((prev) => ({
      ...prev,
      [variantId]: isNaN(val) || val < 0 ? 0 : val,
    }));
  };

  // Calculate order preview
  let totalPieces = 0;
  let estimatedTotalMinor = 0;
  let totalShortagePieces = 0;

  const orderLinesToSubmit: { variantId: number; qtyOrdered: number }[] = [];

  Object.entries(quantities).forEach(([vIdStr, qty]) => {
    const vId = Number(vIdStr);
    if (qty > 0) {
      totalPieces += qty;
      const v = productVariants.find((pv) => pv.id === vId);
      const unitPrice = v?.priceMinor ?? selectedProduct?.defaultPriceMinor ?? 0;
      estimatedTotalMinor += unitPrice * qty;

      const st = stockMap.get(vId);
      const avail = st ? st.available : 0;
      if (qty > avail) {
        totalShortagePieces += qty - Math.max(0, avail);
      }

      orderLinesToSubmit.push({ variantId: vId, qtyOrdered: qty });
    }
  });

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }
    if (orderLinesToSubmit.length === 0) {
      setError('Please enter at least one quantity.');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // 1. Create order
      const { order: draftOrder } = await api.createOrder({
        customerId: selectedCustomerId,
        orderDate,
        requiredDate: requiredDate || undefined,
        currency,
        notes: notes.trim() || undefined,
        lines: orderLinesToSubmit,
      });

      // 2. Automatically confirm order and allocate stock
      const { order } = await api.confirmOrder(draftOrder.id);

      setSuccessMsg(
        `Order ${order.orderNo} created and confirmed! ${
          order.totalShortageQty > 0
            ? `${order.totalShortageQty} pieces require factory production.`
            : 'All pieces allocated from stock.'
        }`,
      );
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
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">Fast Matrix Order Entry</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Enter quantities across Colour × Size in a single view. Real-time shortage check before confirmation.
        </p>
      </div>

      <form onSubmit={handleSubmitOrder} className="p-4 sm:p-6 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
            {successMsg}
          </div>
        )}

        {/* Customer & Product Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              <User size={12} strokeWidth={1.75} /> Customer
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none"
              required
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code}) — {c.defaultCurrency}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              <Tag size={12} strokeWidth={1.75} /> Product
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(Number(e.target.value));
                setQuantities({});
              }}
              className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none"
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <Calendar size={12} strokeWidth={1.75} /> Order Date
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <Calendar size={12} strokeWidth={1.75} /> Due Date
              </label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Matrix Entry Grid */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex justify-between items-center">
            <span>Matrix Quantities ({selectedProduct?.name})</span>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">Currency: {currency}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-24 p-2.5 text-left text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/90 border-b border-r border-slate-200 dark:border-slate-800 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                    Colour
                  </th>
                  {sizes.map((s) => (
                    <th key={s} className="min-w-[80px] w-20 p-2.5 text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/90 border-b border-r border-slate-200 dark:border-slate-800 text-center">
                      {s}
                    </th>
                  ))}
                  <th className="min-w-[70px] w-20 p-2.5 text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800 text-center">
                    Row
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {colours.map((colour) => {
                  let rowQty = 0;
                  return (
                    <tr key={colour} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="sticky left-0 z-10 p-2.5 text-left text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase border-r border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-850 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                        {colour}
                      </td>
                      {sizes.map((size) => {
                        const variant = variantByColourSize(colour, size);
                        if (!variant) {
                          return (
                            <td key={size} className="p-2 text-slate-300 dark:text-slate-600 text-xs border-r border-slate-100 dark:border-slate-800 text-center">
                              —
                            </td>
                          );
                        }
                        const qty = quantities[variant.id] || 0;
                        rowQty += qty;
                        const stockInfo = stockMap.get(variant.id);
                        const avail = stockInfo ? stockInfo.available : 0;
                        const isShortage = qty > avail && qty > 0;

                        return (
                          <td key={size} className="p-1.5 border-r border-slate-100 dark:border-slate-800">
                            <div className="flex flex-col items-center">
                              <input
                                type="number"
                                min="0"
                                value={qty === 0 ? '' : qty}
                                onChange={(e) => handleQtyChange(variant.id, e.target.value)}
                                placeholder="0"
                                className={`w-14 px-2 py-1.5 text-center font-mono text-sm rounded-xl border focus:outline-none transition ${
                                  qty > 0
                                    ? isShortage
                                      ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 font-bold'
                                      : 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 font-bold'
                                    : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                                }`}
                              />
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">
                                Avail: <span className={avail > 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-500'}>{avail}</span>
                              </span>
                              {qty > 0 && isShortage && (
                                <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/80 px-1 rounded mt-0.5">
                                  Short: {qty - Math.max(0, avail)}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-2.5 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 text-center bg-slate-50/50 dark:bg-slate-800/40">
                        {rowQty}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Summary & Submit Bar */}
        <div className="p-4 sm:p-5 bg-slate-900 dark:bg-slate-800/90 border border-slate-800 dark:border-slate-700 text-white rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-md">
          <div className="flex flex-wrap items-center justify-around sm:justify-start gap-4 sm:gap-6 text-sm">
            <div>
              <span className="text-slate-400 text-[11px] block uppercase tracking-wider font-semibold">Total Pieces</span>
              <span className="text-lg font-mono font-bold text-white">{totalPieces}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block uppercase tracking-wider font-semibold">Estimated</span>
              <span className="text-lg font-mono font-bold text-slate-200">{formatMoney(estimatedTotalMinor, currency)}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block uppercase tracking-wider font-semibold">Status</span>
              {totalShortagePieces > 0 ? (
                <span className="text-xs font-semibold text-amber-300 bg-amber-950/80 border border-amber-800 px-2 py-1 rounded-xl">
                  {totalShortagePieces} pcs shortage
                </span>
              ) : (
                <span className="text-xs font-semibold text-emerald-300 bg-emerald-950/80 border border-emerald-800 px-2 py-1 rounded-xl">
                  100% available
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || totalPieces === 0}
            className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-xl disabled:opacity-50 transition shadow-sm"
          >
            {submitting ? 'Confirming...' : 'Confirm Order & Reserve Stock'}
          </button>
        </div>
      </form>
    </div>
  );
};

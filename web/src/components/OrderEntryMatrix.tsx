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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-sm text-slate-900">Fast Matrix Order Entry</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Enter quantities across Colour × Size in a single view. Real-time shortage check before confirmation.
        </p>
      </div>

      <form onSubmit={handleSubmitOrder} className="p-5 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-medium border border-emerald-200">
            {successMsg}
          </div>
        )}

        {/* Customer & Product Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              <User size={12} strokeWidth={1.75} /> Customer
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
              <Tag size={12} strokeWidth={1.75} /> Product
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(Number(e.target.value));
                setQuantities({});
              }}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-medium focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                <Calendar size={12} strokeWidth={1.75} /> Order Date
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                required
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                <Calendar size={12} strokeWidth={1.75} /> Due Date
              </label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Matrix Entry Grid */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-600 flex justify-between items-center">
            <span>Matrix Quantities ({selectedProduct?.name})</span>
            <span className="text-[11px] text-slate-400">Currency: {currency}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-24 p-2 text-left text-[11px] font-mono font-medium text-slate-500 uppercase bg-slate-50 border-b border-r border-slate-200">
                    Colour
                  </th>
                  {sizes.map((s) => (
                    <th key={s} className="w-20 p-2 text-[11px] font-mono font-medium text-slate-500 uppercase bg-slate-50 border-b border-r border-slate-200">
                      {s}
                    </th>
                  ))}
                  <th className="w-20 p-2 text-[11px] font-mono font-medium text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    Row
                  </th>
                </tr>
              </thead>
              <tbody>
                {colours.map((colour) => {
                  let rowQty = 0;
                  return (
                    <tr key={colour} className="hover:bg-slate-50">
                      <td className="p-2 text-left text-[11px] font-mono font-medium text-slate-500 uppercase border-b border-r border-slate-200 bg-slate-50">
                        {colour}
                      </td>
                      {sizes.map((size) => {
                        const variant = variantByColourSize(colour, size);
                        if (!variant) {
                          return (
                            <td key={size} className="p-2 text-slate-300 text-xs border-b border-slate-200">
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
                          <td key={size} className="p-1 border-b border-slate-200">
                            <div className="flex flex-col items-center">
                              <input
                                type="number"
                                min="0"
                                value={qty === 0 ? '' : qty}
                                onChange={(e) => handleQtyChange(variant.id, e.target.value)}
                                placeholder="0"
                                className={`w-14 px-2 py-1.5 text-center font-mono text-sm rounded-lg border focus:outline-none ${
                                  qty > 0
                                    ? isShortage
                                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                                      : 'border-blue-400 bg-blue-50 text-blue-900'
                                    : 'border-slate-300 bg-white text-slate-800'
                                }`}
                              />
                              <span className="text-[10px] text-slate-400 mt-1">
                                Avail: <span className={avail > 0 ? 'text-emerald-600 font-medium' : 'text-red-500'}>{avail}</span>
                              </span>
                              {qty > 0 && isShortage && (
                                <span className="text-[9px] font-medium text-amber-600 bg-amber-100 px-1 rounded mt-0.5">
                                  Short: {qty - Math.max(0, avail)}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-2 text-sm font-mono font-bold text-slate-900 border-b border-slate-200 text-center bg-slate-50">
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
        <div className="p-4 bg-slate-900 text-white rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span className="text-slate-400 text-[11px] block uppercase tracking-wider">Total Pieces</span>
              <span className="text-lg font-mono font-bold">{totalPieces}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block uppercase tracking-wider">Estimated</span>
              <span className="text-lg font-mono font-bold text-slate-300">{formatMoney(estimatedTotalMinor, currency)}</span>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block uppercase tracking-wider">Status</span>
              {totalShortagePieces > 0 ? (
                <span className="text-xs font-medium text-amber-400 bg-amber-900/50 px-2 py-1 rounded">
                  {totalShortagePieces} pcs shortage
                </span>
              ) : (
                <span className="text-xs font-medium text-emerald-400 bg-emerald-900/50 px-2 py-1 rounded">
                  100% available
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || totalPieces === 0}
            className="w-full md:w-auto px-6 py-2.5 bg-white text-slate-900 font-medium text-sm rounded-lg hover:bg-slate-100 disabled:opacity-50 transition"
          >
            {submitting ? 'Confirming...' : 'Confirm Order & Reserve Stock'}
          </button>
        </div>
      </form>
    </div>
  );
};

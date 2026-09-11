import React, { useState } from 'react';
import { api, type Customer, type Product, type ProductVariant, type StockSummary, type Currency, formatMoney } from '../api.ts';

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
            ? `⚠ ${order.totalShortageQty} pieces require factory production.`
            : '✓ All pieces allocated from stock.'
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 bg-slate-50/50">
        <h3 className="font-extrabold text-lg text-slate-900">Fast Matrix Order Entry</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Enter quantities across Colour × Size in a single view. Real-time shortage check before confirmation.
        </p>
      </div>

      <form onSubmit={handleSubmitOrder} className="p-6 space-y-6">
        {error && (
          <div className="p-3.5 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200">
            {successMsg}
          </div>
        )}

        {/* Customer & Product Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Customer</label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-hidden"
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
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => {
                setSelectedProductId(Number(e.target.value));
                setQuantities({});
              }}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-hidden"
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Order Date</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-hidden"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">Due Date</label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold focus:border-blue-600 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Matrix Entry Grid */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-700 border-b border-slate-200 flex justify-between items-center">
            <span>Matrix Quantities ({selectedProduct?.name})</span>
            <span className="text-[11px] text-slate-500 font-normal">Currency: {currency}</span>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-2.5 text-left font-bold text-xs text-slate-500 uppercase bg-slate-50 rounded-tl-lg">Colour</th>
                  {sizes.map((s) => (
                    <th key={s} className="p-2.5 font-bold text-xs text-slate-700 uppercase bg-slate-50">{s}</th>
                  ))}
                  <th className="p-2.5 font-bold text-xs text-slate-500 uppercase bg-slate-50 rounded-tr-lg">Row Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {colours.map((colour) => {
                  let rowQty = 0;
                  return (
                    <tr key={colour} className="hover:bg-slate-50/50">
                      <td className="p-3 text-left font-bold text-sm text-slate-800">{colour}</td>
                      {sizes.map((size) => {
                        const variant = variantByColourSize(colour, size);
                        if (!variant) {
                          return <td key={size} className="p-2 text-slate-300">—</td>;
                        }
                        const qty = quantities[variant.id] || 0;
                        rowQty += qty;
                        const stockInfo = stockMap.get(variant.id);
                        const avail = stockInfo ? stockInfo.available : 0;
                        const isShortage = qty > avail;

                        return (
                          <td key={size} className="p-2">
                            <div className="flex flex-col items-center">
                              <input
                                type="number"
                                min="0"
                                value={qty === 0 ? '' : qty}
                                onChange={(e) => handleQtyChange(variant.id, e.target.value)}
                                placeholder="0"
                                className={`w-16 px-2 py-1.5 text-center font-bold text-sm rounded-lg border focus:outline-hidden ${
                                  qty > 0
                                    ? isShortage
                                      ? 'border-amber-400 bg-amber-50 text-amber-900 focus:border-amber-600'
                                      : 'border-blue-500 bg-blue-50 text-blue-900 focus:border-blue-700'
                                    : 'border-slate-300 bg-white text-slate-800 focus:border-blue-600'
                                }`}
                              />
                              <span className="text-[10px] text-slate-400 mt-1">
                                Avail: <span className={avail > 0 ? 'text-emerald-700 font-semibold' : 'text-red-500'}>{avail}</span>
                              </span>
                              {qty > 0 && isShortage && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded mt-0.5">
                                  Short: {qty - Math.max(0, avail)}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-3 font-extrabold text-sm text-slate-900">{rowQty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Summary & Submit Bar */}
        <div className="p-5 bg-slate-900 text-white rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span className="text-slate-400 text-xs block">Total Ordered Pieces:</span>
              <span className="text-xl font-black">{totalPieces} pcs</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block">Estimated Amount:</span>
              <span className="text-xl font-black text-blue-300">{formatMoney(estimatedTotalMinor, currency)}</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs block">Stock Allocation Status:</span>
              {totalShortagePieces > 0 ? (
                <span className="text-xs font-bold text-amber-400 bg-amber-950/80 px-2.5 py-1 rounded-md">
                  ⚠ {totalShortagePieces} pcs shortage (requires production)
                </span>
              ) : (
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-md">
                  ✓ 100% available in finished stock
                </span>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || totalPieces === 0}
            className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm rounded-xl shadow-lg disabled:opacity-50 transition"
          >
            {submitting ? 'Confirming Order...' : 'Confirm Order & Reserve Stock'}
          </button>
        </div>
      </form>
    </div>
  );
};

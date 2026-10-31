import React, { useState } from 'react';
import { Plus, ArrowRightLeft, Wrench } from 'lucide-react';
import { api, type CuttingStockSummary, type Product } from '../api.ts';

interface CuttingStockMatrixProps {
  products: Product[];
  stock: CuttingStockSummary[];
  onRefresh: () => void;
}

export const CuttingStockMatrix: React.FC<CuttingStockMatrixProps> = ({
  products,
  stock,
  onRefresh,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    products.length > 0 ? products[0].id : null,
  );
  const [showModal, setShowModal] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'add' | 'transfer' | 'adjust'>('add');
  const [activeVariant, setActiveVariant] = useState<CuttingStockSummary | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [reasonCode, setReasonCode] = useState<string>('correction');
  const [note, setNote] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeProduct = products.find((p) => p.id === selectedProductId);
  const productStock = selectedProductId
    ? stock.filter((s) => s.productId === selectedProductId)
    : stock;

  const sizes = Array.from(new Set(productStock.map((s) => s.size)));
  const colours = Array.from(new Set(productStock.map((s) => s.colour)));

  const matrixMap = new Map<string, CuttingStockSummary>();
  productStock.forEach((s) => {
    matrixMap.set(`${s.colour}___${s.size}`, s);
  });

  // Safe resolver for cutting stock count (handles both onHand and cuttingQty aliases)
  const getItemQty = (item?: CuttingStockSummary | null): number => {
    if (!item) return 0;
    const val = item.onHand ?? (item as any).cuttingQty ?? (item as any).qty ?? 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  // Calculate Size Column Totals and Grand Total
  const sizeTotals: Record<string, number> = {};
  let grandTotal = 0;

  sizes.forEach((size) => {
    let sizeSum = 0;
    colours.forEach((colour) => {
      const item = matrixMap.get(`${colour}___${size}`);
      sizeSum += getItemQty(item);
    });
    sizeTotals[size] = sizeSum;
    grandTotal += sizeSum;
  });

  const openAction = (variant: CuttingStockSummary, mode: 'add' | 'transfer' | 'adjust') => {
    setActiveVariant(variant);
    setModalMode(mode);
    const available = getItemQty(variant);
    setQty(mode === 'transfer' ? Math.min(available, 10) : 10);
    setReasonCode('correction');
    setNote('');
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVariant) return;

    setLoading(true);
    setError(null);

    try {
      if (modalMode === 'add') {
        await api.addCuttingStock(activeVariant.variantId, qty);
      } else if (modalMode === 'transfer') {
        const available = getItemQty(activeVariant);
        if (qty > available) {
          throw new Error('Cannot transfer more than available in cutting stock.');
        }
        await api.transferCuttingToFinished(activeVariant.variantId, qty);
      } else if (modalMode === 'adjust') {
        await api.adjustCuttingStock(activeVariant.variantId, qty, reasonCode, note);
      }
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Product</label>
          <select
            value={selectedProductId ?? ''}
            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : null)}
            className="w-full sm:w-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:outline-none cursor-pointer"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400">
          Work in Progress (Cut & Ready for Sewing)
        </div>
      </div>

      {/* Grid */}
      {activeProduct && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
              {activeProduct.name} <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">({activeProduct.code})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pieces cut and available to be moved into finished stock.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-28 p-2.5 text-left text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/90 border-b border-r border-slate-200 dark:border-slate-800 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                    Colour
                  </th>
                  {sizes.map((size) => (
                    <th key={size} className="min-w-[84px] w-24 p-2.5 text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/90 border-b border-r border-slate-200 dark:border-slate-800 text-center">
                      {size}
                    </th>
                  ))}
                  <th className="min-w-[70px] w-24 p-2.5 text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-800 text-center">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {colours.map((colour) => {
                  let colourTotal = 0;
                  return (
                    <tr key={colour} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                      <td className="sticky left-0 z-10 p-2.5 text-left text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 uppercase border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                        {colour}
                      </td>
                      {sizes.map((size) => {
                        const item = matrixMap.get(`${colour}___${size}`);
                        if (!item) {
                          return (
                            <td key={size} className="p-2.5 text-slate-300 dark:text-slate-600 text-xs border-r border-slate-100 dark:border-slate-800 text-center font-mono">
                              0
                            </td>
                          );
                        }
                        const itemQty = getItemQty(item);
                        colourTotal += itemQty;

                        return (
                          <td key={size} className="p-1.5 border-r border-slate-100 dark:border-slate-800 text-center">
                            <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 p-1.5 flex flex-col items-center justify-center gap-1 shadow-2xs">
                              <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                                {itemQty}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openAction(item, 'add')}
                                  className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 transition"
                                  title="Add to cutting"
                                >
                                  <Plus size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAction(item, 'transfer')}
                                  disabled={itemQty === 0}
                                  className="p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 disabled:opacity-30 transition"
                                  title="Transfer to finished stock"
                                >
                                  <ArrowRightLeft size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAction(item, 'adjust')}
                                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition"
                                  title="Stock count adjustment"
                                >
                                  <Wrench size={12} />
                                </button>
                              </div>
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-2.5 text-sm font-mono font-bold text-slate-900 dark:text-slate-100 text-center bg-slate-50/50 dark:bg-slate-800/40">
                        {colourTotal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Bottom Summary Row: Size Totals & Cutting Grand Total */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/90 font-mono font-bold">
                  <td className="sticky left-0 z-10 p-2.5 text-left text-[11px] uppercase text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                    Total
                  </td>
                  {sizes.map((size) => (
                    <td
                      key={size}
                      className="p-2.5 text-sm text-center text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700"
                    >
                      {sizeTotals[size] || 0}
                    </td>
                  ))}
                  <td className="p-2.5 text-base text-center text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/40">
                    {grandTotal}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showModal && activeVariant && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
              {modalMode === 'add' && 'Add Cut Pieces'}
              {modalMode === 'transfer' && 'Move to Finished Goods'}
              {modalMode === 'adjust' && 'Adjust Cutting Stock'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {activeVariant.productName} · {activeVariant.colour} / {activeVariant.size}
              <span className="block text-[11px] text-slate-400 mt-0.5">
                Current in Cutting: {getItemQty(activeVariant)} pcs
              </span>
            </p>

            {error && (
              <div className="p-2.5 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none"
                  required
                />
              </div>

              {modalMode === 'adjust' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason</label>
                    <select
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="correction">Count Correction</option>
                      <option value="damage">Fabric / Cut Damage</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Note</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
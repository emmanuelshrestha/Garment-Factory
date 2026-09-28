import React, { useState } from 'react';
import { api, type StockSummary, type Product } from '../api.ts';

interface InventoryMatrixProps {
  products: Product[];
  stock: StockSummary[];
  onRefresh: () => void;
}

export const InventoryMatrix: React.FC<InventoryMatrixProps> = ({
  products,
  stock,
  onRefresh,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    products.length > 0 ? products[0].id : null,
  );
  const [showAdjustmentModal, setShowAdjustmentModal] = useState<boolean>(false);
  const [adjustmentVariant, setAdjustmentVariant] = useState<StockSummary | null>(null);
  const [adjustQtyDelta, setAdjustQtyDelta] = useState<number>(0);
  const [adjustReasonCode, setAdjustReasonCode] = useState<string>('stock_count');
  const [adjustNote, setAdjustNote] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const activeProduct = products.find((p) => p.id === selectedProductId);
  const productStock = selectedProductId
    ? stock.filter((s) => s.productId === selectedProductId)
    : stock;

  // Extract unique sizes sorted in order
  const sizes = Array.from(new Set(productStock.map((s) => s.size)));
  const colours = Array.from(new Set(productStock.map((s) => s.colour)));

  // Matrix cell lookup: colour x size -> StockSummary
  const matrixMap = new Map<string, StockSummary>();
  productStock.forEach((s) => {
    matrixMap.set(`${s.colour}___${s.size}`, s);
  });

  const openAdjustment = (summary: StockSummary) => {
    setAdjustmentVariant(summary);
    setAdjustQtyDelta(0);
    setAdjustReasonCode('stock_count');
    setAdjustNote('');
    setError(null);
    setShowAdjustmentModal(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentVariant) return;
    if (adjustQtyDelta === 0) {
      setError('Quantity change cannot be zero.');
      return;
    }
    if (!adjustNote.trim()) {
      setError('A note explaining why stock is being adjusted is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.createStockAdjustment({
        reasonCode: adjustReasonCode,
        note: adjustNote.trim(),
        lines: [{ variantId: adjustmentVariant.variantId, qtyDelta: adjustQtyDelta }],
      });
      setShowAdjustmentModal(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to adjust stock');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Product Selector & Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Product</label>
          <select
            value={selectedProductId ?? ''}
            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : null)}
            className="w-full sm:w-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name} ({p.defaultCurrency})
              </option>
            ))}
          </select>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <span className="text-slate-600 dark:text-slate-400">At/Below Min</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="text-slate-600 dark:text-slate-400">Within 25%</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-slate-600 dark:text-slate-400">Healthy Stock</span>
          </span>
        </div>
      </div>

      {/* Colour x Size Matrix Grid */}
      {activeProduct && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
          {/* Header */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  {activeProduct.name} <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">({activeProduct.code})</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Physical on-hand vs. free unreserved stock across sizes. Click any cell to record an adjustment.
                </p>
              </div>
            </div>
          </div>

          {/* Matrix Table with sticky left column on horizontal scroll */}
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
                      <td className="sticky left-0 z-10 p-2.5 text-left text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase border-r border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-850 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                        {colour}
                      </td>
                      {sizes.map((size) => {
                        const item = matrixMap.get(`${colour}___${size}`);
                        if (!item) {
                          return (
                            <td key={size} className="p-2.5 text-slate-300 dark:text-slate-600 text-xs border-r border-slate-100 dark:border-slate-800 text-center">
                              —
                            </td>
                          );
                        }
                        colourTotal += item.onHand;
                        const isLowStock = item.band === 'red';
                        const isNearMin = item.band === 'amber';

                        return (
                          <td key={size} className="p-1.5 border-r border-slate-100 dark:border-slate-800 text-center">
                            <button
                              onClick={() => openAdjustment(item)}
                              className="w-full rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 cursor-pointer shadow-2xs"
                              title={`Click to adjust stock for ${item.sku}`}
                            >
                              <span className="flex items-center gap-1.5">
                                {(isLowStock || isNearMin) && (
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${isLowStock ? 'bg-red-500' : 'bg-amber-500'}`} />
                                )}
                                <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {item.onHand}
                                </span>
                              </span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">
                                Avail {item.available} / Min {item.minStockQty}
                              </span>
                            </button>
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
            </table>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustmentModal && adjustmentVariant && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">Record Stock Adjustment</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  {adjustmentVariant.sku} ({adjustmentVariant.productName} - {adjustmentVariant.colour} / {adjustmentVariant.size})
                </p>
              </div>
              <button
                onClick={() => setShowAdjustmentModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1"
              >
                ×
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block font-medium">Current On Hand:</span>
                  <span className="text-base font-mono font-bold text-slate-900 dark:text-slate-100">{adjustmentVariant.onHand}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block font-medium">New On Hand:</span>
                  <span className="text-base font-mono font-bold text-blue-600 dark:text-blue-400">{adjustmentVariant.onHand + adjustQtyDelta}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Adjustment Quantity (Signed +/-):</label>
                <input
                  type="number"
                  value={adjustQtyDelta === 0 ? '' : adjustQtyDelta}
                  onChange={(e) => setAdjustQtyDelta(Number(e.target.value))}
                  placeholder="e.g. +10 or -5"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                  required
                />
                <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 block">
                  Positive adds pieces to stock; negative removes pieces.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason Category:</label>
                <select
                  value={adjustReasonCode}
                  onChange={(e) => setAdjustReasonCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                >
                  <option value="stock_count">Physical Stock Count Correction</option>
                  <option value="damage">Damaged Stock Removed</option>
                  <option value="loss">Stock Loss / Discrepancy</option>
                  <option value="found">Found / Unaccounted Stock</option>
                  <option value="correction">Clerical Correction</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Mandatory Explanatory Note:</label>
                <textarea
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="Reason for discrepancy (required for audit trail)"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-sm"
                >
                  {saving ? 'Saving...' : 'Apply Stock Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

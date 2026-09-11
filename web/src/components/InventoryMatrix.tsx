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
    <div className="space-y-6">
      {/* Product Selector & Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product:</label>
          <select
            value={selectedProductId ?? ''}
            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-hidden"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name} ({p.defaultCurrency})
              </option>
            ))}
          </select>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-4 text-xs font-bold">
          <span className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-red-500 inline-block shadow-2xs"></span>
            <span className="text-slate-700">Red: At/Below Min</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 inline-block shadow-2xs"></span>
            <span className="text-slate-700">Amber: Within 25%</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 inline-block shadow-2xs"></span>
            <span className="text-slate-700">Green: Healthy Stock</span>
          </span>
        </div>
      </div>

      {/* Colour x Size Matrix Grid */}
      {activeProduct && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                {activeProduct.name} <span className="text-slate-400 font-mono text-xs">({activeProduct.code})</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical on-hand vs. free unreserved stock across sizes. Click any cell to record an adjustment.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-3 text-left font-bold text-xs text-slate-500 uppercase tracking-wider bg-slate-50 rounded-tl-xl">
                    Colour
                  </th>
                  {sizes.map((size) => (
                    <th key={size} className="p-3 font-extrabold text-xs text-slate-700 uppercase bg-slate-50">
                      {size}
                    </th>
                  ))}
                  <th className="p-3 font-bold text-xs text-slate-500 uppercase bg-slate-50 rounded-tr-xl">
                    Total On Hand
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {colours.map((colour) => {
                  let colourTotal = 0;
                  return (
                    <tr key={colour} className="hover:bg-slate-50/50">
                      <td className="p-3 text-left font-bold text-sm text-slate-800 flex items-center space-x-2">
                        <span>{colour}</span>
                      </td>
                      {sizes.map((size) => {
                        const item = matrixMap.get(`${colour}___${size}`);
                        if (!item) {
                          return <td key={size} className="p-3 text-slate-300 text-xs">—</td>;
                        }
                        colourTotal += item.onHand;
                        const badgeColor =
                          item.band === 'red'
                            ? 'border-red-300 bg-red-50 text-red-900 hover:bg-red-100'
                            : item.band === 'amber'
                            ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                            : 'border-emerald-200 bg-emerald-50/60 text-emerald-900 hover:bg-emerald-100';

                        return (
                          <td key={size} className="p-2">
                            <div
                              onClick={() => openAdjustment(item)}
                              className={`p-2.5 rounded-xl border ${badgeColor} cursor-pointer transition flex flex-col items-center justify-center shadow-2xs`}
                              title={`Click to adjust stock for ${item.sku}`}
                            >
                              <span className="text-sm font-black tracking-tight">{item.onHand}</span>
                              <div className="text-[10px] text-slate-600 font-medium mt-0.5 flex space-x-1">
                                <span>Avail: {item.available}</span>
                                {item.allocated > 0 && <span className="text-blue-600 font-bold">({item.allocated} res)</span>}
                              </div>
                              <span className="text-[9px] text-slate-400 mt-0.5">Min: {item.minStockQty}</span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-3 font-extrabold text-sm text-slate-900">
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900">Record Stock Adjustment</h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{adjustmentVariant.sku} ({adjustmentVariant.productName} - {adjustmentVariant.colour} / {adjustmentVariant.size})</p>
              </div>
              <button
                onClick={() => setShowAdjustmentModal(false)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 block">Current On Hand:</span>
                  <span className="text-base font-black text-slate-900">{adjustmentVariant.onHand}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">New On Hand:</span>
                  <span className="text-base font-black text-blue-600">{adjustmentVariant.onHand + adjustQtyDelta}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Adjustment Quantity (Signed +/-):</label>
                <input
                  type="number"
                  value={adjustQtyDelta === 0 ? '' : adjustQtyDelta}
                  onChange={(e) => setAdjustQtyDelta(Number(e.target.value))}
                  placeholder="e.g. +10 or -5"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-hidden"
                  required
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Positive adds pieces to stock; negative removes pieces.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason Category:</label>
                <select
                  value={adjustReasonCode}
                  onChange={(e) => setAdjustReasonCode(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-medium focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="stock_count">Physical Stock Count Correction</option>
                  <option value="damage">Damaged Stock Removed</option>
                  <option value="loss">Stock Loss / Discrepancy</option>
                  <option value="found">Found / Unaccounted Stock</option>
                  <option value="correction">Clerical Correction</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mandatory Explanatory Note:</label>
                <textarea
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="Reason for discrepancy (required for audit trail)"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:border-blue-600 focus:outline-hidden"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-sm disabled:opacity-50"
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

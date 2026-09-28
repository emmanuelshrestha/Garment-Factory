import React, { useState } from 'react';
import { api, type CuttingStockSummary, type Product } from '../api.ts';
import { Plus, ArrowRightLeft, Wrench } from 'lucide-react';

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
  const [selectedVariant, setSelectedVariant] = useState<CuttingStockSummary | null>(null);
  const [qty, setQty] = useState<number>(0);
  const [reasonCode, setReasonCode] = useState<string>('stock_count');
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
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

  const openModal = (summary: CuttingStockSummary, mode: 'add' | 'transfer' | 'adjust') => {
    setSelectedVariant(summary);
    setModalMode(mode);
    setQty(0);
    setReasonCode('stock_count');
    setNote('');
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVariant) return;
    
    if (modalMode !== 'adjust' && qty <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }
    if (modalMode === 'adjust' && qty === 0) {
      setError('Quantity change cannot be zero.');
      return;
    }
    if (modalMode === 'adjust' && !note.trim()) {
      setError('A note explaining why stock is being adjusted is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (modalMode === 'add') {
        await api.addCuttingStock(selectedVariant.variantId, qty);
      } else if (modalMode === 'transfer') {
        await api.transferCuttingToFinished(selectedVariant.variantId, qty);
      } else {
        await api.adjustCuttingStock(selectedVariant.variantId, qty, reasonCode, note);
      }
      setShowModal(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to update stock');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
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
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeProduct && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
          <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
              {activeProduct.name} <span className="text-slate-400 dark:text-slate-500 font-mono text-xs">({activeProduct.code})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Work-in-progress cutting stock before stitching & finishing.
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
                    <th key={size} className="min-w-[120px] p-2.5 text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/90 border-b border-r border-slate-200 dark:border-slate-800 text-center">
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {colours.map((colour) => (
                  <tr key={colour} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="sticky left-0 z-10 p-2.5 text-left text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 uppercase border-r border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-850 shadow-[1px_0_0_0_rgba(0,0,0,0.05)]">
                      {colour}
                    </td>
                    {sizes.map((size) => {
                      const item = matrixMap.get(`${colour}___${size}`);
                      if (!item) return (
                        <td key={size} className="p-2.5 text-slate-300 dark:text-slate-600 text-xs border-r border-slate-100 dark:border-slate-800 text-center">—</td>
                      );

                      return (
                        <td key={size} className="p-2 border-r border-slate-100 dark:border-slate-800">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100">{item.onHand}</span>
                            <div className="flex flex-wrap justify-center gap-1">
                              <button
                                onClick={() => openModal(item, 'add')}
                                className="px-2 py-1 text-[10px] font-bold bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-0.5 transition"
                                title="Add cutting stock"
                              >
                                <Plus size={10} strokeWidth={2} /> Add
                              </button>
                              <button
                                onClick={() => openModal(item, 'transfer')}
                                className="px-2 py-1 text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-0.5 transition"
                                title="Transfer to finished"
                              >
                                <ArrowRightLeft size={10} strokeWidth={2} /> Move
                              </button>
                              <button
                                onClick={() => openModal(item, 'adjust')}
                                className="px-2 py-1 text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-0.5 transition"
                                title="Adjust stock"
                              >
                                <Wrench size={10} strokeWidth={2} /> Adjust
                              </button>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && selectedVariant && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-4 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  {modalMode === 'add' ? 'Add to Cutting' : modalMode === 'transfer' ? 'Transfer to Finished' : 'Adjust Stock'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{selectedVariant.sku}</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold p-1"
              >
                ×
              </button>
            </div>

            {error && <div className="p-3 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold">{error}</div>}
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Quantity:</label>
                <input
                  type="number"
                  value={qty === 0 ? '' : qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  placeholder={modalMode === 'adjust' ? 'Quantity Change (+/-)' : 'Quantity'}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                  required
                />
              </div>

              {modalMode === 'adjust' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason:</label>
                    <select
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                    >
                      <option value="stock_count">Physical Count</option>
                      <option value="damage">Damage</option>
                      <option value="loss">Loss</option>
                      <option value="found">Found</option>
                      <option value="correction">Correction</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Explanatory Note:</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                      rows={2}
                      required
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-sm">
                  {saving ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

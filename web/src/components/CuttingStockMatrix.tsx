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
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Product</label>
          <select
            value={selectedProductId ?? ''}
            onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
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
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h3 className="font-semibold text-sm text-slate-900">
              {activeProduct.name} <span className="text-slate-400 font-mono text-xs">({activeProduct.code})</span>
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-28 p-2 text-left text-[11px] font-mono font-medium text-slate-500 uppercase bg-slate-50 border-b border-r border-slate-200">
                    Colour
                  </th>
                  {sizes.map((size) => (
                    <th key={size} className="w-20 p-2 text-[11px] font-mono font-medium text-slate-500 uppercase bg-slate-50 border-b border-r border-slate-200">
                      {size}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {colours.map((colour) => (
                  <tr key={colour} className="hover:bg-slate-50">
                    <td className="p-2 text-left text-[11px] font-mono font-medium text-slate-500 uppercase border-b border-r border-slate-200 bg-slate-50">
                      {colour}
                    </td>
                    {sizes.map((size) => {
                      const item = matrixMap.get(`${colour}___${size}`);
                      if (!item) return (
                        <td key={size} className="p-2 text-slate-300 text-xs border-b border-slate-200">—</td>
                      );

                      return (
                        <td key={size} className="p-1 border-b border-slate-200">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-sm font-mono font-bold text-slate-900">{item.onHand}</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => openModal(item, 'add')}
                                className="px-2 py-1 text-[10px] font-medium bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded flex items-center gap-0.5"
                                title="Add cutting stock"
                              >
                                <Plus size={10} strokeWidth={2} /> Add
                              </button>
                              <button
                                onClick={() => openModal(item, 'transfer')}
                                className="px-2 py-1 text-[10px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded flex items-center gap-0.5"
                                title="Transfer to finished"
                              >
                                <ArrowRightLeft size={10} strokeWidth={2} /> Move
                              </button>
                              <button
                                onClick={() => openModal(item, 'adjust')}
                                className="px-2 py-1 text-[10px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded flex items-center gap-0.5"
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
        <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl border border-slate-200 space-y-4">
            <h4 className="font-semibold text-sm text-slate-900">
              {modalMode === 'add' ? 'Add to Cutting' : modalMode === 'transfer' ? 'Transfer to Finished' : 'Adjust Stock'}
            </h4>
            <p className="text-xs text-slate-500 font-mono">{selectedVariant.sku}</p>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-xs font-medium">{error}</div>}
            <form onSubmit={handleSave} className="space-y-4">
              <input
                type="number"
                value={qty === 0 ? '' : qty}
                onChange={(e) => setQty(Number(e.target.value))}
                placeholder={modalMode === 'adjust' ? 'Quantity Change (+/-)' : 'Quantity'}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                required
              />
              {modalMode === 'adjust' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
                    <select
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium"
                    >
                      <option value="stock_count">Physical Count</option>
                      <option value="damage">Damage</option>
                      <option value="loss">Loss</option>
                      <option value="found">Found</option>
                      <option value="correction">Correction</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Note</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium"
                      rows={2}
                      required
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg text-xs font-medium bg-slate-900 text-white disabled:opacity-50">
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

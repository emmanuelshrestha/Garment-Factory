import React, { useState, useEffect, useMemo } from 'react';
import { bagsApi, BagSummary, api, Product, ProductVariant } from '../api';
import { 
  Package, Plus, X, Minus, Search, ChevronDown, ChevronRight, 
  Layers, Hash, Eye, ArrowRight 
} from 'lucide-react';

interface BagContentItem {
  variantId: number;
  productName: string;
  colour: string;
  size: string;
  quantity: number;
}

export function BagsPage() {
  const [bags, setBags] = useState<BagSummary[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);

  // Search & Accordion State
  const [bagFilter, setBagFilter] = useState('');
  const [expandedBagIds, setExpandedBagIds] = useState<Record<number, boolean>>({});

  // Modals
  const [isNewBagOpen, setIsNewBagOpen] = useState(false);
  const [newBagName, setNewBagName] = useState('');
  const [activeBag, setActiveBag] = useState<any | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);

  // Add Item Modal Inputs
  const [modalProductSearch, setModalProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedColour, setSelectedColour] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [removeVariantId, setRemoveVariantId] = useState<number | null>(null);

  const fetchBags = () => bagsApi.list().then(r => setBags(r.bags || []));

  useEffect(() => {
    fetchBags();
    api.getProducts().then(r => setProducts(Array.isArray(r) ? r : (r?.products || []))).catch(() => setProducts([]));
    api.getVariants().then(r => setVariants(Array.isArray(r) ? r : (r?.variants || []))).catch(() => setVariants([]));
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedBagIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Assign numeric indexes (#01, #02, ...) matching catalogue order
  const numberedProducts = useMemo(() => {
    return products.map((p, idx) => ({
      ...p,
      numberTag: `#${String(idx + 1).padStart(2, '0')}`,
    }));
  }, [products]);

  const filteredModalProducts = useMemo(() => {
    if (!modalProductSearch.trim()) return numberedProducts;
    const q = modalProductSearch.toLowerCase();
    return numberedProducts.filter(
      p => p.numberTag.includes(q) || p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    );
  }, [numberedProducts, modalProductSearch]);

  // Filter bags by bag name or content
  const filteredBags = useMemo(() => {
    if (!bagFilter.trim()) return bags;
    const q = bagFilter.toLowerCase();
    return bags.filter(b => {
      const matchName = b.name.toLowerCase().includes(q);
      const matchContent = (b as any).contents?.some((c: BagContentItem) =>
        c.productName.toLowerCase().includes(q) ||
        c.colour.toLowerCase().includes(q) ||
        c.size.toLowerCase().includes(q)
      );
      return matchName || matchContent;
    });
  }, [bags, bagFilter]);

  const openAddModal = (bag: any) => {
    setActiveBag(bag);
    setSelectedProductId(products[0]?.id || null);
    setSelectedColour(null);
    setSelectedVariantId(null);
    setModalProductSearch('');
    setQuantity(1);
    setIsAddModalOpen(true);
  };

  const openRemoveModal = (bag: any) => {
    setActiveBag(bag);
    setRemoveVariantId(bag.contents?.[0]?.variantId || null);
    setQuantity(1);
    setIsRemoveModalOpen(true);
  };

  const handleAddStock = async () => {
    if (!activeBag || !selectedVariantId) return;
    try {
      await bagsApi.addStock(activeBag.id, { variantId: selectedVariantId, quantity, reason: 'Floor packing' });
      setIsAddModalOpen(false);
      fetchBags();
    } catch (err: any) {
      alert(err.message || 'Failed to add stock');
    }
  };

  const handleRemoveStock = async () => {
    if (!activeBag || !removeVariantId) return;
    try {
      await bagsApi.removeStock(activeBag.id, { variantId: removeVariantId, quantity, reason: 'Floor dispatch' });
      setIsRemoveModalOpen(false);
      fetchBags();
    } catch (err: any) {
      alert(err.message || 'Failed to remove stock');
    }
  };

  // Derive colours & sizes for add modal
  const availableColours = Array.from(new Set(
    variants
      .filter(v => (v.productId ?? (v as any).product_id) === selectedProductId)
      .map(v => (v as any).colourName || (v as any).colour)
  )).filter(Boolean);

  useEffect(() => {
    if (availableColours.length > 0 && (!selectedColour || !availableColours.includes(selectedColour))) {
      setSelectedColour(availableColours[0]);
    }
  }, [selectedProductId, variants]);

  const availableSizes = variants.filter(v => 
    (v.productId ?? (v as any).product_id) === selectedProductId &&
    ((v as any).colourName || (v as any).colour) === selectedColour
  );

  useEffect(() => {
    if (availableSizes.length > 0) {
      setSelectedVariantId(availableSizes[0].id);
    } else {
      setSelectedVariantId(null);
    }
  }, [selectedColour, selectedProductId]);

  // Aggregate bag contents by product for clean presentation
  const getProductGroups = (contents: BagContentItem[] = []) => {
    const groups: Record<string, { total: number; items: BagContentItem[] }> = {};
    contents.forEach(item => {
      if (!groups[item.productName]) {
        groups[item.productName] = { total: 0, items: [] };
      }
      groups[item.productName].total += item.quantity;
      groups[item.productName].items.push(item);
    });
    return groups;
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Top Search & Actions Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search bags or contents (e.g. Bag-1, Bomber, Navy, XL)..."
            value={bagFilter}
            onChange={e => setBagFilter(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-2 pl-10 pr-9 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600 transition"
          />
          {bagFilter && (
            <button
              onClick={() => setBagFilter('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          <span className="text-xs text-slate-500 font-mono font-semibold">
            {filteredBags.length} of {bags.length} Bag(s)
          </span>
          <button 
            onClick={() => setIsNewBagOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-95"
          >
            <Plus size={15} /> New Bag
          </button>
        </div>
      </div>

      {/* Bag Cards Grid */}
      <div className="grid gap-3.5 sm:grid-cols-2">
        {filteredBags.map(bag => {
          const contents: BagContentItem[] = (bag as any).contents || [];
          const productGroups = getProductGroups(contents);
          const distinctProductCount = Object.keys(productGroups).length;
          const isExpanded = !!expandedBagIds[bag.id];

          return (
            <div 
              key={bag.id} 
              className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between hover:border-slate-300 dark:hover:border-slate-700 transition"
            >
              <div>
                {/* Header */}
                <div className="flex justify-between items-center pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                      <Package size={16} />
                    </div>
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-slate-100 block">{bag.name}</span>
                      <span className="text-[11px] text-slate-400">{distinctProductCount} style(s) inside</span>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900">
                    {bag.totalQty || 0} pcs
                  </span>
                </div>

                {/* Content Preview & Groups */}
                <div className="py-2.5">
                  {contents.length === 0 ? (
                    <div className="text-slate-400 italic py-4 text-center text-xs">Empty bag (0 items)</div>
                  ) : (
                    <div className="space-y-2">
                      {/* Condensed View / Summary Chips */}
                      <div className="space-y-1.5">
                        {Object.entries(productGroups).slice(0, isExpanded ? undefined : 3).map(([prodName, data]) => (
                          <div 
                            key={prodName}
                            className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80"
                          >
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-bold text-slate-800 dark:text-slate-200 truncate pr-2">{prodName}</span>
                              <span className="font-mono font-bold text-blue-600 dark:text-blue-400 shrink-0">{data.total} pcs</span>
                            </div>

                            {/* Detailed variant tags when expanded */}
                            {isExpanded && (
                              <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 grid grid-cols-2 gap-1 text-[11px]">
                                {data.items.map((item, i) => (
                                  <div key={i} className="flex justify-between px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700/50">
                                    <span className="text-slate-600 dark:text-slate-400 truncate">{item.colour} / {item.size}</span>
                                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100 ml-1">{item.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Expand / Collapse Toggle if more than 3 styles */}
                      {distinctProductCount > 3 && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(bag.id)}
                          className="w-full text-center text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline py-1 flex items-center justify-center gap-1"
                        >
                          {isExpanded ? (
                            <>Show less <ChevronDown size={14} className="rotate-180" /></>
                          ) : (
                            <>+{distinctProductCount - 3} more product styles <ChevronDown size={14} /></>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                <button 
                  onClick={() => openAddModal(bag)}
                  className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-semibold transition active:scale-95"
                >
                  + Add Stock
                </button>
                <button 
                  onClick={() => openRemoveModal(bag)}
                  disabled={!bag.totalQty || bag.totalQty === 0}
                  className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition active:scale-95"
                >
                  - Take Out
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Stock Modal with Numbered Product Search */}
      {isAddModalOpen && activeBag && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Package size={15} className="text-blue-600" />
                Add Stock to {activeBag.name}
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              {/* Product Search & Grid */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                    1. Select Product
                  </label>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {filteredModalProducts.length} product(s)
                  </span>
                </div>

                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                  <input
                    type="text"
                    placeholder="Search by product # (e.g. 01), code (JKT), or name..."
                    value={modalProductSearch}
                    onChange={e => setModalProductSearch(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 pl-8 pr-7 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                  />
                  {modalProductSearch && (
                    <button
                      onClick={() => setModalProductSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Product Select List */}
                <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40">
                  {filteredModalProducts.map(p => {
                    const isSelected = selectedProductId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProductId(p.id)}
                        className={`w-full px-3 py-2 flex items-center justify-between text-left transition ${
                          isSelected
                            ? 'bg-blue-600 text-white font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}>
                            {p.numberTag}
                          </span>
                          <span className="truncate text-xs">{p.name}</span>
                        </div>
                        <span className={`text-[10px] font-mono shrink-0 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                          {p.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Colour Chips */}
              {availableColours.length > 0 && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] mb-1.5">
                    2. Select Colour
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableColours.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSelectedColour(c)}
                        className={`px-3 py-1.5 rounded-xl border transition ${
                          selectedColour === c 
                            ? 'bg-blue-600 border-blue-600 text-white font-semibold' 
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size Chips */}
              {availableSizes.length > 0 && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] mb-1.5">
                    3. Select Size
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableSizes.map(v => {
                      const sizeName = (v as any).sizeName || (v as any).size || 'Default';
                      const isSelected = selectedVariantId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVariantId(v.id)}
                          className={`min-w-[42px] px-3 py-1.5 rounded-xl border text-center transition font-mono ${
                            isSelected 
                              ? 'bg-blue-600 border-blue-600 text-white font-bold' 
                              : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {sizeName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quantity Stepper */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-[11px] mb-1.5">
                  4. Quantity
                </label>
                <div className="flex items-center gap-1.5">
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => Math.max(1, q - 5))}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-bold"
                  >
                    -5
                  </button>
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
                  >
                    <Minus size={14} />
                  </button>
                  <input 
                    type="number"
                    min="1"
                    className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-1.5 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-blue-600"
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => q + 1)}
                    className="p-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
                  >
                    <Plus size={14} />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => q + 5)}
                    className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-bold"
                  >
                    +5
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <button 
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={!selectedVariantId}
                onClick={handleAddStock}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl font-semibold text-xs transition shadow-sm"
              >
                Add to Bag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Modal */}
      {isRemoveModalOpen && activeBag && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">Take Out from {activeBag.name}</h2>
              <button onClick={() => setIsRemoveModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-semibold mb-1">Select Item to Remove</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(activeBag.contents || []).map((item: any) => {
                    const isSelected = removeVariantId === item.variantId;
                    return (
                      <div
                        key={item.variantId}
                        onClick={() => setRemoveVariantId(item.variantId)}
                        className={`p-2 rounded-xl border cursor-pointer flex justify-between items-center transition ${
                          isSelected 
                            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-700 dark:text-blue-300' 
                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span>{item.productName} · {item.colour} / {item.size}</span>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{item.quantity} in bag</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-semibold mb-1">Quantity to Take Out</label>
                <div className="flex items-center gap-2">
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
                  >
                    <Minus size={14} />
                  </button>
                  <input 
                    type="number"
                    min="1"
                    className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-1.5 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-blue-600"
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <button 
                    type="button"
                    onClick={() => setQuantity(q => q + 1)}
                    className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <button 
                type="button"
                onClick={() => setIsRemoveModalOpen(false)}
                className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button 
                type="button"
                disabled={!removeVariantId}
                onClick={handleRemoveStock}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-xl font-semibold text-xs transition shadow-sm"
              >
                Confirm Take Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Bag Modal */}
      {isNewBagOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-4 shadow-2xl">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">Create New Bag</h2>
              <button onClick={() => setIsNewBagOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1">
                <X size={16} />
              </button>
            </div>
            <input 
              placeholder="Bag Name (e.g. Bag-6)"
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-900 dark:text-slate-100 mb-4 focus:outline-none focus:border-blue-600"
              value={newBagName}
              autoFocus
              onChange={e => setNewBagName(e.target.value)}
            />
            <div className="flex gap-2">
              <button 
                onClick={() => setIsNewBagOpen(false)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  if (!newBagName.trim()) return;
                  await bagsApi.create({ name: newBagName });
                  setIsNewBagOpen(false);
                  setNewBagName('');
                  fetchBags();
                }}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition shadow-sm"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
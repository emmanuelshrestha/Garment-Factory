import React, { useState, useEffect, useMemo } from 'react';
import { bagsApi, api, Product } from '../api';
import { Search, MapPin, Package, Minus, Plus, X } from 'lucide-react';

interface BagLocation {
  bagId: number;
  bagName: string;
  quantity: number;
}

interface StockRow {
  variantId: number;
  productName: string;
  colour: string;
  size: string;
  totalQty: number;
  bags: BagLocation[];
}

export function StockPage() {
  const [stockRows, setStockRows] = useState<StockRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [selectedColour, setSelectedColour] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  // Take-out modal state
  const [activeTakeOut, setActiveTakeOut] = useState<{
    bagId: number;
    bagName: string;
    variantId: number;
    productName: string;
    colour: string;
    size: string;
    maxQty: number;
  } | null>(null);
  const [takeOutQty, setTakeOutQty] = useState(1);

  const loadData = async () => {
    setLoading(true);
    try {
      const fetchGlobal = (bagsApi as any).getGlobalStock || (bagsApi as any).globalStock;
      const [stockRes, prodRes] = await Promise.all([
        fetchGlobal ? fetchGlobal().catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
        api.getProducts().catch(() => ({ products: [] })),
      ]);
      setStockRows(stockRes.rows || []);
      setProducts(Array.isArray(prodRes) ? prodRes : (prodRes?.products || []));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Numbered products (#01, #02, ...)
  const numberedProducts = useMemo(() => {
    return products.map((p, idx) => ({
      ...p,
      numberTag: `#${String(idx + 1).padStart(2, '0')}`,
    }));
  }, [products]);

  const availableColours = useMemo(() => {
    const list = stockRows
      .filter(r => !selectedProduct || r.productName === selectedProduct)
      .map(r => r.colour)
      .filter(Boolean);
    return Array.from(new Set(list));
  }, [stockRows, selectedProduct]);

  const availableSizes = useMemo(() => {
    const list = stockRows
      .filter(r => (!selectedProduct || r.productName === selectedProduct) &&
                   (!selectedColour || r.colour === selectedColour))
      .map(r => r.size)
      .filter(Boolean);
    return Array.from(new Set(list));
  }, [stockRows, selectedProduct, selectedColour]);

  const filteredRows = useMemo(() => {
    return stockRows.filter(row => {
      if (selectedProduct && row.productName !== selectedProduct) return false;
      if (selectedColour && row.colour !== selectedColour) return false;
      if (selectedSize && row.size !== selectedSize) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesProduct = row.productName?.toLowerCase().includes(q);
        const matchesColour = row.colour?.toLowerCase().includes(q);
        const matchesSize = row.size?.toLowerCase().includes(q);
        const matchesBag = row.bags?.some(b => b.bagName?.toLowerCase().includes(q));
        if (!matchesProduct && !matchesColour && !matchesSize && !matchesBag) return false;
      }

      return true;
    });
  }, [stockRows, selectedProduct, selectedColour, selectedSize, searchQuery]);

  const handleConfirmTakeOut = async () => {
    if (!activeTakeOut) return;
    try {
      await bagsApi.removeStock(activeTakeOut.bagId, {
        variantId: activeTakeOut.variantId,
        quantity: takeOutQty,
        reason: 'Floor Stock Locator dispatch',
      });
      setActiveTakeOut(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to remove stock');
    }
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-2xs">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <MapPin className="text-blue-600 dark:text-blue-400" size={18} />
          Stock Locator
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Locate finished garments by product #, style, colour, size, or specific bag name across the floor.
        </p>

        {/* Search Bar */}
        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Search by product # (e.g. 01), name, colour, size, or bag (e.g. Bag-1)..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-2 pl-9 pr-9 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 text-xs shadow-2xs">
        {/* Product Chips with Numbers */}
        <div>
          <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block text-[11px] mb-1.5">
            Product (#{numberedProducts.length} Total)
          </span>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
            <button
              onClick={() => setSelectedProduct(null)}
              className={`px-3 py-1 rounded-xl border text-xs font-semibold transition ${
                selectedProduct === null
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              All Products
            </button>
            {numberedProducts.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProduct(selectedProduct === p.name ? null : p.name)}
                className={`px-2.5 py-1 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 ${
                  selectedProduct === p.name
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                <span className="font-mono text-[10px] opacity-75">{p.numberTag}</span>
                <span>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Colour Chips */}
        {availableColours.length > 0 && (
          <div>
            <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block text-[11px] mb-1.5">Colour</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedColour(null)}
                className={`px-3 py-1 rounded-xl border text-xs font-semibold transition ${
                  selectedColour === null
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                All Colours
              </button>
              {availableColours.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedColour(selectedColour === c ? null : c)}
                  className={`px-3 py-1 rounded-xl border text-xs font-semibold transition ${
                    selectedColour === c
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
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
            <span className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider block text-[11px] mb-1.5">Size</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedSize(null)}
                className={`px-3 py-1 rounded-xl border text-xs font-semibold transition ${
                  selectedSize === null
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                }`}
              >
                All Sizes
              </button>
              {availableSizes.map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedSize(selectedSize === s ? null : s)}
                  className={`min-w-[40px] px-3 py-1 rounded-xl border text-xs font-semibold text-center transition ${
                    selectedSize === s
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter Status */}
      <div className="flex justify-between items-center text-xs text-slate-500 px-1">
        <span>Found {filteredRows.length} variant location(s)</span>
        {(selectedProduct || selectedColour || selectedSize || searchQuery) && (
          <button
            onClick={() => {
              setSelectedProduct(null);
              setSelectedColour(null);
              setSelectedSize(null);
              setSearchQuery('');
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results List */}
      <div className="space-y-3 pb-8">
        {loading ? (
          <div className="text-center py-12 text-xs text-slate-500">Scanning bag contents...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-14 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <Package className="mx-auto text-slate-400 dark:text-slate-600 mb-2" size={36} />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No stock found</p>
            <p className="text-xs text-slate-500 mt-1">Try another filter or check in the Bags tab.</p>
          </div>
        ) : (
          filteredRows.map(row => (
            <div
              key={row.variantId}
              className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs space-y-3"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{row.productName}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 font-medium">
                      {row.colour}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs border border-slate-200 dark:border-slate-700 font-mono font-bold">
                      Size {row.size}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">Total In Bags</span>
                  <span className="text-lg font-mono font-bold text-blue-600 dark:text-blue-400">{row.totalQty} pcs</span>
                </div>
              </div>

              {/* Exact Sack List */}
              <div className="bg-slate-50 dark:bg-slate-950/70 rounded-xl p-2.5 border border-slate-100 dark:border-slate-800 space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Locations ({row.bags?.length || 0} bag{row.bags?.length === 1 ? '' : 's'}):
                </span>
                {row.bags && row.bags.length > 0 ? (
                  row.bags.map(b => (
                    <div
                      key={b.bagId}
                      className="flex justify-between items-center py-1.5 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-2">
                        <Package size={14} className="text-blue-600 dark:text-blue-400" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{b.bagName}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{b.quantity} pcs</span>
                        <button
                          onClick={() => {
                            setActiveTakeOut({
                              bagId: b.bagId,
                              bagName: b.bagName,
                              variantId: row.variantId,
                              productName: row.productName,
                              colour: row.colour,
                              size: row.size,
                              maxQty: b.quantity,
                            });
                            setTakeOutQty(1);
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold transition"
                        >
                          Take Out
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-400 italic py-1">No bags currently assigned</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Take-Out Modal */}
      {activeTakeOut && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 z-50">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Take Out from {activeTakeOut.bagName}
              </h2>
              <button onClick={() => setActiveTakeOut(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1">
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{activeTakeOut.productName}</p>
                <p className="text-slate-500 mt-0.5">
                  {activeTakeOut.colour} · Size {activeTakeOut.size}
                </p>
                <p className="text-blue-600 dark:text-blue-400 font-mono font-bold mt-1">Available in bag: {activeTakeOut.maxQty} pcs</p>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-semibold mb-1">Quantity</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTakeOutQty(q => Math.max(1, q - 1))}
                    className="p-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={activeTakeOut.maxQty}
                    className="flex-1 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl py-1.5 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:border-blue-600"
                    value={takeOutQty}
                    onChange={e =>
                      setTakeOutQty(
                        Math.max(1, Math.min(activeTakeOut.maxQty, Number(e.target.value) || 1))
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setTakeOutQty(q => Math.min(activeTakeOut.maxQty, q + 1))}
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
                onClick={() => setActiveTakeOut(null)}
                className="flex-1 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTakeOut}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs transition shadow-sm"
              >
                Confirm Take Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
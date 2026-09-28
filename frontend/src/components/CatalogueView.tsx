import React, { useState, useEffect } from 'react';
import { api, type Product, type Colour, type Size, type Customer, type Currency, type ProductVariant, formatMoney } from '../api';

// ─── Types ───────────────────────────────────────────────────────────────────

type CatalogueSubTab = 'products' | 'customers' | 'colours' | 'sizes' | 'variants';

// ─── Main CatalogueView ───────────────────────────────────────────────────────

export const CatalogueView: React.FC = () => {
  const [subTab, setSubTab] = useState<CatalogueSubTab>('products');

  return (
    <div className="space-y-5">
      {/* Sub-Tab Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-extrabold text-base sm:text-lg text-slate-900">Catalogue Management</h3>
          <p className="text-xs text-slate-500 mt-0.5">Products, customers, colours, and variant matrices.</p>
        </div>
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full">
          {(['products', 'customers', 'colours', 'sizes', 'variants'] as CatalogueSubTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize whitespace-nowrap transition ${
                subTab === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t === 'variants' ? 'Variants & Stock Mins' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'products' && <ProductsPanel />}
      {subTab === 'customers' && <CustomersPanel />}
      {subTab === 'colours' && <ColoursPanel />}
      {subTab === 'sizes' && <SizesPanel />}
      {subTab === 'variants' && <VariantsPanel />}
    </div>
  );
};

// ─── Image Helper ──────────────────────────────────────────────────────────

async function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 1200;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Failed to load image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ─── Products Panel ───────────────────────────────────────────────────────────

const ProductsPanel: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<{
    code: string;
    name: string;
    category: string;
    defaultPriceMinor: string;
    defaultCurrency: Currency;
    images: string[];
    displayImage: string | null;
  }>({
    code: '',
    name: '',
    category: '',
    defaultPriceMinor: '',
    defaultCurrency: 'NPR',
    images: [],
    displayImage: null,
  });
  const [priceForm, setPriceForm] = useState({ productId: 0, priceMinor: '', note: '' });
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image upload & Lightbox states
  const [urlInput, setUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [lightboxProduct, setLightboxProduct] = useState<Product | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const load = async () => {
    setLoading(true);
    try { setProducts((await api.getProducts()).products); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditProduct(null);
    setForm({
      code: '',
      name: '',
      category: '',
      defaultPriceMinor: '',
      defaultCurrency: 'NPR',
      images: [],
      displayImage: null,
    });
    setUrlInput('');
    setShowUrlInput(false);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    const initialImages = p.images || [];
    const initialDisplay = p.displayImage || (initialImages.length > 0 ? initialImages[0] : null);
    setForm({
      code: p.code,
      name: p.name,
      category: p.category ?? '',
      defaultPriceMinor: p.defaultPriceMinor != null ? (p.defaultPriceMinor / 100).toFixed(2) : '',
      defaultCurrency: p.defaultCurrency,
      images: initialImages,
      displayImage: initialDisplay,
    });
    setUrlInput('');
    setShowUrlInput(false);
    setError(null);
    setShowModal(true);
  };

  const handleFilesSelected = async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    const remainingSlots = 4 - form.images.length;
    if (remainingSlots <= 0) {
      alert('Maximum of 4 images reached for this product.');
      return;
    }

    const filesToProcess = fileArr.slice(0, remainingSlots);
    if (fileArr.length > remainingSlots) {
      alert(`Only ${remainingSlots} more image(s) can be added (maximum 4 per product).`);
    }

    setUploadingImage(true);
    try {
      const compressedList = await Promise.all(filesToProcess.map(f => compressImageFile(f)));
      setForm(prev => {
        const newImages = [...prev.images, ...compressedList].slice(0, 4);
        const newDisplay = prev.displayImage && newImages.includes(prev.displayImage)
          ? prev.displayImage
          : (newImages[0] ?? null);
        return {
          ...prev,
          images: newImages,
          displayImage: newDisplay,
        };
      });
    } catch (err: any) {
      setError(err.message || 'Failed to process images');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSetDisplay = (img: string) => {
    setForm(prev => ({ ...prev, displayImage: img }));
  };

  const handleRemoveImage = (index: number) => {
    setForm(prev => {
      const removed = prev.images[index];
      const newImages = prev.images.filter((_, i) => i !== index);
      let newDisplay = prev.displayImage;
      if (newDisplay === removed || !newImages.includes(newDisplay || '')) {
        newDisplay = newImages[0] ?? null;
      }
      return {
        ...prev,
        images: newImages,
        displayImage: newDisplay,
      };
    });
  };

  const handleAddUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (form.images.length >= 4) {
      alert('Maximum of 4 images reached for this product.');
      return;
    }
    setForm(prev => {
      const newImages = [...prev.images, url].slice(0, 4);
      const newDisplay = prev.displayImage && newImages.includes(prev.displayImage)
        ? prev.displayImage
        : (newImages[0] ?? null);
      return {
        ...prev,
        images: newImages,
        displayImage: newDisplay,
      };
    });
    setUrlInput('');
    setShowUrlInput(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    const priceMinor = form.defaultPriceMinor ? Math.round(parseFloat(form.defaultPriceMinor) * 100) : undefined;
    try {
      if (editProduct) {
        await api.updateProduct(editProduct.id, {
          code: form.code,
          name: form.name,
          category: form.category || null,
          defaultPriceMinor: priceMinor ?? null,
          defaultCurrency: form.defaultCurrency,
          images: form.images,
          displayImage: form.displayImage,
        });
      } else {
        await api.createProduct({
          code: form.code,
          name: form.name,
          category: form.category || undefined,
          defaultPriceMinor: priceMinor,
          defaultCurrency: form.defaultCurrency,
          images: form.images,
          displayImage: form.displayImage,
        });
      }
      setShowModal(false); await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (p: Product) => {
    const action = p.isActive ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${action} product "${p.name}"?`)) return;
    try {
      await api.updateProduct(p.id, { isActive: !p.isActive });
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Permanently delete product "${p.code} - ${p.name}"?\n\nNote: If this product has existing stock movements or orders, it cannot be deleted and should be deactivated instead.`)) return;
    try {
      await api.deleteProduct(p.id);
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSetPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(parseFloat(priceForm.priceMinor) * 100);
    try {
      await api.setProductPrice(priceForm.productId, minor, priceForm.note || undefined);
      setShowPriceModal(false); await load();
    } catch (e: any) { alert(e.message); }
  };

  const openLightbox = (p: Product, initialIdx = 0) => {
    setLightboxProduct(p);
    setLightboxIndex(initialIdx);
  };

  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.category && p.category.toLowerCase().includes(q))
    );
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <h4 className="font-extrabold text-sm text-slate-900">Products ({products.length})</h4>
          <input
            type="text"
            placeholder="Search code, name, category..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs w-56 focus:outline-none focus:border-blue-500"
          />
        </div>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition">
          + New Product
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400 text-xs">Loading products...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium w-16">Image</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Code</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Name</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Category</th>
                <th className="py-2.5 px-4 text-right text-[11px] uppercase tracking-wider text-slate-500 font-medium">Default Price</th>
                <th className="py-2.5 px-4 text-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">Status</th>
                <th className="py-2.5 px-4 text-right text-[11px] uppercase tracking-wider text-slate-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                    {search ? 'No products match your search.' : 'No products yet. Add your first product.'}
                  </td>
                </tr>
              ) : filtered.map((p) => {
                const cover = p.displayImage || p.images?.[0];
                const imageCount = p.images?.length || (cover ? 1 : 0);

                return (
                  <tr key={p.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-4">
                      {cover ? (
                        <div
                          onClick={() => openLightbox(p, 0)}
                          className="relative group w-11 h-11 rounded-xl overflow-hidden border border-slate-200 shadow-2xs cursor-pointer bg-slate-100 hover:ring-2 hover:ring-blue-500 transition"
                          title="Click to view images"
                        >
                          <img
                            src={cover}
                            alt={p.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition duration-200"
                          />
                          {imageCount > 1 && (
                            <span className="absolute bottom-0 right-0 bg-slate-900/80 text-[9px] font-extrabold text-white px-1 rounded-tl-md">
                              {imageCount}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div
                          onClick={() => openEdit(p)}
                          className="w-11 h-11 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-400 transition cursor-pointer"
                          title="Add product images"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-[8px] font-semibold mt-0.5">+img</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-xs text-blue-900">{p.code}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{p.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{p.category || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-semibold">
                      {p.defaultPriceMinor ? formatMoney(p.defaultPriceMinor, p.defaultCurrency) : '—'}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${p.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200 line-through'}`}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button onClick={() => openEdit(p)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition">Edit</button>
                      <button onClick={() => { setPriceForm({ productId: p.id, priceMinor: '', note: '' }); setShowPriceModal(true); }} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition">Price</button>
                      <button onClick={() => handleToggleActive(p)} className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${p.isActive ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}>
                        {p.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button onClick={() => handleDelete(p)} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal with Image Management */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-extrabold text-base text-slate-900">{editProduct ? 'Edit Product' : 'Add New Product'}</h4>
                <p className="text-xs text-slate-500 mt-0.5">Configure product details and up to 4 catalogue images.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 font-bold p-1">✕</button>
            </div>

            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Product Code *</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. JKT-01" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono font-bold focus:border-blue-500 focus:outline-none" required />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Product Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Winter Jacket A" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-500 focus:outline-none" required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Jackets, Trousers, Shirts" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:border-blue-500 focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default Price (Major Units)</label>
                  <input type="number" step="0.01" min="0" value={form.defaultPriceMinor} onChange={e => setForm(f => ({ ...f, defaultPriceMinor: e.target.value }))} placeholder="e.g. 2500.00" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Price Currency</label>
                  <select value={form.defaultCurrency} onChange={e => setForm(f => ({ ...f, defaultCurrency: e.target.value as Currency }))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white focus:border-blue-500 focus:outline-none">
                    <option value="NPR">NPR</option>
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              {/* ─── Product Images (Max 4) ─── */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-800">
                      Product Images ({form.images.length}/4)
                    </label>
                    <p className="text-[11px] text-slate-500">
                      One image is automatically set as the display cover. Click an image to set it as display cover.
                    </p>
                  </div>
                  {form.images.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setShowUrlInput(!showUrlInput)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold"
                    >
                      {showUrlInput ? 'Cancel URL' : '+ Add from URL'}
                    </button>
                  )}
                </div>

                {showUrlInput && form.images.length < 4 && (
                  <div className="flex gap-2 mb-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <input
                      type="url"
                      placeholder="Paste image URL (https://...)"
                      value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddUrl}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold"
                    >
                      Add
                    </button>
                  </div>
                )}

                {/* Images Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {form.images.map((img, idx) => {
                    const isDisplay = form.displayImage === img || (idx === 0 && !form.displayImage);
                    return (
                      <div
                        key={idx}
                        className={`relative group aspect-square rounded-xl overflow-hidden border-2 bg-slate-100 transition shadow-2xs ${
                          isDisplay ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        <img src={img} alt={`Product ${idx + 1}`} className="w-full h-full object-cover" />

                        {/* Display Badge */}
                        {isDisplay ? (
                          <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded-md shadow-sm">
                            ★ Display
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetDisplay(img)}
                            className="absolute top-1.5 left-1.5 bg-slate-900/75 hover:bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition shadow-sm"
                            title="Set as display image"
                          >
                            Set Display
                          </button>
                        )}

                        {/* Remove Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1.5 right-1.5 bg-red-600 hover:bg-red-700 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition shadow-sm"
                          title="Remove image"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}

                  {/* Upload Dropzone / Button */}
                  {form.images.length < 4 && (
                    <label
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
                      }}
                      className={`aspect-square rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 flex flex-col items-center justify-center p-2 text-center cursor-pointer transition ${
                        uploadingImage ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) handleFilesSelected(e.target.files);
                        }}
                      />
                      <svg className="w-6 h-6 text-slate-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-[10px] font-bold text-slate-600">
                        {uploadingImage ? 'Processing...' : 'Upload Image'}
                      </span>
                      <span className="text-[9px] text-slate-400">({4 - form.images.length} left)</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving || uploadingImage} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                  {saving ? 'Saving...' : editProduct ? 'Update Product' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Price Modal */}
      {showPriceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-base text-slate-900">Update Product Price</h4>
              <button onClick={() => setShowPriceModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleSetPrice} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Price (Major Units e.g. 2500.00)</label>
                <input type="number" step="0.01" min="0.01" value={priceForm.priceMinor} onChange={e => setPriceForm(f => ({ ...f, priceMinor: e.target.value }))} placeholder="2500.00" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Note (Optional)</label>
                <input value={priceForm.note} onChange={e => setPriceForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. Price revision Q3 2026" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setShowPriceModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Set Price</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox / Fullscreen Image Viewer Modal */}
      {lightboxProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between text-white">
              <div>
                <h4 className="font-bold text-sm">{lightboxProduct.name}</h4>
                <p className="text-[11px] text-slate-400 font-mono">{lightboxProduct.code} — Image {(lightboxIndex + 1)} of {(lightboxProduct.images?.length || 1)}</p>
              </div>
              <button
                onClick={() => setLightboxProduct(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white font-bold transition"
              >
                ✕
              </button>
            </div>

            {/* Main Image Display */}
            <div className="relative aspect-4/3 max-h-[60vh] bg-black flex items-center justify-center p-4">
              {(() => {
                const images = lightboxProduct.images && lightboxProduct.images.length > 0
                  ? lightboxProduct.images
                  : [lightboxProduct.displayImage || ''];
                const currentImg = images[lightboxIndex] || images[0];

                return (
                  <>
                    <img
                      src={currentImg}
                      alt={lightboxProduct.name}
                      className="max-h-full max-w-full object-contain rounded-lg shadow-lg"
                    />

                    {/* Navigation Buttons */}
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={() => setLightboxIndex((lightboxIndex - 1 + images.length) % images.length)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center font-bold text-lg backdrop-blur-xs transition"
                          title="Previous image"
                        >
                          ‹
                        </button>
                        <button
                          onClick={() => setLightboxIndex((lightboxIndex + 1) % images.length)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center font-bold text-lg backdrop-blur-xs transition"
                          title="Next image"
                        >
                          ›
                        </button>
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Thumbnails strip */}
            {lightboxProduct.images && lightboxProduct.images.length > 1 && (
              <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-center gap-2">
                {lightboxProduct.images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setLightboxIndex(idx)}
                    className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition ${
                      lightboxIndex === idx ? 'border-blue-500 scale-105 ring-2 ring-blue-400/50' : 'border-slate-700 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Customers Panel ──────────────────────────────────────────────────────────

const CustomersPanel: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    code: '', name: '', phone: '', address: '', defaultCurrency: 'NPR' as Currency, notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setCustomers((await api.getCustomers()).customers); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditCustomer(null);
    setForm({ code: '', name: '', phone: '', address: '', defaultCurrency: 'NPR', notes: '' });
    setError(null);
    setShowModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditCustomer(c);
    setForm({ code: c.code, name: c.name, phone: c.phone || '', address: c.address || '', defaultCurrency: c.defaultCurrency, notes: c.notes || '' });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError(null);
    try {
      if (editCustomer) {
        await api.updateCustomer(editCustomer.id, {
          name: form.name, phone: form.phone || undefined,
          address: form.address || undefined, notes: form.notes || undefined,
          defaultCurrency: form.defaultCurrency,
        });
      } else {
        await api.createCustomer({
          code: form.code, name: form.name, phone: form.phone || undefined,
          address: form.address || undefined, defaultCurrency: form.defaultCurrency,
          notes: form.notes || undefined,
        });
      }
      setShowModal(false); await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async (c: Customer) => {
    if (!confirm(`Deactivate customer "${c.name}"?`)) return;
    try { await api.deactivateCustomer(c.id); await load(); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h4 className="font-extrabold text-sm text-slate-900">Customers ({customers.length})</h4>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm">
          + New Customer
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400 text-xs">Loading customers...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Code</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Name</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Phone</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Address</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Currency</th>
                <th className="py-2.5 px-4 text-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">Status</th>
                <th className="py-2.5 px-4 text-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400 text-xs">No customers yet.</td></tr>
              ) : customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-xs text-blue-900">{c.code}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{c.name}</td>
                  <td className="py-3 px-4 text-xs text-slate-600">{c.phone || '—'}</td>
                  <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">{c.address || '—'}</td>
                  <td className="py-3 px-4 text-xs font-bold text-slate-700">{c.defaultCurrency}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200 line-through'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center space-x-2">
                    <button onClick={() => openEdit(c)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg">Edit</button>
                    {c.isActive && <button onClick={() => handleDeactivate(c)} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg">Deactivate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-base text-slate-900">{editCustomer ? 'Edit Customer' : 'Add New Customer'}</h4>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Customer Code *</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. CUST-01" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono" required disabled={!!editCustomer} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Customer or Company Name" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="e.g. +977 984-XXXXXXX" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default Currency</label>
                  <select value={form.defaultCurrency} onChange={e => setForm(f => ({ ...f, defaultCurrency: e.target.value as Currency }))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" disabled={!!editCustomer}>
                    <option value="NPR">NPR</option>
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Address</label>
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Shop/Office Address" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Seasonal buyer, preferred payment by cheque" rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs" />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                  {saving ? 'Saving...' : editCustomer ? 'Update Customer' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Colours Panel ────────────────────────────────────────────────────────────

const ColoursPanel: React.FC = () => {
  const [colours, setColours] = useState<Colour[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editColour, setEditColour] = useState<Colour | null>(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setColours((await api.getColours()).colours); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true); setError(null);
    try { await api.createColour(newName.trim()); setNewName(''); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editColour || !editName.trim()) return;
    setSaving(true); setError(null);
    try {
      await api.updateColour(editColour.id, { name: editName.trim() });
      setEditColour(null);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (c: Colour) => {
    const action = c.isActive ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${action} colour "${c.name}"?`)) return;
    try {
      await api.updateColour(c.id, { isActive: !c.isActive });
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (c: Colour) => {
    if (!confirm(`Permanently delete colour "${c.name}"?\n\nNote: If this colour is already used by existing product variants, it cannot be deleted and should be deactivated instead.`)) return;
    try {
      await api.deleteColour(c.id);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className="font-extrabold text-sm text-slate-900">Colours ({colours.length})</h4>
        <p className="text-xs text-slate-500 mt-0.5">Manage garment colours used in product variants and matrices.</p>
      </div>
      <div className="p-6 space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
        <form onSubmit={handleAdd} className="flex space-x-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New colour name (e.g. Navy Blue, Maroon)"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none"
            required
          />
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition">
            {saving ? 'Adding...' : '+ Add Colour'}
          </button>
        </form>

        {loading ? (
          <div className="py-6 text-center text-slate-400 text-xs">Loading colours...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {colours.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-500 shrink-0 shadow-xs" />
                  <span className={`text-sm font-bold truncate ${c.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{c.name}</span>
                </div>
                <div className="flex items-center space-x-1 shrink-0 ml-2">
                  <button
                    onClick={() => { setEditColour(c); setEditName(c.name); setError(null); }}
                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold rounded-lg transition"
                    title="Edit colour"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleActive(c)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition ${c.isActive ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'}`}
                    title={c.isActive ? 'Deactivate colour' : 'Reactivate colour'}
                  >
                    {c.isActive ? 'Off' : 'On'}
                  </button>
                  <button
                    onClick={() => handleDelete(c)}
                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold rounded-lg transition"
                    title="Delete colour"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Colour Modal */}
      {editColour && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-extrabold text-sm text-slate-900">Edit Colour</h4>
              <button onClick={() => setEditColour(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Colour Name</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Colour name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditColour(null)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


// ─── Sizes Panel ─────────────────────────────────────────────────────────────

const SizesPanel: React.FC = () => {
  const [sizes, setSizes] = useState<Size[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('');
  const [editSize, setEditSize] = useState<Size | null>(null);
  const [editForm, setEditForm] = useState({ name: '', sortOrder: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setSizes((await api.getSizes()).sizes); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSortOrder.trim()) return;
    setSaving(true); setError(null);
    try {
      await api.createSize(newName.trim(), Number(newSortOrder));
      setNewName('');
      setNewSortOrder('');
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSize || !editForm.name.trim()) return;
    setSaving(true); setError(null);
    try {
      await api.updateSize(editSize.id, {
        name: editForm.name.trim(),
        sortOrder: Number(editForm.sortOrder) || 0,
      });
      setEditSize(null);
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (s: Size) => {
    const action = s.isActive ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${action} size "${s.name}"?`)) return;
    try {
      await api.updateSize(s.id, { isActive: !s.isActive });
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (s: Size) => {
    if (!confirm(`Permanently delete size "${s.name}"?\n\nNote: If this size is used by existing product variants, it cannot be deleted and should be deactivated instead.`)) return;
    try {
      await api.deleteSize(s.id);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className="font-extrabold text-sm text-slate-900">Sizes ({sizes.length})</h4>
        <p className="text-xs text-slate-500 mt-0.5">Define size options and their sort order (e.g., S, M, L, XL, XXL).</p>
      </div>
      <div className="p-6 space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
        <form onSubmit={handleAdd} className="flex space-x-3">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Size name (e.g. 3XL, Free Size)"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none"
            required
          />
          <input
            type="number"
            value={newSortOrder}
            onChange={e => setNewSortOrder(e.target.value)}
            placeholder="Sort Order"
            className="w-28 px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none"
            required
          />
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-50 transition">
            {saving ? 'Adding...' : '+ Add Size'}
          </button>
        </form>

        {loading ? (
          <div className="py-6 text-center text-slate-400 text-xs">Loading sizes...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {sizes.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 hover:border-slate-300 transition">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className={`text-sm font-bold truncate ${s.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{s.name}</span>
                  <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">#{s.sortOrder}</span>
                </div>
                <div className="flex items-center space-x-1 shrink-0 ml-2">
                  <button
                    onClick={() => { setEditSize(s); setEditForm({ name: s.name, sortOrder: String(s.sortOrder) }); setError(null); }}
                    className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[11px] font-bold rounded-lg transition"
                    title="Edit size"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleActive(s)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition ${s.isActive ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'}`}
                    title={s.isActive ? 'Deactivate size' : 'Reactivate size'}
                  >
                    {s.isActive ? 'Off' : 'On'}
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold rounded-lg transition"
                    title="Delete size"
                  >
                    Del
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Size Modal */}
      {editSize && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-extrabold text-sm text-slate-900">Edit Size</h4>
              <button onClick={() => setEditSize(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Size Name</label>
                <input
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Size name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Sort Order</label>
                <input
                  type="number"
                  value={editForm.sortOrder}
                  onChange={e => setEditForm(f => ({ ...f, sortOrder: e.target.value }))}
                  placeholder="Sort order number"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditSize(null)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


const VariantsPanel: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [colours, setColours] = useState<Colour[]>([]);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [selectedColours, setSelectedColours] = useState<number[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<number[]>([]);
  const [minStockQty, setMinStockQty] = useState<number>(0);
  const [openingStockQty, setOpeningStockQty] = useState<number>(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ created: number[]; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Variant editing & filtering
  const [variantSearch, setVariantSearch] = useState('');
  const [editVariant, setEditVariant] = useState<ProductVariant | null>(null);
  const [editMinStock, setEditMinStock] = useState('0');
  const [editPrice, setEditPrice] = useState('');

  const loadVariants = async () => {
    if (selectedProductId) {
      const v = await api.getVariants(selectedProductId);
      setVariants(v.variants);
    }
  };

  useEffect(() => {
    Promise.all([api.getProducts(), api.getColours(), api.getSizes()])
      .then(([p, c, s]) => {
        setProducts(p.products.filter(prod => prod.isActive));
        setColours(c.colours.filter(col => col.isActive));
        setSizes(s.sizes.filter(sz => sz.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
        if (p.products.length > 0) setSelectedProductId(p.products[0].id);
      });
  }, []);

  useEffect(() => {
    if (selectedProductId) loadVariants();
  }, [selectedProductId]);

  const toggleColour = (id: number) => setSelectedColours(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  const toggleSize = (id: number) => setSelectedSizes(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const handleGenerate = async () => {
    if (!selectedProductId || selectedColours.length === 0 || selectedSizes.length === 0) return;
    setGenerating(true); setError(null); setResult(null);
    try {
      const r = await api.generateVariants(selectedProductId, selectedColours, selectedSizes, minStockQty || undefined, openingStockQty || undefined);
      setResult(r);
      setSelectedColours([]); setSelectedSizes([]);
      await loadVariants();
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const handleToggleActive = async (variant: ProductVariant) => {
    const action = variant.isActive ? 'Deactivate' : 'Reactivate';
    if (!confirm(`${action} variant "${variant.sku}"?`)) return;
    try {
      await api.updateVariant(variant.id, { isActive: !variant.isActive });
      await loadVariants();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteVariant = async (v: ProductVariant) => {
    if (!confirm(`Permanently delete variant "${v.sku}"?\n\nNote: If this variant has existing orders or recorded stock movements, it cannot be deleted and should be deactivated instead.`)) return;
    try {
      await api.deleteVariant(v.id);
      await loadVariants();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openEditVariant = (v: ProductVariant) => {
    setEditVariant(v);
    setEditMinStock(String(v.minStockQty));
    setEditPrice(v.priceMinor != null ? (v.priceMinor / 100).toFixed(2) : '');
  };

  const handleSaveVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVariant) return;
    const minStock = parseInt(editMinStock, 10);
    const priceMinor = editPrice.trim() === '' ? null : Math.round(parseFloat(editPrice) * 100);
    try {
      await api.updateVariant(editVariant.id, {
        minStockQty: isNaN(minStock) ? 0 : minStock,
        priceMinor,
      });
      setEditVariant(null);
      await loadVariants();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const currentProduct = products.find(p => p.id === selectedProductId);

  const filteredVariants = variants.filter(v => {
    if (!showInactive && !v.isActive) return false;
    const q = variantSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      v.sku.toLowerCase().includes(q) ||
      v.colour.toLowerCase().includes(q) ||
      v.size.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h4 className="font-extrabold text-sm text-slate-900">Generate Variants (Colour × Size Matrix)</h4>
          <p className="text-xs text-slate-500 mt-0.5">Select a product, then tick the colours and sizes to auto-generate all SKU combinations.</p>
        </div>
        <div className="p-6 space-y-5">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
          {result && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold border border-emerald-200">
              Generated {result.created.length} new variant{result.created.length !== 1 ? 's' : ''}
              {openingStockQty > 0 && <> with {openingStockQty} pieces each in stock</>}
              {result.skipped > 0 && <> • {result.skipped} already existed (skipped)</>}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Product</label>
            <select value={selectedProductId ?? ''} onChange={e => setSelectedProductId(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold">
              {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Colours ({colours.length})</div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {colours.map(c => (
                  <label key={c.id} className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer border transition ${selectedColours.includes(c.id) ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={selectedColours.includes(c.id)} onChange={() => toggleColour(c.id)} className="rounded text-blue-600" />
                    <span className="text-xs font-semibold text-slate-800 truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Sizes ({sizes.length})</div>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {sizes.map(s => (
                  <label key={s.id} className={`flex items-center justify-center p-2 rounded-lg cursor-pointer border transition text-sm font-extrabold ${selectedSizes.includes(s.id) ? 'bg-blue-50 border-blue-400 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                    <input type="checkbox" checked={selectedSizes.includes(s.id)} onChange={() => toggleSize(s.id)} className="sr-only" />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Opening Stock per Variant</label>
              <input type="number" min="0" value={openingStockQty === 0 ? '' : openingStockQty} placeholder="0" onChange={e => setOpeningStockQty(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold" />
              <span className="text-[10px] text-slate-500 mt-0.5 block">pieces added to inventory immediately on creation</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Minimum Stock Threshold</label>
              <input type="number" min="0" value={minStockQty === 0 ? '' : minStockQty} placeholder="0" onChange={e => setMinStockQty(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold" />
              <span className="text-[10px] text-slate-500 mt-0.5 block">triggers amber/red alerts when available stock falls below</span>
            </div>
          </div>

          <div className="flex items-center space-x-4 pt-2 border-t border-slate-100">
            <button
              onClick={handleGenerate}
              disabled={generating || !selectedProductId || selectedColours.length === 0 || selectedSizes.length === 0}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50 transition"
            >
              {generating ? 'Generating...' : `Generate ${selectedColours.length * selectedSizes.length} Variants`}
            </button>
            {(selectedColours.length > 0 || selectedSizes.length > 0) && (
              <span className="text-xs text-slate-500">
                {selectedColours.length} colours × {selectedSizes.length} sizes = {selectedColours.length * selectedSizes.length} variants
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Existing Variants List */}
      {selectedProductId && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mt-6">
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3">
            <div>
              <h4 className="font-extrabold text-sm text-slate-900">
                Variants for {currentProduct?.code || 'Product'} ({variants.length})
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {variants.filter(v => v.isActive).length} active • {variants.filter(v => !v.isActive).length} inactive
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="text"
                placeholder="Filter variants..."
                value={variantSearch}
                onChange={e => setVariantSearch(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs w-48 focus:outline-none focus:border-blue-500"
              />
              <label className="flex items-center space-x-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={e => setShowInactive(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span className="text-slate-600 font-semibold">Show inactive</span>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">SKU</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Colour</th>
                  <th className="px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Size</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider">Min Stock</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider">Price Override</th>
                  <th className="px-4 py-2.5 text-center text-[11px] font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVariants.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      {variants.length === 0 ? 'No variants created yet for this product. Use the generator above.' : 'No variants matched the filter.'}
                    </td>
                  </tr>
                ) : (
                  filteredVariants.map(v => (
                    <tr key={v.id} className={`hover:bg-slate-50 transition ${!v.isActive ? 'bg-slate-50/50 opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-xs font-mono font-bold text-slate-900">{v.sku}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{v.colour}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{v.size}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700 text-right">{v.minStockQty} pcs</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-700 text-right">
                        {v.priceMinor != null ? (
                          <span className="font-bold text-blue-700">{formatMoney(v.priceMinor, currentProduct?.defaultCurrency)}</span>
                        ) : (
                          <span className="text-slate-400 italic">Default</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${v.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200 line-through'}`}>
                          {v.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => openEditVariant(v)}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(v)}
                          className={`px-2 py-1 text-xs font-semibold rounded-lg transition ${v.isActive ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'}`}
                        >
                          {v.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          onClick={() => handleDeleteVariant(v)}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Variant Modal */}
      {editVariant && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Edit Variant</h4>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">{editVariant.sku}</p>
              </div>
              <button onClick={() => setEditVariant(null)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveVariant} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Minimum Stock Threshold (pcs)</label>
                <input
                  type="number"
                  min="0"
                  value={editMinStock}
                  onChange={e => setEditMinStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Price Override (Major Units)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  placeholder="Leave empty to use product default"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-600"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Clear this field to fall back to product's default price.
                </span>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setEditVariant(null)} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
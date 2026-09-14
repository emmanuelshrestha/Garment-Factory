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
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-lg text-slate-900">Catalogue Management</h3>
          <p className="text-xs text-slate-500 mt-0.5">Products, customers, colours, and variant matrices.</p>
        </div>
        <div className="flex space-x-1 bg-slate-100 p-1 rounded-xl">
          {(['products', 'customers', 'colours', 'sizes', 'variants'] as CatalogueSubTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
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

// ─── Products Panel ───────────────────────────────────────────────────────────

const ProductsPanel: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    code: '', name: '', category: '', defaultPriceMinor: '', defaultCurrency: 'NPR' as Currency,
  });
  const [priceForm, setPriceForm] = useState({ productId: 0, priceMinor: '', note: '' });
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setProducts((await api.getProducts()).products); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditProduct(null);
    setForm({ code: '', name: '', category: '', defaultPriceMinor: '', defaultCurrency: 'NPR' });
    setError(null);
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditProduct(p);
    setForm({
      code: p.code, name: p.name, category: p.category ?? '',
      defaultPriceMinor: p.defaultPriceMinor != null ? (p.defaultPriceMinor / 100).toFixed(2) : '',
      defaultCurrency: p.defaultCurrency,
    });
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    const priceMinor = form.defaultPriceMinor ? Math.round(parseFloat(form.defaultPriceMinor) * 100) : undefined;
    try {
      if (editProduct) {
        await api.updateProduct(editProduct.id, { name: form.name, category: form.category || undefined });
        if (priceMinor) await api.setProductPrice(editProduct.id, priceMinor);
      } else {
        await api.createProduct({
          code: form.code, name: form.name,
          category: form.category || undefined,
          defaultPriceMinor: priceMinor,
          defaultCurrency: form.defaultCurrency,
        });
      }
      setShowModal(false); await load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async (p: Product) => {
    if (!confirm(`Deactivate product "${p.name}"? This will hide it from new orders.`)) return;
    try { await api.deactivateProduct(p.id); await load(); }
    catch (e: any) { alert(e.message); }
  };

  const handleSetPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    const minor = Math.round(parseFloat(priceForm.priceMinor) * 100);
    try {
      await api.setProductPrice(priceForm.productId, minor, priceForm.note || undefined);
      setShowPriceModal(false); await load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h4 className="font-extrabold text-sm text-slate-900">Products ({products.length})</h4>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm">
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
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Code</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Name</th>
                <th className="py-2.5 px-4 text-[11px] uppercase tracking-wider text-slate-500 font-medium">Category</th>
                <th className="py-2.5 px-4 text-right text-[11px] uppercase tracking-wider text-slate-500 font-medium">Default Price</th>
                <th className="py-2.5 px-4 text-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">Status</th>
                <th className="py-2.5 px-4 text-center text-[11px] uppercase tracking-wider text-slate-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-xs">No products yet. Add your first product.</td></tr>
              ) : products.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-xs text-blue-900">{p.code}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{p.name}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">{p.category || '—'}</td>
                  <td className="py-3 px-4 text-right font-mono text-xs">
                    {p.defaultPriceMinor ? formatMoney(p.defaultPriceMinor, p.defaultCurrency) : '—'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${p.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200 line-through'}`}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center space-x-2">
                    <button onClick={() => openEdit(p)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg">Edit</button>
                    <button onClick={() => { setPriceForm({ productId: p.id, priceMinor: '', note: '' }); setShowPriceModal(true); }} className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">Set Price</button>
                    {p.isActive && <button onClick={() => handleDeactivate(p)} className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded-lg">Deactivate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <h4 className="font-extrabold text-base text-slate-900">{editProduct ? 'Edit Product' : 'Add New Product'}</h4>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700 font-bold">✕</button>
            </div>
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Product Code *</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="e.g. JKT-01" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono font-bold" required disabled={!!editProduct} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Product Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Winter Jacket A" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold" required />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Jackets, Trousers, Shirts" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Default Price (Major Units)</label>
                  <input type="number" step="0.01" min="0" value={form.defaultPriceMinor} onChange={e => setForm(f => ({ ...f, defaultPriceMinor: e.target.value }))} placeholder="e.g. 2500.00" className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Price Currency</label>
                  <select value={form.defaultCurrency} onChange={e => setForm(f => ({ ...f, defaultCurrency: e.target.value as Currency }))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm" disabled={!!editProduct}>
                    <option value="NPR">NPR</option>
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button type="submit" disabled={saving} className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className="font-extrabold text-sm text-slate-900">Colours</h4>
        <p className="text-xs text-slate-500 mt-0.5">Colours are used when generating product variants (Colour × Size matrix).</p>
      </div>
      <div className="p-6 space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
        <form onSubmit={handleAdd} className="flex space-x-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New colour name (e.g. Navy Blue)" className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none" required />
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-50">
            {saving ? 'Adding...' : '+ Add Colour'}
          </button>
        </form>

        {loading ? (
          <div className="py-6 text-center text-slate-400 text-xs">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {colours.map((c) => (
              <div key={c.id} className="flex items-center space-x-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="w-4 h-4 rounded-full bg-slate-400 shrink-0" />
                <span className="text-sm font-semibold text-slate-800">{c.name}</span>
                {!c.isActive && <span className="text-xs text-red-500">(off)</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


// ─── Sizes Panel ─────────────────────────────────────────────────────────────

const SizesPanel: React.FC = () => {
  const [sizes, setSizes] = useState<Size[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('');
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h4 className="font-extrabold text-sm text-slate-900">Sizes</h4>
        <p className="text-xs text-slate-500 mt-0.5">Define size options and their sort order (e.g., 3XL, sort 6).</p>
      </div>
      <div className="p-6 space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs font-semibold">{error}</div>}
        <form onSubmit={handleAdd} className="flex space-x-3">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Size name (e.g. 3XL)" className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none" required />
          <input type="number" value={newSortOrder} onChange={e => setNewSortOrder(e.target.value)} placeholder="Sort Order" className="w-24 px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold focus:border-blue-600 focus:outline-none" required />
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-50">
            {saving ? 'Adding...' : '+ Add Size'}
          </button>
        </form>

        {loading ? (
          <div className="py-6 text-center text-slate-400 text-xs">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sizes.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-sm font-bold text-slate-800">{s.name}</span>
                <span className="text-[10px] font-mono text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">Sort: {s.sortOrder}</span>
              </div>
            ))}
          </div>
        )}
      </div>
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
      await loadVariants(); // Reload the variant list
    } catch (e: any) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const handleDeactivate = async (variantId: number) => {
    try {
      await api.updateVariant(variantId, { isActive: false });
      await loadVariants();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleReactivate = async (variantId: number) => {
    try {
      await api.updateVariant(variantId, { isActive: true });
      await loadVariants();
    } catch (e: any) {
      setError(e.message);
    }
  };

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

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Colours</div>
            <div className="grid grid-cols-2 gap-2">
              {colours.map(c => (
                <label key={c.id} className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer border transition ${selectedColours.includes(c.id) ? 'bg-blue-50 border-blue-400' : 'bg-slate-50 border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={selectedColours.includes(c.id)} onChange={() => toggleColour(c.id)} className="rounded" />
                  <span className="text-xs font-semibold text-slate-800">{c.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Sizes</div>
            <div className="grid grid-cols-3 gap-2">
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
            <input type="number" min="0" value={openingStockQty === 0 ? "" : openingStockQty} placeholder="0" onChange={e => setOpeningStockQty(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold" />
            <span className="text-[10px] text-slate-500 mt-0.5 block">pieces added to inventory on creation</span>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Minimum Stock Threshold</label>
            <input type="number" min="0" value={minStockQty === 0 ? "" : minStockQty} placeholder="0" onChange={e => setMinStockQty(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-semibold" />
            <span className="text-[10px] text-slate-500 mt-0.5 block">triggers amber/red alerts when stock falls below</span>
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
    {selectedProductId && variants.length > 0 && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden mt-6">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h4 className="font-extrabold text-sm text-slate-900">Existing Variants</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {variants.filter(v => v.isActive).length} active variant{variants.filter(v => v.isActive).length !== 1 ? 's' : ''}
              {variants.filter(v => !v.isActive).length > 0 && <> • {variants.filter(v => !v.isActive).length} inactive</>}
            </p>
          </div>
          <label className="flex items-center space-x-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded"
            />
            <span className="text-slate-600 font-semibold">Show inactive</span>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">Colour</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">Size</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider">Min Stock</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {variants
                .filter(v => showInactive || v.isActive)
                .map(v => (
                  <tr key={v.id} className={!v.isActive ? 'bg-slate-50/50 opacity-60' : ''}>
                    <td className="px-4 py-3 text-xs font-mono font-bold text-slate-900">{v.sku}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{v.colour}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{v.size}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">{v.minStockQty} pcs</td>
                    <td className="px-4 py-3">
                      <span className={v.isActive ? 'text-emerald-700 text-xs font-bold' : 'text-slate-500 text-xs font-semibold'}>
                        {v.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v.isActive ? (
                        <button
                          onClick={() => handleDeactivate(v.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-bold transition"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(v.id)}
                          className="text-emerald-600 hover:text-emerald-800 text-xs font-bold transition"
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
    </>
  );
};
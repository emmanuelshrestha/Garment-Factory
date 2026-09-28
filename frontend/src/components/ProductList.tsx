import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type Product, type Currency } from '../api';

export function ProductList() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.getProducts()).products,
  });
  const [editing, setEditing] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const createMut = useMutation({
    mutationFn: api.createProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
  const updateMut = useMutation({
    mutationFn: (data: Product) =>
      api.updateProduct(data.id, {
        name: data.name,
        category: data.category ?? undefined,
        isActive: data.isActive,
        images: data.images,
        displayImage: data.displayImage,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  if (isLoading) return <div className="text-slate-600 dark:text-slate-400 p-4">Loading products...</div>;
  if (error) return <div className="text-red-600 dark:text-red-400 p-4">Error: {String(error)}</div>;

  const handleSubmit = (formData: any) => {
    if (editing) {
      updateMut.mutate({ ...editing, ...formData });
      setEditing(null);
    } else {
      createMut.mutate(formData);
      setIsCreating(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Products</h2>
        <button onClick={() => setIsCreating(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">+ New Product</button>
      </div>

      {isCreating && <ProductForm onSubmit={handleSubmit} onCancel={() => setIsCreating(false)} />}
      {editing && <ProductForm initial={editing} onSubmit={handleSubmit} onCancel={() => setEditing(null)} />}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Default Price</th>
                <th className="py-3 px-4">Active</th>
                <th className="py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data?.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100">{p.code}</td>
                  <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">{p.name}</td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{p.category || '-'}</td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200">{p.defaultPriceMinor} {p.defaultCurrency}</td>
                  <td className="py-3 px-4">{p.isActive ? '✅' : '❌'}</td>
                  <td className="py-3 px-4">
                    <button onClick={() => setEditing(p)} className="text-blue-600 dark:text-blue-400 hover:underline mr-3 font-semibold text-xs">Edit</button>
                    {p.isActive && (
                      <button onClick={() => api.deactivateProduct?.(p.id)} className="text-red-600 dark:text-red-400 hover:underline font-semibold text-xs">Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProductForm({ initial, onSubmit, onCancel }: { initial?: Partial<Product>; onSubmit: (data: any) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    code: initial?.code || '',
    name: initial?.name || '',
    category: initial?.category || '',
    defaultPriceMinor: initial?.defaultPriceMinor ?? 0,
    defaultCurrency: (initial?.defaultCurrency || 'NPR') as Currency,
  });
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === 'defaultPriceMinor' ? parseInt(value) || 0 : value }));
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };
  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input name="code" value={form.code} onChange={handleChange} placeholder="Code" className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500" required />
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500" required />
        <input name="category" value={form.category} onChange={handleChange} placeholder="Category" className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
        <input name="defaultPriceMinor" type="number" value={form.defaultPriceMinor} onChange={handleChange} placeholder="Price (minor units)" className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500" required />
        <select name="defaultCurrency" value={form.defaultCurrency} onChange={handleChange} className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl text-sm focus:outline-none focus:border-blue-500">
          <option value="NPR">NPR</option><option value="INR">INR</option><option value="USD">USD</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold transition">Save</button>
        <button type="button" onClick={onCancel} className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-xl text-sm font-semibold transition">Cancel</button>
      </div>
    </form>
  );
}
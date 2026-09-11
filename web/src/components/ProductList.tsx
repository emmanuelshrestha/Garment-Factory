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
    mutationFn: (data: Product) => api.updateProduct(data.id, { name: data.name, category: data.category ?? undefined, isActive: data.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  if (isLoading) return <div>Loading products...</div>;
  if (error) return <div>Error: {String(error)}</div>;

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
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Products</h2>
        <button onClick={() => setIsCreating(true)} className="bg-blue-600 text-white px-4 py-2 rounded">+ New Product</button>
      </div>

      {isCreating && <ProductForm onSubmit={handleSubmit} onCancel={() => setIsCreating(false)} />}
      {editing && <ProductForm initial={editing} onSubmit={handleSubmit} onCancel={() => setEditing(null)} />}

      <table className="w-full border-collapse">
        <thead><tr className="bg-gray-100"><th>Code</th><th>Name</th><th>Category</th><th>Default Price</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {data?.map(p => (
            <tr key={p.id} className="border-b">
              <td>{p.code}</td>
              <td>{p.name}</td>
              <td>{p.category || '-'}</td>
              <td>{p.defaultPriceMinor} {p.defaultCurrency}</td>
              <td>{p.isActive ? '✅' : '❌'}</td>
              <td>
                <button onClick={() => setEditing(p)} className="text-blue-600 mr-2">Edit</button>
                {p.isActive && (
                  <button onClick={() => api.deactivateProduct?.(p.id)} className="text-red-600">Deactivate</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
    <form onSubmit={handleSubmit} className="bg-gray-50 p-4 mb-4 rounded border">
      <div className="grid grid-cols-2 gap-4">
        <input name="code" value={form.code} onChange={handleChange} placeholder="Code" className="border p-2 rounded" required />
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="border p-2 rounded" required />
        <input name="category" value={form.category} onChange={handleChange} placeholder="Category" className="border p-2 rounded" />
        <input name="defaultPriceMinor" type="number" value={form.defaultPriceMinor} onChange={handleChange} placeholder="Price (minor units)" className="border p-2 rounded" required />
        <select name="defaultCurrency" value={form.defaultCurrency} onChange={handleChange} className="border p-2 rounded">
          <option value="NPR">NPR</option><option value="INR">INR</option><option value="USD">USD</option>
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
        <button type="button" onClick={onCancel} className="bg-gray-300 px-4 py-2 rounded">Cancel</button>
      </div>
    </form>
  );
}
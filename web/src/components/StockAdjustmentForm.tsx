import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export function StockAdjustmentForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    variantId: 0,
    qtyDelta: 0,
    reasonCode: 'adjustment_in',
    note: '',
  });

  const mutate = useMutation({
    mutationFn: api.createStockAdjustment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      alert('Adjustment applied');
      setForm({ variantId: 0, qtyDelta: 0, reasonCode: 'adjustment_in', note: '' });
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'qtyDelta' ? parseInt(value) || 0 : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.qtyDelta === 0) return alert('Quantity delta cannot be zero');
    mutate.mutate({
      reasonCode: form.reasonCode,
      note: form.note,
      lines: [{ variantId: form.variantId, qtyDelta: form.qtyDelta }],
    });
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Stock Adjustment</h2>
      <form onSubmit={handleSubmit} className="bg-gray-50 p-4 rounded border space-y-3 max-w-md">
        <div>
          <label className="block font-medium">Variant ID</label>
          <input name="variantId" type="number" value={form.variantId} onChange={handleChange} className="border p-2 rounded w-full" required />
        </div>
        <div>
          <label className="block font-medium">Quantity delta (positive = add, negative = remove)</label>
          <input name="qtyDelta" type="number" value={form.qtyDelta} onChange={handleChange} className="border p-2 rounded w-full" required />
        </div>
        <div>
          <label className="block font-medium">Reason</label>
          <select name="reasonCode" value={form.reasonCode} onChange={handleChange} className="border p-2 rounded w-full">
            <option value="opening_balance">Opening Balance</option>
            <option value="adjustment_in">Adjustment In</option>
            <option value="adjustment_out">Adjustment Out</option>
            <option value="return_in">Return In</option>
          </select>
        </div>
        <div>
          <label className="block font-medium">Note</label>
          <textarea name="note" value={form.note} onChange={handleChange} className="border p-2 rounded w-full" required />
        </div>
        <button type="submit" disabled={mutate.isPending} className="bg-blue-600 text-white px-4 py-2 rounded">
          {mutate.isPending ? 'Processing...' : 'Apply Adjustment'}
        </button>
      </form>
    </div>
  );
}
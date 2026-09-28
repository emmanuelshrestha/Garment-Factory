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
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Stock Adjustment</h2>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 max-w-md">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Variant ID</label>
          <input name="variantId" type="number" value={form.variantId} onChange={handleChange} className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-blue-500" required />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Quantity delta (positive = add, negative = remove)</label>
          <input name="qtyDelta" type="number" value={form.qtyDelta} onChange={handleChange} className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-blue-500" required />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Reason</label>
          <select name="reasonCode" value={form.reasonCode} onChange={handleChange} className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-blue-500">
            <option value="opening_balance">Opening Balance</option>
            <option value="adjustment_in">Adjustment In</option>
            <option value="adjustment_out">Adjustment Out</option>
            <option value="return_in">Return In</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Note</label>
          <textarea name="note" value={form.note} onChange={handleChange} className="border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 p-2.5 rounded-xl w-full text-sm focus:outline-none focus:border-blue-500" required />
        </div>
        <button type="submit" disabled={mutate.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 shadow-xs">
          {mutate.isPending ? 'Processing...' : 'Apply Adjustment'}
        </button>
      </form>
    </div>
  );
}
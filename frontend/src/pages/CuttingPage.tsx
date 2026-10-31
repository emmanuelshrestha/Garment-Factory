import React, { useState, useEffect } from 'react';
import { cuttingApi, CuttingRecord } from '../api';
import { Scissors } from 'lucide-react';

export function CuttingPage() {
  const [records, setRecords] = useState<CuttingRecord[]>([]);

  useEffect(() => {
    cuttingApi.list({}).then(r => setRecords(r.records)).catch(console.error);
  }, []);

  return (
    <div className="p-4 bg-slate-950 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-6">Cutting Log</h1>
      <div className="space-y-4">
        {records.map(record => (
          <div key={record.id} className="p-4 bg-slate-900 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">{record.productName} - {record.size}</h2>
              <span className="text-blue-400 font-bold">{record.quantity} units</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">{record.cutDate} · Recorded by {record.recordedByName}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

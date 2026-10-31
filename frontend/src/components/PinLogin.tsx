import { useState } from 'react';
import { staffApi } from '../api.ts';

export function PinLogin() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitPin = async (candidate: string) => {
    setBusy(true);
    setError('');
    try {
      // The server returns { staff: { id, name, role } }, but a login
      // response is a boundary we do not control: read it defensively so a
      // shape change shows an error instead of crashing the page.
      const res = (await staffApi.loginWithPin(candidate)) as unknown as {
        staff?: { role?: string };
        user?: { role?: string };
        role?: string;
      };
      const role = res?.staff?.role ?? res?.user?.role ?? res?.role ?? 'staff';
      window.location.assign(role === 'owner' ? '/' : '/floor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid PIN');
      setPin('');
      setBusy(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (busy || pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) void submitPin(next);
  };

  return (
    <div className="flex flex-col items-center justify-center p-2">
      <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        Enter your PIN
      </p>
      <div className="mb-6 flex h-10 items-center gap-2 font-mono text-3xl tracking-widest text-blue-600 dark:text-blue-400">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={
              'flex h-9 w-7 items-center justify-center rounded-lg border ' +
              (pin.length > i
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60'
                : i < 4
                  ? 'border-slate-300 dark:border-slate-700'
                  : 'border-dashed border-slate-200 dark:border-slate-800')
            }
          >
            {pin.length > i ? '●' : ''}
          </span>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            type="button"
            disabled={busy}
            onClick={() => handleDigit(String(d))}
            className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-black text-slate-900 transition active:scale-95 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => setPin(pin.slice(0, -1))}
          aria-label="Backspace"
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-200 text-lg font-black text-slate-700 transition active:scale-95 hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200"
        >
          ⌫
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => handleDigit('0')}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-2xl font-black text-slate-900 transition active:scale-95 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          0
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setPin('');
            setError('');
          }}
          className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 text-xs font-black text-red-700 transition active:scale-95 hover:bg-red-200 disabled:opacity-50 dark:bg-red-950/60 dark:text-red-300"
        >
          CLR
        </button>
      </div>

      <p className="mt-5 text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500">
        {busy ? 'Checking PIN…' : 'Ask your owner for a PIN'}
      </p>
    </div>
  );
}

import { useState } from 'react';
import { api } from '../api.ts';
import { ThemeToggle } from './ThemeToggle.tsx';
import { PinLogin } from './PinLogin.tsx';

interface LoginPageProps {
  onLogin: (user: { id: number; username: string; fullName: string }) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTenantField, setShowTenantField] = useState(false);
  const [mode, setMode] = useState<'staff' | 'owner'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'owner' : 'staff',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      localStorage.setItem('tenantSlug', tenantSlug.trim());
      const response = await api.login(username, password);

      if (response.user) {
        onLogin(response.user);
      } else {
        setError('Invalid username or password');
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    alert('Please contact the system administrator to reset your password.');
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-center bg-slate-100 py-12 transition-colors duration-150 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="compact" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-black text-white shadow-lg dark:bg-blue-500">
            🏭
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Garment Factory OS
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Production-grade factory management system
          </p>
        </div>

        <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
          {/* Mode toggle */}
          <div className="mb-5 flex rounded-2xl border border-slate-200 bg-slate-200 p-1 dark:border-slate-800 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode('staff')}
              aria-pressed={mode === 'staff'}
              className={
                'min-h-[48px] flex-1 rounded-xl text-sm font-bold transition ' +
                (mode === 'staff'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400')
              }
            >
              👷 Floor Staff PIN
            </button>
            <button
              type="button"
              onClick={() => setMode('owner')}
              aria-pressed={mode === 'owner'}
              className={
                'min-h-[48px] flex-1 rounded-xl text-sm font-bold transition ' +
                (mode === 'owner'
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400')
              }
            >
              👔 Owner / Management
            </button>
          </div>

          {mode === 'staff' ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <PinLogin />
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 shadow-xl dark:border-slate-800 dark:bg-slate-900 sm:px-10">
              {error && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-400">
                  {error}
                </div>
              )}

              <form className="space-y-5" onSubmit={handleSubmit}>
                {showTenantField ? (
                  <div>
                    <label
                      htmlFor="tenantSlug"
                      className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300"
                    >
                      Factory ID / Subdomain
                    </label>
                    <input
                      id="tenantSlug"
                      type="text"
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      className="block min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      placeholder="e.g. acme for acme.yourdomain.com"
                      autoComplete="organization"
                    />
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Your factory&apos;s unique identifier
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => setShowTenantField(true)}
                      className="min-h-[48px] text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      ↪ Logging into a specific factory? Enter factory ID
                    </button>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="username"
                    className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="block min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="Enter your username"
                    autoComplete="username"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </div>

                <div className="text-xs">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="min-h-[48px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Forgot your password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>

                <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                  No account? Contact system administrator
                </p>
              </form>
            </div>
          )}

          <div className="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
            <p>© {new Date().getFullYear()} Garment Factory OS</p>
            <p className="mt-0.5 font-mono text-[10px]">Node.js 22 • React 19 • SQLite</p>
          </div>
        </div>
      </div>
    </div>
  );
}

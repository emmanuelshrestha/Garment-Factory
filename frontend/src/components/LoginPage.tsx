import { useState } from 'react';
import { api } from '../api.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

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
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors duration-150 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle variant="compact" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 dark:bg-blue-500 text-white font-black text-2xl shadow-lg mb-3">
            🏭
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Garment Factory OS</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Production-grade factory management system
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white dark:bg-slate-900 py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-200 dark:border-slate-800">
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 px-4 py-3 rounded-xl text-sm font-semibold">
                {error}
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {showTenantField ? (
                <div>
                  <label htmlFor="tenantSlug" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Factory ID / Subdomain
                  </label>
                  <input
                    id="tenantSlug"
                    type="text"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
                    placeholder="e.g., 'acme' for acme.yourdomain.com"
                    autoComplete="organization"
                  />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Your factory's unique identifier
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowTenantField(true)}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    ↪ Logging into a specific factory? Enter factory ID
                  </button>
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="Enter your username"
                  autoComplete="username"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Forgot your password?
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>

              <div className="text-center text-xs text-slate-500 dark:text-slate-400">
                <p>No account? Contact system administrator</p>
              </div>
            </form>

            <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs text-slate-400 dark:text-slate-500 text-center">
              <p>© {new Date().getFullYear()} Garment Factory OS</p>
              <p className="mt-0.5 font-mono text-[10px]">Node.js 22 • React 19 • SQLite</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
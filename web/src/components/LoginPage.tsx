import { useState } from 'react';
import { api } from '../api.ts';

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
      // Multi-tenant: always overwrite stored slug. Empty string clears a
      // stale value from a previous session, so logging in without a factory
      // ID always targets the platform's own database.
      localStorage.setItem('tenantSlug', tenantSlug.trim());

      const response = await api.login(username, password);
      
      if (response.user) {
        // App.tsx re-renders the authenticated view automatically
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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🏭</h1>
          <h2 className="text-3xl font-bold text-gray-900">Garment Factory OS</h2>
          <p className="mt-2 text-sm text-gray-600">
            Production-grade factory management system
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
              {showTenantField ? (
                <div>
                  <label htmlFor="tenantSlug" className="block text-sm font-medium text-gray-700">
                    Factory ID / Subdomain
                  </label>
                  <div className="mt-1">
                    <input
                      id="tenantSlug"
                      type="text"
                      value={tenantSlug}
                      onChange={(e) => setTenantSlug(e.target.value)}
                      className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="e.g., 'acme' for acme.yourdomain.com"
                      autoComplete="organization"
                    />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Your factory's unique identifier
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowTenantField(true)}
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    ↪ Logging into a specific factory? Enter factory ID
                  </button>
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                  Username
                </label>
                <div className="mt-1">
                  <input
                    id="username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter your username"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="mt-1">
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="font-medium text-blue-600 hover:text-blue-500"
                  >
                    Forgot your password?
                  </button>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>

              <div className="text-center text-sm text-gray-500">
                <p>No account? Contact system administrator</p>
              </div>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">System Information</span>
                </div>
              </div>
              <div className="mt-4 text-xs text-gray-500 text-center">
                <p>© {new Date().getFullYear()} Garment Factory OS</p>
                <p>Version 1.0.0</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
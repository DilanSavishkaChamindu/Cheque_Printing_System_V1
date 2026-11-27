import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Landmark, LockKeyhole, Shield } from 'lucide-react';
import { authService } from '../../services/authService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { authStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';

export function TenantLoginPage() {
  const navigate = useNavigate();
  const [tenantCode, setTenantCode] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await authService.loginTenant({
        tenantCode: tenantCode.trim() || undefined,
        identifier: identifier.trim(),
        password,
      });
      authStore.setTenantSession(response.tokens, response.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Unable to sign in.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-7 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-emerald-400">
            <Landmark className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Organization Sign In
            </h1>
            <p className="text-xs text-slate-500">
              ChequePrint Multi-Tenant SaaS Workspace
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="tenantCode"
              className="block text-xs font-medium text-slate-700"
            >
              Organization Code <span className="text-slate-400">(optional if email unique)</span>
            </label>
            <input
              id="tenantCode"
              type="text"
              value={tenantCode}
              onChange={(e) => setTenantCode(e.target.value)}
              placeholder="e.g. ABC_TRADING"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="identifier"
              className="block text-xs font-medium text-slate-700"
            >
              Email or Username
            </label>
            <input
              id="identifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="user@company.com"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-700"
              >
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            <LockKeyhole className="h-4 w-4" />
            <span>{submitting ? 'Signing in...' : 'Sign In to Organization'}</span>
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-500">
          <Link to="/system-status" className="hover:text-slate-900">
            System Status
          </Link>
          <Link
            to="/platform/login"
            className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-950"
          >
            <Shield className="h-3.5 w-3.5 text-emerald-600" />
            <span>Platform Admin Portal</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

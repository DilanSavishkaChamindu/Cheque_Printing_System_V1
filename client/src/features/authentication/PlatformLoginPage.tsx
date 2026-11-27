import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { authService } from '../../services/authService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { authStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';

export function PlatformLoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await authService.loginPlatform({
        identifier: identifier.trim(),
        password,
      });
      authStore.setPlatformSession(response.tokens, response.admin);
      navigate('/platform', { replace: true });
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Unable to authenticate platform administrator.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-7 text-slate-100 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">
              Platform Administration
            </h1>
            <p className="text-xs text-slate-400">
              SaaS Owner Control Plane — Isolated Portal
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3.5 py-2.5 text-xs text-rose-200">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="platformIdentifier"
              className="block text-xs font-medium text-slate-300"
            >
              Administrator Email or Username
            </label>
            <input
              id="platformIdentifier"
              type="text"
              required
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="platformPassword"
              className="block text-xs font-medium text-slate-300"
            >
              Password
            </label>
            <input
              id="platformPassword"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
          >
            {submitting ? 'Authenticating...' : 'Sign In as Platform Admin'}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-4 text-center text-xs text-slate-400">
          <Link to="/login" className="hover:text-white">
            Switch to Organization User Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

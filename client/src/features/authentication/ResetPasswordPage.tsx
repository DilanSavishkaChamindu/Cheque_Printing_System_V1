import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { authService } from '../../services/authService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { Button } from '../../components/ui/Button';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.resetPassword({ token: token.trim(), newPassword });
      setDone(true);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-white p-7 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-emerald-400">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-900">Complete Password Reset</h1>
            <p className="text-xs text-slate-500">Tokens expire quickly and can only be used once</p>
          </div>
        </div>

        {done ? (
          <div className="mt-6 space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="text-sm font-medium text-slate-900">
              Your password has been updated and prior sessions were revoked.
            </p>
            <Link to="/login" className="block">
              <Button className="w-full">Sign In with New Password</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700">Reset Token</label>
              <input
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars, upper, lower, digit"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating Password...' : 'Reset Password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

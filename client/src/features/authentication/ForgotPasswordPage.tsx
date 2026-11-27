import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { authService } from '../../services/authService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { Button } from '../../components/ui/Button';

export function ForgotPasswordPage() {
  const [tenantCode, setTenantCode] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.forgotPassword({
        actorType: 'TENANT_USER',
        tenantCode: tenantCode.trim() || undefined,
        email: email.trim(),
      });
      setSubmitted(true);
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
            <h1 className="text-base font-semibold text-slate-900">Reset Password</h1>
            <p className="text-xs text-slate-500">Request a short-lived one-time reset token</p>
          </div>
        </div>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs leading-relaxed text-emerald-800">
              If an active account matches your request, a password reset token has been generated.
            </div>
            <Link to="/reset-password" className="block">
              <Button className="w-full">Enter Reset Token</Button>
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
              <label className="block text-xs font-medium text-slate-700">
                Organization Code (optional)
              </label>
              <input
                type="text"
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Submitting...' : 'Request Reset Token'}
            </Button>
          </form>
        )}

        <div className="mt-5 text-center text-xs">
          <Link to="/login" className="text-slate-600 hover:text-slate-900">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

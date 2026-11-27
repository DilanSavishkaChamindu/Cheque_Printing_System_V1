import { useState, type FormEvent } from 'react';
import { authService } from '../../services/authService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { authStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function SecuritySettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated successfully. Other active sessions have been revoked.');
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    await authService.logoutAllTenant();
    await authStore.clearSession();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Account Security</h1>
        <p className="mt-1 text-sm text-slate-600">
          Update your password and manage active sessions across devices.
        </p>
      </div>

      <Card title="Change Password">
        <form onSubmit={handleChangePassword} className="space-y-4">
          {message && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-700">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Confirm New Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </Card>

      <Card
        title="Session Revocation"
        subtitle="Sign out from all browsers and registered offline sessions."
      >
        <Button variant="danger" onClick={() => void handleLogoutAll()}>
          Revoke All Active Sessions
        </Button>
      </Card>
    </div>
  );
}

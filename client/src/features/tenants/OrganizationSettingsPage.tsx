import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SUPPORTED_CURRENCIES } from '@cheque-saas/shared';
import { platformService } from '../../services/platformService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['tenant-current-profile'],
    queryFn: () => platformService.getCurrentTenantProfile(),
  });

  const [organizationName, setOrganizationName] = useState('');
  const [registeredBusinessName, setRegisteredBusinessName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('LKR');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [offlineMaxSessionHours, setOfflineMaxSessionHours] = useState(24);
  const [requireDeviceApproval, setRequireDeviceApproval] = useState(true);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    const p = profileQuery.data;
    if (p) {
      setOrganizationName(p.organizationName);
      setRegisteredBusinessName(p.registeredBusinessName ?? '');
      setContactPerson(p.contactPerson);
      setEmail(p.email);
      setContactNumber(p.contactNumber ?? '');
      setAddress(p.address ?? '');
      setCountry(p.country);
      setDefaultCurrency(p.settings?.defaultCurrency ?? 'LKR');
      setDateFormat(p.settings?.dateFormat ?? 'DD/MM/YYYY');
      setOfflineMaxSessionHours(p.settings?.offlineMaxSessionHours ?? 24);
      setRequireDeviceApproval(p.settings?.requireDeviceApproval ?? true);
    }
  }, [profileQuery.data]);

  const mutation = useMutation({
    mutationFn: () =>
      platformService.updateCurrentTenantProfile({
        organizationName,
        registeredBusinessName: registeredBusinessName || null,
        contactPerson,
        email,
        contactNumber: contactNumber || null,
        address: address || null,
        country,
        settings: {
          defaultCurrency,
          dateFormat,
          offlineMaxSessionHours,
          requireDeviceApproval,
        },
      }),
    onSuccess: async () => {
      setSavedMsg('Organization settings saved.');
      await queryClient.invalidateQueries({ queryKey: ['tenant-current-profile'] });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSavedMsg(null);
    mutation.mutate();
  };

  if (profileQuery.isLoading) {
    return <p className="text-sm text-slate-600">Loading organization profile...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Organization Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage your organization profile, default cheque formatting, and offline security policy.
        </p>
      </div>

      <Card title={`Organization (${profileQuery.data?.tenantCode ?? ''})`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {savedMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {savedMsg}
            </div>
          )}
          {mutation.isError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {extractApiErrorMessage(mutation.error)}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">Organization Name</label>
              <input
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Registered Business Name
              </label>
              <input
                type="text"
                value={registeredBusinessName}
                onChange={(e) => setRegisteredBusinessName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Contact Person</label>
              <input
                type="text"
                required
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Contact Number</label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Country</label>
              <input
                type="text"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Default Currency</label>
              <select
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Cheque Date Format</label>
              <select
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="DDMMYYYY">DDMMYYYY</option>
                <option value="DD MMM YYYY">DD MMM YYYY</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Offline Session Expiry (hrs)
              </label>
              <input
                type="number"
                min={1}
                max={720}
                value={offlineMaxSessionHours}
                onChange={(e) => setOfflineMaxSessionHours(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={requireDeviceApproval}
              onChange={(e) => setRequireDeviceApproval(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Require administrator approval for new offline devices</span>
          </label>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

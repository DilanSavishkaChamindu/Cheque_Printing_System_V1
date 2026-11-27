import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { INITIAL_FEATURE_CATALOG, SUPPORTED_CURRENCIES } from '@cheque-saas/shared';
import { platformService } from '../../services/platformService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function CreateTenantPage() {
  const navigate = useNavigate();
  const [tenantCode, setTenantCode] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [registeredBusinessName, setRegisteredBusinessName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [country, setCountry] = useState('Sri Lanka');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [defaultCurrency, setDefaultCurrency] = useState('LKR');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(
    INITIAL_FEATURE_CATALOG.filter((f) => f.isDefaultEnabled).map((f) => f.key)
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleFeature = (key: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const created = await platformService.createTenant({
        tenantCode: tenantCode.trim().toUpperCase(),
        organizationName: organizationName.trim(),
        registeredBusinessName: registeredBusinessName.trim() || null,
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        contactNumber: contactNumber.trim() || null,
        country: country.trim(),
        registrationNumber: registrationNumber.trim() || null,
        status: 'ACTIVE',
        defaultCurrency,
        clientAdmin: {
          firstName: adminFirstName.trim(),
          lastName: adminLastName.trim(),
          email: adminEmail.trim(),
          username: adminUsername.trim(),
          password: adminPassword,
        },
        enabledFeatureKeys: selectedFeatures,
      });

      navigate(`/platform/tenants/${created.id}`);
    } catch (err) {
      setError(extractApiErrorMessage(err, 'Failed to register tenant.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Register Client Organization</h1>
        <p className="mt-1 text-sm text-slate-600">
          Provision an isolated tenant, default company context, initial Client Administrator, and enabled modules.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            {error}
          </div>
        )}

        <Card title="1. Organization Profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">Tenant Code *</label>
              <input
                type="text"
                required
                value={tenantCode}
                onChange={(e) => setTenantCode(e.target.value)}
                placeholder="ABC_TRADING"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Organization Name *</label>
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
              <label className="block text-xs font-medium text-slate-700">Registration Number</label>
              <input
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Contact Person *</label>
              <input
                type="text"
                required
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Organization Email *</label>
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
              <label className="block text-xs font-medium text-slate-700">Country *</label>
              <input
                type="text"
                required
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
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
          </div>
        </Card>

        <Card title="2. Initial Client Administrator">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">First Name *</label>
              <input
                type="text"
                required
                value={adminFirstName}
                onChange={(e) => setAdminFirstName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Last Name *</label>
              <input
                type="text"
                required
                value={adminLastName}
                onChange={(e) => setAdminLastName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Admin Email *</label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Admin Username *</label>
              <input
                type="text"
                required
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Initial Password *</label>
              <input
                type="password"
                required
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Min 8 chars, uppercase, lowercase, digit"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </Card>

        <Card title="3. Initial Feature Entitlements">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INITIAL_FEATURE_CATALOG.map((feature) => (
              <label
                key={feature.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(feature.key)}
                  onChange={() => toggleFeature(feature.key)}
                  className="mt-0.5 rounded border-slate-300"
                />
                <div>
                  <p className="text-xs font-semibold text-slate-900">{feature.name}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{feature.category}</p>
                </div>
              </label>
            ))}
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => navigate('/platform/tenants')}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Provisioning Tenant...' : 'Create Tenant'}
          </Button>
        </div>
      </form>
    </div>
  );
}

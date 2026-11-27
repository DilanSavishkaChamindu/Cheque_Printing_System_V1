import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { PERMISSION_CODES } from '@cheque-saas/shared';
import {
  organizationService,
  type CompanyDto,
} from '../../services/organizationService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function CompaniesPage() {
  const queryClient = useQueryClient();
  const { tenantUser } = useAuthStore();
  const canManage = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.COMPANY_MANAGE)
  );

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<CompanyDto | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [companyCode, setCompanyCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [registeredBusinessName, setRegisteredBusinessName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Sri Lanka');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['companies', page, search, statusFilter],
    queryFn: () =>
      organizationService.listCompanies({
        page,
        limit: 15,
        search,
        status: statusFilter,
      }),
  });

  const openCreate = () => {
    setEditing(null);
    setCompanyCode('');
    setCompanyName('');
    setRegisteredBusinessName('');
    setRegistrationNumber('');
    setCity('');
    setCountry('Sri Lanka');
    setEmail('');
    setContactNumber('');
    setAddress('');
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (company: CompanyDto) => {
    setEditing(company);
    setCompanyCode(company.companyCode);
    setCompanyName(company.companyName);
    setRegisteredBusinessName(company.registeredBusinessName ?? '');
    setRegistrationNumber(company.registrationNumber ?? '');
    setCity(company.city ?? '');
    setCountry(company.country ?? '');
    setEmail(company.email ?? '');
    setContactNumber(company.contactNumber ?? '');
    setAddress(company.address ?? '');
    setFormError(null);
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (editing) {
        return organizationService.updateCompany(editing.id, {
          companyName: companyName.trim(),
          registeredBusinessName: registeredBusinessName.trim() || null,
          registrationNumber: registrationNumber.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          email: email.trim() || null,
          contactNumber: contactNumber.trim() || null,
          address: address.trim() || null,
        });
      }
      return organizationService.createCompany({
        companyCode: companyCode.trim().toUpperCase(),
        companyName: companyName.trim(),
        registeredBusinessName: registeredBusinessName.trim() || null,
        registrationNumber: registrationNumber.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        email: email.trim() || null,
        contactNumber: contactNumber.trim() || null,
        address: address.trim() || null,
      });
    },
    onSuccess: async () => {
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (err) => setFormError(extractApiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      organizationService.updateCompanyStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    saveMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Companies</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage business companies operated within your organization.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span>Add Company</span>
          </Button>
        )}
      </div>

      {showForm && canManage && (
        <Card title={editing ? `Edit Company (${editing.companyCode})` : 'New Company'}>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {!editing && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Company Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
                    placeholder="TRADING"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                  />
                </div>
              )}
              <div className={editing ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-medium text-slate-700">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
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
                <label className="block text-xs font-medium text-slate-700">
                  Registration Number
                </label>
                <input
                  type="text"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Contact Number
                </label>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-700">Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : 'Save Company'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-60">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search companies..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 pr-3 font-medium">Code</th>
                <th className="py-2.5 pr-3 font-medium">Company Name</th>
                <th className="py-2.5 pr-3 font-medium">Location</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                {canManage && <th className="py-2.5 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data?.items.map((company) => (
                <tr key={company.id}>
                  <td className="py-3 pr-3 font-mono font-medium text-slate-800">
                    {company.companyCode}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{company.companyName}</span>
                      {company.isDefault && <Badge variant="info">Default</Badge>}
                    </div>
                    {company.registrationNumber && (
                      <p className="text-[11px] text-slate-400">
                        Reg: {company.registrationNumber}
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-slate-600">
                    {[company.city, company.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 pr-3">
                    <Badge variant={company.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {company.status}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="py-3 text-right space-x-3">
                      <button
                        type="button"
                        onClick={() => openEdit(company)}
                        className="font-medium text-slate-700 hover:text-slate-950"
                      >
                        Edit
                      </button>
                      {!company.isDefault && (
                        <button
                          type="button"
                          onClick={() =>
                            statusMutation.mutate({
                              id: company.id,
                              status: company.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                            })
                          }
                          className="font-medium text-emerald-700 hover:text-emerald-900"
                        >
                          {company.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={query.data?.pagination}
          onPageChange={(p) => setPage(p)}
        />
      </Card>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { PERMISSION_CODES } from '@cheque-saas/shared';
import { organizationService } from '../../services/organizationService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function BanksPage() {
  const queryClient = useQueryClient();
  const { tenantUser } = useAuthStore();
  const canManage = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.BANK_MANAGE)
  );

  const [tab, setTab] = useState<'banks' | 'branches'>('banks');
  const [bankPage, setBankPage] = useState(1);
  const [branchPage, setBranchPage] = useState(1);
  const [bankSearch, setBankSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [selectedBankFilter, setSelectedBankFilter] = useState('');

  // Bank creation form
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCountry, setBankCountry] = useState('Sri Lanka');
  const [bankError, setBankError] = useState<string | null>(null);

  // Branch creation form
  const [branchBankId, setBranchBankId] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchCity, setBranchCity] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchError, setBranchError] = useState<string | null>(null);

  const banksQuery = useQuery({
    queryKey: ['banks', bankPage, bankSearch],
    queryFn: () =>
      organizationService.listBanks({ page: bankPage, limit: 15, search: bankSearch }),
  });

  const branchesQuery = useQuery({
    queryKey: ['bank-branches', branchPage, selectedBankFilter, branchSearch],
    queryFn: () =>
      organizationService.listBranches({
        page: branchPage,
        limit: 15,
        bankId: selectedBankFilter,
        search: branchSearch,
      }),
    enabled: tab === 'branches',
  });

  const createBankMutation = useMutation({
    mutationFn: () =>
      organizationService.createBank({
        bankCode: bankCode.trim().toUpperCase(),
        bankName: bankName.trim(),
        country: bankCountry.trim(),
      }),
    onSuccess: async () => {
      setBankCode('');
      setBankName('');
      setBankError(null);
      await queryClient.invalidateQueries({ queryKey: ['banks'] });
    },
    onError: (err) => setBankError(extractApiErrorMessage(err)),
  });

  const bankStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: 'ACTIVE' | 'INACTIVE' }) =>
      organizationService.updateBankStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['banks'] });
    },
  });

  const createBranchMutation = useMutation({
    mutationFn: () =>
      organizationService.createBranch({
        bankId: branchBankId,
        branchCode: branchCode.trim().toUpperCase(),
        branchName: branchName.trim(),
        city: branchCity.trim() || null,
        address: branchAddress.trim() || null,
      }),
    onSuccess: async () => {
      setBranchCode('');
      setBranchName('');
      setBranchCity('');
      setBranchAddress('');
      setBranchError(null);
      await queryClient.invalidateQueries({ queryKey: ['bank-branches'] });
    },
    onError: (err) => setBranchError(extractApiErrorMessage(err)),
  });

  const handleCreateBank = (e: FormEvent) => {
    e.preventDefault();
    createBankMutation.mutate();
  };

  const handleCreateBranch = (e: FormEvent) => {
    e.preventDefault();
    createBranchMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Banks & Branches</h1>
        <p className="mt-1 text-sm text-slate-600">
          Shared platform bank references and organization-specific custom banks & branches.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('banks')}
          className={`border-b-2 px-4 py-2 text-xs font-semibold ${
            tab === 'banks'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500'
          }`}
        >
          Banks
        </button>
        <button
          type="button"
          onClick={() => setTab('branches')}
          className={`border-b-2 px-4 py-2 text-xs font-semibold ${
            tab === 'branches'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500'
          }`}
        >
          Bank Branches
        </button>
      </div>

      {tab === 'banks' && (
        <div className="space-y-5">
          {canManage && (
            <Card title="Add Custom Organization Bank">
              <form onSubmit={handleCreateBank} className="grid gap-3 sm:grid-cols-4">
                <input
                  type="text"
                  required
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  placeholder="Bank Code (e.g. HSBC)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs uppercase"
                />
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank Name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  value={bankCountry}
                  onChange={(e) => setBankCountry(e.target.value)}
                  placeholder="Country"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <Button type="submit" disabled={createBankMutation.isPending}>
                  <Plus className="h-4 w-4" />
                  <span>Create Bank</span>
                </Button>
              </form>
              {bankError && <p className="mt-2 text-xs text-rose-600">{bankError}</p>}
            </Card>
          )}

          <Card>
            <div className="mb-4 relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={bankSearch}
                onChange={(e) => {
                  setBankSearch(e.target.value);
                  setBankPage(1);
                }}
                placeholder="Search banks by code or name..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-3 font-medium">Code</th>
                    <th className="py-2.5 pr-3 font-medium">Bank Name</th>
                    <th className="py-2.5 pr-3 font-medium">Country</th>
                    <th className="py-2.5 pr-3 font-medium">Scope</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    {canManage && <th className="py-2.5 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {banksQuery.data?.items.map((bank) => (
                    <tr key={bank.id}>
                      <td className="py-3 pr-3 font-mono font-medium text-slate-800">
                        {bank.bankCode}
                      </td>
                      <td className="py-3 pr-3 font-medium text-slate-900">{bank.bankName}</td>
                      <td className="py-3 pr-3 text-slate-600">{bank.country}</td>
                      <td className="py-3 pr-3">
                        <Badge variant={bank.isSystemShared ? 'info' : 'neutral'}>
                          {bank.isSystemShared ? 'System Shared' : 'Organization'}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge variant={bank.status === 'ACTIVE' ? 'success' : 'danger'}>
                          {bank.status}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="py-3 text-right">
                          {bank.isSystemShared ? (
                            <span className="text-slate-400">Read-only</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                bankStatusMutation.mutate({
                                  id: bank.id,
                                  status: bank.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                                })
                              }
                              className="font-medium text-emerald-700 hover:text-emerald-900"
                            >
                              {bank.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
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
              pagination={banksQuery.data?.pagination}
              onPageChange={(p) => setBankPage(p)}
            />
          </Card>
        </div>
      )}

      {tab === 'branches' && (
        <div className="space-y-5">
          {canManage && (
            <Card title="Add Organization Bank Branch">
              <form onSubmit={handleCreateBranch} className="grid gap-3 sm:grid-cols-5">
                <select
                  required
                  value={branchBankId}
                  onChange={(e) => setBranchBankId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="">Select Bank...</option>
                  {banksQuery.data?.items.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} ({b.bankCode})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  placeholder="Branch Code"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs uppercase"
                />
                <input
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="Branch Name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={branchCity}
                  onChange={(e) => setBranchCity(e.target.value)}
                  placeholder="City (optional)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <Button type="submit" disabled={createBranchMutation.isPending}>
                  Add Branch
                </Button>
                <input
                  type="text"
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                  placeholder="Address (optional)"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-5"
                />
              </form>
              {branchError && <p className="mt-2 text-xs text-rose-600">{branchError}</p>}
            </Card>
          )}

          <Card>
            <div className="mb-4 flex flex-wrap gap-3">
              <select
                value={selectedBankFilter}
                onChange={(e) => {
                  setSelectedBankFilter(e.target.value);
                  setBranchPage(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="">All Banks</option>
                {banksQuery.data?.items.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bankName}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={branchSearch}
                onChange={(e) => {
                  setBranchSearch(e.target.value);
                  setBranchPage(1);
                }}
                placeholder="Search branch name, code, or city..."
                className="flex-1 min-w-60 rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-3 font-medium">Bank</th>
                    <th className="py-2.5 pr-3 font-medium">Branch Code</th>
                    <th className="py-2.5 pr-3 font-medium">Branch Name</th>
                    <th className="py-2.5 pr-3 font-medium">City</th>
                    <th className="py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchesQuery.data?.items.map((br) => (
                    <tr key={br.id}>
                      <td className="py-3 pr-3 font-medium text-slate-900">
                        {br.bank.bankName}
                      </td>
                      <td className="py-3 pr-3 font-mono text-slate-700">{br.branchCode}</td>
                      <td className="py-3 pr-3 text-slate-800">{br.branchName}</td>
                      <td className="py-3 pr-3 text-slate-600">{br.city ?? '—'}</td>
                      <td className="py-3">
                        <Badge variant={br.status === 'ACTIVE' ? 'success' : 'danger'}>
                          {br.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!branchesQuery.isLoading && branchesQuery.data?.items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        No branches registered for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <PaginationControls
              pagination={branchesQuery.data?.pagination}
              onPageChange={(p) => setBranchPage(p)}
            />
          </Card>
        </div>
      )}
    </div>
  );
}

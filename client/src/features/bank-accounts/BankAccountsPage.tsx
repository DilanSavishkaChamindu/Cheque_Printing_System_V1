import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import {
  FEATURE_KEYS,
  PERMISSION_CODES,
  SUPPORTED_CURRENCIES,
} from '@cheque-saas/shared';
import { organizationService } from '../../services/organizationService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function BankAccountsPage() {
  const queryClient = useQueryClient();
  const { tenantUser, activeCompanyId } = useAuthStore();
  const canManage = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.BANK_ACCOUNT_MANAGE)
  );
  const companiesEnabled = Boolean(
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES)
  );

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [companyId, setCompanyId] = useState(activeCompanyId ?? '');
  const [bankId, setBankId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<'CURRENT' | 'SAVINGS' | 'OVERDRAFT' | 'OTHER'>('CURRENT');
  const [currency, setCurrency] = useState(tenantUser?.tenant.defaultCurrency ?? 'LKR');
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [openingBalanceDate, setOpeningBalanceDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [formError, setFormError] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['bank-accounts', page, search, activeCompanyId],
    queryFn: () =>
      organizationService.listBankAccounts({
        page,
        limit: 15,
        companyId: companiesEnabled ? activeCompanyId ?? undefined : undefined,
        search,
      }),
  });

  const referenceBanksQuery = useQuery({
    queryKey: ['reference-banks'],
    queryFn: () => organizationService.listReferenceBanks(),
  });

  const selectedBank = referenceBanksQuery.data?.find((b) => b.id === bankId);

  const createMutation = useMutation({
    mutationFn: () =>
      organizationService.createBankAccount({
        companyId: companiesEnabled ? companyId || activeCompanyId || undefined : undefined,
        bankId,
        branchId: branchId || null,
        accountName: accountName.trim(),
        accountNumber: accountNumber.trim(),
        accountType,
        currency,
        openingBalance,
        openingBalanceDate,
      }),
    onSuccess: async () => {
      setShowForm(false);
      setAccountName('');
      setAccountNumber('');
      setOpeningBalance('0.00');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
    onError: (err) => setFormError(extractApiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'FROZEN' }) =>
      organizationService.updateBankAccountStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Bank Accounts & Internal Book Balances
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Balances displayed here represent your organization&apos;s internal auditable book ledger, not live bank feeds.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setCompanyId(activeCompanyId ?? tenantUser?.companies[0]?.id ?? '');
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Add Bank Account</span>
          </Button>
        )}
      </div>

      {showForm && canManage && (
        <Card title="Register Bank Account">
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {formError}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {companiesEnabled && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Company *</label>
                  <select
                    required
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select Company...</option>
                    {tenantUser?.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.companyCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700">Bank *</label>
                <select
                  required
                  value={bankId}
                  onChange={(e) => {
                    setBankId(e.target.value);
                    setBranchId('');
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select Bank...</option>
                  {referenceBanksQuery.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName} ({b.bankCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Branch</label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Optional / Main Branch</option>
                  {selectedBank?.branches.map((br) => (
                    <option key={br.id} value={br.id}>
                      {br.branchName} ({br.branchCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Account Name *</label>
                <input
                  type="text"
                  required
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Account Number *</label>
                <input
                  type="text"
                  required
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Account Type</label>
                <select
                  value={accountType}
                  onChange={(e) =>
                    setAccountType(
                      e.target.value as 'CURRENT' | 'SAVINGS' | 'OVERDRAFT' | 'OTHER'
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="CURRENT">Current</option>
                  <option value="SAVINGS">Savings</option>
                  <option value="OVERDRAFT">Overdraft</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Opening Book Balance *
                </label>
                <input
                  type="text"
                  required
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Opening Balance Date *
                </label>
                <input
                  type="date"
                  required
                  value={openingBalanceDate}
                  onChange={(e) => setOpeningBalanceDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Account'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-4 relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search bank accounts..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 pr-3 font-medium">Bank & Branch</th>
                <th className="py-2.5 pr-3 font-medium">Account</th>
                {companiesEnabled && <th className="py-2.5 pr-3 font-medium">Company</th>}
                <th className="py-2.5 pr-3 font-medium text-right">Book Balance (Internal)</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accountsQuery.data?.items.map((acc) => (
                <tr key={acc.id}>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-900">{acc.bank.bankName}</div>
                    <div className="text-[11px] text-slate-500">
                      {acc.branch?.branchName ?? 'Main'}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-900">{acc.accountName}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {acc.accountNumberMasked} · {acc.accountType}
                    </div>
                  </td>
                  {companiesEnabled && (
                    <td className="py-3 pr-3 text-slate-600">{acc.company.companyName}</td>
                  )}
                  <td className="py-3 pr-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {acc.currency} {Number(acc.currentBookBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 pr-3">
                    <Badge variant={acc.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {acc.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-right space-x-3">
                    <Link
                      to={`/bank-accounts/${acc.id}/ledger`}
                      className="font-medium text-sky-700 hover:text-sky-900"
                    >
                      Ledger
                    </Link>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          statusMutation.mutate({
                            id: acc.id,
                            status: acc.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                          })
                        }
                        className="font-medium text-emerald-700 hover:text-emerald-900"
                      >
                        {acc.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!accountsQuery.isLoading && accountsQuery.data?.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No bank accounts configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={accountsQuery.data?.pagination}
          onPageChange={(p) => setPage(p)}
        />
      </Card>
    </div>
  );
}

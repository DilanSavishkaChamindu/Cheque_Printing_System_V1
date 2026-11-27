import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import {
  FEATURE_KEYS,
  PERMISSION_CODES,
  SUPPORTED_CURRENCIES,
  type ReceivedChequeStatus,
} from '@cheque-saas/shared';
import {
  ledgerService,
  type ReceivedChequeDto,
} from '../../services/ledgerService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function ReceivedChequesPage() {
  const queryClient = useQueryClient();
  const { tenantUser, activeCompanyId } = useAuthStore();
  const companiesEnabled = Boolean(
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES)
  );
  const canManage = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.RECEIVED_CHEQUE_MANAGE)
  );

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [companyId, setCompanyId] = useState(activeCompanyId ?? '');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankId, setBankId] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(tenantUser?.tenant.defaultCurrency ?? 'LKR');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [statusTarget, setStatusTarget] = useState<ReceivedChequeDto | null>(null);
  const [nextStatus, setNextStatus] = useState<ReceivedChequeStatus>('DEPOSITED');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['received-cheques', page, search, statusFilter, activeCompanyId],
    queryFn: () =>
      ledgerService.listReceivedCheques({
        page,
        limit: 15,
        companyId: companiesEnabled ? activeCompanyId ?? undefined : undefined,
        status: statusFilter,
        search,
      }),
  });

  const optionsQuery = useQuery({
    queryKey: ['received-cheque-options'],
    queryFn: () => ledgerService.getReceivedChequeOptions(),
  });

  const historyQuery = useQuery({
    queryKey: ['received-cheque-history', historyTargetId],
    queryFn: () => ledgerService.getReceivedChequeDetails(historyTargetId!),
    enabled: Boolean(historyTargetId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      ledgerService.createReceivedCheque({
        companyId: companiesEnabled ? companyId || activeCompanyId || undefined : undefined,
        chequeNumber: chequeNumber.trim(),
        chequeDate,
        receivedDate,
        bankId: bankId || null,
        bankName: bankName.trim(),
        branchName: branchName.trim() || null,
        receivedFrom: receivedFrom.trim(),
        amount: amount.trim(),
        currency,
        note: note.trim() || null,
        status: 'RECEIVED',
      }),
    onSuccess: async () => {
      setShowForm(false);
      setChequeNumber('');
      setReceivedFrom('');
      setAmount('');
      setNote('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['received-cheques'] });
    },
    onError: (err) => setFormError(extractApiErrorMessage(err)),
  });

  const statusMutation = useMutation({
    mutationFn: () =>
      ledgerService.updateReceivedChequeStatus(statusTarget!.id, {
        status: nextStatus,
        depositBankAccountId:
          depositAccountId || statusTarget?.depositBankAccountId || null,
        reason: statusReason.trim() || undefined,
      }),
    onSuccess: async () => {
      setStatusTarget(null);
      setStatusReason('');
      await queryClient.invalidateQueries({ queryKey: ['received-cheques'] });
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
    onError: (err) => setFormError(extractApiErrorMessage(err)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Received Cheques</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track incoming customer and third-party cheques separately from issued cheques; clearing posts to the bank book ledger.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setCompanyId(activeCompanyId ?? tenantUser?.companies[0]?.id ?? '');
              setShowForm((v) => !v);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>Record Received Cheque</span>
          </Button>
        )}
      </div>

      {formError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {formError}
        </div>
      )}

      {showForm && canManage && (
        <Card title="Record Incoming Cheque">
          <form onSubmit={handleSubmit} className="space-y-4">
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
                    {tenantUser?.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-700">Cheque Number *</label>
                <input
                  type="text"
                  required
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Received From *</label>
                <input
                  type="text"
                  required
                  value={receivedFrom}
                  onChange={(e) => setReceivedFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Cheque Date *</label>
                <input
                  type="date"
                  required
                  value={chequeDate}
                  onChange={(e) => setChequeDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Received Date *</label>
                <input
                  type="date"
                  required
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Drawer Bank *</label>
                <select
                  value={bankId}
                  onChange={(e) => {
                    const selected = optionsQuery.data?.banks.find((b) => b.id === e.target.value);
                    setBankId(e.target.value);
                    if (selected) {
                      setBankName(selected.bankName);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Custom / Other Bank</option>
                  {optionsQuery.data?.banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bankName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Bank Name *</label>
                <input
                  type="text"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Branch Name</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700">Amount *</label>
                <input
                  type="text"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                />
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
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Note</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Save Received Cheque
              </Button>
            </div>
          </form>
        </Card>
      )}

      {statusTarget && (
        <Card
          title={`Update Received Cheque #${statusTarget.chequeNumber}`}
          subtitle={`Current Status: ${statusTarget.status}`}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as ReceivedChequeStatus)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="PENDING_DEPOSIT">Pending Deposit</option>
              <option value="DEPOSITED">Deposited</option>
              <option value="CLEARED">Cleared (Credits Bank Ledger)</option>
              <option value="BOUNCED">Bounced</option>
              <option value="RETURNED">Returned</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <select
              value={depositAccountId}
              onChange={(e) => setDepositAccountId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="">Select Deposit Bank Account...</option>
              {optionsQuery.data?.bankAccounts
                .filter((a) => a.companyId === statusTarget.companyId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bankName} — {a.accountName} ({a.accountNumberMasked})
                  </option>
                ))}
            </select>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Note / deposit slip reference"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => statusMutation.mutate()}
                disabled={statusMutation.isPending}
              >
                Update
              </Button>
              <Button variant="secondary" onClick={() => setStatusTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {historyQuery.data && (
        <Card
          title={`Status History — Cheque #${historyQuery.data.chequeNumber}`}
          action={
            <Button variant="ghost" onClick={() => setHistoryTargetId(null)}>
              Close
            </Button>
          }
        >
          <ul className="space-y-2 text-xs">
            {historyQuery.data.statusHistory.map((h) => (
              <li key={h.id} className="rounded border border-slate-200 px-3 py-2">
                <span className="font-semibold">
                  {h.previousStatus ?? 'NEW'} → {h.newStatus}
                </span>{' '}
                · <span className="text-slate-500">{new Date(h.createdAt).toLocaleString()}</span>
                {h.reason && <p className="mt-0.5 text-slate-600">{h.reason}</p>}
              </li>
            ))}
          </ul>
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
              placeholder="Search cheque #, drawer, or bank..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
          >
            <option value="">All Statuses</option>
            <option value="RECEIVED">Received</option>
            <option value="PENDING_DEPOSIT">Pending Deposit</option>
            <option value="DEPOSITED">Deposited</option>
            <option value="CLEARED">Cleared</option>
            <option value="BOUNCED">Bounced</option>
            <option value="RETURNED">Returned</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 pr-3 font-medium">Cheque #</th>
                <th className="py-2.5 pr-3 font-medium">Received Date</th>
                <th className="py-2.5 pr-3 font-medium">Received From</th>
                <th className="py-2.5 pr-3 font-medium">Bank / Branch</th>
                <th className="py-2.5 pr-3 font-medium text-right">Amount</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listQuery.data?.items.map((rc) => (
                <tr key={rc.id}>
                  <td className="py-3 pr-3 font-mono font-semibold text-slate-900">
                    {rc.chequeNumber}
                  </td>
                  <td className="py-3 pr-3 tabular-nums text-slate-600">{rc.receivedDate}</td>
                  <td className="py-3 pr-3 font-medium text-slate-900">{rc.receivedFrom}</td>
                  <td className="py-3 pr-3 text-slate-600">
                    {rc.bankName} {rc.branchName ? `(${rc.branchName})` : ''}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono font-semibold tabular-nums">
                    {rc.currency} {Number(rc.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 pr-3">
                    <Badge
                      variant={
                        rc.status === 'CLEARED'
                          ? 'success'
                          : rc.status === 'BOUNCED' || rc.status === 'CANCELLED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {rc.status}
                    </Badge>
                  </td>
                  <td className="py-3 text-right space-x-3">
                    <button
                      type="button"
                      onClick={() => setHistoryTargetId(rc.id)}
                      className="font-medium text-slate-600 hover:text-slate-950"
                    >
                      History
                    </button>
                    {canManage &&
                      rc.status !== 'CLEARED' &&
                      rc.status !== 'RETURNED' &&
                      rc.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setStatusTarget(rc);
                            setDepositAccountId(rc.depositBankAccountId ?? '');
                            setNextStatus('DEPOSITED');
                          }}
                          className="font-medium text-emerald-700 hover:text-emerald-900"
                        >
                          Update Status
                        </button>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={listQuery.data?.pagination}
          onPageChange={(p) => setPage(p)}
        />
      </Card>
    </div>
  );
}

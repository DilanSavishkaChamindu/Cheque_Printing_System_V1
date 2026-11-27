import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Printer, Search } from 'lucide-react';
import {
  FEATURE_KEYS,
  PERMISSION_CODES,
  type ChequeBankingStatus,
} from '@cheque-saas/shared';
import {
  chequeService,
  type IssuedChequeDetailsDto,
  type IssuedChequeDto,
} from '../../services/chequeService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { ChequePreviewCard } from '../../components/ChequePreviewCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function ChequeHistoryPage() {
  const queryClient = useQueryClient();
  const { tenantUser, activeCompanyId } = useAuthStore();
  const companiesEnabled = Boolean(
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES)
  );
  const canPrint = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.CHEQUE_PRINT)
  );
  const canUpdateStatus = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.CHEQUE_STATUS_UPDATE)
  );
  const canCancel = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.CHEQUE_CANCEL)
  );

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [businessStatus, setBusinessStatus] = useState('');
  const [printingStatus, setPrintingStatus] = useState('');
  const [bankingStatus, setBankingStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<IssuedChequeDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [statusTarget, setStatusTarget] = useState<IssuedChequeDto | null>(null);
  const [nextBankingStatus, setNextBankingStatus] =
    useState<ChequeBankingStatus>('PRESENTED');
  const [statusReason, setStatusReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [
      'issued-cheques',
      page,
      search,
      businessStatus,
      printingStatus,
      bankingStatus,
      fromDate,
      toDate,
      activeCompanyId,
    ],
    queryFn: () =>
      chequeService.listCheques({
        page,
        limit: 15,
        companyId: companiesEnabled ? activeCompanyId ?? undefined : undefined,
        search,
        businessStatus,
        printingStatus,
        bankingStatus,
        fromDate,
        toDate,
      }),
  });

  const detailsQuery = useQuery({
    queryKey: ['issued-cheque-details', inspectingId],
    queryFn: () => chequeService.getChequeDetails(inspectingId!),
    enabled: Boolean(inspectingId),
  });

  const issueMutation = useMutation({
    mutationFn: (id: string) => chequeService.issueDraft(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['issued-cheques'] });
    },
    onError: (err) => setActionError(extractApiErrorMessage(err)),
  });

  const reprintMutation = useMutation({
    mutationFn: (cheque: IssuedChequeDto) =>
      chequeService.recordPrintJob(cheque.id, {
        templateId: cheque.templateId,
        jobType: cheque.printCount > 0 ? 'REPRINT' : 'INITIAL_PRINT',
        status: 'SUCCESS',
      }),
    onSuccess: async () => {
      window.print();
      await queryClient.invalidateQueries({ queryKey: ['issued-cheques'] });
      await queryClient.invalidateQueries({ queryKey: ['issued-cheque-details'] });
    },
    onError: (err) => setActionError(extractApiErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => chequeService.cancelCheque(cancelTarget!.id, cancelReason),
    onSuccess: async () => {
      setCancelTarget(null);
      setCancelReason('');
      await queryClient.invalidateQueries({ queryKey: ['issued-cheques'] });
    },
    onError: (err) => setActionError(extractApiErrorMessage(err)),
  });

  const bankingMutation = useMutation({
    mutationFn: () =>
      chequeService.updateBankingStatus(
        statusTarget!.id,
        nextBankingStatus,
        statusReason || undefined
      ),
    onSuccess: async () => {
      setStatusTarget(null);
      setStatusReason('');
      await queryClient.invalidateQueries({ queryKey: ['issued-cheques'] });
      await queryClient.invalidateQueries({ queryKey: ['issued-cheque-details'] });
    },
    onError: (err) => setActionError(extractApiErrorMessage(err)),
  });

  const inspected: IssuedChequeDetailsDto | undefined = detailsQuery.data;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Cheque History</h1>
          <p className="mt-1 text-sm text-slate-600">
            Search issued cheques, manage lifecycle transitions, reprint, and review audit history.
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          <span>Print View</span>
        </Button>
      </div>

      {actionError && (
        <div className="no-print rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {actionError}
        </div>
      )}

      {inspected && (
        <Card
          title={`Cheque #${inspected.chequeNumber} — ${inspected.payeeName}`}
          subtitle="Detailed Preview & Lifecycle History"
          action={
            <Button variant="ghost" onClick={() => setInspectingId(null)}>
              Close
            </Button>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <ChequePreviewCard
              bankName={inspected.bank.bankName}
              accountName={inspected.bankAccount.accountName}
              accountNumberMasked={inspected.bankAccount.accountNumberMasked}
              chequeNumber={inspected.chequeNumber}
              chequeDate={inspected.chequeDate}
              dateFormat={inspected.dateFormat}
              payeeName={inspected.payeeName}
              amount={inspected.amount}
              currency={inspected.currency}
              amountInWords={inspected.amountInWords}
              paymentType={inspected.paymentType}
              cashRecipient={inspected.cashRecipient}
              businessStatus={inspected.businessStatus}
            />

            <div className="space-y-3 text-xs">
              <h3 className="font-semibold text-slate-900">Status &amp; Print History</h3>
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {inspected.statusHistory.map((h) => (
                  <li
                    key={h.id}
                    className="rounded border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        {h.statusCategory}: {h.previousStatus ?? 'NEW'} → {h.newStatus}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(h.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {h.reason && <p className="mt-0.5 text-slate-600">{h.reason}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {cancelTarget && (
        <Card title={`Cancel Cheque #${cancelTarget.chequeNumber}`} className="no-print">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Cancellation reason (required for audit log)"
              className="flex-1 min-w-64 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <Button
              variant="danger"
              disabled={cancelReason.trim().length < 3 || cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              Confirm Cancellation
            </Button>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Close
            </Button>
          </div>
        </Card>
      )}

      {statusTarget && (
        <Card
          title={`Update Banking Status for Cheque #${statusTarget.chequeNumber}`}
          subtitle={`Current Banking Status: ${statusTarget.bankingStatus}`}
          className="no-print"
        >
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={nextBankingStatus}
              onChange={(e) =>
                setNextBankingStatus(e.target.value as ChequeBankingStatus)
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="PENDING">Pending</option>
              <option value="PRESENTED">Presented</option>
              <option value="POSTPONED">Postponed</option>
              <option value="CLEARED">Cleared</option>
              <option value="BOUNCED">Bounced</option>
              <option value="STOPPED">Stopped</option>
            </select>
            <input
              type="text"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
              placeholder="Optional note / bank reference"
              className="flex-1 min-w-60 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <Button
              onClick={() => bankingMutation.mutate()}
              disabled={bankingMutation.isPending}
            >
              Update Status
            </Button>
            <Button variant="secondary" onClick={() => setStatusTarget(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card className="no-print">
        <div className="mb-4 grid gap-3 sm:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Cheque #, payee, or description..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs"
            />
          </div>
          <select
            value={businessStatus}
            onChange={(e) => {
              setBusinessStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
          >
            <option value="">All Record Status</option>
            <option value="DRAFT">Draft</option>
            <option value="ISSUED">Issued</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <select
            value={printingStatus}
            onChange={(e) => {
              setPrintingStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
          >
            <option value="">All Print Status</option>
            <option value="NOT_PRINTED">Not Printed</option>
            <option value="PRINTED">Printed</option>
            <option value="PRINT_FAILED">Print Failed</option>
          </select>
          <select
            value={bankingStatus}
            onChange={(e) => {
              setBankingStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
          >
            <option value="">All Banking Status</option>
            <option value="PENDING">Pending</option>
            <option value="PRESENTED">Presented</option>
            <option value="CLEARED">Cleared</option>
            <option value="BOUNCED">Bounced</option>
            <option value="POSTPONED">Postponed</option>
            <option value="STOPPED">Stopped</option>
          </select>
          <div className="flex gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-[11px]"
              aria-label="From date"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-[11px]"
              aria-label="To date"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 pr-3 font-medium">Cheque #</th>
                <th className="py-2.5 pr-3 font-medium">Date</th>
                <th className="py-2.5 pr-3 font-medium">Payee</th>
                <th className="py-2.5 pr-3 font-medium">Bank / Account</th>
                <th className="py-2.5 pr-3 font-medium text-right">Amount</th>
                <th className="py-2.5 pr-3 font-medium">Statuses</th>
                <th className="py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data?.items.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pr-3 font-mono font-semibold text-slate-900">
                    {c.chequeNumber}
                  </td>
                  <td className="py-3 pr-3 tabular-nums text-slate-600">{c.chequeDate}</td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-900">{c.payeeName}</div>
                    {companiesEnabled && (
                      <div className="text-[11px] text-slate-400">
                        {c.company.companyName}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="text-slate-800">{c.bank.bankName}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {c.bankAccount.accountNumberMasked}
                    </div>
                  </td>
                  <td className="py-3 pr-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {c.currency} {Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 pr-3 space-x-1">
                    <Badge
                      variant={
                        c.businessStatus === 'CANCELLED'
                          ? 'danger'
                          : c.businessStatus === 'DRAFT'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {c.businessStatus}
                    </Badge>
                    <Badge variant={c.printingStatus === 'PRINTED' ? 'info' : 'neutral'}>
                      {c.printingStatus}
                    </Badge>
                    <Badge
                      variant={
                        c.bankingStatus === 'CLEARED'
                          ? 'success'
                          : c.bankingStatus === 'BOUNCED' || c.bankingStatus === 'STOPPED'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {c.bankingStatus}
                    </Badge>
                  </td>
                  <td className="py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setInspectingId(c.id)}
                      className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-950"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>
                    {c.businessStatus === 'DRAFT' && (
                      <button
                        type="button"
                        onClick={() => issueMutation.mutate(c.id)}
                        className="font-medium text-emerald-700 hover:text-emerald-900"
                      >
                        Issue
                      </button>
                    )}
                    {canPrint && c.businessStatus !== 'CANCELLED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => reprintMutation.mutate(c)}
                          className="font-medium text-sky-700 hover:text-sky-900"
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void chequeService.downloadChequePdf(c.id, c.chequeNumber)
                          }
                          className="font-medium text-indigo-700 hover:text-indigo-900"
                        >
                          PDF
                        </button>
                      </>
                    )}
                    {canUpdateStatus && c.businessStatus === 'ISSUED' && (
                      <button
                        type="button"
                        onClick={() => setStatusTarget(c)}
                        className="font-medium text-amber-700 hover:text-amber-900"
                      >
                        Status
                      </button>
                    )}
                    {canCancel &&
                      c.businessStatus !== 'CANCELLED' &&
                      c.bankingStatus !== 'CLEARED' && (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(c)}
                          className="font-medium text-rose-700 hover:text-rose-900"
                        >
                          Cancel
                        </button>
                      )}
                  </td>
                </tr>
              ))}
              {!query.isLoading && query.data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No cheques found matching these filters.
                  </td>
                </tr>
              )}
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

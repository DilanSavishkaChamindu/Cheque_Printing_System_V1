import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Plus, RotateCcw } from 'lucide-react';
import { PERMISSION_CODES } from '@cheque-saas/shared';
import { ledgerService } from '../../services/ledgerService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function BankLedgerPage() {
  const { bankAccountId = '' } = useParams();
  const queryClient = useQueryClient();
  const { tenantUser } = useAuthStore();
  const canPost = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.BANK_TRANSACTION_MANAGE)
  );

  const [page, setPage] = useState(1);
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [showPostForm, setShowPostForm] = useState(false);

  const [transactionType, setTransactionType] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT'>('DEPOSIT');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tx-${Date.now()}`
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [reversalTargetId, setReversalTargetId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const txQuery = useQuery({
    queryKey: ['bank-transactions', bankAccountId, page, txTypeFilter],
    queryFn: () =>
      ledgerService.listTransactions({
        page,
        limit: 20,
        bankAccountId,
        transactionType: txTypeFilter,
      }),
    enabled: Boolean(bankAccountId),
  });

  const reconcileQuery = useQuery({
    queryKey: ['bank-account-reconcile', bankAccountId],
    queryFn: () => ledgerService.reconcileAccount(bankAccountId),
    enabled: Boolean(bankAccountId),
  });

  const postMutation = useMutation({
    mutationFn: () =>
      ledgerService.postTransaction(
        {
          bankAccountId,
          transactionDate: txDate,
          transactionType,
          adjustmentDirection:
            transactionType === 'ADJUSTMENT' ? adjustmentDirection : undefined,
          amount: amount.trim(),
          referenceNumber: referenceNumber.trim() || null,
          description: description.trim(),
          idempotencyKey,
        },
        idempotencyKey
      ),
    onSuccess: async () => {
      setShowPostForm(false);
      setAmount('');
      setReferenceNumber('');
      setDescription('');
      setErrorMsg(null);
      setIdempotencyKey(
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `tx-${Date.now()}`
      );
      await queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['bank-account-reconcile'] });
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
    onError: (err) => setErrorMsg(extractApiErrorMessage(err)),
  });

  const reverseMutation = useMutation({
    mutationFn: () =>
      ledgerService.reverseTransaction(reversalTargetId!, reversalReason.trim()),
    onSuccess: async () => {
      setReversalTargetId(null);
      setReversalReason('');
      await queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['bank-account-reconcile'] });
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
    onError: (err) => setErrorMsg(extractApiErrorMessage(err)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    postMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Bank Account Book Ledger
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Immutable internal ledger (Opening Balance + Credits − Debits). Posted entries cannot be edited; errors use counter-entry reversals.
          </p>
        </div>
        {canPost && (
          <Button onClick={() => setShowPostForm((v) => !v)}>
            <Plus className="h-4 w-4" />
            <span>Post Transaction</span>
          </Button>
        )}
      </div>

      {reconcileQuery.data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs text-slate-500">Opening Balance</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
              {Number(reconcileQuery.data.openingBalance).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-500">Calculated Book Balance</p>
            <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-emerald-700">
              {Number(reconcileQuery.data.calculatedLedgerBalance).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
          </Card>
          <Card>
            <p className="text-xs text-slate-500">Ledger Integrity</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={reconcileQuery.data.isReconciled ? 'success' : 'danger'}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {reconcileQuery.data.isReconciled ? 'Reconciled' : 'Mismatch Detected'}
                </span>
              </Badge>
              <span className="text-xs text-slate-500">
                ({reconcileQuery.data.transactionCount} entries)
              </span>
            </div>
          </Card>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {errorMsg}
        </div>
      )}

      {showPostForm && canPost && (
        <Card title="Post Ledger Transaction">
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Type *</label>
              <select
                value={transactionType}
                onChange={(e) =>
                  setTransactionType(e.target.value as 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT')
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              >
                <option value="DEPOSIT">Deposit (Credit)</option>
                <option value="WITHDRAWAL">Withdrawal (Debit)</option>
                <option value="ADJUSTMENT">Book Adjustment</option>
              </select>
            </div>
            {transactionType === 'ADJUSTMENT' && (
              <div>
                <label className="block text-xs font-medium text-slate-700">Direction *</label>
                <select
                  value={adjustmentDirection}
                  onChange={(e) =>
                    setAdjustmentDirection(e.target.value as 'CREDIT' | 'DEBIT')
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="CREDIT">Credit (+)</option>
                  <option value="DEBIT">Debit (−)</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700">Date *</label>
              <input
                type="date"
                required
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Reference #</label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Description *</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowPostForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={postMutation.isPending}>
                Post Transaction
              </Button>
            </div>
          </form>
        </Card>
      )}

      {reversalTargetId && (
        <Card title="Post Reversal Counter-Entry">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="Mandatory reason for reversing this transaction"
              className="flex-1 min-w-64 rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <Button
              variant="danger"
              disabled={reversalReason.trim().length < 3 || reverseMutation.isPending}
              onClick={() => reverseMutation.mutate()}
            >
              Confirm Reversal
            </Button>
            <Button variant="secondary" onClick={() => setReversalTargetId(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-4">
          <select
            value={txTypeFilter}
            onChange={(e) => {
              setTxTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
          >
            <option value="">All Transaction Types</option>
            <option value="OPENING_BALANCE">Opening Balance</option>
            <option value="DEPOSIT">Deposits</option>
            <option value="WITHDRAWAL">Withdrawals</option>
            <option value="CHEQUE_PAYMENT">Cheque Payments</option>
            <option value="RECEIVED_CHEQUE_DEPOSIT">Received Cheque Deposits</option>
            <option value="ADJUSTMENT">Adjustments</option>
            <option value="REVERSAL">Reversals</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 pr-3 font-medium">Seq</th>
                <th className="py-2.5 pr-3 font-medium">Date</th>
                <th className="py-2.5 pr-3 font-medium">Type</th>
                <th className="py-2.5 pr-3 font-medium">Description / Ref</th>
                <th className="py-2.5 pr-3 font-medium text-right">Debit</th>
                <th className="py-2.5 pr-3 font-medium text-right">Credit</th>
                <th className="py-2.5 pr-3 font-medium text-right">Book Balance</th>
                {canPost && <th className="py-2.5 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txQuery.data?.items.map((tx) => (
                <tr key={tx.id}>
                  <td className="py-3 pr-3 font-mono text-slate-500">#{tx.sequenceNumber}</td>
                  <td className="py-3 pr-3 tabular-nums text-slate-600">
                    {tx.transactionDate.slice(0, 10)}
                  </td>
                  <td className="py-3 pr-3">
                    <Badge
                      variant={
                        tx.transactionType === 'REVERSAL'
                          ? 'warning'
                          : Number(tx.creditAmount) > 0
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {tx.transactionType}
                    </Badge>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="text-slate-900">{tx.description ?? '—'}</div>
                    {tx.referenceNumber && (
                      <div className="font-mono text-[11px] text-slate-400">
                        Ref: {tx.referenceNumber}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums text-rose-700">
                    {Number(tx.debitAmount) > 0 ? Number(tx.debitAmount).toFixed(2) : '—'}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums text-emerald-700">
                    {Number(tx.creditAmount) > 0 ? Number(tx.creditAmount).toFixed(2) : '—'}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {Number(tx.balanceAfterTransaction).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  {canPost && (
                    <td className="py-3 text-right">
                      {tx.isReversed ? (
                        <span className="text-slate-400">Reversed</span>
                      ) : tx.transactionType !== 'OPENING_BALANCE' &&
                        tx.transactionType !== 'REVERSAL' ? (
                        <button
                          type="button"
                          onClick={() => setReversalTargetId(tx.id)}
                          className="inline-flex items-center gap-1 font-medium text-amber-700 hover:text-amber-900"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>Reverse</span>
                        </button>
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={txQuery.data?.pagination}
          onPageChange={(p) => setPage(p)}
        />
      </Card>
    </div>
  );
}

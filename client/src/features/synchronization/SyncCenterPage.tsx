import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CloudOff,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { PERMISSION_CODES, type PaymentType } from '@cheque-saas/shared';
import {
  offlineDb,
  type LocalBankAccountCache,
  type LocalChequeAllocationCache,
  type LocalChequeDraftRecord,
  type LocalSyncOperationRecord,
} from '../../lib/offlineDb';
import {
  createOfflineChequeDraft,
  processPendingSyncQueue,
  refreshOfflineCache,
  syncService,
} from '../../services/syncEngine';
import { chequeService } from '../../services/chequeService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function SyncCenterPage() {
  const queryClient = useQueryClient();
  const { tenantUser } = useAuthStore();
  const { isOnline, refreshPendingCount } = useOnlineStatus();
  const canManageDevices = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.DEVICE_MANAGE)
  );
  const canAllocate = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.CHEQUE_BOOK_MANAGE)
  );

  const [tab, setTab] = useState<'queue' | 'devices' | 'conflicts' | 'limitations'>('queue');
  const [localDrafts, setLocalDrafts] = useState<LocalChequeDraftRecord[]>([]);
  const [localOps, setLocalOps] = useState<LocalSyncOperationRecord[]>([]);
  const [cachedAccounts, setCachedAccounts] = useState<LocalBankAccountCache[]>([]);
  const [cachedAllocations, setCachedAllocations] = useState<LocalChequeAllocationCache[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Offline draft quick form
  const [offlineBankAccountId, setOfflineBankAccountId] = useState('');
  const [offlinePayee, setOfflinePayee] = useState('');
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineDate, setOfflineDate] = useState(new Date().toISOString().slice(0, 10));
  const [offlinePaymentType, setOfflinePaymentType] = useState<PaymentType>('ACCOUNT_PAYEE');

  // Range allocation form
  const [allocDeviceId, setAllocDeviceId] = useState('');
  const [allocBookId, setAllocBookId] = useState('');
  const [allocCount, setAllocCount] = useState(10);

  // Conflict resolution notes
  const [conflictNotes, setConflictNotes] = useState('');

  const loadLocalDexie = async () => {
    if (!tenantUser) {
      return;
    }
    const [drafts, ops, accs, ranges] = await Promise.all([
      offlineDb.localChequeDrafts.where('tenantId').equals(tenantUser.tenantId).toArray(),
      offlineDb.syncOperations.where('tenantId').equals(tenantUser.tenantId).toArray(),
      offlineDb.cachedBankAccounts.where('tenantId').equals(tenantUser.tenantId).toArray(),
      offlineDb.allocatedChequeRanges.where('tenantId').equals(tenantUser.tenantId).toArray(),
    ]);
    setLocalDrafts(drafts);
    setLocalOps(ops);
    setCachedAccounts(accs);
    setCachedAllocations(ranges);
    if (!offlineBankAccountId && accs[0]) {
      setOfflineBankAccountId(accs[0].id);
    }
    await refreshPendingCount();
  };

  useEffect(() => {
    void loadLocalDexie();
  }, [tenantUser?.tenantId]);

  const devicesQuery = useQuery({
    queryKey: ['sync-devices'],
    queryFn: () => syncService.listDevices(),
    enabled: isOnline,
  });

  const conflictsQuery = useQuery({
    queryKey: ['sync-conflicts'],
    queryFn: () => syncService.listConflicts(1, 'OPEN'),
    enabled: isOnline,
  });

  const booksContextQuery = useQuery({
    queryKey: ['cheque-books-for-alloc'],
    queryFn: () => chequeService.getCreationContext(),
    enabled: isOnline && canAllocate && tab === 'devices',
  });

  const bootstrapMutation = useMutation({
    mutationFn: () => refreshOfflineCache(),
    onSuccess: async (data) => {
      setErrorMsg(null);
      setStatusMsg(
        `Offline cache updated (${data.bankAccounts.length} accounts, ${data.allocations.length} allocated cheque ranges).`
      );
      await loadLocalDexie();
    },
    onError: (err) => setErrorMsg(extractApiErrorMessage(err)),
  });

  const syncNowMutation = useMutation({
    mutationFn: () => processPendingSyncQueue(),
    onSuccess: async (res) => {
      setErrorMsg(null);
      setStatusMsg(
        `Sync run completed: ${res.synchronized} synchronized, ${res.conflicts} conflicts, ${res.failed} failed.`
      );
      await loadLocalDexie();
      await queryClient.invalidateQueries({ queryKey: ['sync-conflicts'] });
    },
    onError: (err) => setErrorMsg(extractApiErrorMessage(err)),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => syncService.approveDevice(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sync-devices'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => syncService.revokeDevice(id, 'Revoked via Sync Center'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sync-devices'] });
    },
  });

  const allocateMutation = useMutation({
    mutationFn: () =>
      syncService.requestOfflineRange({
        deviceId: allocDeviceId,
        chequeBookId: allocBookId,
        leafCount: allocCount,
      }),
    onSuccess: async () => {
      setStatusMsg('Allocated non-overlapping offline cheque range to device.');
      await bootstrapMutation.mutateAsync().catch(() => undefined);
    },
    onError: (err) => setErrorMsg(extractApiErrorMessage(err)),
  });

  const resolveConflictMutation = useMutation({
    mutationFn: (payload: {
      conflictId: string;
      status: 'RESOLVED_KEEP_SERVER' | 'RESOLVED_APPLY_LOCAL' | 'DISCARDED';
    }) =>
      syncService.resolveConflict(payload.conflictId, {
        resolutionStatus: payload.status,
        resolutionNotes: conflictNotes.trim() || 'Resolved by authorized user',
      }),
    onSuccess: async () => {
      setConflictNotes('');
      await queryClient.invalidateQueries({ queryKey: ['sync-conflicts'] });
    },
  });

  const handleCreateOfflineDraft = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const account = cachedAccounts.find((a) => a.id === offlineBankAccountId);
      const { draft } = await createOfflineChequeDraft({
        bankAccountId: offlineBankAccountId,
        chequeDate: offlineDate,
        payeeName: offlinePayee.trim(),
        amount: offlineAmount.trim(),
        currency: account?.currency ?? 'LKR',
        paymentType: offlinePaymentType,
      });
      setOfflinePayee('');
      setOfflineAmount('');
      setStatusMsg(
        `Saved local cheque #${draft.chequeNumber} to IndexedDB queue (Pending Synchronization).`
      );
      await loadLocalDexie();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create offline draft.');
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Offline Workspace &amp; Synchronization Center
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage IndexedDB offline cache, device cheque-number range allocations, sync queue retries, and conflict review.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!isOnline || bootstrapMutation.isPending}
            onClick={() => bootstrapMutation.mutate()}
          >
            <HardDriveDownload className="h-4 w-4" />
            <span>Refresh Offline Cache</span>
          </Button>
          <Button
            disabled={!isOnline || syncNowMutation.isPending}
            onClick={() => syncNowMutation.mutate()}
          >
            <RefreshCw className="h-4 w-4" />
            <span>Sync Queue Now</span>
          </Button>
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(
          [
            ['queue', `Local Queue (${localOps.length})`],
            ['devices', 'Devices & Cheque Ranges'],
            ['conflicts', `Conflicts (${conflictsQuery.data?.items.length ?? 0})`],
            ['limitations', 'Offline Security & Limitations'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`border-b-2 px-4 py-2 text-xs font-semibold ${
              tab === k
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <div className="space-y-5">
          <Card
            title="Prepare Offline Cheque Draft (IndexedDB)"
            subtitle="Uses locally cached accounts and non-overlapping allocated cheque ranges."
          >
            {cachedAccounts.length === 0 || cachedAllocations.length === 0 ? (
              <p className="text-xs text-slate-600">
                No offline accounts or allocated cheque-number ranges cached yet. Ensure this device is approved under <strong>Devices &amp; Cheque Ranges</strong>, allocate a range, and click <strong>Refresh Offline Cache</strong> while online.
              </p>
            ) : (
              <form onSubmit={handleCreateOfflineDraft} className="grid gap-3 sm:grid-cols-5">
                <select
                  required
                  value={offlineBankAccountId}
                  onChange={(e) => setOfflineBankAccountId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  {cachedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bankName} — {a.accountName} ({a.accountNumberMasked})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  required
                  value={offlinePayee}
                  onChange={(e) => setOfflinePayee(e.target.value)}
                  placeholder="Payee Name"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  required
                  value={offlineAmount}
                  onChange={(e) => setOfflineAmount(e.target.value)}
                  placeholder="Amount (e.g. 5000.00)"
                  className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                />
                <input
                  type="date"
                  required
                  value={offlineDate}
                  onChange={(e) => setOfflineDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <div className="flex gap-2">
                  <select
                    value={offlinePaymentType}
                    onChange={(e) => setOfflinePaymentType(e.target.value as PaymentType)}
                    className="rounded-lg border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="ACCOUNT_PAYEE">A/C Payee</option>
                    <option value="CASH">Cash</option>
                  </select>
                  <Button type="submit">Queue Draft</Button>
                </div>
              </form>
            )}
          </Card>

          <Card title="Local IndexedDB Drafts & Sync Operations">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Cheque #</th>
                    <th className="py-2 pr-3 font-medium">Payee</th>
                    <th className="py-2 pr-3 font-medium text-right">Amount</th>
                    <th className="py-2 pr-3 font-medium">Sync State</th>
                    <th className="py-2 font-medium">Queue / Error Info</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localDrafts.map((d) => {
                    const op = localOps.find((o) => o.recordId === d.id);
                    return (
                      <tr key={d.id}>
                        <td className="py-2.5 pr-3 font-mono font-semibold">{d.chequeNumber}</td>
                        <td className="py-2.5 pr-3">{d.payeeName}</td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
                          {d.currency} {d.amount}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge
                            variant={
                              d.serverSynced
                                ? 'success'
                                : d.syncStatus === 'CONFLICT' || d.syncStatus === 'FAILED'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {d.serverSynced ? 'Server Confirmed' : `Pending (${d.syncStatus})`}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {op ? `Retries: ${op.retryCount}` : ''} {op?.lastError ?? ''}
                        </td>
                      </tr>
                    );
                  })}
                  {localDrafts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        No offline cheque drafts stored on this browser.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'devices' && (
        <div className="space-y-5">
          {canAllocate && (
            <Card title="Allocate Non-Overlapping Offline Cheque Range">
              <div className="grid gap-3 sm:grid-cols-4">
                <select
                  value={allocDeviceId}
                  onChange={(e) => setAllocDeviceId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="">Select Approved Device...</option>
                  {devicesQuery.data
                    ?.filter((d) => d.status === 'ACTIVE')
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.deviceName} ({d.user.username})
                      </option>
                    ))}
                </select>
                <select
                  value={allocBookId}
                  onChange={(e) => setAllocBookId(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="">Select Cheque Book...</option>
                  {booksContextQuery.data?.chequeBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bookName} ({b.remainingLeaves} leaves left)
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={allocCount}
                  onChange={(e) => setAllocCount(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <Button
                  disabled={!allocDeviceId || !allocBookId || allocateMutation.isPending}
                  onClick={() => allocateMutation.mutate()}
                >
                  Allocate Offline Range
                </Button>
              </div>
            </Card>
          )}

          <Card title="Registered Devices">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Device</th>
                    <th className="py-2 pr-3 font-medium">User</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Last Seen</th>
                    {canManageDevices && <th className="py-2 text-right font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {devicesQuery.data?.map((dev) => (
                    <tr key={dev.id}>
                      <td className="py-2.5 pr-3 font-medium text-slate-900">
                        {dev.deviceName}
                        {dev.id === tenantUser?.deviceId && (
                          <Badge variant="info" className="ml-2">
                            This Browser
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{dev.user.email}</td>
                      <td className="py-2.5 pr-3">
                        <Badge
                          variant={
                            dev.status === 'ACTIVE'
                              ? 'success'
                              : dev.status === 'REVOKED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {dev.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-500">
                        {dev.lastSeenAt ? new Date(dev.lastSeenAt).toLocaleString() : '—'}
                      </td>
                      {canManageDevices && (
                        <td className="py-2.5 text-right space-x-3">
                          {dev.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() => approveMutation.mutate(dev.id)}
                              className="font-medium text-emerald-700"
                            >
                              Approve
                            </button>
                          )}
                          {dev.status !== 'REVOKED' && (
                            <button
                              type="button"
                              onClick={() => revokeMutation.mutate(dev.id)}
                              className="font-medium text-rose-700"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'conflicts' && (
        <Card
          title="Open Synchronization Conflicts"
          subtitle="Financial records never use silent last-write-wins. Review differences and resolve explicitly."
        >
          <div className="mb-4">
            <input
              type="text"
              value={conflictNotes}
              onChange={(e) => setConflictNotes(e.target.value)}
              placeholder="Audit notes for conflict resolution..."
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>

          <div className="space-y-4">
            {conflictsQuery.data?.items.map((c) => (
              <div key={c.id} className="rounded-lg border border-amber-300 bg-amber-50/40 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span className="font-semibold text-slate-900">{c.conflictType}</span>
                    <span className="font-mono text-slate-500">{c.recordId}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        resolveConflictMutation.mutate({
                          conflictId: c.id,
                          status: 'RESOLVED_KEEP_SERVER',
                        })
                      }
                    >
                      Keep Server Version
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        resolveConflictMutation.mutate({
                          conflictId: c.id,
                          status: 'DISCARDED',
                        })
                      }
                    >
                      Discard Local Change
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <pre className="overflow-auto rounded border border-slate-200 bg-white p-2.5 text-[11px]">
                    Local Payload:\n{JSON.stringify(c.localPayloadJson, null, 2)}
                  </pre>
                  <pre className="overflow-auto rounded border border-slate-200 bg-white p-2.5 text-[11px]">
                    Server Snapshot:\n{JSON.stringify(c.serverSnapshotJson, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
            {conflictsQuery.data?.items.length === 0 && (
              <p className="py-6 text-center text-xs text-slate-500">
                No open synchronization conflicts.
              </p>
            )}
          </div>
        </Card>
      )}

      {tab === 'limitations' && (
        <Card title="Offline Capabilities, Security Policy & PWA Limitations">
          <div className="grid gap-4 sm:grid-cols-2 text-xs leading-relaxed text-slate-600">
            <div className="rounded-lg border border-slate-200 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span>Offline Security Policy</span>
              </div>
              <p>
                Local IndexedDB stores only scoped accounts, templates, allocated cheque-number ranges, and pending drafts for the authenticated session. Remote device revocation blocks synchronization immediately on reconnection, though it cannot remotely wipe an already-disconnected browser profile until logout or session clearance.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <CloudOff className="h-4 w-4 text-amber-600" />
                <span>Technical PWA Limitations</span>
              </div>
              <ul className="list-disc pl-4 space-y-1">
                <li>Express.js and MySQL 8.0 run centrally and cannot execute inside the browser Service Worker.</li>
                <li>Browser storage (IndexedDB/CacheStorage) can be evicted by the OS or user profile cleanup.</li>
                <li>Remote permission changes, user deactivation, and tenant suspension are enforced when reconnecting to sync.</li>
                <li>Background sync timing varies across browsers; manual synchronization is always available here.</li>
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

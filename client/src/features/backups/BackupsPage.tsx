import { useState, type ChangeEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, Upload } from 'lucide-react';
import { PERMISSION_CODES } from '@cheque-saas/shared';
import { analyticsService } from '../../services/analyticsService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function BackupsPage() {
  const queryClient = useQueryClient();
  const { tenantUser } = useAuthStore();
  const canManage = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.BACKUP_MANAGE)
  );

  const [restoreJsonText, setRestoreJsonText] = useState('');
  const [previewResult, setPreviewResult] = useState<{
    restoreJobId: string;
    status: string;
    canConfirm: boolean;
    validationErrors: string[];
    counts: Record<string, number>;
    duplicatesDetected: Record<string, number>;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const historyQuery = useQuery({
    queryKey: ['tenant-backups-history'],
    queryFn: () => analyticsService.getBackupHistory(),
  });

  const exportMutation = useMutation({
    mutationFn: () => analyticsService.exportBackup(),
    onSuccess: async (res) => {
      const blob = new Blob([JSON.stringify(res.backup, null, 2)], {
        type: 'application/json',
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `tenant-backup-${tenantUser?.tenant.tenantCode ?? 'org'}-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setStatusMessage('Backup exported and downloaded cleanly (password secrets excluded).');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ['tenant-backups-history'] });
    },
    onError: (err) => setErrorMessage(extractApiErrorMessage(err)),
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(restoreJsonText);
      return analyticsService.previewRestore(parsed);
    },
    onSuccess: async (res) => {
      setPreviewResult(res);
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ['tenant-backups-history'] });
    },
    onError: (err) => setErrorMessage(extractApiErrorMessage(err, 'Invalid JSON backup payload.')),
  });

  const confirmMutation = useMutation({
    mutationFn: () => analyticsService.confirmRestore(previewResult!.restoreJobId),
    onSuccess: async (res) => {
      setPreviewResult(null);
      setRestoreJsonText('');
      setStatusMessage(
        `Restore completed cleanly (${JSON.stringify(res.restoredCounts)}).`
      );
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ['tenant-backups-history'] });
    },
    onError: (err) => setErrorMessage(extractApiErrorMessage(err)),
  });

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setRestoreJsonText(text);
    setPreviewResult(null);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Organization Backup &amp; Restore
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Application-level JSON export for your organization only. Password hashes, reset tokens, and platform backups are strictly excluded.
          </p>
        </div>

        {canManage && (
          <Button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4" />
            <span>{exportMutation.isPending ? 'Exporting...' : 'Download JSON Backup'}</span>
          </Button>
        )}
      </div>

      {statusMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
          {errorMessage}
        </div>
      )}

      {canManage && (
        <Card
          title="Validated Restore"
          subtitle="Step 1: Validate schema version, tenant ownership, duplicates, and ledger balance consistency. Step 2: Explicitly confirm."
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Upload Backup JSON File
              </label>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => void handleFileUpload(e)}
                className="block text-xs text-slate-600"
              />
            </div>

            <textarea
              rows={5}
              value={restoreJsonText}
              onChange={(e) => setRestoreJsonText(e.target.value)}
              placeholder="Or paste exported backup JSON here..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            />

            <Button
              variant="secondary"
              disabled={!restoreJsonText.trim() || previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              <Upload className="h-4 w-4" />
              <span>Preview &amp; Validate Backup</span>
            </Button>

            {previewResult && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-900">Restore Preview Summary</span>
                  <Badge variant={previewResult.canConfirm ? 'success' : 'danger'}>
                    {previewResult.canConfirm ? 'Valid — Ready for Confirmation' : 'Validation Failed'}
                  </Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-4">
                  {Object.entries(previewResult.counts).map(([k, count]) => (
                    <div key={k} className="rounded border border-slate-200 bg-white p-2">
                      <span className="text-slate-500">{k}</span>
                      <p className="font-mono font-semibold text-slate-900">{count}</p>
                    </div>
                  ))}
                </div>

                {previewResult.validationErrors.length > 0 && (
                  <ul className="list-disc pl-5 text-rose-700">
                    {previewResult.validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}

                {previewResult.canConfirm && (
                  <Button
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending}
                  >
                    Confirm &amp; Execute Restore
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent Export Jobs">
          <ul className="divide-y divide-slate-100 text-xs">
            {historyQuery.data?.backups.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-medium text-slate-900">
                    {b.recordCount} records (v{b.schemaVersion})
                  </p>
                  <p className="font-mono text-[11px] text-slate-400">
                    {b.checksum ? `SHA256: ${b.checksum.slice(0, 16)}...` : ''}
                  </p>
                </div>
                <Badge variant={b.status === 'COMPLETED' ? 'success' : 'warning'}>
                  {b.status}
                </Badge>
              </li>
            ))}
            {historyQuery.data?.backups.length === 0 && (
              <li className="py-4 text-center text-slate-500">No backup exports yet.</li>
            )}
          </ul>
        </Card>

        <Card title="Recent Restore Jobs">
          <ul className="divide-y divide-slate-100 text-xs">
            {historyQuery.data?.restores.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-medium text-slate-900">
                    Schema v{r.backupSchemaVersion}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant={r.status === 'COMPLETED' ? 'success' : 'neutral'}>
                  {r.status}
                </Badge>
              </li>
            ))}
            {historyQuery.data?.restores.length === 0 && (
              <li className="py-4 text-center text-slate-500">No restore jobs yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

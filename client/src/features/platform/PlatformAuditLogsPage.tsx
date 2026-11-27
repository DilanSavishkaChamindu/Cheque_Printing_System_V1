import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { platformService } from '../../services/platformService';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function PlatformAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const query = useQuery({
    queryKey: ['platform-audit-logs', page, action],
    queryFn: () => platformService.listAuditLogs({ page, limit: 20, action }),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Platform Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Immutable log of tenant lifecycle, feature allocation, and platform admin actions.
        </p>
      </div>

      <Card>
        <div className="mb-4">
          <input
            type="text"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by action (e.g. TENANT_CREATED, TENANT_FEATURE_DISABLED)"
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Timestamp</th>
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Entity</th>
                <th className="py-2 pr-3 font-medium">Tenant</th>
                <th className="py-2 font-medium">Administrator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data?.items.map((log) => (
                <tr key={log.id}>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 font-mono font-medium text-slate-900">
                    {log.action}
                  </td>
                  <td className="py-2.5 pr-3 text-slate-600">{log.entityType}</td>
                  <td className="py-2.5 pr-3 text-slate-600">
                    {log.tenant ? `${log.tenant.organizationName} (${log.tenant.tenantCode})` : '—'}
                  </td>
                  <td className="py-2.5 text-slate-600">{log.platformAdmin?.email ?? 'System'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={query.data?.pagination}
          onPageChange={(next) => setPage(next)}
        />
      </Card>
    </div>
  );
}

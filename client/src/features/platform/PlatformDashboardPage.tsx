import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, FileCheck2, Users } from 'lucide-react';
import { platformService } from '../../services/platformService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function PlatformDashboardPage() {
  const query = useQuery({
    queryKey: ['platform-dashboard'],
    queryFn: () => platformService.getDashboard(),
  });

  if (query.isLoading) {
    return <p className="text-sm text-slate-600">Loading platform overview...</p>;
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {extractApiErrorMessage(query.error, 'Failed to load platform dashboard.')}
      </div>
    );
  }

  const { totals, tenantUsage, recentActivities, systemHealth } = query.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Platform Overview</h1>
          <p className="mt-1 text-sm text-slate-600">
            SaaS tenant status, non-financial usage metrics, and system health.
          </p>
        </div>
        <Link to="/platform/tenants/new">
          <Button>Register New Tenant</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Tenants</span>
            <Building2 className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {totals.totalTenants}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totals.activeTenants} active · {totals.suspendedTenants} suspended ·{' '}
            {totals.inactiveTenants} inactive
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Users</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {totals.totalUsers}
          </p>
          <p className="mt-1 text-xs text-slate-500">Across all client organizations</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Cheques</span>
            <FileCheck2 className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {totals.totalIssuedCheques + totals.totalReceivedCheques}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {totals.totalIssuedCheques} issued · {totals.totalReceivedCheques} received
          </p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">System Health</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <Badge variant={systemHealth.databaseConnected ? 'success' : 'danger'}>
              {systemHealth.databaseConnected ? 'MySQL Connected' : 'Database Issue'}
            </Badge>
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-slate-500">
            API Uptime: {systemHealth.uptimeSeconds}s
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Tenant Usage" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Organization</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium text-right">Users</th>
                  <th className="py-2 pr-3 font-medium text-right">Companies</th>
                  <th className="py-2 pr-3 font-medium text-right">Cheques</th>
                  <th className="py-2 font-medium text-right">Features</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenantUsage.map((row) => (
                  <tr key={row.tenantId}>
                    <td className="py-2.5 pr-3">
                      <Link
                        to={`/platform/tenants/${row.tenantId}`}
                        className="font-medium text-slate-900 hover:text-emerald-700"
                      >
                        {row.organizationName}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">
                        {row.tenantCode}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge
                        variant={
                          row.status === 'ACTIVE'
                            ? 'success'
                            : row.status === 'SUSPENDED'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.usersCount}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{row.companiesCount}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {row.issuedChequesCount + row.receivedChequesCount}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {row.enabledFeaturesCount}
                    </td>
                  </tr>
                ))}
                {tenantUsage.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No client organizations registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent Platform Activity">
          <ul className="space-y-3 text-xs">
            {recentActivities.map((item) => (
              <li key={item.id} className="border-b border-slate-100 pb-2.5 last:border-0">
                <p className="font-medium text-slate-900">{item.action}</p>
                <p className="text-slate-500">
                  {item.tenantName ?? item.entityType} · {item.actorEmail ?? 'System'}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
            {recentActivities.length === 0 && (
              <li className="py-4 text-center text-slate-500">No platform audit entries yet.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

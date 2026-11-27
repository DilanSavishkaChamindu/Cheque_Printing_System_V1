import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { TenantStatus } from '@cheque-saas/shared';
import { platformService } from '../../services/platformService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

type TabKey = 'overview' | 'features' | 'history' | 'users';

export function TenantDetailsPage() {
  const { tenantId = '' } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [statusReason, setStatusReason] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);

  const tenantQuery = useQuery({
    queryKey: ['platform-tenant-details', tenantId],
    queryFn: () => platformService.getTenantDetails(tenantId),
    enabled: Boolean(tenantId),
  });

  const historyQuery = useQuery({
    queryKey: ['platform-tenant-feature-history', tenantId, historyPage],
    queryFn: () => platformService.getTenantFeatureHistory(tenantId, historyPage, 15),
    enabled: Boolean(tenantId) && activeTab === 'history',
  });

  const usersQuery = useQuery({
    queryKey: ['platform-tenant-users', tenantId, usersPage],
    queryFn: () => platformService.listTenantUsers(tenantId, usersPage, 15),
    enabled: Boolean(tenantId) && activeTab === 'users',
  });

  const statusMutation = useMutation({
    mutationFn: (status: TenantStatus) =>
      platformService.updateTenantStatus(tenantId, {
        status,
        reason: statusReason.trim() || undefined,
      }),
    onSuccess: async () => {
      setStatusReason('');
      await queryClient.invalidateQueries({
        queryKey: ['platform-tenant-details', tenantId],
      });
    },
  });

  const featureMutation = useMutation({
    mutationFn: (payload: { featureKey: string; isEnabled: boolean }) =>
      platformService.setTenantFeature(tenantId, payload.featureKey, {
        isEnabled: payload.isEnabled,
        isOverride: true,
        overrideReason: overrideReason.trim() || 'Updated by Platform Administrator',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['platform-tenant-details', tenantId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['platform-tenant-feature-history', tenantId],
      });
    },
  });

  if (tenantQuery.isLoading) {
    return <p className="text-sm text-slate-600">Loading tenant configuration...</p>;
  }

  if (tenantQuery.isError || !tenantQuery.data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {extractApiErrorMessage(tenantQuery.error, 'Tenant not found.')}
      </div>
    );
  }

  const tenant = tenantQuery.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-slate-900">
              {tenant.organizationName}
            </h1>
            <Badge
              variant={
                tenant.status === 'ACTIVE'
                  ? 'success'
                  : tenant.status === 'SUSPENDED'
                    ? 'danger'
                    : 'warning'
              }
            >
              {tenant.status}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-xs text-slate-500">
            {tenant.tenantCode} · {tenant.country} · Default Company:{' '}
            {tenant.defaultCompany?.companyName ?? 'Not Set'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {(
          [
            ['overview', 'Overview & Status'],
            ['features', 'Features & Overrides'],
            ['history', 'Feature History'],
            ['users', `Users (${tenant.usage.usersCount})`],
          ] as Array<[TabKey, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Organization Details" className="lg:col-span-2">
            <dl className="grid gap-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Registered Business Name</dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  {tenant.registeredBusinessName ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Registration Number</dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  {tenant.registrationNumber ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Contact Person</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{tenant.contactPerson}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="mt-0.5 font-medium text-slate-900">{tenant.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="mt-0.5 font-medium text-slate-900">
                  {tenant.contactNumber ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Usage Summary</dt>
                <dd className="mt-0.5 tabular-nums font-medium text-slate-900">
                  {tenant.usage.companiesCount} companies · {tenant.usage.bankAccountsCount} bank
                  accounts · {tenant.usage.issuedChequesCount} issued cheques
                </dd>
              </div>
            </dl>
          </Card>

          <Card
            title="Lifecycle & Suspension Control"
            subtitle="Suspending or deactivating immediately revokes active tenant sessions."
          >
            <div className="space-y-3">
              <input
                type="text"
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                placeholder="Reason for status change (optional)"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
              {statusMutation.isError && (
                <p className="text-xs text-rose-600">
                  {extractApiErrorMessage(statusMutation.error)}
                </p>
              )}
              <div className="grid gap-2">
                <Button
                  variant="primary"
                  disabled={tenant.status === 'ACTIVE' || statusMutation.isPending}
                  onClick={() => statusMutation.mutate('ACTIVE')}
                >
                  Activate Tenant
                </Button>
                <Button
                  variant="danger"
                  disabled={tenant.status === 'SUSPENDED' || statusMutation.isPending}
                  onClick={() => statusMutation.mutate('SUSPENDED')}
                >
                  Suspend Tenant
                </Button>
                <Button
                  variant="secondary"
                  disabled={tenant.status === 'INACTIVE' || statusMutation.isPending}
                  onClick={() => statusMutation.mutate('INACTIVE')}
                >
                  Deactivate Tenant
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'features' && (
        <Card
          title="Tenant Feature Entitlements"
          subtitle="Changes take effect immediately on backend API authorization and dynamic navigation."
        >
          <div className="mb-4">
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Audit reason for feature toggle (optional)"
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>

          <div className="divide-y divide-slate-100">
            {tenant.features.map((feat) => (
              <div
                key={feat.featureId}
                className="flex flex-wrap items-center justify-between gap-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {feat.featureName}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {feat.featureKey}
                    </span>
                    {!feat.isGlobalActive && (
                      <Badge variant="danger">Globally Disabled</Badge>
                    )}
                    {feat.isOverride && <Badge variant="info">Tenant Override</Badge>}
                  </div>
                  {feat.description && (
                    <p className="mt-0.5 text-xs text-slate-500">{feat.description}</p>
                  )}
                </div>

                <Button
                  variant={feat.isEnabledForTenant ? 'secondary' : 'primary'}
                  disabled={featureMutation.isPending}
                  onClick={() =>
                    featureMutation.mutate({
                      featureKey: feat.featureKey,
                      isEnabled: !feat.isEnabledForTenant,
                    })
                  }
                >
                  {feat.isEnabledForTenant ? 'Disable Feature' : 'Enable Feature'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'history' && (
        <Card title="Feature Allocation Change History">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Timestamp</th>
                  <th className="py-2 pr-3 font-medium">Feature</th>
                  <th className="py-2 pr-3 font-medium">Change</th>
                  <th className="py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyQuery.data?.items.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {new Date(row.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      {row.featureName}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={row.newEnabled ? 'success' : 'danger'}>
                        {row.previousEnabled === null
                          ? row.newEnabled
                            ? 'Provisioned: Enabled'
                            : 'Provisioned: Disabled'
                          : `${row.previousEnabled ? 'Enabled' : 'Disabled'} → ${
                              row.newEnabled ? 'Enabled' : 'Disabled'
                            }`}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-slate-600">{row.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            pagination={historyQuery.data?.pagination}
            onPageChange={(p) => setHistoryPage(p)}
          />
        </Card>
      )}

      {activeTab === 'users' && (
        <Card title="Organization Users">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Email / Username</th>
                  <th className="py-2 pr-3 font-medium">Roles</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersQuery.data?.items.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2.5 pr-3 font-medium text-slate-900">
                      {u.firstName} {u.lastName}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {u.email} ({u.username})
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">
                      {u.roles.map((r) => r.name).join(', ') || '—'}
                    </td>
                    <td className="py-2.5">
                      <Badge variant={u.status === 'ACTIVE' ? 'success' : 'danger'}>
                        {u.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            pagination={usersQuery.data?.pagination}
            onPageChange={(p) => setUsersPage(p)}
          />
        </Card>
      )}
    </div>
  );
}

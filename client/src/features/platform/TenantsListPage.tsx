import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import type { TenantStatus } from '@cheque-saas/shared';
import { platformService } from '../../services/platformService';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function TenantsListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TenantStatus | ''>('');

  const query = useQuery({
    queryKey: ['platform-tenants', page, search, status],
    queryFn: () =>
      platformService.listTenants({
        page,
        limit: 15,
        search,
        status,
      }),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Client Organizations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage registered tenants, lifecycle status, and feature entitlements.
          </p>
        </div>
        <Link to="/platform/tenants/new">
          <Button>
            <Plus className="h-4 w-4" />
            <span>Register Tenant</span>
          </Button>
        </Link>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-60">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by code, organization, contact, or email..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as TenantStatus | '');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INACTIVE">Inactive</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2.5 pr-3 font-medium">Code</th>
                <th className="py-2.5 pr-3 font-medium">Organization</th>
                <th className="py-2.5 pr-3 font-medium">Contact</th>
                <th className="py-2.5 pr-3 font-medium">Country</th>
                <th className="py-2.5 pr-3 font-medium">Status</th>
                <th className="py-2.5 pr-3 font-medium text-right">Users</th>
                <th className="py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data?.items.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="py-3 pr-3 font-mono font-medium text-slate-700">
                    {tenant.tenantCode}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-slate-900">{tenant.organizationName}</div>
                    <div className="text-[11px] text-slate-400">{tenant.email}</div>
                  </td>
                  <td className="py-3 pr-3 text-slate-600">{tenant.contactPerson}</td>
                  <td className="py-3 pr-3 text-slate-600">{tenant.country}</td>
                  <td className="py-3 pr-3">
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
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    {tenant.usage.usersCount}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      to={`/platform/tenants/${tenant.id}`}
                      className="font-medium text-emerald-700 hover:text-emerald-900"
                    >
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
              {!query.isLoading && query.data?.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No matching tenants found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          pagination={query.data?.pagination}
          onPageChange={(nextPage) => setPage(nextPage)}
        />
      </Card>
    </div>
  );
}

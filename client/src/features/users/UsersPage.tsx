import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import {
  organizationService,
  type TenantUserDto,
} from '../../services/organizationService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

export function UsersPage() {
  const queryClient = useQueryClient();
  const { tenantUser } = useAuthStore();
  const canManage = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.USER_MANAGE)
  );
  const companiesEnabled = Boolean(
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES)
  );

  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<TenantUserDto | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isClientAdmin, setIsClientAdmin] = useState(false);
  const [companyAccessScope, setCompanyAccessScope] = useState<
    'ALL_COMPANIES' | 'SELECTED_COMPANIES'
  >('ALL_COMPANIES');
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [userError, setUserError] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<TenantUserDto | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [activityTarget, setActivityTarget] = useState<TenantUserDto | null>(null);

  // Role form
  const [roleCode, setRoleCode] = useState('');
  const [roleName, setRoleName] = useState('');
  const [rolePermissions, setRolePermissions] = useState<string[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users', page, search, statusFilter],
    queryFn: () =>
      organizationService.listUsers({
        page,
        limit: 15,
        search,
        status: statusFilter,
      }),
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => organizationService.listRoles(),
  });

  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: () => organizationService.listPermissions(),
  });

  const companiesQuery = useQuery({
    queryKey: ['companies-for-users'],
    queryFn: () => organizationService.listCompanies({ page: 1, limit: 100 }),
    enabled: companiesEnabled,
  });

  const activityQuery = useQuery({
    queryKey: ['user-activity', activityTarget?.id],
    queryFn: () => organizationService.getUserActivity(activityTarget!.id),
    enabled: Boolean(activityTarget),
  });

  const openCreateUser = () => {
    setEditingUser(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setUsername('');
    setMobileNumber('');
    setPassword('');
    setIsClientAdmin(false);
    setCompanyAccessScope('ALL_COMPANIES');
    setSelectedRoleIds([]);
    setSelectedCompanyIds([]);
    setUserError(null);
    setShowUserForm(true);
  };

  const openEditUser = (u: TenantUserDto) => {
    setEditingUser(u);
    setFirstName(u.firstName);
    setLastName(u.lastName);
    setEmail(u.email);
    setUsername(u.username);
    setMobileNumber(u.mobileNumber ?? '');
    setPassword('');
    setIsClientAdmin(u.isClientAdmin);
    setCompanyAccessScope(u.companyAccessScope);
    setSelectedRoleIds(u.roles.map((r) => r.id));
    setSelectedCompanyIds(u.companies.map((c) => c.id));
    setUserError(null);
    setShowUserForm(true);
  };

  const saveUserMutation = useMutation({
    mutationFn: () => {
      if (editingUser) {
        return organizationService.updateUser(editingUser.id, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          mobileNumber: mobileNumber.trim() || null,
          isClientAdmin,
          companyAccessScope: companiesEnabled ? companyAccessScope : 'ALL_COMPANIES',
          companyIds:
            companiesEnabled && companyAccessScope === 'SELECTED_COMPANIES'
              ? selectedCompanyIds
              : [],
          roleIds: selectedRoleIds,
        });
      }
      return organizationService.createUser({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        username: username.trim(),
        mobileNumber: mobileNumber.trim() || null,
        password,
        isClientAdmin,
        companyAccessScope: companiesEnabled ? companyAccessScope : 'ALL_COMPANIES',
        companyIds:
          companiesEnabled && companyAccessScope === 'SELECTED_COMPANIES'
            ? selectedCompanyIds
            : [],
        roleIds: selectedRoleIds,
        permissionOverrides: [],
      });
    },
    onSuccess: async () => {
      setShowUserForm(false);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setUserError(extractApiErrorMessage(err)),
  });

  const userStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' }) =>
      organizationService.updateUserStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const resetPwMutation = useMutation({
    mutationFn: () =>
      organizationService.resetUserPassword(resetTarget!.id, resetPasswordValue),
    onSuccess: () => {
      setResetTarget(null);
      setResetPasswordValue('');
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: () =>
      organizationService.createRole({
        code: roleCode.trim().toUpperCase(),
        name: roleName.trim(),
        permissionCodes: rolePermissions,
      }),
    onSuccess: async () => {
      setRoleCode('');
      setRoleName('');
      setRolePermissions([]);
      setRoleError(null);
      await queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (err) => setRoleError(extractApiErrorMessage(err)),
  });

  const handleSaveUser = (e: FormEvent) => {
    e.preventDefault();
    saveUserMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users & Permissions</h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure organization user accounts, RBAC roles, and company access scopes.
          </p>
        </div>
        {canManage && tab === 'users' && (
          <Button onClick={openCreateUser}>
            <Plus className="h-4 w-4" />
            <span>Add User</span>
          </Button>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`border-b-2 px-4 py-2 text-xs font-semibold ${
            tab === 'users'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500'
          }`}
        >
          Users
        </button>
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={`border-b-2 px-4 py-2 text-xs font-semibold ${
            tab === 'roles'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500'
          }`}
        >
          Roles & Permissions
        </button>
      </div>

      {tab === 'users' && (
        <>
          {showUserForm && canManage && (
            <Card title={editingUser ? `Edit User (${editingUser.username})` : 'Create User'}>
              <form onSubmit={handleSaveUser} className="space-y-4">
                {userError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {userError}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700">First Name *</label>
                    <input
                      type="text"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Last Name *</label>
                    <input
                      type="text"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Email *</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  {!editingUser && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">Username *</label>
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700">Password *</label>
                        <input
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-700">Mobile Number</label>
                    <input
                      type="text"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Assigned Roles
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {rolesQuery.data?.map((role) => (
                      <label key={role.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedRoleIds.includes(role.id)}
                          onChange={() =>
                            setSelectedRoleIds((prev) =>
                              prev.includes(role.id)
                                ? prev.filter((id) => id !== role.id)
                                : [...prev, role.id]
                            )
                          }
                        />
                        <span>{role.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {companiesEnabled && (
                  <div className="space-y-2 border-t border-slate-200 pt-3">
                    <label className="block text-xs font-medium text-slate-700">
                      Company Access Scope
                    </label>
                    <select
                      value={companyAccessScope}
                      onChange={(e) =>
                        setCompanyAccessScope(
                          e.target.value as 'ALL_COMPANIES' | 'SELECTED_COMPANIES'
                        )
                      }
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                    >
                      <option value="ALL_COMPANIES">All Companies</option>
                      <option value="SELECTED_COMPANIES">Selected Companies</option>
                    </select>

                    {companyAccessScope === 'SELECTED_COMPANIES' && (
                      <div className="flex flex-wrap gap-3 pt-1">
                        {companiesQuery.data?.items.map((comp) => (
                          <label key={comp.id} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={selectedCompanyIds.includes(comp.id)}
                              onChange={() =>
                                setSelectedCompanyIds((prev) =>
                                  prev.includes(comp.id)
                                    ? prev.filter((id) => id !== comp.id)
                                    : [...prev, comp.id]
                                )
                              }
                            />
                            <span>
                              {comp.companyName} ({comp.companyCode})
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={isClientAdmin}
                    onChange={(e) => setIsClientAdmin(e.target.checked)}
                  />
                  <span>Grant Client Administrator privileges</span>
                </label>

                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowUserForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveUserMutation.isPending}>
                    {saveUserMutation.isPending ? 'Saving...' : 'Save User'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {resetTarget && (
            <Card title={`Reset Password for ${resetTarget.email}`}>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="password"
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  placeholder="New password (min 8 chars, upper, lower, digit)"
                  className="flex-1 min-w-64 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
                <Button
                  onClick={() => resetPwMutation.mutate()}
                  disabled={resetPwMutation.isPending}
                >
                  Confirm Reset
                </Button>
                <Button variant="secondary" onClick={() => setResetTarget(null)}>
                  Cancel
                </Button>
              </div>
              {resetPwMutation.isError && (
                <p className="mt-2 text-xs text-rose-600">
                  {extractApiErrorMessage(resetPwMutation.error)}
                </p>
              )}
            </Card>
          )}

          {activityTarget && (
            <Card
              title={`Activity Log: ${activityTarget.firstName} ${activityTarget.lastName}`}
              action={
                <Button variant="ghost" onClick={() => setActivityTarget(null)}>
                  Close
                </Button>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 text-xs">
                <div>
                  <h4 className="font-semibold text-slate-800 mb-2">Recent Authentication Events</h4>
                  <ul className="space-y-1.5">
                    {activityQuery.data?.recentAuthLogs.map((l) => (
                      <li key={l.id} className="text-slate-600">
                        <span className="font-mono">{l.eventType}</span> ·{' '}
                        {new Date(l.createdAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 mb-2">Recent Audit Actions</h4>
                  <ul className="space-y-1.5">
                    {activityQuery.data?.auditItems.map((a) => (
                      <li key={a.id} className="text-slate-600">
                        <span className="font-mono">{a.action}</span> ({a.entityType}) ·{' '}
                        {new Date(a.createdAt).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
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
                  placeholder="Search users..."
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-3 font-medium">User</th>
                    <th className="py-2.5 pr-3 font-medium">Roles</th>
                    <th className="py-2.5 pr-3 font-medium">Company Scope</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    <th className="py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersQuery.data?.items.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 pr-3">
                        <div className="font-medium text-slate-900">
                          {u.firstName} {u.lastName}{' '}
                          {u.isClientAdmin && <Badge variant="info">Admin</Badge>}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {u.email} · @{u.username}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        {u.roles.map((r) => r.name).join(', ') || '—'}
                      </td>
                      <td className="py-3 pr-3 text-slate-600">
                        {u.companyAccessScope === 'ALL_COMPANIES'
                          ? 'All Companies'
                          : `${u.companies.length} Selected`}
                      </td>
                      <td className="py-3 pr-3">
                        <Badge
                          variant={
                            u.status === 'ACTIVE'
                              ? 'success'
                              : u.status === 'SUSPENDED'
                                ? 'danger'
                                : 'warning'
                          }
                        >
                          {u.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right space-x-2.5">
                        <button
                          type="button"
                          onClick={() => setActivityTarget(u)}
                          className="font-medium text-slate-600 hover:text-slate-950"
                        >
                          Activity
                        </button>
                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditUser(u)}
                              className="font-medium text-slate-700 hover:text-slate-950"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setResetTarget(u)}
                              className="font-medium text-amber-700 hover:text-amber-900"
                            >
                              Reset PW
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                userStatusMutation.mutate({
                                  id: u.id,
                                  status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                                })
                              }
                              className="font-medium text-emerald-700 hover:text-emerald-900"
                            >
                              {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <PaginationControls
              pagination={usersQuery.data?.pagination}
              onPageChange={(p) => setPage(p)}
            />
          </Card>
        </>
      )}

      {tab === 'roles' && (
        <div className="space-y-5">
          {canManage && (
            <Card title="Create Custom Role">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  createRoleMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    required
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value)}
                    placeholder="Role Code (e.g. AUDITOR)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs uppercase"
                  />
                  <input
                    type="text"
                    required
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="Role Display Name"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                  <Button type="submit" disabled={createRoleMutation.isPending}>
                    Create Role
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {permissionsQuery.data?.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={rolePermissions.includes(perm.code)}
                        onChange={() =>
                          setRolePermissions((prev) =>
                            prev.includes(perm.code)
                              ? prev.filter((c) => c !== perm.code)
                              : [...prev, perm.code]
                          )
                        }
                      />
                      <span>{perm.name}</span>
                    </label>
                  ))}
                </div>
                {roleError && <p className="text-xs text-rose-600">{roleError}</p>}
              </form>
            </Card>
          )}

          <Card title="Organization Roles">
            <div className="divide-y divide-slate-100">
              {rolesQuery.data?.map((role) => (
                <div key={role.id} className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-slate-900">{role.name}</span>{' '}
                      <span className="font-mono text-[11px] text-slate-400">{role.code}</span>
                    </div>
                    <Badge variant="neutral">{role.usersCount} users</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {role.permissions.map((p) => p.name).join(' · ') || 'No permissions assigned'}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

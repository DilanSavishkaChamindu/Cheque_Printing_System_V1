import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FEATURE_KEYS } from '@cheque-saas/shared';
import { analyticsService } from '../../services/analyticsService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';

export function DashboardPage() {
  const { tenantUser, activeCompanyId } = useAuthStore();
  const companiesEnabled = Boolean(
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES)
  );
  const [companyFilter, setCompanyFilter] = useState<string>(
    companiesEnabled ? activeCompanyId ?? '' : ''
  );
  const [monitorTab, setMonitorTab] = useState<'today' | 'tomorrow' | 'nextSevenDays'>(
    'today'
  );

  const query = useQuery({
    queryKey: ['dashboard', companiesEnabled ? companyFilter || activeCompanyId : 'default'],
    queryFn: () =>
      analyticsService.getDashboard(
        companiesEnabled ? companyFilter || activeCompanyId || undefined : undefined
      ),
  });

  if (query.isLoading) {
    return <p className="text-sm text-slate-600">Loading operational dashboard...</p>;
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {extractApiErrorMessage(query.error, 'Unable to load dashboard.')}
      </div>
    );
  }

  const { bankAccounts, chequeSummary, dateMonitor, receivedChequeMonitor } = query.data;
  const monitorList = dateMonitor[monitorTab];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Operational Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Cheque issuance overview, maturity date monitor, received cheques, and internal bank book balances.
          </p>
        </div>

        {companiesEnabled && tenantUser && tenantUser.companies.length > 0 && (
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium"
          >
            <option value="">All Authorized Companies</option>
            {tenantUser.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} ({c.companyCode})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Cheque Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Cheques', value: chequeSummary.totalCheques, tone: 'text-slate-900' },
          { label: 'Issued (Active)', value: chequeSummary.issuedCheques, tone: 'text-sky-700' },
          { label: 'Printed (Separate Axis)', value: chequeSummary.printedCheques, tone: 'text-indigo-700' },
          { label: 'Pending Clearance', value: chequeSummary.pendingCheques, tone: 'text-amber-700' },
          { label: 'Cleared', value: chequeSummary.clearedCheques, tone: 'text-emerald-700' },
          { label: 'Postponed', value: chequeSummary.postponedCheques, tone: 'text-amber-800' },
          { label: 'Bounced', value: chequeSummary.bouncedCheques, tone: 'text-rose-700' },
          { label: 'Cancelled', value: chequeSummary.cancelledCheques, tone: 'text-slate-500' },
        ].map((card) => (
          <Card key={card.label}>
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-semibold tabular-nums ${card.tone}`}>
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Received Cheque Monitor */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/received-cheques" className="block">
          <Card title="Received Today" subtitle="Click to inspect received cheques">
            <p className="text-2xl font-semibold tabular-nums text-slate-900">
              {receivedChequeMonitor.receivedTodayCount}
            </p>
          </Card>
        </Link>
        <Link to="/received-cheques" className="block">
          <Card title="Pending Banking" subtitle="Received / Pending Deposit">
            <p className="text-2xl font-semibold tabular-nums text-amber-700">
              {receivedChequeMonitor.pendingBankingCount}
            </p>
          </Card>
        </Link>
        <Link to="/received-cheques" className="block">
          <Card title="Banked Today" subtitle="Deposited today">
            <p className="text-2xl font-semibold tabular-nums text-emerald-700">
              {receivedChequeMonitor.bankedTodayCount}
            </p>
          </Card>
        </Link>
      </div>

      {/* Bank Account Overview */}
      <Card
        title="Bank Accounts Overview"
        subtitle="Internal Book Balances (not live bank feeds)"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Bank &amp; Branch</th>
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium text-right">Current Book Balance</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bankAccounts.map((acc) => (
                <tr key={acc.id}>
                  <td className="py-2.5 pr-3">
                    <div className="font-medium text-slate-900">{acc.bankName}</div>
                    <div className="text-[11px] text-slate-500">{acc.branchName}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="text-slate-800">{acc.accountName}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {acc.accountNumberMasked}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                    {acc.currency}{' '}
                    {Number(acc.currentBookBalance).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="py-2.5">
                    <Badge variant={acc.status === 'ACTIVE' ? 'success' : 'warning'}>
                      {acc.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {bankAccounts.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    No bank accounts found for this selection.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Cheque Date Monitor */}
      <Card
        title="Cheque Date Monitor"
        action={
          <div className="flex gap-1.5">
            {(
              [
                ['today', `Today (${dateMonitor.today.length})`],
                ['tomorrow', `Tomorrow (${dateMonitor.tomorrow.length})`],
                ['nextSevenDays', `Next 7 Days (${dateMonitor.nextSevenDays.length})`],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setMonitorTab(tabKey)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  monitorTab === tabKey
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Cheque #</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Payee</th>
                <th className="py-2 pr-3 font-medium">Bank Account</th>
                <th className="py-2 pr-3 font-medium text-right">Amount</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monitorList.map((item) => (
                <tr key={item.id}>
                  <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                    {item.chequeNumber}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-600">{item.chequeDate}</td>
                  <td className="py-2.5 pr-3 font-medium text-slate-900">{item.payeeName}</td>
                  <td className="py-2.5 pr-3 text-slate-600">{item.bankAccountLabel}</td>
                  <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums">
                    {item.currency}{' '}
                    {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5">
                    <Badge variant="info">{item.bankingStatus}</Badge>
                  </td>
                </tr>
              ))}
              {monitorList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    No cheques scheduled for this date window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

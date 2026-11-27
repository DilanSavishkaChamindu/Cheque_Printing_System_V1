import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import {
  FEATURE_KEYS,
  PERMISSION_CODES,
  type ReportCategory,
} from '@cheque-saas/shared';
import { analyticsService } from '../../services/analyticsService';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PaginationControls } from '../../components/ui/Pagination';

const REPORT_CATEGORIES: Array<{ value: ReportCategory; label: string }> = [
  { value: 'ISSUED_CHEQUE', label: 'Issued Cheque Report' },
  { value: 'RECEIVED_CHEQUE', label: 'Received Cheque Report' },
  { value: 'BANK_ACCOUNT', label: 'Bank Account Report' },
  { value: 'BANK_TRANSACTION', label: 'Bank Transaction Report' },
  { value: 'DAILY_CHEQUE', label: 'Daily Cheque Report' },
  { value: 'MONTHLY_CHEQUE', label: 'Monthly Cheque Report' },
  { value: 'PENDING_CHEQUE', label: 'Pending Cheque Report' },
  { value: 'CLEARED_CHEQUE', label: 'Cleared Cheque Report' },
  { value: 'BOUNCED_CHEQUE', label: 'Bounced Cheque Report' },
  { value: 'CANCELLED_CHEQUE', label: 'Cancelled Cheque Report' },
];

export function ReportsPage() {
  const { tenantUser, activeCompanyId } = useAuthStore();
  const companiesEnabled = Boolean(
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES)
  );
  const canExport = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.REPORTS_EXPORT)
  );

  const [category, setCategory] = useState<ReportCategory>('ISSUED_CHEQUE');
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');

  const reportQuery = useQuery({
    queryKey: [
      'operational-report',
      category,
      page,
      fromDate,
      toDate,
      payeeName,
      chequeNumber,
      activeCompanyId,
    ],
    queryFn: () =>
      analyticsService.runReport({
        category,
        page,
        limit: 20,
        companyId: companiesEnabled ? activeCompanyId ?? undefined : undefined,
        fromDate,
        toDate,
        payeeName,
        chequeNumber,
      }),
  });

  const data = reportQuery.data;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Operational Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Server-paginated cheque and bank ledger reports with PDF, Excel, and Print output.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canExport && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  void analyticsService.exportReport({
                    category,
                    format: 'EXCEL',
                    page: 1,
                    limit: 100,
                    sortOrder: 'desc',
                    companyId: companiesEnabled ? activeCompanyId ?? undefined : undefined,
                    fromDate: fromDate || undefined,
                    toDate: toDate || undefined,
                    payeeName: payeeName || undefined,
                    chequeNumber: chequeNumber || undefined,
                  })
                }
              >
                <Download className="h-4 w-4" />
                <span>Export Excel</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void analyticsService.exportReport({
                    category,
                    format: 'PDF',
                    page: 1,
                    limit: 100,
                    sortOrder: 'desc',
                    companyId: companiesEnabled ? activeCompanyId ?? undefined : undefined,
                    fromDate: fromDate || undefined,
                    toDate: toDate || undefined,
                    payeeName: payeeName || undefined,
                    chequeNumber: chequeNumber || undefined,
                  })
                }
              >
                <Download className="h-4 w-4" />
                <span>Export PDF</span>
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            <span>Print</span>
          </Button>
        </div>
      </div>

      <Card className="no-print">
        <div className="grid gap-3 sm:grid-cols-5">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ReportCategory);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium sm:col-span-2"
          >
            {REPORT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={chequeNumber}
            onChange={(e) => {
              setChequeNumber(e.target.value);
              setPage(1);
            }}
            placeholder="Cheque #"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={payeeName}
            onChange={(e) => {
              setPayeeName(e.target.value);
              setPage(1);
            }}
            placeholder="Payee / Party"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
          <div className="flex gap-1.5">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-[11px]"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-[11px]"
            />
          </div>
        </div>
      </Card>

      {data && (
        <Card
          title={REPORT_CATEGORIES.find((c) => c.value === data.category)?.label}
          subtitle={`Total Records: ${data.summary.recordCount} · Summary Total: ${Number(
            data.summary.totalAmount
          ).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  {data.columns.map((col) => (
                    <th key={col.key} className="py-2.5 pr-3 font-medium">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row, idx) => (
                  <tr key={idx}>
                    {data.columns.map((col) => (
                      <td key={col.key} className="py-2.5 pr-3 text-slate-800">
                        {String(row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={data.columns.length}
                      className="py-8 text-center text-slate-500"
                    >
                      No records matched the selected report criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            pagination={{
              page: data.page,
              limit: data.limit,
              totalItems: data.totalItems,
              totalPages: Math.max(1, Math.ceil(data.totalItems / data.limit)),
              hasNextPage: data.page * data.limit < data.totalItems,
              hasPreviousPage: data.page > 1,
            }}
            onPageChange={(p) => setPage(p)}
          />
        </Card>
      )}
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Database,
  HardDrive,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react';
import type { ApiSuccessResponse } from '@cheque-saas/shared';
import { apiClient, extractApiErrorMessage } from '../../lib/apiClient';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

interface HealthPayload {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds: number;
  database: {
    connected: boolean;
    latencyMs?: number;
    error?: string;
  };
}

export function SystemStatusPage() {
  const { isOnline, pendingSyncCount } = useOnlineStatus();

  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const response = await apiClient.get<ApiSuccessResponse<HealthPayload>>('/health', {
        validateStatus: (status) => status === 200 || status === 503,
      });
      return response.data;
    },
    retry: false,
  });

  const health = healthQuery.data?.data;
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const indexedDbSupported = typeof indexedDB !== 'undefined';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Platform Foundation & System Status
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Live verification of Express API connectivity, MySQL 8.0 database health,
            and local PWA offline storage readiness.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={() => void healthQuery.refetch()}
          disabled={healthQuery.isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 ${healthQuery.isFetching ? 'animate-spin' : ''}`}
          />
          <span>Refresh Health Check</span>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Backend API Card */}
        <Card
          title="Backend API"
          subtitle="/api/v1/health"
          action={
            healthQuery.isError ? (
              <Badge variant="danger">Unreachable</Badge>
            ) : health ? (
              <Badge variant="success">Online</Badge>
            ) : (
              <Badge variant="neutral">Checking</Badge>
            )
          }
        >
          {healthQuery.isError ? (
            <div className="flex items-start gap-2.5 text-xs text-rose-700">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{extractApiErrorMessage(healthQuery.error, 'Could not reach Express API.')}</p>
            </div>
          ) : health ? (
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Service</dt>
                <dd className="font-mono text-slate-900">{health.service}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Version</dt>
                <dd className="font-mono text-slate-900">{health.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Uptime</dt>
                <dd className="tabular-nums text-slate-900">{health.uptimeSeconds}s</dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs text-slate-500">Probing API endpoint...</p>
          )}
        </Card>

        {/* MySQL 8.0 Card */}
        <Card
          title="Central Database (MySQL 8.0)"
          subtitle="Prisma ORM Connection"
          action={
            health?.database.connected ? (
              <Badge variant="success">Connected</Badge>
            ) : healthQuery.isError ? (
              <Badge variant="neutral">Unknown</Badge>
            ) : (
              <Badge variant="warning">Disconnected</Badge>
            )
          }
        >
          {health?.database.connected ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2 text-emerald-700">
                <Database className="h-4 w-4" />
                <span>MySQL connection verified</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Query Latency</span>
                <span className="tabular-nums font-medium text-slate-900">
                  {health.database.latencyMs ?? 0} ms
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-slate-600">
              {health?.database.error
                ? 'Database connectivity unavailable. Configure server/.env DATABASE_URL and run Prisma migrations.'
                : 'Waiting for API database probe.'}
            </p>
          )}
        </Card>

        {/* Local PWA / Dexie Card */}
        <Card
          title="PWA & Local Storage"
          subtitle="IndexedDB + Dexie.js"
          action={
            <Badge variant={isOnline ? 'info' : 'warning'}>
              {isOnline ? 'Browser Online' : 'Browser Offline'}
            </Badge>
          }
        >
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">IndexedDB</dt>
              <dd className="font-medium text-slate-900">
                {indexedDbSupported ? 'Available' : 'Unsupported'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Service Worker API</dt>
              <dd className="font-medium text-slate-900">
                {swSupported ? 'Supported' : 'Unsupported'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Pending Sync Queue</dt>
              <dd className="tabular-nums font-medium text-slate-900">
                {pendingSyncCount} operations
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card
        title="Phase 1 Implementation Foundation"
        subtitle="Completed foundational infrastructure ready for Phase 2 (Authentication & SaaS Multi-Tenancy)"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: Server,
              title: 'Modular Monolith API',
              detail: 'Express 5, Helmet, CORS, Pino log redaction, rate limiters, Zod validation, and unified JSON responses.',
            },
            {
              icon: Database,
              title: 'Multi-Tenant MySQL Schema',
              detail: 'Full Prisma schema across platform, tenant RBAC, banks, ledgers, cheques, templates, sync, backups, and audits.',
            },
            {
              icon: HardDrive,
              title: 'PWA & Dexie Foundation',
              detail: 'Workbox asset shell config, Dexie IndexedDB schema, online/offline indicator, and print-ready CSS baseline.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{item.title}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

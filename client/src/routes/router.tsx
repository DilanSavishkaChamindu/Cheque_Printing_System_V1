import { createBrowserRouter } from 'react-router-dom';
import { FEATURE_KEYS, PERMISSION_CODES } from '@cheque-saas/shared';
import { AppLayout } from '../layouts/AppLayout';
import { PlatformLayout } from '../layouts/PlatformLayout';
import { SystemStatusPage } from '../features/foundation/SystemStatusPage';
import { ModulePendingPhasePage } from '../features/foundation/ModulePendingPhasePage';
import { NotFoundPage } from '../features/foundation/NotFoundPage';
import { TenantLoginPage } from '../features/authentication/TenantLoginPage';
import { PlatformLoginPage } from '../features/authentication/PlatformLoginPage';
import { ForgotPasswordPage } from '../features/authentication/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/authentication/ResetPasswordPage';
import { SecuritySettingsPage } from '../features/authentication/SecuritySettingsPage';
import { OrganizationSettingsPage } from '../features/tenants/OrganizationSettingsPage';
import { CompaniesPage } from '../features/companies/CompaniesPage';
import { BanksPage } from '../features/banks/BanksPage';
import { UsersPage } from '../features/users/UsersPage';
import { BankAccountsPage } from '../features/bank-accounts/BankAccountsPage';
import { BankLedgerPage } from '../features/bank-accounts/BankLedgerPage';
import { NewChequePage } from '../features/cheques/NewChequePage';
import { ChequeHistoryPage } from '../features/cheques/ChequeHistoryPage';
import { ReceivedChequesPage } from '../features/received-cheques/ReceivedChequesPage';
import { TemplatesPage } from '../features/templates/TemplatesPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ReportsPage } from '../features/reports/ReportsPage';
import { BackupsPage } from '../features/backups/BackupsPage';
import { SyncCenterPage } from '../features/synchronization/SyncCenterPage';
import { PlatformDashboardPage } from '../features/platform/PlatformDashboardPage';
import { TenantsListPage } from '../features/platform/TenantsListPage';
import { CreateTenantPage } from '../features/platform/CreateTenantPage';
import { TenantDetailsPage } from '../features/platform/TenantDetailsPage';
import { GlobalFeaturesPage } from '../features/platform/GlobalFeaturesPage';
import { PlatformAuditLogsPage } from '../features/platform/PlatformAuditLogsPage';
import {
  FeatureRouteGuard,
  PlatformProtectedRoute,
  TenantProtectedRoute,
} from './guards';

export const router = createBrowserRouter([
  { path: '/login', element: <TenantLoginPage /> },
  { path: '/platform/login', element: <PlatformLoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/system-status',
    element: <AppLayout />,
    children: [{ index: true, element: <SystemStatusPage /> }],
  },

  {
    path: '/platform',
    element: <PlatformProtectedRoute />,
    children: [
      {
        element: <PlatformLayout />,
        children: [
          { index: true, element: <PlatformDashboardPage /> },
          { path: 'tenants', element: <TenantsListPage /> },
          { path: 'tenants/new', element: <CreateTenantPage /> },
          { path: 'tenants/:tenantId', element: <TenantDetailsPage /> },
          { path: 'features', element: <GlobalFeaturesPage /> },
          { path: 'audit-logs', element: <PlatformAuditLogsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },

  {
    path: '/',
    element: <TenantProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <SystemStatusPage /> },
          {
            path: 'dashboard',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.DASHBOARD}
                requiredPermission={PERMISSION_CODES.DASHBOARD_VIEW}
              >
                <DashboardPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'cheques/new',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.NEW_CHEQUE}
                requiredPermission={PERMISSION_CODES.CHEQUE_CREATE}
              >
                <NewChequePage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'cheques/history',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.CHEQUE_HISTORY}
                requiredPermission={PERMISSION_CODES.CHEQUE_HISTORY_VIEW}
              >
                <ChequeHistoryPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'received-cheques',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.RECEIVED_CHEQUES}
                requiredPermission={PERMISSION_CODES.RECEIVED_CHEQUE_VIEW}
              >
                <ReceivedChequesPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'banks',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.BANK_MANAGEMENT}
                requiredPermission={PERMISSION_CODES.BANK_VIEW}
              >
                <BanksPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'bank-accounts',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.BANK_BALANCE}
                requiredPermission={PERMISSION_CODES.BANK_ACCOUNT_VIEW}
              >
                <BankAccountsPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'bank-accounts/:bankAccountId/ledger',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.BANK_BALANCE}
                requiredPermission={PERMISSION_CODES.BANK_ACCOUNT_VIEW}
              >
                <BankLedgerPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'templates',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.TEMPLATES_CALIBRATION}
                requiredPermission={PERMISSION_CODES.TEMPLATE_VIEW}
              >
                <TemplatesPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'reports',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.REPORTS}
                requiredPermission={PERMISSION_CODES.REPORTS_VIEW}
              >
                <ReportsPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'companies',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.COMPANIES}
                requiredPermission={PERMISSION_CODES.COMPANY_VIEW}
              >
                <CompaniesPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'users',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.USER_MANAGEMENT}
                requiredPermission={PERMISSION_CODES.USER_VIEW}
              >
                <UsersPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'backups',
            element: (
              <FeatureRouteGuard
                featureKey={FEATURE_KEYS.BACKUP_RESTORE}
                requiredPermission={PERMISSION_CODES.BACKUP_VIEW}
              >
                <BackupsPage />
              </FeatureRouteGuard>
            ),
          },
          {
            path: 'settings/organization',
            element: (
              <FeatureRouteGuard requireAdmin>
                <OrganizationSettingsPage />
              </FeatureRouteGuard>
            ),
          },
          { path: 'sync', element: <SyncCenterPage /> },
          { path: 'settings/security', element: <SecuritySettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

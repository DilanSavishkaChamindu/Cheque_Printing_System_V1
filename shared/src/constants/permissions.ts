import { FEATURE_KEYS, type FeatureKey } from './features.js';

export const PERMISSION_CODES = {
  DASHBOARD_VIEW: 'dashboard.view',
  CHEQUE_CREATE: 'cheque.create',
  CHEQUE_EDIT: 'cheque.edit',
  CHEQUE_HISTORY_VIEW: 'cheque.history.view',
  CHEQUE_PRINT: 'cheque.print',
  CHEQUE_CANCEL: 'cheque.cancel',
  CHEQUE_STATUS_UPDATE: 'cheque.status.update',
  CHEQUE_BOOK_VIEW: 'cheque_book.view',
  CHEQUE_BOOK_MANAGE: 'cheque_book.manage',
  RECEIVED_CHEQUE_VIEW: 'received_cheque.view',
  RECEIVED_CHEQUE_MANAGE: 'received_cheque.manage',
  BANK_VIEW: 'bank.view',
  BANK_MANAGE: 'bank.manage',
  BANK_ACCOUNT_VIEW: 'bank_account.view',
  BANK_ACCOUNT_MANAGE: 'bank_account.manage',
  BANK_TRANSACTION_MANAGE: 'bank_transaction.manage',
  TEMPLATE_VIEW: 'template.view',
  TEMPLATE_MANAGE: 'template.manage',
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  BACKUP_VIEW: 'backup.view',
  BACKUP_MANAGE: 'backup.manage',
  COMPANY_VIEW: 'company.view',
  COMPANY_MANAGE: 'company.manage',
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  AUDIT_VIEW: 'audit.view',
  DEVICE_MANAGE: 'device.manage',
} as const;

export type PermissionCode = (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];

export interface PermissionDefinitionSeed {
  code: PermissionCode;
  name: string;
  moduleKey: FeatureKey | 'system';
  description: string;
}

export const INITIAL_PERMISSION_CATALOG: readonly PermissionDefinitionSeed[] = [
  {
    code: PERMISSION_CODES.DASHBOARD_VIEW,
    name: 'View Dashboard',
    moduleKey: FEATURE_KEYS.DASHBOARD,
    description: 'Access operational dashboard metrics and date monitors.',
  },
  {
    code: PERMISSION_CODES.CHEQUE_CREATE,
    name: 'Create Cheques',
    moduleKey: FEATURE_KEYS.NEW_CHEQUE,
    description: 'Prepare and issue new cheques.',
  },
  {
    code: PERMISSION_CODES.CHEQUE_EDIT,
    name: 'Edit Cheques',
    moduleKey: FEATURE_KEYS.CHEQUE_HISTORY,
    description: 'Modify editable cheque drafts and allowed fields prior to lock.',
  },
  {
    code: PERMISSION_CODES.CHEQUE_HISTORY_VIEW,
    name: 'View Cheque History',
    moduleKey: FEATURE_KEYS.CHEQUE_HISTORY,
    description: 'Search and view issued cheques and status timelines.',
  },
  {
    code: PERMISSION_CODES.CHEQUE_PRINT,
    name: 'Print Cheques',
    moduleKey: FEATURE_KEYS.NEW_CHEQUE,
    description: 'Print cheques, reprint authorized cheques, and export cheque PDFs.',
  },
  {
    code: PERMISSION_CODES.CHEQUE_CANCEL,
    name: 'Cancel Cheques',
    moduleKey: FEATURE_KEYS.CHEQUE_HISTORY,
    description: 'Cancel issued cheques with required audit justification.',
  },
  {
    code: PERMISSION_CODES.CHEQUE_STATUS_UPDATE,
    name: 'Update Cheque Banking Status',
    moduleKey: FEATURE_KEYS.CHEQUE_HISTORY,
    description: 'Transition cheque banking statuses (presented, cleared, bounced, postponed, stopped).',
  },
  {
    code: PERMISSION_CODES.CHEQUE_BOOK_VIEW,
    name: 'View Cheque Books',
    moduleKey: FEATURE_KEYS.NEW_CHEQUE,
    description: 'View cheque books and allocated number ranges.',
  },
  {
    code: PERMISSION_CODES.CHEQUE_BOOK_MANAGE,
    name: 'Manage Cheque Books',
    moduleKey: FEATURE_KEYS.BANK_BALANCE,
    description: 'Register cheque books and allocate offline cheque-number ranges.',
  },
  {
    code: PERMISSION_CODES.RECEIVED_CHEQUE_VIEW,
    name: 'View Received Cheques',
    moduleKey: FEATURE_KEYS.RECEIVED_CHEQUES,
    description: 'View received cheques and deposit status history.',
  },
  {
    code: PERMISSION_CODES.RECEIVED_CHEQUE_MANAGE,
    name: 'Manage Received Cheques',
    moduleKey: FEATURE_KEYS.RECEIVED_CHEQUES,
    description: 'Create, edit, deposit, clear, or return received cheques.',
  },
  {
    code: PERMISSION_CODES.BANK_VIEW,
    name: 'View Banks & Branches',
    moduleKey: FEATURE_KEYS.BANK_MANAGEMENT,
    description: 'View shared and tenant-defined banks and branches.',
  },
  {
    code: PERMISSION_CODES.BANK_MANAGE,
    name: 'Manage Banks & Branches',
    moduleKey: FEATURE_KEYS.BANK_MANAGEMENT,
    description: 'Create and update tenant-specific banks and branches.',
  },
  {
    code: PERMISSION_CODES.BANK_ACCOUNT_VIEW,
    name: 'View Bank Accounts',
    moduleKey: FEATURE_KEYS.BANK_BALANCE,
    description: 'View bank accounts and internal book balances.',
  },
  {
    code: PERMISSION_CODES.BANK_ACCOUNT_MANAGE,
    name: 'Manage Bank Accounts',
    moduleKey: FEATURE_KEYS.BANK_BALANCE,
    description: 'Create and update tenant bank accounts.',
  },
  {
    code: PERMISSION_CODES.BANK_TRANSACTION_MANAGE,
    name: 'Manage Bank Transactions',
    moduleKey: FEATURE_KEYS.BANK_BALANCE,
    description: 'Post deposits, withdrawals, cheque postings, adjustments, and reversals.',
  },
  {
    code: PERMISSION_CODES.TEMPLATE_VIEW,
    name: 'View Templates & Calibration',
    moduleKey: FEATURE_KEYS.TEMPLATES_CALIBRATION,
    description: 'View cheque layout templates and calibration profiles.',
  },
  {
    code: PERMISSION_CODES.TEMPLATE_MANAGE,
    name: 'Manage Templates & Calibration',
    moduleKey: FEATURE_KEYS.TEMPLATES_CALIBRATION,
    description: 'Create, edit, duplicate, calibrate, and test-print cheque templates.',
  },
  {
    code: PERMISSION_CODES.REPORTS_VIEW,
    name: 'View Reports',
    moduleKey: FEATURE_KEYS.REPORTS,
    description: 'Run and inspect operational cheque and bank reports.',
  },
  {
    code: PERMISSION_CODES.REPORTS_EXPORT,
    name: 'Export Reports',
    moduleKey: FEATURE_KEYS.REPORTS,
    description: 'Export reports as PDF, Excel, or print output.',
  },
  {
    code: PERMISSION_CODES.BACKUP_VIEW,
    name: 'View Backups',
    moduleKey: FEATURE_KEYS.BACKUP_RESTORE,
    description: 'View tenant backup and restore job history.',
  },
  {
    code: PERMISSION_CODES.BACKUP_MANAGE,
    name: 'Manage Backups & Restore',
    moduleKey: FEATURE_KEYS.BACKUP_RESTORE,
    description: 'Export tenant JSON backups and run validated restores.',
  },
  {
    code: PERMISSION_CODES.COMPANY_VIEW,
    name: 'View Companies',
    moduleKey: FEATURE_KEYS.COMPANIES,
    description: 'View tenant companies.',
  },
  {
    code: PERMISSION_CODES.COMPANY_MANAGE,
    name: 'Manage Companies',
    moduleKey: FEATURE_KEYS.COMPANIES,
    description: 'Create, update, and activate/deactivate companies within the tenant.',
  },
  {
    code: PERMISSION_CODES.USER_VIEW,
    name: 'View Users & Roles',
    moduleKey: FEATURE_KEYS.USER_MANAGEMENT,
    description: 'View organization users, roles, and assigned permissions.',
  },
  {
    code: PERMISSION_CODES.USER_MANAGE,
    name: 'Manage Users & Roles',
    moduleKey: FEATURE_KEYS.USER_MANAGEMENT,
    description: 'Create, update, suspend users, assign roles/permissions/companies, and reset passwords.',
  },
  {
    code: PERMISSION_CODES.AUDIT_VIEW,
    name: 'View Audit Logs',
    moduleKey: 'system',
    description: 'Inspect organization audit trail entries.',
  },
  {
    code: PERMISSION_CODES.DEVICE_MANAGE,
    name: 'Manage Registered Devices',
    moduleKey: 'system',
    description: 'Approve or revoke offline-capable registered devices.',
  },
] as const;

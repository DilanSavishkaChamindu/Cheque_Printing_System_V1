export const FEATURE_KEYS = {
  DASHBOARD: 'dashboard',
  NEW_CHEQUE: 'new_cheque',
  CHEQUE_HISTORY: 'cheque_history',
  RECEIVED_CHEQUES: 'received_cheques',
  USER_MANAGEMENT: 'user_management',
  BANK_MANAGEMENT: 'bank_management',
  BANK_BALANCE: 'bank_balance',
  TEMPLATES_CALIBRATION: 'templates_calibration',
  REPORTS: 'reports',
  BACKUP_RESTORE: 'backup_restore',
  COMPANIES: 'companies',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export interface FeatureDefinitionSeed {
  key: FeatureKey;
  name: string;
  description: string;
  category: string;
  isDefaultEnabled: boolean;
  sortOrder: number;
}

export const INITIAL_FEATURE_CATALOG: readonly FeatureDefinitionSeed[] = [
  {
    key: FEATURE_KEYS.DASHBOARD,
    name: 'Dashboard',
    description: 'Operational overview of bank accounts, issued cheques, date monitors, and received cheques.',
    category: 'Core',
    isDefaultEnabled: true,
    sortOrder: 1,
  },
  {
    key: FEATURE_KEYS.NEW_CHEQUE,
    name: 'New Cheque',
    description: 'Create, preview, and print issued cheques with amount-in-words validation.',
    category: 'Cheque Operations',
    isDefaultEnabled: true,
    sortOrder: 2,
  },
  {
    key: FEATURE_KEYS.CHEQUE_HISTORY,
    name: 'Cheque History',
    description: 'Search, filter, update lifecycle status, reprint, and export issued cheques.',
    category: 'Cheque Operations',
    isDefaultEnabled: true,
    sortOrder: 3,
  },
  {
    key: FEATURE_KEYS.RECEIVED_CHEQUES,
    name: 'Received Cheques',
    description: 'Track customer and third-party received cheques from receipt through deposit and clearance.',
    category: 'Cheque Operations',
    isDefaultEnabled: true,
    sortOrder: 4,
  },
  {
    key: FEATURE_KEYS.USER_MANAGEMENT,
    name: 'User Management',
    description: 'Manage tenant users, roles, permissions, company scopes, and password resets.',
    category: 'Administration',
    isDefaultEnabled: true,
    sortOrder: 5,
  },
  {
    key: FEATURE_KEYS.BANK_MANAGEMENT,
    name: 'Bank Management',
    description: 'Manage bank and branch reference records used for accounts and cheques.',
    category: 'Banking',
    isDefaultEnabled: true,
    sortOrder: 6,
  },
  {
    key: FEATURE_KEYS.BANK_BALANCE,
    name: 'Bank Balance',
    description: 'Manage bank accounts and auditable financial book-balance ledger transactions.',
    category: 'Banking',
    isDefaultEnabled: true,
    sortOrder: 7,
  },
  {
    key: FEATURE_KEYS.TEMPLATES_CALIBRATION,
    name: 'Templates / Calibration',
    description: 'Configure bank-specific cheque layouts, millimeter coordinates, and printer calibration profiles.',
    category: 'Printing',
    isDefaultEnabled: true,
    sortOrder: 8,
  },
  {
    key: FEATURE_KEYS.REPORTS,
    name: 'Reports',
    description: 'Generate server-filtered cheque, received cheque, and bank ledger reports with PDF/Excel export.',
    category: 'Analytics',
    isDefaultEnabled: true,
    sortOrder: 9,
  },
  {
    key: FEATURE_KEYS.BACKUP_RESTORE,
    name: 'Backup / Restore',
    description: 'Create structured JSON tenant backups and perform validated, audited restores.',
    category: 'Administration',
    isDefaultEnabled: true,
    sortOrder: 10,
  },
  {
    key: FEATURE_KEYS.COMPANIES,
    name: 'Companies',
    description: 'Manage multiple business companies and user company access scopes inside one tenant.',
    category: 'Administration',
    isDefaultEnabled: false,
    sortOrder: 11,
  },
] as const;

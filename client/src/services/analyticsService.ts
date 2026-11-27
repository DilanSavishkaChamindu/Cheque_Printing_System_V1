import type {
  ApiSuccessResponse,
  ExportReportInput,
  ReportCategory,
} from '@cheque-saas/shared';
import { apiClient } from '../lib/apiClient';

export interface DashboardDataDto {
  bankAccounts: Array<{
    id: string;
    bankName: string;
    branchName: string;
    accountName: string;
    accountNumberMasked: string;
    currency: string;
    currentBookBalance: string;
    status: string;
    companyName: string;
  }>;
  chequeSummary: {
    totalCheques: number;
    draftCheques: number;
    issuedCheques: number;
    printedCheques: number;
    pendingCheques: number;
    presentedCheques: number;
    clearedCheques: number;
    cancelledCheques: number;
    bouncedCheques: number;
    postponedCheques: number;
    stoppedCheques: number;
  };
  dateMonitor: {
    today: Array<{
      id: string;
      chequeNumber: string;
      payeeName: string;
      companyName: string;
      bankAccountLabel: string;
      amount: string;
      currency: string;
      chequeDate: string;
      businessStatus: string;
      printingStatus: string;
      bankingStatus: string;
    }>;
    tomorrow: Array<{
      id: string;
      chequeNumber: string;
      payeeName: string;
      companyName: string;
      bankAccountLabel: string;
      amount: string;
      currency: string;
      chequeDate: string;
      businessStatus: string;
      printingStatus: string;
      bankingStatus: string;
    }>;
    nextSevenDays: Array<{
      id: string;
      chequeNumber: string;
      payeeName: string;
      companyName: string;
      bankAccountLabel: string;
      amount: string;
      currency: string;
      chequeDate: string;
      businessStatus: string;
      printingStatus: string;
      bankingStatus: string;
    }>;
  };
  receivedChequeMonitor: {
    receivedTodayCount: number;
    pendingBankingCount: number;
    bankedTodayCount: number;
  };
}

export interface ReportResultDto {
  category: ReportCategory;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number | null>>;
  summary: {
    recordCount: number;
    totalAmount: string;
  };
  page: number;
  limit: number;
  totalItems: number;
}

export const analyticsService = {
  async getDashboard(companyId?: string): Promise<DashboardDataDto> {
    const res = await apiClient.get<ApiSuccessResponse<DashboardDataDto>>('/dashboard', {
      params: companyId ? { companyId } : undefined,
    });
    return res.data.data;
  },

  async runReport(params: {
    category: ReportCategory;
    page?: number;
    limit?: number;
    companyId?: string;
    bankAccountId?: string;
    chequeNumber?: string;
    payeeName?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<ReportResultDto> {
    const res = await apiClient.get<ApiSuccessResponse<ReportResultDto>>('/reports', {
      params: Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== '' && v !== undefined)
      ),
    });
    return res.data.data;
  },

  async exportReport(input: ExportReportInput): Promise<void> {
    const res = await apiClient.post<Blob>('/reports/export', input, {
      responseType: 'blob',
    });
    const ext = input.format === 'EXCEL' ? 'xlsx' : 'pdf';
    const url = window.URL.createObjectURL(res.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${input.category.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async getBackupHistory() {
    const res = await apiClient.get<
      ApiSuccessResponse<{
        backups: Array<{
          id: string;
          schemaVersion: string;
          status: string;
          recordCount: number;
          checksum: string | null;
          createdAt: string;
        }>;
        restores: Array<{
          id: string;
          backupSchemaVersion: string;
          status: string;
          isConfirmed: boolean;
          createdAt: string;
        }>;
      }>
    >('/backups');
    return res.data.data;
  },

  async exportBackup() {
    const res = await apiClient.post<
      ApiSuccessResponse<{
        jobId: string;
        backup: Record<string, unknown>;
      }>
    >('/backups/export');
    return res.data.data;
  },

  async previewRestore(payload: unknown) {
    const res = await apiClient.post<
      ApiSuccessResponse<{
        restoreJobId: string;
        status: string;
        canConfirm: boolean;
        validationErrors: string[];
        counts: Record<string, number>;
        duplicatesDetected: Record<string, number>;
      }>
    >('/backups/restore/preview', payload);
    return res.data.data;
  },

  async confirmRestore(restoreJobId: string) {
    const res = await apiClient.post<
      ApiSuccessResponse<{
        restoreJobId: string;
        status: string;
        restoredCounts: Record<string, number>;
      }>
    >(`/backups/restore/${restoreJobId}/confirm`, { confirmed: true });
    return res.data.data;
  },
};

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Prisma } from '@prisma/client';
import {
  centsToDecimalString,
  decimalStringToCents,
  FEATURE_KEYS,
  type AuthenticatedTenantUser,
  type ExportReportInput,
  type ReportFilterQueryInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { resolveAuthorizedCompanyId } from '../../core/authorization.js';
import { maskAccountNumber } from '../../utils/masking.js';
import { recordTenantAudit } from '../audit-logs/audit.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

export interface ReportRowDto {
  [key: string]: string | number | null;
}

export interface ReportColumnDef {
  key: string;
  label: string;
}

export interface ReportRunResult {
  category: string;
  columns: ReportColumnDef[];
  rows: ReportRowDto[];
  summary: {
    recordCount: number;
    totalAmount: string;
  };
  page: number;
  limit: number;
  totalItems: number;
}

function resolveCompanyFilter(actor: AuthenticatedTenantUser, requestedCompanyId?: string) {
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);
  if (requestedCompanyId) {
    return { companyId: resolveAuthorizedCompanyId(actor, requestedCompanyId) };
  }
  if (!companiesEnabled) {
    return { companyId: resolveAuthorizedCompanyId(actor, null) };
  }
  if (actor.companyAccessScope === 'SELECTED_COMPANIES') {
    return { companyId: { in: actor.allowedCompanyIds } };
  }
  return {};
}

function buildIssuedWhere(
  actor: AuthenticatedTenantUser,
  query: ReportFilterQueryInput
): Prisma.IssuedChequeWhereInput {
  const companyFilter = resolveCompanyFilter(actor, query.companyId);
  const base: Prisma.IssuedChequeWhereInput = {
    tenantId: actor.tenantId,
    ...companyFilter,
    ...(query.bankId ? { bankId: query.bankId } : {}),
    ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
    ...(query.chequeNumber ? { chequeNumber: { contains: query.chequeNumber } } : {}),
    ...(query.payeeName ? { payeeName: { contains: query.payeeName } } : {}),
    ...(query.fromDate || query.toDate
      ? {
          chequeDate: {
            ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } : {}),
            ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
    ...(query.minAmount || query.maxAmount
      ? {
          amount: {
            ...(query.minAmount ? { gte: new Prisma.Decimal(query.minAmount) } : {}),
            ...(query.maxAmount ? { lte: new Prisma.Decimal(query.maxAmount) } : {}),
          },
        }
      : {}),
  };

  switch (query.category) {
    case 'PENDING_CHEQUE':
      return { ...base, businessStatus: 'ISSUED', bankingStatus: 'PENDING' };
    case 'CLEARED_CHEQUE':
      return { ...base, businessStatus: 'ISSUED', bankingStatus: 'CLEARED' };
    case 'BOUNCED_CHEQUE':
      return { ...base, businessStatus: 'ISSUED', bankingStatus: 'BOUNCED' };
    case 'CANCELLED_CHEQUE':
      return { ...base, businessStatus: 'CANCELLED' };
    case 'DAILY_CHEQUE': {
      const today = new Date().toISOString().slice(0, 10);
      const target = query.fromDate ?? today;
      return {
        ...base,
        chequeDate: {
          gte: new Date(`${target}T00:00:00.000Z`),
          lte: new Date(`${target}T23:59:59.999Z`),
        },
      };
    }
    case 'MONTHLY_CHEQUE': {
      const now = new Date();
      const monthStart =
        query.fromDate ??
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
      return {
        ...base,
        chequeDate: {
          gte: new Date(`${monthStart}T00:00:00.000Z`),
          ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
        },
      };
    }
    default:
      if (query.status) {
        return {
          ...base,
          OR: [
            { bankingStatus: query.status as never },
            { businessStatus: query.status as never },
          ],
        };
      }
      return base;
  }
}

export async function runOperationalReport(
  actor: AuthenticatedTenantUser,
  query: ReportFilterQueryInput
): Promise<ReportRunResult> {
  const prisma = getPrisma();
  const skip = (query.page - 1) * query.limit;
  const companyFilter = resolveCompanyFilter(actor, query.companyId);

  if (query.category === 'RECEIVED_CHEQUE') {
    const where: Prisma.ReceivedChequeWhereInput = {
      tenantId: actor.tenantId,
      ...companyFilter,
      ...(query.bankId ? { bankId: query.bankId } : {}),
      ...(query.chequeNumber ? { chequeNumber: { contains: query.chequeNumber } } : {}),
      ...(query.payeeName ? { receivedFrom: { contains: query.payeeName } } : {}),
      ...(query.status ? { status: query.status as never } : {}),
      ...(query.fromDate || query.toDate
        ? {
            receivedDate: {
              ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } : {}),
              ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
      ...(query.minAmount || query.maxAmount
        ? {
            amount: {
              ...(query.minAmount ? { gte: new Prisma.Decimal(query.minAmount) } : {}),
              ...(query.maxAmount ? { lte: new Prisma.Decimal(query.maxAmount) } : {}),
            },
          }
        : {}),
    };

    const [rows, totalItems, agg] = await Promise.all([
      prisma.receivedCheque.findMany({
        where,
        orderBy: { receivedDate: 'desc' },
        skip,
        take: query.limit,
        include: { company: { select: { companyName: true } } },
      }),
      prisma.receivedCheque.count({ where }),
      prisma.receivedCheque.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      category: query.category,
      columns: [
        { key: 'chequeNumber', label: 'Cheque #' },
        { key: 'receivedDate', label: 'Received Date' },
        { key: 'receivedFrom', label: 'Received From' },
        { key: 'bankName', label: 'Bank' },
        { key: 'companyName', label: 'Company' },
        { key: 'amount', label: 'Amount' },
        { key: 'status', label: 'Status' },
      ],
      rows: rows.map((r) => ({
        chequeNumber: r.chequeNumber,
        receivedDate: r.receivedDate.toISOString().slice(0, 10),
        receivedFrom: r.receivedFrom,
        bankName: r.bankName,
        companyName: r.company.companyName,
        amount: `${r.currency} ${r.amount.toFixed(2)}`,
        status: r.status,
      })),
      summary: {
        recordCount: totalItems,
        totalAmount: (agg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
      },
      page: query.page,
      limit: query.limit,
      totalItems,
    };
  }

  if (query.category === 'BANK_ACCOUNT') {
    const where: Prisma.BankAccountWhereInput = {
      tenantId: actor.tenantId,
      ...companyFilter,
      ...(query.bankId ? { bankId: query.bankId } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };

    const [rows, totalItems, agg] = await Promise.all([
      prisma.bankAccount.findMany({
        where,
        orderBy: { accountName: 'asc' },
        skip,
        take: query.limit,
        include: {
          bank: { select: { bankName: true } },
          company: { select: { companyName: true } },
        },
      }),
      prisma.bankAccount.count({ where }),
      prisma.bankAccount.aggregate({ where, _sum: { currentBookBalance: true } }),
    ]);

    return {
      category: query.category,
      columns: [
        { key: 'bankName', label: 'Bank' },
        { key: 'accountName', label: 'Account Name' },
        { key: 'accountNumber', label: 'Account #' },
        { key: 'companyName', label: 'Company' },
        { key: 'openingBalance', label: 'Opening Balance' },
        { key: 'currentBookBalance', label: 'Book Balance (Internal)' },
        { key: 'status', label: 'Status' },
      ],
      rows: rows.map((a) => ({
        bankName: a.bank.bankName,
        accountName: a.accountName,
        accountNumber: maskAccountNumber(a.accountNumber),
        companyName: a.company.companyName,
        openingBalance: `${a.currency} ${a.openingBalance.toFixed(2)}`,
        currentBookBalance: `${a.currency} ${a.currentBookBalance.toFixed(2)}`,
        status: a.status,
      })),
      summary: {
        recordCount: totalItems,
        totalAmount: (agg._sum.currentBookBalance ?? new Prisma.Decimal(0)).toFixed(2),
      },
      page: query.page,
      limit: query.limit,
      totalItems,
    };
  }

  if (query.category === 'BANK_TRANSACTION') {
    const where: Prisma.BankAccountTransactionWhereInput = {
      tenantId: actor.tenantId,
      ...companyFilter,
      ...(query.bankAccountId ? { bankAccountId: query.bankAccountId } : {}),
      ...(query.status ? { transactionType: query.status as never } : {}),
      ...(query.fromDate || query.toDate
        ? {
            transactionDate: {
              ...(query.fromDate ? { gte: new Date(`${query.fromDate}T00:00:00.000Z`) } : {}),
              ...(query.toDate ? { lte: new Date(`${query.toDate}T23:59:59.999Z`) } : {}),
            },
          }
        : {}),
    };

    const [rows, totalItems, agg] = await Promise.all([
      prisma.bankAccountTransaction.findMany({
        where,
        orderBy: [{ transactionDate: 'desc' }, { sequenceNumber: 'desc' }],
        skip,
        take: query.limit,
        include: {
          bankAccount: { select: { accountName: true, currency: true } },
        },
      }),
      prisma.bankAccountTransaction.count({ where }),
      prisma.bankAccountTransaction.aggregate({
        where,
        _sum: { creditAmount: true, debitAmount: true },
      }),
    ]);

    const creditCents = decimalStringToCents(
      (agg._sum.creditAmount ?? new Prisma.Decimal(0)).toFixed(2)
    );
    const debitCents = decimalStringToCents(
      (agg._sum.debitAmount ?? new Prisma.Decimal(0)).toFixed(2)
    );

    return {
      category: query.category,
      columns: [
        { key: 'transactionDate', label: 'Date' },
        { key: 'accountName', label: 'Account' },
        { key: 'transactionType', label: 'Type' },
        { key: 'referenceNumber', label: 'Reference' },
        { key: 'debitAmount', label: 'Debit' },
        { key: 'creditAmount', label: 'Credit' },
        { key: 'balanceAfter', label: 'Running Balance' },
      ],
      rows: rows.map((tx) => ({
        transactionDate: tx.transactionDate.toISOString().slice(0, 10),
        accountName: tx.bankAccount.accountName,
        transactionType: tx.transactionType,
        referenceNumber: tx.referenceNumber ?? '—',
        debitAmount: tx.debitAmount.toFixed(2),
        creditAmount: tx.creditAmount.toFixed(2),
        balanceAfter: tx.balanceAfterTransaction.toFixed(2),
      })),
      summary: {
        recordCount: totalItems,
        totalAmount: centsToDecimalString(creditCents - debitCents),
      },
      page: query.page,
      limit: query.limit,
      totalItems,
    };
  }

  // Issued cheque report categories
  const where = buildIssuedWhere(actor, query);
  const [rows, totalItems, agg] = await Promise.all([
    prisma.issuedCheque.findMany({
      where,
      orderBy: { chequeDate: 'desc' },
      skip,
      take: query.limit,
      include: {
        company: { select: { companyName: true } },
        bank: { select: { bankName: true } },
        bankAccount: { select: { accountName: true } },
      },
    }),
    prisma.issuedCheque.count({ where }),
    prisma.issuedCheque.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    category: query.category,
    columns: [
      { key: 'chequeNumber', label: 'Cheque #' },
      { key: 'chequeDate', label: 'Cheque Date' },
      { key: 'payeeName', label: 'Payee' },
      { key: 'bankName', label: 'Bank' },
      { key: 'companyName', label: 'Company' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Business / Banking' },
    ],
    rows: rows.map((c) => ({
      chequeNumber: c.chequeNumber,
      chequeDate: c.chequeDate.toISOString().slice(0, 10),
      payeeName: c.payeeName,
      bankName: c.bank.bankName,
      companyName: c.company.companyName,
      amount: `${c.currency} ${c.amount.toFixed(2)}`,
      status: `${c.businessStatus} / ${c.bankingStatus}`,
    })),
    summary: {
      recordCount: totalItems,
      totalAmount: (agg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
    },
    page: query.page,
    limit: query.limit,
    totalItems,
  };
}

export async function exportReportFile(
  actor: AuthenticatedTenantUser,
  input: ExportReportInput,
  meta: TenantActorMeta
): Promise<{ buffer: Buffer; contentType: string; filename: string; jobId: string }> {
  const prisma = getPrisma();
  const job = await prisma.reportExportJob.create({
    data: {
      tenantId: actor.tenantId,
      userId: actor.id,
      companyId: input.companyId ?? null,
      reportCategory: input.category,
      format: input.format,
      filtersJson: input as unknown as Prisma.InputJsonValue,
      status: 'PROCESSING',
      progressPercent: 25,
    },
  });

  try {
    // Bounded export page size up to 2000 records per export file to protect memory
    const report = await runOperationalReport(actor, {
      ...input,
      page: 1,
      limit: 100,
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `${input.category.toLowerCase()}-${timestamp}.${
      input.format === 'EXCEL' ? 'xlsx' : 'pdf'
    }`;

    let buffer: Buffer;
    let contentType: string;

    if (input.format === 'EXCEL') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(input.category);
      sheet.columns = report.columns.map((c) => ({
        header: c.label,
        key: c.key,
        width: 22,
      }));
      for (const row of report.rows) {
        sheet.addRow(row);
      }
      sheet.addRow({});
      sheet.addRow({
        [report.columns[0]?.key ?? 'summary']: `Total Records: ${report.summary.recordCount}`,
        [report.columns[report.columns.length - 1]?.key ?? 'total']: `Total: ${report.summary.totalAmount}`,
      });
      const arrayBuf = await workbook.xlsx.writeBuffer();
      buffer = Buffer.from(arrayBuf);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
      });

      doc.fontSize(14).font('Helvetica-Bold').text(`${actor.tenant.organizationName} — ${input.category}`);
      doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toISOString()} | Records: ${report.summary.recordCount} | Summary Total: ${report.summary.totalAmount}`);
      doc.moveDown(0.8);

      doc.font('Helvetica-Bold').fontSize(8);
      doc.text(report.columns.map((c) => c.label).join('  |  '));
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(8);
      for (const row of report.rows) {
        doc.text(report.columns.map((c) => String(row[c.key] ?? '—')).join('  |  '));
      }
      doc.end();
      buffer = await done;
      contentType = 'application/pdf';
    }

    await prisma.reportExportJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        progressPercent: 100,
        fileName: filename,
        completedAt: new Date(),
      },
    });

    await recordTenantAudit({
      tenantId: actor.tenantId,
      companyId: input.companyId ?? null,
      userId: actor.id,
      deviceId: actor.deviceId,
      actorType: 'TENANT_USER',
      action: 'REPORT_EXPORTED',
      entityType: 'ReportExportJob',
      entityId: job.id,
      newValues: { category: input.category, format: input.format, filename },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      requestId: meta.requestId,
    });

    return { buffer, contentType, filename, jobId: job.id };
  } catch (error) {
    await prisma.reportExportJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Export failed',
      },
    });
    throw error;
  }
}

export async function listReportJobs(actor: AuthenticatedTenantUser) {
  const prisma = getPrisma();
  return prisma.reportExportJob.findMany({
    where: { tenantId: actor.tenantId, userId: actor.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
}

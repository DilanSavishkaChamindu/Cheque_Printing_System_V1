import type { Request, Response } from 'express';
import { exportReportSchema, reportFilterQuerySchema } from '@cheque-saas/shared';
import { sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  exportReportFile,
  listReportJobs,
  runOperationalReport,
} from './report.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function runReportController(req: Request, res: Response): Promise<void> {
  const query = reportFilterQuerySchema.parse(req.query);
  const result = await runOperationalReport(req.tenantUser!, query);
  sendPaginated(res, result.rows, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function runReportFullController(req: Request, res: Response): Promise<void> {
  const query = reportFilterQuerySchema.parse(req.query);
  const result = await runOperationalReport(req.tenantUser!, query);
  sendSuccess(res, result, 'Report executed successfully.');
}

export async function exportReportController(req: Request, res: Response): Promise<void> {
  const input = exportReportSchema.parse(req.body);
  const exported = await exportReportFile(req.tenantUser!, input, getMeta(req));

  res.setHeader('Content-Type', exported.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
  res.setHeader('X-Report-Job-Id', exported.jobId);
  res.send(exported.buffer);
}

export async function listReportJobsController(req: Request, res: Response): Promise<void> {
  const jobs = await listReportJobs(req.tenantUser!);
  sendSuccess(res, jobs, 'Recent report export jobs retrieved.');
}

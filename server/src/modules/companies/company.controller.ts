import type { Request, Response } from 'express';
import {
  createCompanySchema,
  listCompaniesQuerySchema,
  updateCompanySchema,
  updateRecordStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  createCompany,
  getCompanyById,
  listCompanies,
  updateCompany,
  updateCompanyStatus,
} from './company.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listCompaniesController(req: Request, res: Response): Promise<void> {
  const query = listCompaniesQuerySchema.parse(req.query);
  const result = await listCompanies(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function getCompanyController(req: Request, res: Response): Promise<void> {
  const companyId = uuidSchema.parse(req.params.companyId);
  const company = await getCompanyById(req.tenantUser!, companyId);
  sendSuccess(res, company, 'Company details retrieved.');
}

export async function createCompanyController(req: Request, res: Response): Promise<void> {
  const input = createCompanySchema.parse(req.body);
  const company = await createCompany(req.tenantUser!, input, getMeta(req));
  sendCreated(res, company, 'Company created successfully.');
}

export async function updateCompanyController(req: Request, res: Response): Promise<void> {
  const companyId = uuidSchema.parse(req.params.companyId);
  const input = updateCompanySchema.parse(req.body);
  const company = await updateCompany(req.tenantUser!, companyId, input, getMeta(req));
  sendSuccess(res, company, 'Company updated successfully.');
}

export async function updateCompanyStatusController(req: Request, res: Response): Promise<void> {
  const companyId = uuidSchema.parse(req.params.companyId);
  const input = updateRecordStatusSchema.parse(req.body);
  const company = await updateCompanyStatus(
    req.tenantUser!,
    companyId,
    input.status,
    getMeta(req)
  );
  sendSuccess(res, company, `Company status updated to ${input.status}.`);
}

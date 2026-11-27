import type { Request, Response } from 'express';
import {
  createCalibrationProfileSchema,
  createChequeTemplateSchema,
  duplicateTemplateSchema,
  listTemplatesQuerySchema,
  updateCalibrationProfileSchema,
  updateChequeTemplateSchema,
  updateRecordStatusSchema,
  uuidSchema,
} from '@cheque-saas/shared';
import { sendCreated, sendPaginated, sendSuccess } from '../../core/response.js';
import { getClientIp, getUserAgent } from '../../utils/sanitize.js';
import {
  createCalibrationProfile,
  createTemplate,
  duplicateTemplate,
  getTemplateById,
  listCalibrationProfiles,
  listTemplates,
  recordCalibrationTestPrint,
  updateCalibrationProfile,
  updateTemplate,
  updateTemplateStatus,
} from './template.service.js';

function getMeta(req: Request) {
  return {
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    requestId: req.requestId ?? null,
  };
}

export async function listTemplatesController(req: Request, res: Response): Promise<void> {
  const query = listTemplatesQuerySchema.parse(req.query);
  const result = await listTemplates(req.tenantUser!, query);
  sendPaginated(res, result.items, {
    page: result.page,
    limit: result.limit,
    totalItems: result.totalItems,
  });
}

export async function getTemplateController(req: Request, res: Response): Promise<void> {
  const templateId = uuidSchema.parse(req.params.templateId);
  const tpl = await getTemplateById(req.tenantUser!, templateId);
  sendSuccess(res, tpl, 'Template retrieved.');
}

export async function createTemplateController(req: Request, res: Response): Promise<void> {
  const input = createChequeTemplateSchema.parse(req.body);
  const tpl = await createTemplate(req.tenantUser!, input, getMeta(req));
  sendCreated(res, tpl, 'Cheque template created successfully.');
}

export async function updateTemplateController(req: Request, res: Response): Promise<void> {
  const templateId = uuidSchema.parse(req.params.templateId);
  const input = updateChequeTemplateSchema.parse(req.body);
  const tpl = await updateTemplate(req.tenantUser!, templateId, input, getMeta(req));
  sendSuccess(res, tpl, 'Cheque template updated successfully.');
}

export async function duplicateTemplateController(req: Request, res: Response): Promise<void> {
  const templateId = uuidSchema.parse(req.params.templateId);
  const input = duplicateTemplateSchema.parse(req.body);
  const tpl = await duplicateTemplate(
    req.tenantUser!,
    templateId,
    input.templateName,
    getMeta(req)
  );
  sendCreated(res, tpl, 'Cheque template duplicated successfully.');
}

export async function updateTemplateStatusController(req: Request, res: Response): Promise<void> {
  const templateId = uuidSchema.parse(req.params.templateId);
  const input = updateRecordStatusSchema.parse(req.body);
  const tpl = await updateTemplateStatus(
    req.tenantUser!,
    templateId,
    input.status,
    getMeta(req)
  );
  sendSuccess(res, tpl, `Template status updated to ${input.status}.`);
}

export async function listCalibrationController(req: Request, res: Response): Promise<void> {
  const templateId =
    typeof req.query.templateId === 'string' && req.query.templateId
      ? uuidSchema.parse(req.query.templateId)
      : undefined;
  const profiles = await listCalibrationProfiles(req.tenantUser!, templateId);
  sendSuccess(res, profiles, 'Calibration profiles retrieved.');
}

export async function createCalibrationController(req: Request, res: Response): Promise<void> {
  const input = createCalibrationProfileSchema.parse(req.body);
  const profile = await createCalibrationProfile(req.tenantUser!, input, getMeta(req));
  sendCreated(res, profile, 'Calibration profile created successfully.');
}

export async function updateCalibrationController(req: Request, res: Response): Promise<void> {
  const profileId = uuidSchema.parse(req.params.profileId);
  const input = updateCalibrationProfileSchema.parse(req.body);
  const profile = await updateCalibrationProfile(
    req.tenantUser!,
    profileId,
    input,
    getMeta(req)
  );
  sendSuccess(res, profile, 'Calibration profile updated successfully.');
}

export async function testPrintCalibrationController(req: Request, res: Response): Promise<void> {
  const profileId = uuidSchema.parse(req.params.profileId);
  const result = await recordCalibrationTestPrint(req.tenantUser!, profileId, getMeta(req));
  sendSuccess(res, result, 'Calibration test print logged.');
}

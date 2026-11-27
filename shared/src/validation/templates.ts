import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './pagination.js';

export const paperOrientationEnum = z.enum(['PORTRAIT', 'LANDSCAPE']);
export const feedDirectionEnum = z.enum([
  'TOP_FIRST',
  'BOTTOM_FIRST',
  'LEFT_FIRST',
  'RIGHT_FIRST',
]);
export const templateFieldKeyEnum = z.enum([
  'CHEQUE_DATE',
  'PAYEE_NAME',
  'AMOUNT_NUMBER',
  'AMOUNT_WORDS_LINE_1',
  'AMOUNT_WORDS_LINE_2',
  'PAYMENT_TYPE_MARK',
  'CASH_RECIPIENT',
  'LEFT_EDGE_MARKING',
  'COMPANY_STAMP',
  'CUSTOM_TEXT',
]);
export const textAlignmentEnum = z.enum(['LEFT', 'CENTER', 'RIGHT']);

export const templateFieldInputSchema = z.object({
  fieldKey: templateFieldKeyEnum,
  label: z.string().trim().min(1).max(100),
  xMm: z.coerce.number().min(0).max(400),
  yMm: z.coerce.number().min(0).max(400),
  widthMm: z.coerce.number().min(1).max(400),
  heightMm: z.coerce.number().min(1).max(400),
  fontFamily: z.string().trim().min(1).max(80).default('Arial'),
  fontSizePt: z.coerce.number().min(5).max(48).default(11),
  fontWeight: z.string().trim().min(1).max(32).default('normal'),
  letterSpacingMm: z.coerce.number().min(-2).max(20).default(0),
  lineHeight: z.coerce.number().min(0.8).max(4).default(1.2),
  textAlign: textAlignmentEnum.default('LEFT'),
  dateDigitGapMm: z.coerce.number().min(0).max(20).nullable().optional(),
  isVisible: z.boolean().default(true),
  customConfigJson: z.record(z.unknown()).nullable().optional(),
});

export const createChequeTemplateSchema = z.object({
  companyId: uuidSchema.nullable().optional(),
  bankId: uuidSchema,
  bankAccountId: uuidSchema.nullable().optional(),
  templateName: z.string().trim().min(2).max(150),
  paperWidthMm: z.coerce.number().min(50).max(400).default(178),
  paperHeightMm: z.coerce.number().min(40).max(400).default(89),
  orientation: paperOrientationEnum.default('LANDSCAPE'),
  dateFormat: z.enum(['DD/MM/YYYY', 'DDMMYYYY', 'DD MMM YYYY']).default('DD/MM/YYYY'),
  feedDirection: feedDirectionEnum.default('TOP_FIRST'),
  centerOnA4: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  fields: z.array(templateFieldInputSchema).optional(),
});

export const updateChequeTemplateSchema = createChequeTemplateSchema
  .partial()
  .omit({ bankId: true });

export const duplicateTemplateSchema = z.object({
  templateName: z.string().trim().min(2).max(150),
});

export const listTemplatesQuerySchema = paginationQuerySchema.extend({
  bankId: uuidSchema.optional(),
  companyId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createCalibrationProfileSchema = z.object({
  templateId: uuidSchema,
  deviceId: uuidSchema.nullable().optional(),
  profileName: z.string().trim().min(2).max(120),
  offsetXMm: z.coerce.number().min(-50).max(50).default(0),
  offsetYMm: z.coerce.number().min(-50).max(50).default(0),
  scalePercent: z.coerce.number().min(50).max(150).default(100),
  printerMarginTopMm: z.coerce.number().min(0).max(100).default(0),
  printerMarginLeftMm: z.coerce.number().min(0).max(100).default(0),
  isDefault: z.boolean().default(false),
});

export const updateCalibrationProfileSchema = createCalibrationProfileSchema
  .partial()
  .omit({ templateId: true });

export type TemplateFieldInput = z.infer<typeof templateFieldInputSchema>;
export type CreateChequeTemplateInput = z.infer<typeof createChequeTemplateSchema>;
export type UpdateChequeTemplateInput = z.infer<typeof updateChequeTemplateSchema>;
export type ListTemplatesQueryInput = z.infer<typeof listTemplatesQuerySchema>;
export type CreateCalibrationProfileInput = z.infer<typeof createCalibrationProfileSchema>;
export type UpdateCalibrationProfileInput = z.infer<typeof updateCalibrationProfileSchema>;

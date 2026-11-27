import { Prisma } from '@prisma/client';
import {
  FEATURE_KEYS,
  type AuthenticatedTenantUser,
  type CreateCalibrationProfileInput,
  type CreateChequeTemplateInput,
  type ListTemplatesQueryInput,
  type TemplateFieldInput,
  type UpdateCalibrationProfileInput,
  type UpdateChequeTemplateInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { resolveAuthorizedCompanyId } from '../../core/authorization.js';
import { ForbiddenError, NotFoundError } from '../../core/errors.js';
import { recordTenantAudit } from '../audit-logs/audit.service.js';
import type { TenantActorMeta } from '../companies/company.service.js';

export const DEFAULT_TEMPLATE_FIELDS: readonly TemplateFieldInput[] = [
  {
    fieldKey: 'CHEQUE_DATE',
    label: 'Cheque Date',
    xMm: 132,
    yMm: 12,
    widthMm: 40,
    heightMm: 8,
    fontFamily: 'Courier',
    fontSizePt: 11,
    fontWeight: 'bold',
    letterSpacingMm: 0.5,
    lineHeight: 1.2,
    textAlign: 'LEFT',
    dateDigitGapMm: 4.5,
    isVisible: true,
  },
  {
    fieldKey: 'PAYEE_NAME',
    label: 'Payee Name',
    xMm: 24,
    yMm: 30,
    widthMm: 115,
    heightMm: 9,
    fontFamily: 'Helvetica',
    fontSizePt: 11,
    fontWeight: 'bold',
    letterSpacingMm: 0,
    lineHeight: 1.2,
    textAlign: 'LEFT',
    dateDigitGapMm: null,
    isVisible: true,
  },
  {
    fieldKey: 'AMOUNT_WORDS_LINE_1',
    label: 'Amount in Words (Line 1)',
    xMm: 24,
    yMm: 41,
    widthMm: 105,
    heightMm: 8,
    fontFamily: 'Helvetica',
    fontSizePt: 10,
    fontWeight: 'normal',
    letterSpacingMm: 0,
    lineHeight: 1.3,
    textAlign: 'LEFT',
    dateDigitGapMm: null,
    isVisible: true,
  },
  {
    fieldKey: 'AMOUNT_WORDS_LINE_2',
    label: 'Amount in Words (Line 2)',
    xMm: 16,
    yMm: 49,
    widthMm: 112,
    heightMm: 8,
    fontFamily: 'Helvetica',
    fontSizePt: 10,
    fontWeight: 'normal',
    letterSpacingMm: 0,
    lineHeight: 1.3,
    textAlign: 'LEFT',
    dateDigitGapMm: null,
    isVisible: true,
  },
  {
    fieldKey: 'AMOUNT_NUMBER',
    label: 'Amount (Numeric)',
    xMm: 134,
    yMm: 42,
    widthMm: 38,
    heightMm: 10,
    fontFamily: 'Courier',
    fontSizePt: 12,
    fontWeight: 'bold',
    letterSpacingMm: 0,
    lineHeight: 1.2,
    textAlign: 'RIGHT',
    dateDigitGapMm: null,
    isVisible: true,
  },
  {
    fieldKey: 'PAYMENT_TYPE_MARK',
    label: 'A/C Payee / Cash Crossing',
    xMm: 12,
    yMm: 10,
    widthMm: 34,
    heightMm: 12,
    fontFamily: 'Helvetica',
    fontSizePt: 8,
    fontWeight: 'bold',
    letterSpacingMm: 0,
    lineHeight: 1.1,
    textAlign: 'CENTER',
    dateDigitGapMm: null,
    isVisible: true,
  },
  {
    fieldKey: 'CASH_RECIPIENT',
    label: 'Cash Recipient',
    xMm: 24,
    yMm: 58,
    widthMm: 80,
    heightMm: 7,
    fontFamily: 'Helvetica',
    fontSizePt: 9,
    fontWeight: 'normal',
    letterSpacingMm: 0,
    lineHeight: 1.2,
    textAlign: 'LEFT',
    dateDigitGapMm: null,
    isVisible: true,
  },
  {
    fieldKey: 'LEFT_EDGE_MARKING',
    label: 'Left Edge Security Marking',
    xMm: 5,
    yMm: 25,
    widthMm: 14,
    heightMm: 40,
    fontFamily: 'Helvetica',
    fontSizePt: 7,
    fontWeight: 'bold',
    letterSpacingMm: 0,
    lineHeight: 1.1,
    textAlign: 'CENTER',
    dateDigitGapMm: null,
    isVisible: false,
  },
];

const TEMPLATE_INCLUDE = {
  bank: { select: { id: true, bankCode: true, bankName: true } },
  company: { select: { id: true, companyCode: true, companyName: true } },
  bankAccount: { select: { id: true, accountName: true } },
  fields: { orderBy: { fieldKey: 'asc' } },
  calibrationProfiles: { orderBy: [{ isDefault: 'desc' }, { profileName: 'asc' }] },
} satisfies Prisma.ChequeTemplateInclude;

function mapTemplateDto(
  row: Prisma.ChequeTemplateGetPayload<{ include: typeof TEMPLATE_INCLUDE }>
) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    companyId: row.companyId,
    company: row.company,
    bankId: row.bankId,
    bank: row.bank,
    bankAccountId: row.bankAccountId,
    bankAccount: row.bankAccount,
    templateName: row.templateName,
    paperWidthMm: Number(row.paperWidthMm.toString()),
    paperHeightMm: Number(row.paperHeightMm.toString()),
    orientation: row.orientation,
    dateFormat: row.dateFormat,
    feedDirection: row.feedDirection,
    centerOnA4: row.centerOnA4,
    isDefault: row.isDefault,
    status: row.status,
    fields: row.fields.map((f) => ({
      id: f.id,
      fieldKey: f.fieldKey,
      label: f.label,
      xMm: Number(f.xMm.toString()),
      yMm: Number(f.yMm.toString()),
      widthMm: Number(f.widthMm.toString()),
      heightMm: Number(f.heightMm.toString()),
      fontFamily: f.fontFamily,
      fontSizePt: Number(f.fontSizePt.toString()),
      fontWeight: f.fontWeight,
      letterSpacingMm: Number(f.letterSpacingMm.toString()),
      lineHeight: Number(f.lineHeight.toString()),
      textAlign: f.textAlign,
      dateDigitGapMm: f.dateDigitGapMm !== null ? Number(f.dateDigitGapMm.toString()) : null,
      isVisible: f.isVisible,
      customConfigJson: f.customConfigJson,
    })),
    calibrationProfiles: row.calibrationProfiles.map((p) => ({
      id: p.id,
      templateId: p.templateId,
      deviceId: p.deviceId,
      profileName: p.profileName,
      offsetXMm: Number(p.offsetXMm.toString()),
      offsetYMm: Number(p.offsetYMm.toString()),
      scalePercent: Number(p.scalePercent.toString()),
      printerMarginTopMm: Number(p.printerMarginTopMm.toString()),
      printerMarginLeftMm: Number(p.printerMarginLeftMm.toString()),
      isDefault: p.isDefault,
      lastTestPrintedAt: p.lastTestPrintedAt?.toISOString() ?? null,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTemplates(
  actor: AuthenticatedTenantUser,
  query: ListTemplatesQueryInput
) {
  const prisma = getPrisma();
  const companiesEnabled = actor.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES);

  const where: Prisma.ChequeTemplateWhereInput = {
    tenantId: actor.tenantId,
    ...(query.bankId ? { bankId: query.bankId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.companyId
      ? {
          OR: [
            { companyId: resolveAuthorizedCompanyId(actor, query.companyId) },
            { companyId: null },
          ],
        }
      : !companiesEnabled
        ? { OR: [{ companyId: actor.tenant.defaultCompanyId }, { companyId: null }] }
        : {}),
    ...(query.search ? { templateName: { contains: query.search } } : {}),
  };

  const skip = (query.page - 1) * query.limit;
  const [rows, totalItems] = await Promise.all([
    prisma.chequeTemplate.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { templateName: 'asc' }],
      skip,
      take: query.limit,
      include: TEMPLATE_INCLUDE,
    }),
    prisma.chequeTemplate.count({ where }),
  ]);

  return {
    items: rows.map(mapTemplateDto),
    totalItems,
    page: query.page,
    limit: query.limit,
  };
}

export async function getTemplateById(
  actor: AuthenticatedTenantUser,
  templateId: string
) {
  const prisma = getPrisma();
  const tpl = await prisma.chequeTemplate.findFirst({
    where: { id: templateId, tenantId: actor.tenantId },
    include: TEMPLATE_INCLUDE,
  });

  if (!tpl) {
    throw new NotFoundError('Cheque Template');
  }

  return mapTemplateDto(tpl);
}

export async function createTemplate(
  actor: AuthenticatedTenantUser,
  input: CreateChequeTemplateInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();

  const bank = await prisma.bank.findFirst({
    where: {
      id: input.bankId,
      OR: [{ isSystemShared: true }, { tenantId: actor.tenantId }],
    },
  });
  if (!bank) {
    throw new NotFoundError('Bank');
  }

  const companyId = input.companyId
    ? resolveAuthorizedCompanyId(actor, input.companyId)
    : null;

  if (input.bankAccountId) {
    const account = await prisma.bankAccount.findFirst({
      where: { id: input.bankAccountId, tenantId: actor.tenantId },
    });
    if (!account) {
      throw new NotFoundError('Bank Account');
    }
  }

  const fieldsToCreate =
    input.fields && input.fields.length > 0 ? input.fields : DEFAULT_TEMPLATE_FIELDS;

  const created = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.chequeTemplate.updateMany({
        where: { tenantId: actor.tenantId, bankId: input.bankId },
        data: { isDefault: false },
      });
    }

    const tpl = await tx.chequeTemplate.create({
      data: {
        tenantId: actor.tenantId,
        companyId,
        bankId: input.bankId,
        bankAccountId: input.bankAccountId ?? null,
        templateName: input.templateName,
        paperWidthMm: new Prisma.Decimal(input.paperWidthMm.toFixed(2)),
        paperHeightMm: new Prisma.Decimal(input.paperHeightMm.toFixed(2)),
        orientation: input.orientation,
        dateFormat: input.dateFormat,
        feedDirection: input.feedDirection,
        centerOnA4: input.centerOnA4,
        isDefault: input.isDefault,
        status: 'ACTIVE',
        createdBy: actor.id,
      },
    });

    await tx.chequeTemplateField.createMany({
      data: fieldsToCreate.map((f) => ({
        tenantId: actor.tenantId,
        templateId: tpl.id,
        fieldKey: f.fieldKey,
        label: f.label,
        xMm: new Prisma.Decimal(f.xMm.toFixed(2)),
        yMm: new Prisma.Decimal(f.yMm.toFixed(2)),
        widthMm: new Prisma.Decimal(f.widthMm.toFixed(2)),
        heightMm: new Prisma.Decimal(f.heightMm.toFixed(2)),
        fontFamily: f.fontFamily,
        fontSizePt: new Prisma.Decimal(f.fontSizePt.toFixed(2)),
        fontWeight: f.fontWeight,
        letterSpacingMm: new Prisma.Decimal(f.letterSpacingMm.toFixed(2)),
        lineHeight: new Prisma.Decimal(f.lineHeight.toFixed(2)),
        textAlign: f.textAlign,
        dateDigitGapMm:
          f.dateDigitGapMm !== null && f.dateDigitGapMm !== undefined
            ? new Prisma.Decimal(f.dateDigitGapMm.toFixed(2))
            : null,
        isVisible: f.isVisible,
        customConfigJson: (f.customConfigJson ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      })),
    });

    await tx.chequeCalibrationProfile.create({
      data: {
        tenantId: actor.tenantId,
        templateId: tpl.id,
        profileName: 'Default Printer Profile',
        offsetXMm: new Prisma.Decimal('0.00'),
        offsetYMm: new Prisma.Decimal('0.00'),
        scalePercent: new Prisma.Decimal('100.00'),
        printerMarginTopMm: new Prisma.Decimal('0.00'),
        printerMarginLeftMm: new Prisma.Decimal('0.00'),
        isDefault: true,
        createdBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'TEMPLATE_CREATED',
        entityType: 'ChequeTemplate',
        entityId: tpl.id,
        newValues: { templateName: tpl.templateName, bankId: tpl.bankId },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return tpl.id;
  });

  return getTemplateById(actor, created);
}

export async function updateTemplate(
  actor: AuthenticatedTenantUser,
  templateId: string,
  input: UpdateChequeTemplateInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.chequeTemplate.findFirst({
    where: { id: templateId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Cheque Template');
  }

  await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.chequeTemplate.updateMany({
        where: { tenantId: actor.tenantId, bankId: existing.bankId },
        data: { isDefault: false },
      });
    }

    await tx.chequeTemplate.update({
      where: { id: existing.id },
      data: {
        ...(input.templateName !== undefined ? { templateName: input.templateName } : {}),
        ...(input.paperWidthMm !== undefined
          ? { paperWidthMm: new Prisma.Decimal(input.paperWidthMm.toFixed(2)) }
          : {}),
        ...(input.paperHeightMm !== undefined
          ? { paperHeightMm: new Prisma.Decimal(input.paperHeightMm.toFixed(2)) }
          : {}),
        ...(input.orientation !== undefined ? { orientation: input.orientation } : {}),
        ...(input.dateFormat !== undefined ? { dateFormat: input.dateFormat } : {}),
        ...(input.feedDirection !== undefined ? { feedDirection: input.feedDirection } : {}),
        ...(input.centerOnA4 !== undefined ? { centerOnA4: input.centerOnA4 } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        updatedBy: actor.id,
      },
    });

    if (input.fields !== undefined) {
      for (const f of input.fields) {
        await tx.chequeTemplateField.upsert({
          where: {
            templateId_fieldKey: {
              templateId: existing.id,
              fieldKey: f.fieldKey,
            },
          },
          update: {
            label: f.label,
            xMm: new Prisma.Decimal(f.xMm.toFixed(2)),
            yMm: new Prisma.Decimal(f.yMm.toFixed(2)),
            widthMm: new Prisma.Decimal(f.widthMm.toFixed(2)),
            heightMm: new Prisma.Decimal(f.heightMm.toFixed(2)),
            fontFamily: f.fontFamily,
            fontSizePt: new Prisma.Decimal(f.fontSizePt.toFixed(2)),
            fontWeight: f.fontWeight,
            letterSpacingMm: new Prisma.Decimal(f.letterSpacingMm.toFixed(2)),
            lineHeight: new Prisma.Decimal(f.lineHeight.toFixed(2)),
            textAlign: f.textAlign,
            dateDigitGapMm:
              f.dateDigitGapMm !== null && f.dateDigitGapMm !== undefined
                ? new Prisma.Decimal(f.dateDigitGapMm.toFixed(2))
                : null,
            isVisible: f.isVisible,
          },
          create: {
            tenantId: actor.tenantId,
            templateId: existing.id,
            fieldKey: f.fieldKey,
            label: f.label,
            xMm: new Prisma.Decimal(f.xMm.toFixed(2)),
            yMm: new Prisma.Decimal(f.yMm.toFixed(2)),
            widthMm: new Prisma.Decimal(f.widthMm.toFixed(2)),
            heightMm: new Prisma.Decimal(f.heightMm.toFixed(2)),
            fontFamily: f.fontFamily,
            fontSizePt: new Prisma.Decimal(f.fontSizePt.toFixed(2)),
            fontWeight: f.fontWeight,
            letterSpacingMm: new Prisma.Decimal(f.letterSpacingMm.toFixed(2)),
            lineHeight: new Prisma.Decimal(f.lineHeight.toFixed(2)),
            textAlign: f.textAlign,
            dateDigitGapMm:
              f.dateDigitGapMm !== null && f.dateDigitGapMm !== undefined
                ? new Prisma.Decimal(f.dateDigitGapMm.toFixed(2))
                : null,
            isVisible: f.isVisible,
          },
        });
      }
    }

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'TEMPLATE_UPDATED',
        entityType: 'ChequeTemplate',
        entityId: existing.id,
        newValues: { templateName: input.templateName, fieldsUpdated: Boolean(input.fields) },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });

  return getTemplateById(actor, existing.id);
}

export async function duplicateTemplate(
  actor: AuthenticatedTenantUser,
  templateId: string,
  newName: string,
  meta: TenantActorMeta
) {
  const source = await getTemplateById(actor, templateId);
  return createTemplate(
    actor,
    {
      companyId: source.companyId,
      bankId: source.bankId,
      bankAccountId: source.bankAccountId,
      templateName: newName,
      paperWidthMm: source.paperWidthMm,
      paperHeightMm: source.paperHeightMm,
      orientation: source.orientation,
      dateFormat: source.dateFormat as 'DD/MM/YYYY' | 'DDMMYYYY' | 'DD MMM YYYY',
      feedDirection: source.feedDirection,
      centerOnA4: source.centerOnA4,
      isDefault: false,
      fields: source.fields.map((f) => ({
        fieldKey: f.fieldKey,
        label: f.label,
        xMm: f.xMm,
        yMm: f.yMm,
        widthMm: f.widthMm,
        heightMm: f.heightMm,
        fontFamily: f.fontFamily,
        fontSizePt: f.fontSizePt,
        fontWeight: f.fontWeight,
        letterSpacingMm: f.letterSpacingMm,
        lineHeight: f.lineHeight,
        textAlign: f.textAlign,
        dateDigitGapMm: f.dateDigitGapMm,
        isVisible: f.isVisible,
      })),
    },
    meta
  );
}

export async function updateTemplateStatus(
  actor: AuthenticatedTenantUser,
  templateId: string,
  status: 'ACTIVE' | 'INACTIVE',
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.chequeTemplate.findFirst({
    where: { id: templateId, tenantId: actor.tenantId },
  });
  if (!existing) {
    throw new NotFoundError('Cheque Template');
  }

  await prisma.$transaction(async (tx) => {
    await tx.chequeTemplate.update({
      where: { id: existing.id },
      data: { status, updatedBy: actor.id },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: existing.companyId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: status === 'ACTIVE' ? 'TEMPLATE_ACTIVATED' : 'TEMPLATE_DEACTIVATED',
        entityType: 'ChequeTemplate',
        entityId: existing.id,
        previousValues: { status: existing.status },
        newValues: { status },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );
  });

  return getTemplateById(actor, existing.id);
}

// Calibration Profiles
export async function listCalibrationProfiles(
  actor: AuthenticatedTenantUser,
  templateId?: string
) {
  const prisma = getPrisma();
  const rows = await prisma.chequeCalibrationProfile.findMany({
    where: {
      tenantId: actor.tenantId,
      ...(templateId ? { templateId } : {}),
    },
    orderBy: [{ isDefault: 'desc' }, { profileName: 'asc' }],
  });

  return rows.map((p) => ({
    ...p,
    offsetXMm: Number(p.offsetXMm.toString()),
    offsetYMm: Number(p.offsetYMm.toString()),
    scalePercent: Number(p.scalePercent.toString()),
    printerMarginTopMm: Number(p.printerMarginTopMm.toString()),
    printerMarginLeftMm: Number(p.printerMarginLeftMm.toString()),
    lastTestPrintedAt: p.lastTestPrintedAt?.toISOString() ?? null,
  }));
}

export async function createCalibrationProfile(
  actor: AuthenticatedTenantUser,
  input: CreateCalibrationProfileInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const tpl = await prisma.chequeTemplate.findFirst({
    where: { id: input.templateId, tenantId: actor.tenantId },
  });
  if (!tpl) {
    throw new NotFoundError('Cheque Template');
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.chequeCalibrationProfile.updateMany({
        where: { tenantId: actor.tenantId, templateId: tpl.id },
        data: { isDefault: false },
      });
    }

    const created = await tx.chequeCalibrationProfile.create({
      data: {
        tenantId: actor.tenantId,
        templateId: tpl.id,
        deviceId: input.deviceId ?? null,
        profileName: input.profileName,
        offsetXMm: new Prisma.Decimal(input.offsetXMm.toFixed(2)),
        offsetYMm: new Prisma.Decimal(input.offsetYMm.toFixed(2)),
        scalePercent: new Prisma.Decimal(input.scalePercent.toFixed(2)),
        printerMarginTopMm: new Prisma.Decimal(input.printerMarginTopMm.toFixed(2)),
        printerMarginLeftMm: new Prisma.Decimal(input.printerMarginLeftMm.toFixed(2)),
        isDefault: input.isDefault,
        createdBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CALIBRATION_PROFILE_CREATED',
        entityType: 'ChequeCalibrationProfile',
        entityId: created.id,
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return created;
  });
}

export async function updateCalibrationProfile(
  actor: AuthenticatedTenantUser,
  profileId: string,
  input: UpdateCalibrationProfileInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.chequeCalibrationProfile.findFirst({
    where: { id: profileId, tenantId: actor.tenantId },
  });
  if (!existing) {
    throw new NotFoundError('Calibration Profile');
  }
  if (existing.tenantId !== actor.tenantId) {
    throw new ForbiddenError();
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.chequeCalibrationProfile.updateMany({
        where: { tenantId: actor.tenantId, templateId: existing.templateId },
        data: { isDefault: false },
      });
    }

    const updated = await tx.chequeCalibrationProfile.update({
      where: { id: existing.id },
      data: {
        ...(input.profileName !== undefined ? { profileName: input.profileName } : {}),
        ...(input.offsetXMm !== undefined
          ? { offsetXMm: new Prisma.Decimal(input.offsetXMm.toFixed(2)) }
          : {}),
        ...(input.offsetYMm !== undefined
          ? { offsetYMm: new Prisma.Decimal(input.offsetYMm.toFixed(2)) }
          : {}),
        ...(input.scalePercent !== undefined
          ? { scalePercent: new Prisma.Decimal(input.scalePercent.toFixed(2)) }
          : {}),
        ...(input.printerMarginTopMm !== undefined
          ? { printerMarginTopMm: new Prisma.Decimal(input.printerMarginTopMm.toFixed(2)) }
          : {}),
        ...(input.printerMarginLeftMm !== undefined
          ? { printerMarginLeftMm: new Prisma.Decimal(input.printerMarginLeftMm.toFixed(2)) }
          : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        updatedBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CALIBRATION_PROFILE_UPDATED',
        entityType: 'ChequeCalibrationProfile',
        entityId: updated.id,
        newValues: input,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function recordCalibrationTestPrint(
  actor: AuthenticatedTenantUser,
  profileId: string,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.chequeCalibrationProfile.findFirst({
    where: { id: profileId, tenantId: actor.tenantId },
  });
  if (!existing) {
    throw new NotFoundError('Calibration Profile');
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.chequeCalibrationProfile.update({
      where: { id: existing.id },
      data: { lastTestPrintedAt: now, updatedBy: actor.id },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'CALIBRATION_TEST_PRINTED',
        entityType: 'ChequeCalibrationProfile',
        entityId: existing.id,
        newValues: { lastTestPrintedAt: now.toISOString() },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return profile;
  });

  return {
    id: updated.id,
    lastTestPrintedAt: updated.lastTestPrintedAt?.toISOString() ?? null,
  };
}

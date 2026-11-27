import type { Prisma } from '@prisma/client';
import type {
  AuthenticatedTenantUser,
  CreateCompanyInput,
  ListCompaniesQueryInput,
  UpdateCompanyInput,
} from '@cheque-saas/shared';
import { getPrisma } from '../../config/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { recordTenantAudit } from '../audit-logs/audit.service.js';

export interface TenantActorMeta {
  ipAddress: string | null;
  userAgent: string | null;
  requestId?: string | null;
}

const COMPANY_SORT_FIELDS: Record<string, keyof Prisma.CompanyOrderByWithRelationInput> = {
  companyName: 'companyName',
  companyCode: 'companyCode',
  createdAt: 'createdAt',
  status: 'status',
};

export async function listCompanies(
  actor: AuthenticatedTenantUser,
  query: ListCompaniesQueryInput
) {
  const prisma = getPrisma();
  const where: Prisma.CompanyWhereInput = {
    tenantId: actor.tenantId,
    ...(actor.companyAccessScope === 'SELECTED_COMPANIES'
      ? { id: { in: actor.allowedCompanyIds } }
      : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { companyCode: { contains: query.search } },
            { companyName: { contains: query.search } },
            { registeredBusinessName: { contains: query.search } },
            { city: { contains: query.search } },
          ],
        }
      : {}),
  };

  const sortField = (query.sortBy && COMPANY_SORT_FIELDS[query.sortBy]) || 'companyName';
  const skip = (query.page - 1) * query.limit;

  const [items, totalItems] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { [sortField]: query.sortOrder }],
      skip,
      take: query.limit,
    }),
    prisma.company.count({ where }),
  ]);

  return { items, totalItems, page: query.page, limit: query.limit };
}

export async function getCompanyById(
  actor: AuthenticatedTenantUser,
  companyId: string
) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, tenantId: actor.tenantId },
    include: { settings: true },
  });

  if (!company) {
    throw new NotFoundError('Company');
  }

  if (
    actor.companyAccessScope === 'SELECTED_COMPANIES' &&
    !actor.allowedCompanyIds.includes(company.id)
  ) {
    throw new ForbiddenError('You do not have access to this company.');
  }

  return company;
}

export async function createCompany(
  actor: AuthenticatedTenantUser,
  input: CreateCompanyInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.company.findUnique({
    where: {
      tenantId_companyCode: {
        tenantId: actor.tenantId,
        companyCode: input.companyCode,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ConflictError(`Company code '${input.companyCode}' already exists in this organization.`);
  }

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        tenantId: actor.tenantId,
        companyCode: input.companyCode,
        companyName: input.companyName,
        registeredBusinessName: input.registeredBusinessName ?? null,
        registrationNumber: input.registrationNumber ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        email: input.email ?? null,
        contactNumber: input.contactNumber ?? null,
        website: input.website ?? null,
        logoUrl: input.logoUrl ?? null,
        isDefault: false,
        status: 'ACTIVE',
        createdBy: actor.id,
      },
    });

    await tx.companySetting.create({
      data: {
        tenantId: actor.tenantId,
        companyId: company.id,
        defaultCurrency: actor.tenant.defaultCurrency,
        defaultChequeDateFormat: actor.tenant.dateFormat,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: company.id,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'COMPANY_CREATED',
        entityType: 'Company',
        entityId: company.id,
        newValues: company,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return company;
  });
}

export async function updateCompany(
  actor: AuthenticatedTenantUser,
  companyId: string,
  input: UpdateCompanyInput,
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.company.findFirst({
    where: { id: companyId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Company');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.company.update({
      where: { id: existing.id },
      data: {
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.registeredBusinessName !== undefined
          ? { registeredBusinessName: input.registeredBusinessName }
          : {}),
        ...(input.registrationNumber !== undefined
          ? { registrationNumber: input.registrationNumber }
          : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.contactNumber !== undefined ? { contactNumber: input.contactNumber } : {}),
        ...(input.website !== undefined ? { website: input.website } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        updatedBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: updated.id,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: 'COMPANY_UPDATED',
        entityType: 'Company',
        entityId: updated.id,
        previousValues: existing,
        newValues: updated,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

export async function updateCompanyStatus(
  actor: AuthenticatedTenantUser,
  companyId: string,
  status: 'ACTIVE' | 'INACTIVE',
  meta: TenantActorMeta
) {
  const prisma = getPrisma();
  const existing = await prisma.company.findFirst({
    where: { id: companyId, tenantId: actor.tenantId },
  });

  if (!existing) {
    throw new NotFoundError('Company');
  }

  if (status === 'INACTIVE' && existing.isDefault) {
    throw new ConflictError('Cannot deactivate the organization default company.');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.company.update({
      where: { id: existing.id },
      data: {
        status,
        updatedBy: actor.id,
      },
    });

    await recordTenantAudit(
      {
        tenantId: actor.tenantId,
        companyId: updated.id,
        userId: actor.id,
        deviceId: actor.deviceId,
        actorType: 'TENANT_USER',
        action: status === 'ACTIVE' ? 'COMPANY_ACTIVATED' : 'COMPANY_DEACTIVATED',
        entityType: 'Company',
        entityId: updated.id,
        previousValues: { status: existing.status },
        newValues: { status },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      },
      tx
    );

    return updated;
  });
}

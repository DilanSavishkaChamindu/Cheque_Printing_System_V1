import 'dotenv/config';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import {
  INITIAL_FEATURE_CATALOG,
  INITIAL_PERMISSION_CATALOG,
} from '@cheque-saas/shared';

const prisma = new PrismaClient();

const CENTRAL_SHARED_BANKS = [
  { bankCode: 'BOC', bankName: 'Bank of Ceylon', country: 'Sri Lanka' },
  { bankCode: 'COMB', bankName: 'Commercial Bank of Ceylon', country: 'Sri Lanka' },
  { bankCode: 'HNB', bankName: 'Hatton National Bank', country: 'Sri Lanka' },
  { bankCode: 'SAMP', bankName: 'Sampath Bank', country: 'Sri Lanka' },
  { bankCode: 'PB', bankName: "People's Bank", country: 'Sri Lanka' },
  { bankCode: 'NTB', bankName: 'Nations Trust Bank', country: 'Sri Lanka' },
  { bankCode: 'NDB', bankName: 'National Development Bank', country: 'Sri Lanka' },
  { bankCode: 'DFCC', bankName: 'DFCC Bank', country: 'Sri Lanka' },
  { bankCode: 'SEYB', bankName: 'Seylan Bank', country: 'Sri Lanka' },
] as const;

async function main(): Promise<void> {
  // 1. Seed global feature catalog
  for (const feature of INITIAL_FEATURE_CATALOG) {
    await prisma.feature.upsert({
      where: { key: feature.key },
      update: {
        name: feature.name,
        description: feature.description,
        category: feature.category,
        sortOrder: feature.sortOrder,
      },
      create: {
        key: feature.key,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        isGlobalActive: true,
        isDefaultEnabled: feature.isDefaultEnabled,
        sortOrder: feature.sortOrder,
      },
    });
  }

  // 2. Seed global permission catalog
  for (const permission of INITIAL_PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        name: permission.name,
        moduleKey: permission.moduleKey,
        description: permission.description,
      },
      create: {
        code: permission.code,
        name: permission.name,
        moduleKey: permission.moduleKey,
        description: permission.description,
      },
    });
  }

  // 3. Seed shared bank reference list
  for (const bank of CENTRAL_SHARED_BANKS) {
    await prisma.bank.upsert({
      where: {
        ownerScope_bankCode: {
          ownerScope: 'GLOBAL',
          bankCode: bank.bankCode,
        },
      },
      update: {
        bankName: bank.bankName,
        country: bank.country,
        isSystemShared: true,
      },
      create: {
        ownerScope: 'GLOBAL',
        tenantId: null,
        isSystemShared: true,
        bankCode: bank.bankCode,
        bankName: bank.bankName,
        country: bank.country,
        status: 'ACTIVE',
      },
    });
  }

  // 4. Seed initial Platform Administrator if credentials are configured
  const adminEmail = process.env.SEED_PLATFORM_ADMIN_EMAIL?.trim();
  const adminUsername = process.env.SEED_PLATFORM_ADMIN_USERNAME?.trim();
  const adminPassword = process.env.SEED_PLATFORM_ADMIN_PASSWORD;

  if (adminEmail && adminUsername && adminPassword) {
    const existing = await prisma.platformAdministrator.findUnique({
      where: { email: adminEmail },
    });

    if (!existing) {
      const passwordHash = await argon2.hash(adminPassword, {
        type: argon2.argon2id,
      });

      await prisma.platformAdministrator.create({
        data: {
          firstName: 'Platform',
          lastName: 'Administrator',
          email: adminEmail,
          username: adminUsername,
          passwordHash,
          status: 'ACTIVE',
          passwordUpdatedAt: new Date(),
        },
      });
    }
  }

  console.info('Seed completed: features, permissions, shared banks, and platform admin.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

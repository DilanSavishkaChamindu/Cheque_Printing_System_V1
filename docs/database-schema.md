# Database Schema Specification (MySQL 8.0 + Prisma)

Schema location: `server/prisma/schema.prisma`.

## Core Design Principles

1. **UUID Primary Keys:** All primary records use `CHAR(36)` UUID identifiers (`@default(uuid()) @db.Char(36)`).
2. **Strict Tenant Scoping:** Every tenant-owned table includes `tenantId` (`CHAR(36)`) indexed alongside query keys (dates, statuses, company IDs, cheque numbers).
3. **Financial Integrity:**
   - All monetary values use `DECIMAL(18, 2)` (`@db.Decimal(18, 2)`), never floating-point types.
   - `BankAccountTransaction` acts as an append-only financial ledger with monotonic `(bankAccountId, sequenceNumber)` and `(tenantId, idempotencyKey)` uniqueness. Reversals insert counter-entries referencing `reversedTransactionId`.
4. **Shared vs. Tenant-Scoped Banks:**
   - `Bank` and `BankBranch` support centrally shared records (`ownerScope = 'GLOBAL'`, `tenantId = NULL`, `isSystemShared = true`) alongside tenant-isolated custom entries (`ownerScope = <tenantId>`).
5. **Non-Overlapping Offline Cheque Numbers:**
   - `ChequeNumberAllocation` reserves explicit `[rangeStart, rangeEnd]` ranges per `ChequeBook` and `RegisteredDevice`, backed by `IssuedCheque` unique constraint `(tenantId, bankAccountId, chequeNumber)` and `(tenantId, idempotencyKey)`.
6. **Soft Status & Auditability:**
   - Financial and core operational records restrict hard deletes (`onDelete: Restrict`) and preserve history via `IssuedChequeStatusHistory`, `ReceivedChequeStatusHistory`, `TenantFeatureHistory`, `PlatformAuditLog`, `AuditLog`, `AuthenticationLog`, and `SecurityEvent`.

## Entity Groups

- **Platform:** `PlatformAdministrator`, `PlatformSession`, `Tenant`, `TenantSetting`, `Feature`, `TenantFeature`, `TenantFeatureHistory`, `Subscription`, `PlatformAuditLog`
- **Auth & RBAC:** `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `UserPermissionOverride`, `UserCompany`, `UserSession`, `PasswordResetToken`, `RegisteredDevice`
- **Organization:** `Company`, `CompanySetting`
- **Banking & Ledger:** `Bank`, `BankBranch`, `BankAccount`, `BankAccountTransaction`, `BankAccountAdjustment`
- **Cheques:** `ChequeBook`, `ChequeNumberAllocation`, `IssuedCheque`, `IssuedChequeStatusHistory`, `ChequePrintJob`, `ReceivedCheque`, `ReceivedChequeStatusHistory`
- **Templates & Calibration:** `ChequeTemplate`, `ChequeTemplateField`, `ChequeCalibrationProfile`
- **Offline Sync:** `SyncOperation`, `SyncConflict`, `SyncLog`
- **Reports & Backups:** `ReportExportJob`, `BackupJob`, `RestoreJob`
- **Audit & Security:** `AuditLog`, `AuthenticationLog`, `SecurityEvent`

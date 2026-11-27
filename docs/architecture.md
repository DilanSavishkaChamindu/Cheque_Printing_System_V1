# System Architecture

## Monorepo Layout

- `shared/`: Shared TypeScript constants, domain status enums, amount-in-words converter/verifier, millimeter/point print unit helpers, integer-cent bank ledger math helpers, cheque lifecycle rules, API envelope types, and Zod validation schemas compiled to ESM (`@cheque-saas/shared`).
- `server/`: Modular monolith Node.js + Express 5 + Prisma + MySQL 8.0 REST API (`/api/v1/*`).
- `client/`: React + Vite + TypeScript Progressive Web Application with TanStack Query, Zustand auth state, Tailwind CSS, Workbox SW (`vite-plugin-pwa`), and Dexie.js IndexedDB offline stores.
- `docs/`: Technical architecture, database schema, and API reference documentation.

## Multi-Tenancy, Feature Governance & RBAC

- **Separate Planes:** `PlatformAdministrator` (`PlatformSession`, `/api/v1/platform`, `/platform/*`) is strictly separated from tenant `User` (`UserSession`, `/api/v1/*`, `/*`). Tokens are scoped by `actorType` and blocked with HTTP `403` if used across planes.
- **Zero Client Trust:** `authenticateTenantUser` loads active session, tenant status, effective feature overrides, role permissions, explicit `ALLOW`/`DENY` user overrides, and allowed companies on every request. Suspended or deactivated tenants and users are blocked with HTTP `403`.
- **Dynamic Feature Catalog:** All tenant operational modules check `Feature` + `TenantFeature` overrides via `requireFeature` / `requireAnyFeature`. Even Client Administrators are blocked with HTTP `403` when a tenant feature is disabled.
- **Optional Companies Mode:** When the `companies` feature is disabled, `resolveAuthorizedCompanyId` transparently binds tenant operations to `tenant.defaultCompanyId`. When enabled, user access obeys `companyAccessScope` (`ALL_COMPANIES` or `SELECTED_COMPANIES`).

## Cheque Lifecycle, Printing & Financial Ledger

- **Cheque Issuance & Verification:** Numeric amounts and words are verified on both client and server (`convertAmountToWords`, `verifyAmountInWordsMatch`). Creation supports `Idempotency-Key` deduplication. Printed issued cheques lock financial fields from direct editing unless cancelled.
- **Bank Book-Balance Ledger:** `BankAccountTransaction` acts as an append-only ledger using `DECIMAL(18, 2)` and exact integer-cent math (`decimalStringToCents` / `centsToDecimalString`). Clearing an issued cheque debits the account ledger; clearing a received cheque credits it. Corrections insert counter-entry reversals (`reversedTransactionId`) rather than mutating historical rows. Balances represent internal book balances maintained by application records, not live bank feeds.
- **Printing & Calibration:** `ChequeTemplate`, `ChequeTemplateField`, and `ChequeCalibrationProfile` store millimeter dimensions and printer calibration offsets (`mmToPt` / `mmToPx`). Server-side printable PDFs are generated via `pdfkit`.

## Reports, Backup/Restore & Offline PWA Synchronization

- **Reports & Exports:** `/api/v1/reports` provides server-filtered, paginated reporting across 10 cheque and ledger categories with PDF (`pdfkit`) and Excel (`exceljs`) generation.
- **Backup & Restore:** Tenant exports strip secrets/hashes and sign payloads with a SHA-256 checksum. Restore uses a two-step workflow (`POST /restore/preview` -> `POST /restore/:restoreJobId/confirm`) enforcing strict tenant ownership (cross-tenant restore attempts raise `403` and log a `HIGH` severity `SecurityEvent`), schema version validation, and ledger consistency checks.
- **Offline PWA Mode:** Users bootstrap scoped bank accounts, templates, and non-overlapping `OFFLINE_RANGE` `ChequeNumberAllocation` slices into Dexie.js (`client/src/lib/offlineDb.ts`). `NewChequePage` automatically switches to cached accounts and locked offline ranges when `!isOnline`, queueing operations with exponential retry backoff (`computeSyncBackoffMs`) up to 300s. Server `/api/v1/sync/push` re-validates session, device activation (`RegisteredDevice`), features, permissions, and version conflicts, preserving any mismatch explicitly in `SyncConflict` for manual resolution.

## Security Hardening & Production Checklist

- **HTTP Hardening (`server/src/app.ts`):** `app.disable('x-powered-by')`, `helmet()`, explicit `CORS_ORIGIN` allowlist, JSON body cap (`5mb`), `x-request-id` correlation, and environment-configured rate limiters (`RATE_LIMIT_*`, `AUTH_RATE_LIMIT_MAX_REQUESTS`).
- **Credential & Audit Hygiene:** Argon2id password hashing, SHA-256 hashed refresh and password-reset tokens, recursive audit payload redaction (`sanitizeAuditValue`), and Pino `LOG_REDACTION_PATHS` covering `authorization`, `cookie`, passwords, and tokens.
- **Known Operational Limitations:**
  - Browser Service Workers/IndexedDB cannot guarantee durability against manual browser storage clearing; un-synchronized drafts stay marked locally until confirmed by MySQL.
  - Permission or status revocations on a disconnected offline device take effect when the device next connects (or upon cached `offlineExpiresAt` expiry).
  - Exact physical cheque alignment depends on printer driver scaling (`100%` actual size, zero margins) and requires calibration test printing per printer/browser pair before production cheque issuance.

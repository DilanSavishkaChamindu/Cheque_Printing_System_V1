# Cheque Printing SaaS Platform

Multi-tenant, offline-capable Cheque Printing SaaS Platform (PWA) built as a TypeScript monorepo (`shared`, `server`, `client`).

## Capabilities

- **Multi-Tenant Control Plane & RBAC:** Separate `PlatformAdministrator` governance console and tenant workspaces, database-driven feature entitlements (`Feature` / `TenantFeature`), fine-grained roles + `ALLOW`/`DENY` user permission overrides, and optional multi-company scoping (`companies` feature).
- **Cheque Creation, Printing & Calibration:** Cheque book range tracking, non-overlapping offline device allocations, English amount-in-words validation, millimeter cheque template designer, per-printer calibration profiles (`mm` offsets), print job logs, and server PDF generation (`pdfkit`).
- **Banking & Immutable Book-Balance Ledger:** Company-scoped bank accounts with masked account display, auditable append-only `BankAccountTransaction` ledger (`Opening + Credits - Debits`), counter-entry reversals, reconciliation checks, and separate `ReceivedCheque` tracking.
- **Reports, Backups & Audit Trails:** Server-paginated reporting across 10 cheque/ledger categories with Excel (`exceljs`) and PDF (`pdfkit`) exports, tenant-scoped JSON backup & two-phase verified restore, authentication logs, security events, and entity audit logs.
- **Offline-First PWA (`vite-plugin-pwa` + Dexie.js):** Service Worker asset precaching, IndexedDB storage for pre-allocated cheque ranges and queued cheque drafts, exponential sync backoff, and explicit server conflict resolution.

## Workspace Setup & Local Runbook

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure backend environment (`server/.env`):**
   - Copy `server/.env.example` to `server/.env`.
   - Set a valid MySQL 8.0 `DATABASE_URL`, e.g.:
     ```env
     DATABASE_URL="mysql://cheque_app:YOUR_PASSWORD@localhost:3306/cheque_printing_saas"
     ```
   - Set strong 64+ character `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values.
   - Configure `SEED_PLATFORM_ADMIN_EMAIL`, `SEED_PLATFORM_ADMIN_USERNAME`, and `SEED_PLATFORM_ADMIN_PASSWORD` before seeding, then rotate credentials in production.
3. **Configure frontend environment (`client/.env`, optional for Vite dev proxy):**
   - Copy `client/.env.example` to `client/.env` and set `VITE_API_BASE_URL` for non-proxied deployments.
4. **Prepare MySQL 8.0 schema and initial seed data:**
   ```bash
   npm run prisma:generate
   npm run prisma:validate
   npm run prisma:migrate
   npm run prisma:seed
   ```
5. **Run in development:**
   ```bash
   npm run dev:server
   npm run dev:client
   ```

## Verification Commands

- Validate Prisma schema: `npm run prisma:validate`
- Build all workspaces (`shared`, `server`, `client` + PWA SW): `npm run build`
- Typecheck all workspaces: `npm run typecheck`
- Run unit and HTTP security/isolation tests: `npm test`

## Documentation

- [System Architecture](docs/architecture.md)
- [Database Schema](docs/database-schema.md)
- [API Reference](docs/api-reference.md)

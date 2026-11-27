# REST API Reference (`/api/v1`)

All JSON responses follow a unified envelope:

- **Success:** `{ "success": true, "message": "...", "data": ..., "meta": { ... } }`
- **Error:** `{ "success": false, "message": "...", "code": "ERROR_CODE", "errors": [...], "requestId": "..." }`

Every tenant operational route requires a valid `Authorization: Bearer <accessToken>` issued to an `ACTIVE` `TENANT_USER` within an `ACTIVE` `Tenant`, plus route-level `FeatureKey` entitlement checks (`requireFeature` / `requireAnyFeature`) and RBAC checks (`requirePermission` / `requireClientAdmin`). Platform routes strictly require a `PLATFORM_ADMIN` token (`actorType: 'PLATFORM_ADMIN'`).

## Health

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Public | Verifies Express readiness and MySQL connectivity (`200` healthy, `503` degraded). |

## Authentication (`/api/v1/auth`)

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/v1/auth/platform/login` | Public (auth rate-limited) | Platform administrator login. |
| `POST` | `/api/v1/auth/platform/refresh` | Public (auth rate-limited) | Rotates platform admin refresh/access tokens. |
| `POST` | `/api/v1/auth/platform/logout` | Platform Admin | Revokes active platform session. |
| `GET` | `/api/v1/auth/platform/me` | Platform Admin | Returns authenticated platform admin profile. |
| `POST` | `/api/v1/auth/login` | Public (auth rate-limited) | Tenant user login (email or username + optional device info). |
| `POST` | `/api/v1/auth/refresh` | Public (auth rate-limited) | Rotates tenant session tokens. |
| `POST` | `/api/v1/auth/logout` | Tenant User | Revokes current session. |
| `POST` | `/api/v1/auth/logout-all` | Tenant User | Revokes all sessions for the user within their tenant. |
| `GET` | `/api/v1/auth/me` | Tenant User | Returns active user, effective features, permissions, and allowed companies. |
| `POST` | `/api/v1/auth/change-password` | Tenant User | Changes current password and verifies current password hash. |
| `POST` | `/api/v1/auth/forgot-password` | Public (auth rate-limited) | Issues single-use password reset token. |
| `POST` | `/api/v1/auth/reset-password` | Public (auth rate-limited) | Completes password reset using opaque reset token. |

## Platform Control Plane (`/api/v1/platform`)

Requires `authenticatePlatformAdmin`. Never shares runtime context with tenant user tokens.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/v1/platform/dashboard` | Platform KPIs, tenant counts, and system usage metrics. |
| `GET` | `/api/v1/platform/audit-logs` | Paginated platform audit logs. |
| `GET` | `/api/v1/platform/tenants` | List/filter client organizations. |
| `POST` | `/api/v1/platform/tenants` | Create organization, default company, initial client admin, and feature defaults. |
| `GET` | `/api/v1/platform/tenants/:tenantId` | View organization profile and usage summary. |
| `PATCH` | `/api/v1/platform/tenants/:tenantId` | Update organization details. |
| `PATCH` | `/api/v1/platform/tenants/:tenantId/status` | Activate, suspend, or deactivate an organization. |
| `GET` | `/api/v1/platform/tenants/:tenantId/users` | Read-only support view of tenant user accounts. |
| `GET` | `/api/v1/platform/tenants/:tenantId/features` | Inspect effective tenant features and overrides. |
| `PUT` | `/api/v1/platform/tenants/:tenantId/features` | Bulk update tenant feature entitlements. |
| `PUT` | `/api/v1/platform/tenants/:tenantId/features/:featureKey` | Enable or disable a single feature for a tenant. |
| `GET` | `/api/v1/platform/tenants/:tenantId/features/history` | Feature change audit trail. |
| `GET` | `/api/v1/platform/features` | List global feature catalog definitions. |
| `POST` | `/api/v1/platform/features` | Register a new global feature entry. |
| `PATCH` | `/api/v1/platform/features/:featureId` | Update global feature metadata or active/default flags. |

## Tenant Settings, Features & Audit

- `GET /api/v1/tenants/current` & `PATCH /api/v1/tenants/current` (`requireClientAdmin` on `PATCH`)
- `GET /api/v1/features/my` — Effective tenant feature list for the authenticated user
- `GET /api/v1/dashboard` (`feature: dashboard`, `permission: DASHBOARD_VIEW`)
- `GET /api/v1/audit-logs` (`permission: AUDIT_VIEW`)

## Organization, Users & Banking

- `/api/v1/companies` (`feature: companies`, `COMPANY_VIEW` / `COMPANY_MANAGE`)
- `/api/v1/users`, `/api/v1/roles`, `/api/v1/permissions` (`feature: user_management`, `USER_VIEW` / `USER_MANAGE`)
- `/api/v1/banks`, `/api/v1/bank-branches` (`feature: bank_management`, `BANK_VIEW` / `BANK_MANAGE`)
- `/api/v1/bank-accounts` (`feature: bank_balance`, `BANK_ACCOUNT_VIEW` / `BANK_ACCOUNT_MANAGE`)
- `/api/v1/bank-transactions` (`feature: bank_balance`, `BANK_ACCOUNT_VIEW` / `BANK_TRANSACTION_MANAGE`) — supports list, `/summary`, `/reconcile/:bankAccountId`, manual ledger posting, and counter-entry `/reverse`

## Cheque Operations, Received Cheques & Printing

- `/api/v1/cheque-books` (`requireAnyFeature: new_cheque, bank_balance, cheque_history`, `CHEQUE_BOOK_VIEW` / `CHEQUE_BOOK_MANAGE`) — manages cheque books and non-overlapping `OFFLINE_RANGE` device allocations
- `/api/v1/cheques` (`new_cheque` / `cheque_history` + `CHEQUE_*` permissions) — supports idempotent `POST /api/v1/cheques` (`Idempotency-Key` header or body key), `GET /api/v1/cheques/:chequeId/pdf` (`pdfkit`), drafting, issuing, printing status, banking status lifecycle, and soft cancellation
- `/api/v1/received-cheques` (`feature: received_cheques`, `RECEIVED_CHEQUE_VIEW` / `RECEIVED_CHEQUE_MANAGE`)
- `/api/v1/cheque-templates` & `/api/v1/calibration` (`feature: templates_calibration`, `TEMPLATE_VIEW` / `TEMPLATE_MANAGE`)

## Reports, Backup/Restore & Offline Sync

- `/api/v1/reports` (`feature: reports`, `REPORTS_VIEW` / `REPORTS_EXPORT`) — supports `GET /`, `POST /export` (`PDF` / `EXCEL`), `GET /jobs`
- `/api/v1/backups` (`feature: backup_restore`, `BACKUP_VIEW` / `BACKUP_MANAGE`) — supports `GET /`, `POST /export`, `POST /restore/preview`, `POST /restore/:restoreJobId/confirm`
- `/api/v1/sync` (`authenticateTenantUser` + device/permission guards) — `GET /devices`, `POST /devices/:deviceId/approve` (`DEVICE_MANAGE`), `POST /devices/:deviceId/revoke` (`DEVICE_MANAGE`), `POST /allocations/request` (`CHEQUE_BOOK_MANAGE`), `GET /bootstrap`, `POST /push`, `GET /conflicts`, `POST /conflicts/:conflictId/resolve` (`CHEQUE_EDIT`), `GET /logs`

# Architecture

High-level architecture and conventions for the Modular Furniture ERP. Updated as phases progress.

## 1. System shape

```
┌────────────────────┐        HTTPS / JSON         ┌────────────────────┐
│  Next.js 14 (App)  │  ───────────────────────▶   │  Express API       │
│  /frontend  :3100  │   NEXT_PUBLIC_API_BASE_URL  │  /backend   :4000  │
└────────────────────┘                             └─────────┬──────────┘
                                                             │ Prisma
                                                             ▼
                                                   ┌────────────────────┐
                                                   │  PostgreSQL 16     │
                                                   │  multi-schema      │
                                                   │  (core, ...)       │
                                                   └────────────────────┘
```

Two workspaces (`backend`, `frontend`) under a single root `package.json`. They are deployed independently but developed together via `npm run dev`.

## 2. Backend layout

```
backend/src/
  config/       Environment loader (zod-validated)
  middleware/   auth, rbac, error, request-logger, rate-limit (stubs in P0-03)
  utils/        logger (pino), response helpers, date helpers
  errors/       AppError hierarchy (Validation, Auth, Forbidden, NotFound)
  types/        Shared TypeScript types
  index.ts      Express app entry — wires middleware, mounts routes
```

Detailed structure is built incrementally — P0-03 lays down middleware/errors/logging, P0-04 brings the full schema, P0-05+ add auth/RBAC/etc.

## 3. Database

- Single Postgres 16 instance, multiple schemas to keep domains isolated.
- `core` — users, roles, permissions, orgs, audit (P0-02 stubs, P0-04 fills out).
- Later schemas added per phase (e.g. `crm`, `inventory`, `production`, `accounts`).
- Migrations via `prisma migrate dev` in development; `prisma migrate deploy` in production.
- All tables get `id UUID @default(uuid())`, `createdAt`, `updatedAt`, plus audit columns (added in P0-09).

## 4. Auth & RBAC (planned)

- **Auth (P0-05):** email + password (bcrypt), short-lived JWT access + longer refresh JWT, password reset by emailed token. MFA/OAuth deferred to P0-19.
- **RBAC (P0-06):** 6-level resolver — system → org → branch → department → designation → user. Permissions are merged top-down with explicit deny support.
- **Workflow engine (P0-08):** declarative state machines per business object, with module-level bypass for early phases.
- **Audit trail (P0-09):** automatic logging on all writes via Prisma middleware.

## 5. Communication (planned)

Provider modules behind a common abstraction so individual channels can be swapped without touching callers:

- Email (P0-15): SMTP, SendGrid, SES.
- SMS (P0-16): MSG91, Twilio — DLT-compliant for India.
- WhatsApp (P0-17): WhatsApp Business API.
- Notification orchestrator (P0-18): user preferences, in-app inbox, channel fallback.

## 6. API conventions

**Response envelope:**
```json
// success
{ "success": true, "data": { ... }, "meta": { ... } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ ... ] } }
```

**Error classes** all extend `AppError` and carry an HTTP status + machine-readable `code`. The global error handler turns any thrown `AppError` into the standard envelope; non-`AppError` exceptions become `500 INTERNAL_ERROR` with the stack only logged, never returned.

**Validation:** every request body / query / params runs through a zod schema before reaching the handler. Validation failures throw `ValidationError` with `details` listing each field issue.

**Logging:** pino, JSON in production, pretty in development. Every request gets a `requestId`; logs include user id once auth runs.

## 7. Frontend conventions

- Next.js 14 App Router, server components by default; client components opt-in with `"use client"`.
- Tailwind for styling, shadcn/ui for primitives (added in P0-14).
- Data fetching: server components call the API directly via `NEXT_PUBLIC_API_BASE_URL`; client components use a thin fetch wrapper that handles the standard response envelope.
- No global state library yet — added only when a screen needs it.

## 8. Environments

| Variable | Used by | Notes |
|---|---|---|
| `NODE_ENV` | both | `development` / `production` |
| `PORT` | backend | default 4000 |
| `DATABASE_URL` | backend | Postgres 16 connection string |
| `JWT_SECRET` | backend | access-token signing key |
| `JWT_REFRESH_SECRET` | backend | refresh-token signing key |
| `FRONTEND_URL` | backend | for CORS + email links |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | API origin |

`.env.example` is the single source of truth — every new variable must be added there with a comment explaining how to generate or pick a value.

## 9. Portable PostgreSQL

For local development this project uses a **portable, user-space Postgres** rather than the system-installed Windows service. Reasons:

- **No UAC.** No need to elevate to install or start the database. Important when working on machines where the developer can't (or shouldn't) install a system service.
- **Self-contained.** Postgres binaries live at `E:\Apps\PostgreSQL16\` (download: `postgresql-16.13-1-windows-x64-binaries.zip` from EnterpriseDB). Cluster lives in `E:\Apps\PostgreSQL16\data\`. Server log: `E:\Apps\PostgreSQL16\log\postgres.log`.
- **Reproducible.** A fresh dev box bootstraps with three commands: extract the zip, `initdb`, `pg_ctl start`.

The wrapper scripts (`scripts/db-start.ps1`, `db-stop.ps1`, `db-status.ps1`) read three optional env vars:

| Variable | Default | Meaning |
|---|---|---|
| `PG_HOME` | `E:\Apps\PostgreSQL16` | Where Postgres binaries are extracted |
| `PG_DATA` | `$PG_HOME\data` | Cluster directory (initdb output) |
| `PG_PORT` | `5432` | Listen port |

Production deployments will use a managed Postgres (RDS / Cloud SQL / equivalent) — the portable approach is dev-only.

## 10. Out-of-scope guard

The build is deliberately phase-locked. Each prompt in `/specs/PROMPTS_P0.md` lists explicit IN SCOPE / OUT OF SCOPE items; out-of-scope work is deferred to a named later prompt rather than expanded inline. This keeps phases small enough to verify and commit cleanly.

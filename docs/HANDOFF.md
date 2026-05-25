# ERP build — handoff reference

A single-file orientation for picking up this project on a different
machine (likely a Mac). Distilled from the build sessions through
**P1-01 (Sales Schema)** complete on **2026-05-25**.

> **Phase 0: COMPLETE (30/30).** Phase 1 in progress: P1-01 done.
> 299 / 299 backend tests passing. 76 tables (53 core + 23 sales).

---

## 1. TL;DR

- Backend: Node 20+ / TypeScript 5 / Express / Prisma 6 / PostgreSQL 16
- Frontend: Next.js 14 (App Router) / Tailwind / shadcn/ui — port **3100**
- DB: PostgreSQL 16.13, single instance, multi-schema (`core` + `sales`)
- 299 / 299 backend tests passing in ~13 s
- ~200 API endpoints across auth / users / RBAC / modules / workflows / audit
  / org / branches / departments / roles / documents / custom fields /
  email-providers / sms-providers / email-templates / sms-templates /
  whatsapp-providers / whatsapp-templates / whatsapp-webhook /
  notifications / notification-preferences / admin-notifications /
  oauth / dpdp / mfa
- Admin UI complete: users, roles, org, branches, departments, designations,
  locations, communication (templates/providers/log), compliance (DPDP),
  audit log viewer, workflow instances, settings, modules, custom fields
- Customer portal: layout, signup, dashboard, profile with preferences
- All admin sidebar nav groups: Overview, Identity, Operations, Master data,
  Communication, Compliance, System
- Audit auto-logging on every Prisma create / update / delete via extension
- **Git: NOT initialized yet.** Will happen after the whole of Phase 0 is
  done (decision locked in 2026-05-09).

---

## 2. Repository structure

```
ERP/                              ← repo root
├── README.md                     ← public overview
├── docs/
│   ├── ARCHITECTURE.md           ← system design
│   └── HANDOFF.md                ← (this file)
├── specs/
│   ├── FORWARD_REFERENCES.md     ← master phase 0-8 feature index
│   └── PROMPTS_P0.md             ← the 30 phase-0 prompts (source of truth)
├── backend/
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma         ← 76 models (53 core + 23 sales)
│   │   ├── migrations/           ← every migration applied chronologically
│   │   └── seed.ts               ← idempotent foundation seed
│   ├── scripts/
│   │   └── db-check.ts           ← connection / count probe
│   ├── src/
│   │   ├── app.ts                ← Express app factory
│   │   ├── index.ts              ← boot entry (graceful shutdown)
│   │   ├── config/               ← zod-validated env loader
│   │   ├── errors/               ← AppError class hierarchy
│   │   ├── utils/                ← logger, response helpers, dates, permissions, validate
│   │   ├── lib/                  ← prisma.ts (extended) + prisma-base.ts (raw)
│   │   ├── middleware/           ← auth, rbac, error-handler, request-id, audit-context, …
│   │   ├── services/             ← business logic — see §6
│   │   ├── routes/               ← Express routers per domain
│   │   └── types/
│   └── tests/
│       └── integration/*.test.ts ← 21 test files, 299 tests
├── frontend/
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              ← root → /admin/dashboard or /login
│   │   ├── (auth)/               ← login, forgot, reset, change-password
│   │   ├── portal/login/
│   │   └── admin/                ← shell + dashboard + modules + audit-logs + workflows + settings
│   ├── components/
│   │   ├── ui/                   ← shadcn primitives (manually copied)
│   │   ├── layout/               ← topbar, sidebar
│   │   ├── common/               ← DataTable, ConfirmDialog, PageHeader
│   │   └── providers/            ← AuthProvider context
│   └── lib/                      ← api.ts, auth-store.ts, types.ts, cn.ts
├── scripts/
│   ├── db-start.ps1              ← Windows: starts portable Postgres
│   ├── db-stop.ps1
│   └── db-status.ps1
├── uploads/                      ← runtime: logos, documents (gitignored)
├── .installers/                  ← Postgres binaries zip (gitignored)
└── package.json                  ← workspace root (backend + frontend)
```

---

## 3. Tech stack

### Backend
| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ (current dev box: 24) |
| Language | TypeScript 5.4 (strict, noUnusedLocals/Params, sourceMap) |
| Web framework | Express 4.19 |
| ORM | **Prisma 6.19** (downgraded from 7.x — 7 moved `url = env(...)` out of `schema.prisma`) |
| Auth | `jsonwebtoken` access + refresh, `bcrypt` (cost 12 prod, 4 in tests) |
| Validation | zod 4 — every request body / query / params |
| Logging | pino + pino-http + pino-pretty |
| Email | nodemailer + @sendgrid/mail + @aws-sdk/client-ses + mailgun.js |
| SMS | twilio + direct REST for MSG91 / Gupshup / Textlocal |
| Uploads | multer (in-memory) |
| CSV | csv-parse (sync) |
| Testing | vitest + supertest |
| Dev | tsx (watch mode), dotenv-cli |

### Frontend
| Layer | Choice |
|---|---|
| Framework | Next.js 14.2.35 (App Router) — port **3100** |
| Language | TypeScript 5.4 |
| Styling | Tailwind 3.4 with shadcn CSS-variable theme |
| Component library | shadcn/ui primitives (manually added under `components/ui/`) |
| Data table | @tanstack/react-table v8 |
| Forms | react-hook-form + @hookform/resolvers + zod |
| Icons | lucide-react |
| Toasts | sonner |
| State | React Context for auth, localStorage for tokens |

### Database
- **PostgreSQL 16.13**, single instance
- Multi-schema layout — Phase 0 lives entirely in `core`
- Migrations via Prisma (`prisma/migrations/`)
- Connection string in `.env` (NEVER committed)

---

## 4. Bringing it up on a NEW MAC

The current dev environment is Windows. On the new Mac, you need:

### 4.1 Install prerequisites

```bash
# Node.js 20+ (Homebrew):
brew install node

# PostgreSQL 16 — two choices:
brew install postgresql@16      # Homebrew (recommended on Mac)
brew services start postgresql@16
# OR
# Download Postgres.app from https://postgresapp.com and double-click

# Verify:
node --version    # >= 20
psql --version    # PostgreSQL 16.x
```

### 4.2 Create the database

```bash
# psql is on PATH after Homebrew/Postgres.app install.
createdb erp_dev
# Set a password for the postgres superuser:
psql -d erp_dev -c "ALTER USER postgres WITH PASSWORD 'pick-a-strong-one';"
```

### 4.3 Clone / copy the repo

If you're transferring the whole `E:\Applications\repo\ERP` folder over,
**don't copy `node_modules/`, `.next/`, `uploads/`, `.installers/`, or
`backend/node_modules/.prisma/`** — they're machine-specific. Either
delete them before the copy or rely on `.gitignore` if you've initialized
git by then.

Place the repo at e.g. `~/code/ERP/` on the Mac.

### 4.4 Update `.env`

The current `.env` has Windows-specific paths. On the Mac, edit
`ERP/.env`:

```bash
# Update DATABASE_URL with the password you set above.
# URL-encode special characters in the password.
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/erp_dev

# Frontend port — only matters if your Mac also has something on 3000
# (the Windows box did, hence the 3100 choice). On Mac you can drop back
# to 3000 by editing frontend/package.json scripts AND the FRONTEND_URL.
FRONTEND_URL=http://localhost:3100   # or 3000
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000

# All other knobs (JWT secrets, AUTH_*, SMS_*) can stay as-is.
```

### 4.5 Install + migrate + seed

```bash
cd ~/code/ERP
npm install
npm run db:migrate:dev    # applies every migration
npm run db:seed           # populates org, roles, modules, permissions,
                          # numbering series, settings, comm templates
npm run db:check          # sanity probe — should print non-zero counts
```

### 4.6 Run

```bash
npm run dev   # starts backend :4000 and frontend :3100 together
```

Open `http://localhost:3100`. The admin user is `admin@erp.local` (see §5).

### 4.7 Mac-specific notes

- The `scripts/db-start.ps1` / `db-stop.ps1` / `db-status.ps1` are Windows
  PowerShell. On Mac, use `brew services start postgresql@16` and
  `brew services stop postgresql@16` instead. Or write tiny bash
  equivalents if you'd like consistent `npm run db:start` UX.
- The Windows install uses a **portable** Postgres at `E:\Apps\PostgreSQL16\`
  because the EnterpriseDB system installer failed three times against
  Defender. On Mac the standard Homebrew install works — you can ignore
  all the portable-zip / `.installers/` machinery.
- `EADDRINUSE :4000` issue on Windows came from zombie `tsx watch`
  processes piling up. On Mac, `lsof -i :4000` and `kill <pid>` if needed.
- `uploads/` directory is recreated on demand. Empty start is fine.

---

## 5. Live credentials & seeded data

⚠ **Rotate before any non-local deployment.**

### Admin user
```
email:    admin@erp.local
password: Admin?Demo!Pa55word
```
Created during the P0-05 live-test step. Has the `super_admin` role
(attached after P0-06 was live-tested). Use this to sign in on first boot.

### Postgres superuser (on the Windows dev box)
```
=ZdWhA%E6AsSe?ZJQ4H-%YLt
```
Don't bring this to the Mac — generate a new one with
`ALTER USER postgres WITH PASSWORD '…';` and put the URL-encoded form in
`.env`.

### Other seeded data
- 1 Organization: "Default Organization" (FY start month = 4, INR, Asia/Kolkata)
- 6 system Roles: super_admin / admin / manager / supervisor / employee / customer
- 35 Modules (Phase 0..4)
- 16 Module dependencies
- 129 Permissions (122 module-level + 7 AUTH:users:* sub-feature)
- 430 role-permission grants
- 7 numbering series (ORD, INV, PO, GRN, MIN, DC, CERT)
- 12 system settings
- 7 communication templates (4 email + 3 SMS)

Running `npm run db:seed` again is idempotent — safe to re-run anytime.

---

## 6. Service inventory (backend/src/services/)

| Service | Purpose |
|---|---|
| `password.ts` | bcrypt + zod policy + HIBP breach + history check |
| `jwt.ts` | access + refresh token issuance / verification / rotation |
| `email.ts` | thin shim re-exporting from `communication/email-service` |
| `auth.ts` | internal user auth orchestration (login, refresh, lockout, reset…) |
| `customer-auth.ts` | portal auth (mirror, /api/portal/auth) |
| `users.ts` | admin user management — CRUD, roles, lock, CSV import |
| `permissions.ts` | 6-level RBAC resolver, per-user 1h cache |
| `modules.ts` | module registry, dependencies, activate/deactivate |
| `workflow.ts` | engine, step dispatch, module bypass |
| `workflow-condition.ts` | safe expression evaluator |
| `workflow-actions.ts` | named action handler registry |
| `audit.ts` | redactor + log writer (called by Prisma extension) |
| `audit-context.ts` | AsyncLocalStorage propagating actor through requests |
| `organization.ts` | singleton GET/PUT + logo upload |
| `branches.ts`, `departments.ts`, `designations.ts`, `locations.ts` | org-structure CRUD |
| `roles.ts` | role CRUD + role-permission set + permissions registry |
| `documents.ts` | generic upload + version chain + MIME whitelist |
| `field-visibility.ts` | per-role field rules + per-user merge |
| `custom-fields.ts` | custom field definitions + value validator |
| `communication/email-service.ts` | email send + template render + failover + log |
| `communication/templates.ts` | `{{var}}` renderer (works for email + SMS) |
| `communication/providers/*` | SMTP / SendGrid / SES / Mailgun / log |
| `communication/sms-service.ts` | SMS send + DLT + phone normalize + rate limit |
| `communication/sms-providers/*` | MSG91 / Twilio / Gupshup / Textlocal / log |
| `communication/whatsapp-service.ts` | WhatsApp send (template + session) + failover + rate limit |
| `communication/whatsapp-providers/*` | Interakt / Wati / Gupshup-WA / 360Dialog / log |
| `notification-orchestrator.ts` | Multi-channel dispatch + user prefs + in-app inbox + admin log |

---

## 7. Decisions locked in (do not revisit lightly)

These were settled during the build and changing them is invasive:

1. **Frontend port = 3100**, not 3000 — because the Windows box has a local
   `furniture-calculator` Next.js dev server on 3000. On Mac if no other
   server uses 3000, feel free to drop back to 3000 (update
   `frontend/package.json` dev/start scripts + `FRONTEND_URL` in `.env`).

2. **Prisma 6.x**, not 7. Prisma 7 broke `url = env(...)` in
   `schema.prisma` — moved to `prisma.config.ts`. We stayed on 6 to keep
   the schema-driven config the spec assumes.

3. **All 53 Phase-0 tables in `core` schema.** The spec header says "52"
   but Part 2 enumerates 53 (sub-header counting bug). Implemented all 53.

4. **Postgres `provider_code` is NOT unique** on `email_providers` and
   `sms_providers`. P0-15 / P0-16 dropped earlier `@unique` constraints
   because multiple SMTP / MSG91 configs (primary + fallback) are normal.

5. **`Notification.recipient_user_id` and `NotificationLog.notification_id`
   are NULLABLE** (P0-16 migration). System-emitted messages (e.g. anonymous
   forgot-password sends, rate-limited probes) still get log rows.

6. **Audit log via Prisma extension** (P0-09), not via middleware on every
   route. Single source of truth — `lib/prisma.ts` extends and routes
   import from there; `lib/prisma-base.ts` is the un-extended raw client
   used only by the audit logger itself to avoid recursion.

7. **bcrypt cost 12 in prod, 4 in tests** (vitest config). Suite stays
   under 15 s.

8. **Sidebar permission filtering** — every nav item declares
   `requires: ['MODULE:feature:action']`. The shell hits
   `/api/rbac/users/:id/permissions` once and filters client-side.

9. **No git yet.** P0 commits will be applied as a batch (or rewritten)
   after P0-30. Don't `git init` between prompts.

---

## 8. What's still pending / deferred (carry these forward)

### Functional debt
- **Settings endpoint** — `/admin/settings` page is wired but shows a
  placeholder noting "endpoint comes in P0-22". When P0-22 ships, drop the
  placeholder card.
- **`/admin/profile`** — linked from the topbar dropdown, page not yet
  built. Lands with P0-19 self-service.
- **Sidebar nav stubs** — `/admin/users`, `/admin/roles`,
  `/admin/organization`, `/admin/branches`, `/admin/documents`,
  `/admin/custom-fields`, `/admin/email-providers`, `/admin/email-templates`,
  `/admin/sms-providers`, `/admin/sms-templates` — backend ready for all,
  no frontend pages yet.
- **Demo admin user** (`admin@erp.local`) — convenient for now; remove
  or change before deploying.
- **createUser double-sends** both `password_reset` and `welcome_user`
  emails. P0-19 onboarding cleanup will pick this up.
- **DLT placeholder IDs** — the 3 SMS templates carry `DLT_PLACEHOLDER_*`.
  Register real templates with TRAI and update via PUT
  `/api/admin/sms-templates/:id` before flipping
  `DLT_ENFORCEMENT_ENABLED=true` in production.

### Technical debt
- Two cosmetic TS casts in `backend/src/app.ts` for
  `express.json/.urlencoded()`, `pino-http`, and `express.static()`
  (overload mismatches in @types/express). Runtime is fine.
- ~3 npm audit warnings on transitive deps. Re-evaluate in P0-19
  security hardening.
- Encryption helpers for `// @encrypted` columns: P0-19 will materialise
  them. Columns are in place since P0-04.
- Generic dispatch refactor: email + SMS share ~80% of chain-failover
  machinery. Worth extracting in P0-18 once WhatsApp lands.

### Infrastructure debt
- File uploads are local-disk under `<repo>/uploads/`. Production should
  swap for S3 / GCS — the static handler in `app.ts` and the Document
  service paths are the two touchpoints.
- Background scheduler not yet running cron-style: workflow timeouts and
  audit retention archive have manual endpoints; P0-19 will add the cron.
- Permission resolver cache is in-process. Multi-replica deployments need
  Redis-backed invalidation. P0-19 territory.

---

## 9. Completed prompts at a glance

| # | Name | Headline |
|---|---|---|
| P0-01 | Project initialization | Workspaces, backend + frontend skeletons booting |
| P0-02 | PostgreSQL + Prisma | core schema, stub User model, db-check script |
| P0-03 | Backend core | config / errors / logger / middleware stack + 5 tests |
| P0-04 | Complete schema | 53 tables, 35 modules, full seed |
| P0-05 | Authentication | Internal + portal auth, JWT, password policy, lockout |
| P0-06 | RBAC resolver | 6-level resolver, 122 permissions, overrides |
| P0-07 | Module registry | Enable/disable, deps, history, cache |
| P0-08 | Workflow engine | Approval/notify/condition/action + module bypass |
| P0-09 | Audit trail | Prisma extension, AsyncLocalStorage actor, redactor |
| P0-10 | User management | CRUD, roles, lock/unlock, CSV import |
| P0-11 | Org structure | Singleton org + branches + dept hierarchy + locations |
| P0-12 | Roles + docs | Role CRUD, generic doc upload + version chain |
| P0-13 | Field config | Visibility rules + custom field framework + validator |
| P0-14 | Admin UI foundation | shadcn shell, auth pages, common components |
| P0-15 | Email provider | SMTP / SendGrid / SES / Mailgun, templates, failover |
| P0-16 | SMS provider | MSG91 / Twilio / Gupshup / Textlocal, DLT, rate limit |
| P0-17 | WhatsApp Business provider | Interakt / Wati / Gupshup / 360Dialog, template messaging, webhooks |
| P0-18 | Notification orchestrator | Multi-channel dispatch, user prefs, in-app inbox, admin log/test |
| P0-19 | MFA, OAuth, Security Hardening | TOTP MFA, Google/Microsoft OAuth, express-rate-limit, helmet, DPDP compliance |
| P0-20 | Payment foundation | Razorpay gateway, online/offline payments, refunds, webhooks, admin CRUD |
| P0-21 | Customer portal foundation | Accounts, users, self-signup with approval, portal isolation |
| P0-22 | Numbering series & settings | Atomic sequence engine, financial year reset, system settings CRUD |

Full per-prompt detail lives in
`C:\Users\abc\.claude\projects\C--Users-abc\memory\project_erp_build_state.md`
on the Windows box (Claude's working memory). The same content is
narrated in the chat transcript. Copy that file alongside the repo if you
want the deep narrative.

---

## 10. How to resume — what's next

**P0-23** (spec at `specs/PROMPTS_P0.md`). P0-22 is complete.

To start, in a Claude Code session: spin up the dev servers, type "go",
and we resume from P0-23.

---

## 11. Common gotchas seen during the build

1. **Zombie `tsx watch` processes** holding `:4000` and the Prisma DLL.
   Symptom: `EADDRINUSE` on dev server start, or `EPERM rename` when
   running `prisma generate`. Fix: kill stale node procs. On Mac:
   ```bash
   lsof -i :4000          # find PID
   kill <pid>
   ```

2. **Edit tool "File has not been read yet"** — if a file was modified
   externally between Reads, the next Edit fails silently with that error.
   The workaround was: Read first, then Edit, in the same turn.

3. **Cumulative DB state in tests** — `vitest.config.ts` has
   `fileParallelism: false` because tests share the live `erp_dev` DB.
   Two test files can't both mutate `core.modules.is_active` in parallel.

4. **bcrypt slowness** — production cost 12 is ~250 ms per hash; in tests
   we use cost 4 via vitest env override (`AUTH_BCRYPT_COST=4`).

5. **Prisma extension recursion** — the audit logger writes to
   `core.audit_logs`. To avoid auto-auditing those writes, the audit
   logger uses `rawPrisma` (`lib/prisma-base.ts`), NOT the extended
   `prisma` from `lib/prisma.ts`.

6. **JSON null in Prisma** — for nullable JSON columns, `createMany` /
   `update` needs `Prisma.JsonNull` (not `null`) to clear the field.
   Encountered when seeding role-permission `scope_filter` and email
   provider configurations.

7. **Express + body-parser type overlap** — `express.json()`,
   `express.urlencoded()`, `express.static()`, and `pino-http` return
   types don't satisfy `app.use(handler)` cleanly. Two `as unknown as
   RequestHandler` casts in `app.ts` work around this without changing
   runtime behaviour.

---

## 12. File-transfer checklist

When copying from the Windows box to the new Mac:

✅ Copy:
- `ERP/` whole folder EXCEPT the items below

❌ Don't copy (regenerate on Mac):
- `node_modules/` (any of them — root, backend, frontend)
- `backend/node_modules/.prisma/`
- `.next/`
- `.installers/` (Postgres-binaries zip is Windows-specific)
- `uploads/` (if empty / dev-only)
- `.env` (the password format is fine but the Windows path comments
  reference E:\Apps; rewrite a clean `.env` from `.env.example`)

📋 Bring separately (NOT in repo):
- The Postgres password you choose for the Mac
- Any future API keys (SendGrid, SES, MSG91, Twilio) — never check into
  source

Once copied:
```bash
cd ~/code/ERP
npm install
npm run db:migrate:dev
npm run db:seed
npm run dev
```

Sign in at `http://localhost:3100/login` with `admin@erp.local` /
`Admin?Demo!Pa55word`.

---

_Last updated: 2026-05-22, end of P0-22. Resume by reading
`specs/PROMPTS_P0.md` at `### PROMPT P0-23`._

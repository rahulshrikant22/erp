# PHASE 0 — FOUNDATION
## Admin, RBAC, Communication, Compliance, Payment, Customer Portal Foundation

**Version:** 2.0
**Total prompts:** 30
**Total tables:** 52
**Estimated timeline:** 4-6 weeks at 4-6 hours/day
**Dependencies:** None (this is the first phase)

---

## CLAUDE CODE — READ BEFORE EVERY PROMPT IN THIS FILE

```
═══════════════════════════════════════════════════════════
SCOPE PROTECTION INSTRUCTIONS — APPLIES TO ALL PROMPTS HERE
═══════════════════════════════════════════════════════════
Before agreeing to ANY scope addition during a prompt:
1. Check the SCOPE BOUNDARIES section at end of the current prompt
2. Check FORWARD_REFERENCES.md in project root
3. If the requested feature is listed for a future phase:
   Respond: "That feature is planned for [Phase X, Prompt PX-NN].
   Adding it here will create incomplete functionality dependent on
   tables/services not yet built. Recommend deferring. Continue with
   current Phase 0 scope?"
4. Only proceed with out-of-scope work if user explicitly says:
   "Override scope protection. Add this as an exception."
5. If user overrides, prefix the commit message with [OVERRIDE].
═══════════════════════════════════════════════════════════
```

---

## PART 1 — WHAT PHASE 0 BUILDS

Phase 0 is the foundation. Every other phase plugs into it. Without Phase 0 working, no other phase can run.

**Sub-modules in Phase 0:**
1. Database schema and core master data
2. Authentication (login, JWT, session, password security, MFA, OAuth foundation)
3. RBAC (6-level: module → feature → action → field → row → user override)
4. Module registry with enable/disable and bypass logic
5. Workflow engine with module bypass
6. Audit trail (auto-logging on all writes)
7. User and organization management
8. Roles and permissions admin
9. Field configuration (per-role visibility, custom fields)
10. Communication module (email, SMS, WhatsApp — multi-provider)
11. DPDP Act 2023 compliance features
12. Rate limiting and security hardening
13. Payment foundation (Razorpay + offline)
14. Customer portal foundation (accounts, users, signup with approval)
15. Document management foundation
16. Numbering series engine
17. Notification system
18. Admin UI for everything above

**What Phase 0 explicitly does NOT build:**
- Any business module (orders, products, BOM, production, dispatch — those are later phases)
- Customer-facing functional screens (foundation only; UI in Phase 7)
- Quote viewing in portal (Phase 6)
- Reports beyond basic admin views (Phase 8)

---

## PART 2 — DATABASE SCHEMA SUMMARY

All Phase 0 tables go in the `core` schema. 52 tables grouped by purpose:

**Identity & Access (12 tables):**
users, user_sessions, user_password_history, password_reset_tokens, oauth_providers, oauth_connections, mfa_devices, mfa_recovery_codes, login_attempts, ip_blocklist, device_fingerprints, security_events.

**Organization (5 tables):**
organizations, branches, departments, designations, locations.

**RBAC (8 tables):**
roles, permissions, role_permissions, user_roles, user_permission_overrides, field_visibility_config, data_access_rules, custom_fields.

**Modules & Workflow (6 tables):**
modules, module_dependencies, module_activation_history, workflows, workflow_steps, workflow_instances, workflow_action_logs.

**Audit & Compliance (5 tables):**
audit_logs, dpdp_consents, dpdp_data_requests, privacy_policy_versions, terms_of_service_versions.

**Communication (6 tables):**
email_providers, sms_providers, whatsapp_providers, communication_templates, notifications, notification_log.

**Customer Portal Foundation (4 tables):**
customer_accounts, customer_users, customer_signup_requests, customer_portal_permissions.

**Payment Foundation (3 tables):**
payment_gateways, payment_transactions, payment_refunds.

**Documents & Master Data (3 tables):**
documents, numbering_series, system_settings.

---

## PART 3 — THE 30 PROMPTS

Each prompt is self-contained. Copy the entire prompt text (everything inside the ``` block) into Claude Code. Do not paraphrase.

After successful execution: test → commit with the specified message → push to GitHub → next prompt.

---

### PROMPT P0-01 — Project Initialization & Tech Stack

```
Initialize the ERP project. Read ERP_SPEC.md and FORWARD_REFERENCES.md for context.

Create the following structure:

/erp-project
  /backend          — Node.js + TypeScript + Express + Prisma
  /frontend         — Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
  /specs            — Where all PROMPTS_PX.md files live
  /docs             — Project documentation (README, ARCHITECTURE.md)
  /scripts          — Migration helpers, seed scripts
  .env.example      — Template for environment variables
  .gitignore        — Properly configured for Node + Next.js
  package.json      — Root with workspaces config

Tech stack confirmation:
- Backend: Node.js 20 LTS, TypeScript 5+, Express, Prisma ORM, PostgreSQL 16
- Frontend: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui components
- Auth: jsonwebtoken, bcrypt
- Validation: zod
- Testing: vitest for unit, supertest for API integration
- Logging: pino with pino-pretty for development

Initialize:
1. Create folder structure
2. Initialize npm workspaces (root package.json with workspaces: ["backend", "frontend"])
3. Initialize backend with TypeScript, Express, Prisma
4. Initialize frontend with Next.js 14
5. Create .env.example with: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, NODE_ENV, PORT, FRONTEND_URL
6. Create initial README.md with project overview
7. Initialize git, create .gitignore (node_modules, .env, .next, dist, etc.)

Verify:
- Run `npm install` from root — succeeds
- Backend dev server starts on port 4000
- Frontend dev server starts on port 3000
- Database connection string in .env (placeholder for now)

Do NOT create any business logic yet. Project skeleton only.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-01
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Project structure setup
- Tech stack initialization
- Environment configuration template
- Git initialization

❌ OUT OF SCOPE (DO NOT EXPAND):
- Database tables (Prompt P0-04)
- Authentication implementation (Prompt P0-05)
- Any UI screens (later prompts)
- User management (Prompt P0-10)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"That belongs in a later prompt. Phase 0 is built incrementally.
Continue with project initialization scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-01] Project initialization with Node + Next.js + Prisma stack`

---

### PROMPT P0-02 — PostgreSQL Setup & Prisma Configuration

```
Configure PostgreSQL connection and Prisma ORM.

Prerequisites: PostgreSQL 16 installed locally. Database `erp_dev` created.
Connection string format: postgresql://postgres:PASSWORD@localhost:5432/erp_dev

Tasks:
1. In /backend, install Prisma: npm install prisma @prisma/client
2. Initialize Prisma: npx prisma init
3. Configure schema.prisma:
   - datasource db with PostgreSQL provider, url from env
   - generator client with output to node_modules/.prisma/client
   - Enable multiSchema preview feature
4. Create the `core` schema in PostgreSQL via SQL migration:
   - CREATE SCHEMA IF NOT EXISTS core;
5. Configure Prisma to use named schemas (multiSchema)
6. Create a basic User stub model (just to test Prisma works):
   model User {
     id        String   @id @default(uuid())
     email     String   @unique
     createdAt DateTime @default(now())
     @@schema("core")
   }
7. Run first migration: npx prisma migrate dev --name init
8. Verify: psql to db, \dn shows core schema, \dt core.* shows User table
9. Generate Prisma client and write a test script that connects and queries

Output a setup verification report:
- PostgreSQL version
- Database name
- Schema list
- Connection successful
- Prisma version

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-02
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- PostgreSQL connection
- Prisma initialization
- Multi-schema configuration
- Basic stub User model (will be replaced in P0-04)

❌ OUT OF SCOPE:
- Full database schema (P0-04 builds all 52 tables)
- Auth logic (P0-05)
- Any application code beyond stub

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Full schema is built in P0-04. The stub here just verifies Prisma works.
Continue with verification scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-02] PostgreSQL connection and Prisma multi-schema setup`

---

### PROMPT P0-03 — Backend Core Structure (Middleware, Errors, Logging)

```
Build backend core structure for the API server.

Create:
/backend/src/
  /config/        — Environment loader, app config
  /middleware/    — Auth, error, logging, rate-limit, RBAC middleware (stubs for now)
  /utils/         — Logger, response helpers, date helpers
  /errors/        — Custom error classes (AppError, ValidationError, AuthError, ForbiddenError, NotFoundError)
  /types/         — Shared TypeScript types
  /index.ts       — Express app entry

Implement:
1. Config loader using dotenv with type-safe access via zod schema validation
2. Pino logger with development pretty-printing, production JSON
3. Error class hierarchy with status codes
4. Global error handler middleware (catches all errors, logs, returns standard JSON response)
5. Request logger middleware
6. CORS middleware (configured from env)
7. Body parser middleware
8. Health check endpoint: GET /health → { status: 'ok', timestamp, version }
9. 404 handler
10. Standard response helpers: sendSuccess(res, data), sendError(res, error)

Standard response format:
- Success: { success: true, data: {...}, meta: {...} }
- Error: { success: false, error: { code, message, details } }

Tests:
- Health check returns 200
- Unknown route returns 404 with standard error format
- Throwing AppError returns proper status and format
- Logger captures requests

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-03
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Backend infrastructure (middleware, errors, logging)
- Health check endpoint
- Standard response format
- Error handling foundation

❌ OUT OF SCOPE:
- Authentication middleware logic (P0-05 will fill auth stub)
- RBAC logic (P0-06 will fill RBAC stub)
- Rate limiting actual rules (P0-19 fills it)
- Any business endpoints

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Stubs are intentional. Each is filled in a later P0 prompt.
Continue with infrastructure scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-03] Backend core structure with middleware, errors, and logging`

---

### PROMPT P0-04 — Complete Database Schema (52 Tables)

```
Build the complete Phase 0 database schema. All 52 tables in `core` schema.

Read PROMPTS_P0.md Part 2 for the table list and FORWARD_REFERENCES.md for context.

Define every table with proper columns, constraints, indexes, and relationships.

KEY TABLES (high-level structure — implement fully):

core.organizations:
  id, name, legal_name, gstin, pan, registered_address, billing_address,
  logo_url, primary_email, primary_phone, financial_year_start_month (default 4),
  default_currency (default INR), timezone (default Asia/Kolkata),
  is_active, audit columns

core.branches:
  id, organization_id, branch_code, name, branch_type (head_office/factory/warehouse/showroom),
  gstin, address fields, is_active, audit columns

core.departments, core.designations, core.locations: standard CRUD tables

core.users:
  id, employee_code, email (unique), phone, first_name, last_name,
  password_hash, password_changed_at, must_change_password,
  user_type (internal/external), branch_id, department_id, designation_id,
  is_active, is_locked, locked_until, last_login_at,
  two_factor_enabled, two_factor_secret_encrypted, backup_codes_encrypted,
  audit columns

core.user_sessions:
  id, user_id, refresh_token_hash, device_info, ip_address, user_agent,
  issued_at, expires_at, revoked_at, last_used_at

core.roles:
  id, role_code (unique), name, description, is_system_role, is_active

core.permissions:
  id, permission_code, module_id, feature, action, description

core.role_permissions: id, role_id, permission_id, scope_filter (jsonb)

core.user_roles: id, user_id, role_id, assigned_by, assigned_at, expires_at, is_active

core.user_permission_overrides: id, user_id, permission_id, grant_type (allow/deny), reason, expires_at

core.modules:
  id, module_code (unique), name, description, category, is_core (bool — cannot be disabled),
  is_bypassable (bool — can workflows skip it), is_active, activated_at, deactivated_at,
  parent_module_id (for sub-modules), display_order

core.workflows:
  id, workflow_code, name, description, target_entity (e.g., 'order', 'po'),
  trigger_event, is_active, audit columns

core.workflow_steps:
  id, workflow_id, step_sequence, step_name, step_type (approval/notification/condition/action),
  assignee_type (role/user/dynamic), assignee_value, condition_json, timeout_minutes,
  skip_if_module_inactive (bool — KEY for bypass logic), target_module_id, audit columns

core.workflow_instances:
  id, workflow_id, target_entity_id, current_step, status (active/completed/cancelled),
  initiated_by, initiated_at, completed_at

core.workflow_action_logs:
  id, instance_id, step_id, action_taken, actor_user_id, action_at, notes

core.audit_logs:
  id, entity_type, entity_id, action (create/update/delete/login/logout/permission_change),
  actor_user_id, actor_ip, actor_user_agent, before_data (jsonb), after_data (jsonb),
  changes_summary, action_at, request_id (for correlation)

core.email_providers:
  id, provider_name (smtp/sendgrid/ses/mailgun), provider_code, configuration (jsonb encrypted),
  from_email, from_name, is_primary, is_active, audit columns

core.sms_providers, core.whatsapp_providers: similar structure

core.communication_templates:
  id, template_code, name, channel (email/sms/whatsapp), subject_template,
  body_template, variables_schema (jsonb), is_active, audit columns

core.notifications:
  id, recipient_user_id, notification_type, title, body, is_read, read_at,
  related_entity_type, related_entity_id, created_at

core.notification_log:
  id, notification_id, channel, provider_id, recipient_address, status,
  sent_at, delivered_at, error_message, provider_message_id

core.customer_accounts:
  id, account_code, company_name, primary_contact_name, primary_email, primary_phone,
  account_type (architect/dealer/direct/corporate), gstin, pan,
  is_active, is_verified, verified_at, signup_request_id, audit columns

core.customer_users:
  id, customer_account_id, email (unique within account), password_hash,
  first_name, last_name, phone, role (admin/regular), is_active, audit columns

core.customer_signup_requests:
  id, company_name, contact_name, email, phone, account_type, business_proof_url,
  status (pending/approved/rejected), submitted_at, reviewed_by, reviewed_at, review_notes

core.payment_gateways:
  id, gateway_code (razorpay/stripe), display_name, configuration (jsonb encrypted),
  is_test_mode, is_primary, is_active

core.payment_transactions:
  id, transaction_code, gateway_id (nullable for offline),
  payment_mode (online/bank_transfer/cheque/cash),
  related_entity_type, related_entity_id (e.g., 'order', UUID),
  amount, currency, status, gateway_transaction_id, gateway_payment_id,
  utr_number, cheque_number, cheque_date, payer_name, notes,
  initiated_at, completed_at, audit columns

core.documents:
  id, document_type, name, file_path, file_size, mime_type,
  related_entity_type, related_entity_id, uploaded_by, uploaded_at,
  version, parent_document_id (for revisions)

core.numbering_series:
  id, series_code (e.g., ORD/INV/PO), name, prefix, year_format (YYYY/YY/none),
  separator, padding_length, current_number, reset_yearly, last_reset_at, is_active

core.system_settings:
  id, setting_key (unique), setting_value (text), data_type (string/integer/boolean/json),
  category, description, is_user_editable, audit columns

core.dpdp_consents:
  id, user_id (nullable for customer_user), customer_user_id (nullable),
  consent_type (terms/privacy/marketing/cookies), version_id, consented_at,
  consent_method, ip_address, withdrawn_at, withdrawal_reason

core.dpdp_data_requests:
  id, requester_type (employee/customer), requester_id, request_type (export/erasure),
  status, submitted_at, processed_at, processed_by, response_data_url

core.privacy_policy_versions, core.terms_of_service_versions: id, version, content, effective_from, is_active

core.custom_fields:
  id, target_entity, field_code, label, field_type, is_required,
  options_json, validation_rules, display_order, is_active

core.field_visibility_config:
  id, role_id, target_entity, field_code, visibility (visible/readonly/hidden), display_order

core.login_attempts:
  id, identifier (email or username), attempt_at, success, ip_address, user_agent

core.ip_blocklist:
  id, ip_address, blocked_until, reason, blocked_at

core.security_events:
  id, event_type, severity, user_id, details_json, occurred_at, ip_address

core.password_reset_tokens:
  id, user_id, token_hash, expires_at, used_at

core.oauth_providers:
  id, provider_code (google/microsoft), client_id, client_secret_encrypted, is_active

core.oauth_connections:
  id, user_id (nullable), customer_user_id (nullable), provider_id, provider_user_id,
  access_token_encrypted, refresh_token_encrypted, expires_at

core.mfa_devices:
  id, user_id, device_name, device_type (totp/sms), secret_encrypted, is_primary, is_verified, created_at

core.mfa_recovery_codes:
  id, user_id, code_hash, used_at

core.user_password_history:
  id, user_id, password_hash, set_at

core.module_dependencies, core.module_activation_history: tracking tables for module changes

core.customer_portal_permissions:
  id, customer_account_id, permission_code, granted_at, granted_by

Implementation requirements:
1. Use Prisma schema with @@schema("core") on every model
2. UUIDs for all primary keys (default uuid())
3. Timestamps: created_at, updated_at on every mutable table
4. Audit fields: created_by, updated_by where applicable (FK to users.id)
5. Soft delete: is_deleted, deleted_at, deleted_by on key tables (users, customer_accounts, organizations, branches)
6. Indexes on all FK columns
7. Indexes on frequently filtered columns (status, is_active, dates)
8. Unique constraints where business logic requires
9. Encryption: secret/sensitive columns marked with @encrypted (use prisma-field-encryption or app-level encryption — implement app-level for now)

Seed data:
1. Default organization (placeholder; admin updates via UI later)
2. System roles: super_admin, admin, manager, supervisor, employee, customer (6 base roles)
3. Initial modules registry: all 35 module codes from FORWARD_REFERENCES.md with proper is_core/is_bypassable flags
4. Numbering series: ORD, INV, PO, GRN, MIN, DC, CERT (basic set; more added in their phases)
5. System settings defaults: all keys mentioned in Phase 0 with default values

Generate Prisma migration. Run it. Verify all 52 tables exist via SQL: `\dt core.*` should show 52.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-04
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All 52 Phase 0 tables in core schema
- Indexes, constraints, relationships
- Initial seed data (organization, roles, modules, settings)

❌ OUT OF SCOPE (DO NOT EXPAND):
- Tables for orders/products/BOM/etc. → Built in their respective phases
- Material attribute tables → Phase 2
- Production tables → Phase 4
- Any business logic on top of schema → Later P0 prompts

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Schema is exactly Phase 0 scope. Other phase tables come in their phases.
Continue with the 52-table Phase 0 schema?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-04] Complete Phase 0 schema with 52 tables, indexes, and seed data`

---

### PROMPT P0-05 — Authentication System

```
Build the authentication system on top of the schema from P0-04.

Implement:

1. Password hashing service:
   - bcrypt with cost factor 12
   - Functions: hashPassword(plain), verifyPassword(plain, hash)

2. Password breach checking:
   - Integration with HaveIBeenPwned API (k-anonymity model — only first 5 chars of SHA-1 sent)
   - Check on signup and password change
   - Reject passwords found in breach list
   - Setting: PASSWORD_BREACH_CHECK_ENABLED (default true, can disable for offline dev)

3. Password policy:
   - Minimum 12 characters
   - Must include: uppercase, lowercase, number, special character
   - Cannot match last 5 passwords (uses user_password_history)
   - Cannot contain user's email or name
   - Validate via zod schema

4. JWT service:
   - Access token: 15 min expiry, JWT_SECRET, payload (user_id, user_type, jti, iat, exp)
   - Refresh token: 7 days expiry, JWT_REFRESH_SECRET, stored hash in user_sessions
   - Functions: generateTokenPair(user), verifyAccessToken(token), verifyRefreshToken(token)

5. Auth endpoints:
   POST /api/auth/login
     Input: email, password, device_info (optional)
     Logic:
       - Check IP blocklist
       - Find user by email
       - If user not found: log failed attempt, return generic error
       - If account locked: return locked error
       - Verify password
       - On failure: increment login_attempts, lock account after 5 failures (15 min)
       - On success: generate token pair, create user_sessions row, log success
     Response: { access_token, refresh_token, user: {...basic info} }

   POST /api/auth/refresh
     Input: refresh_token
     Validate, find session, issue new access token (rotate refresh if close to expiry)

   POST /api/auth/logout
     Auth required
     Revoke current session

   POST /api/auth/logout-all
     Auth required
     Revoke all user sessions

   POST /api/auth/forgot-password
     Input: email
     Generate reset token, store hash in password_reset_tokens (1 hour expiry)
     Send email with reset link (use nodemailer placeholder SMTP for now; provider abstraction in P0-15)

   POST /api/auth/reset-password
     Input: token, new_password
     Validate token, check policy, update password, log password history, invalidate all sessions

   POST /api/auth/change-password
     Auth required
     Input: current_password, new_password
     Validate current, check policy, update, log history, invalidate other sessions

6. Auth middleware:
   - Extract Bearer token
   - Verify access token
   - Load user (cached in request)
   - Attach to req.user
   - Reject if user inactive or locked

7. Customer user authentication:
   - Same flow but separate endpoints: /api/portal/auth/*
   - Operates on core.customer_users instead of core.users
   - user_type='external' in tokens
   - Sessions tracked the same way

8. Session listing:
   GET /api/auth/sessions (auth required)
   Returns user's active sessions with device info, last used

9. Tests:
   - Login success/failure
   - Account lockout after 5 failures
   - Token refresh flow
   - Password reset flow
   - Password policy enforcement
   - Concurrent sessions

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-05
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Username/password authentication for both internal and external users
- JWT access + refresh tokens
- Session management
- Password policy and breach checking
- Forgot/reset password flow
- Account lockout

❌ OUT OF SCOPE:
- MFA / 2FA → Built in P0-19
- OAuth / Social login → Foundation only in P0-04, full impl in P0-19
- Biometric auth → Out of scope entirely
- Magic link login → Out of scope unless added later

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"MFA is in P0-19. OAuth is in P0-19. Continue with password auth scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-05] Authentication with JWT, sessions, password policy, and reset flow`

---

### PROMPT P0-06 — RBAC Permission Resolver (6-Level)

```
Build the RBAC system with 6-level permission resolution.

The 6 levels (most restrictive wins, but explicit allow can override deny in some cases — implement carefully):

Level 1 — Module access: User must have access to the module containing the feature
Level 2 — Feature access: User must have access to the feature
Level 3 — Action access: User must have permission for the specific action (view/create/edit/delete/approve)
Level 4 — Field-level access: User's role must allow viewing/editing this field (uses field_visibility_config)
Level 5 — Data-level access: Row-level filter (e.g., "only see your own orders" or "only see your branch's data")
Level 6 — User-specific override: user_permission_overrides can grant or deny specific permissions

Implementation:

1. Permission resolver service:
   resolvePermission(userId, moduleCode, feature, action, entityContext?) returns:
     { allowed: boolean, reason: string, dataFilter?: object, fieldRestrictions?: array }
   
   Algorithm:
     a. Fetch user with active roles and permissions (cache for request)
     b. Check user_permission_overrides for explicit deny → if denied, return { allowed: false }
     c. Check module is active in modules table → if not, return { allowed: false, reason: 'Module disabled' }
     d. Check user has any role with permission for this (module, feature, action)
     e. Apply data-level filter from role_permissions.scope_filter
     f. Check user_permission_overrides for explicit allow that adds permission
     g. Build field restrictions from field_visibility_config
     h. Return result

2. RBAC middleware:
   requirePermission(moduleCode, feature, action) returns Express middleware
   Fails with 403 if user doesn't have permission
   Attaches req.permissionContext = { dataFilter, fieldRestrictions }

3. Field-level filtering:
   filterFields(data, fieldRestrictions) — applies field visibility rules to response data
   Supports: hidden (remove field), readonly (mark readonly), visible (default)
   Used in response transformers

4. Data-level filtering:
   applyDataFilter(prismaWhereClause, dataFilter) — extends Prisma where clause
   Supports common filters: own_records (created_by = userId), own_branch (branch_id = userBranchId), own_team (assigned_to IN team), all (no filter)

5. Permission caching:
   - Cache user's full permission set in Redis (or in-memory for now) on login
   - Invalidate on role change, permission change, override change
   - TTL 1 hour as safety net

6. APIs (admin only):
   - GET /api/rbac/users/:id/permissions — view effective permissions
   - GET /api/rbac/users/:id/permissions/check — test specific permission
   - POST /api/rbac/users/:id/permission-overrides — add override

7. Tests:
   - Permission via role
   - Permission denied via role
   - User-specific allow override
   - User-specific deny override
   - Module disabled blocks all permissions in that module
   - Data filter applied (own_records limits results)
   - Field restrictions hide/redact fields

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-06
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- 6-level RBAC resolver
- Middleware for protecting routes
- Field-level filtering of responses
- Data-level filtering of queries
- User-specific overrides
- Permission caching

❌ OUT OF SCOPE:
- UI for managing roles/permissions → P0-12
- Custom field admin UI → P0-13
- Time-based access (only during work hours) → Out of scope unless needed later

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Permission management UI is P0-12. This prompt builds the resolver only.
Continue with resolver scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-06] RBAC permission resolver with 6-level resolution and middleware`

---

### PROMPT P0-07 — Module Registry Management

```
Build module registry with enable/disable, dependency checks, and bypass support.

Module registry responsibilities:
- Track all modules and their state (active/inactive)
- Enforce core modules cannot be disabled
- Check dependencies before disabling (block if other active modules depend on it)
- Track activation/deactivation history
- Provide query API for "is module X active right now"

Implementation:

1. Module service:
   - listModules(filters): list with active state and dependencies
   - getModule(code): single module with full details
   - activateModule(code, byUserId, reason): activates if dependencies satisfied
   - deactivateModule(code, byUserId, reason): deactivates if not core and no dependents
   - isModuleActive(code): cached boolean check (called frequently — must be fast)
   - getDependents(code): which other modules depend on this one
   - getCompanyGrowthPath(): suggested order of module activation for a small company growing

2. APIs (admin only):
   - GET /api/modules
   - GET /api/modules/:code
   - POST /api/modules/:code/activate
   - POST /api/modules/:code/deactivate
   - GET /api/modules/:code/dependents
   - GET /api/modules/growth-path

3. Module activation history logging:
   - Every activate/deactivate writes to module_activation_history
   - Includes who, when, reason, previous state

4. Caching:
   - Module active status cached aggressively (changes infrequently)
   - Cache invalidated on activate/deactivate

5. Module registry seeding:
   - Verify all 35 modules from FORWARD_REFERENCES.md are seeded with correct flags:
     - is_core (cannot be disabled): orders, products, customer_master, organizations, users, roles, modules, audit, communication
     - is_bypassable (workflows can skip): qc_inbound, qc_in_process, snag_list, returns, rfq_management, customer_portal_screens, hr, finance
     - is_active default: depends on phase the module belongs to (Phase 0 modules active by default)

6. Tests:
   - Activate module: success, duplicate activation
   - Deactivate non-core module: success
   - Deactivate core module: rejected
   - Deactivate module with active dependents: rejected with list
   - History logging
   - Cache invalidation

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-07
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Module registry CRUD
- Dependency enforcement
- Activation history
- Active-state caching

❌ OUT OF SCOPE:
- UI for module management → P0-14 (admin UI)
- Workflow bypass execution → P0-08 (workflow engine reads is_active)
- Module-specific business logic → Each module's phase

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Module-specific logic comes in each module's phase. Module enable/disable
infrastructure only here. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-07] Module registry with dependency checks and bypass support`

---

### PROMPT P0-08 — Workflow Engine with Module Bypass

```
Build the generic workflow engine that powers approval flows, status transitions, and module bypass logic.

Core concept:
A workflow is a sequence of steps. Each step can be: approval (requires user action), notification (sends message), condition (branches based on data), action (calls a function). Steps can be marked skip_if_module_inactive — the engine auto-skips them if the target module is disabled.

Implementation:

1. Workflow definition:
   - Workflows defined as sequences of steps in workflows + workflow_steps tables
   - Step types: approval, notification, condition, action
   - Condition steps use JSON expression language (subset: ==, !=, >, <, >=, <=, AND, OR, IN)
   - Approval steps assign to role/user/dynamic-resolver
   - Action steps invoke registered handler functions (registry pattern)

2. Workflow engine service:
   - createInstance(workflowCode, targetEntity, initiatedBy): creates workflow_instances row
   - advanceInstance(instanceId, action, actorId, payload): moves to next step
   - skipStep(instanceId, stepId, reason): bypass logic
   - cancelInstance(instanceId, reason): aborts workflow
   - getInstanceStatus(instanceId): current step, next steps, history

3. Module bypass logic (CRITICAL):
   When advancing to next step:
     a. Check if step.skip_if_module_inactive is true
     b. If so, check modules.is_active for step.target_module_id
     c. If module inactive, skip this step automatically (log to action_logs as "auto_skipped_module_inactive")
     d. Continue to next step
     e. If next step also skip_if_module_inactive and that module also inactive, repeat
   This means: disabling a module gracefully removes its workflow steps without breaking the chain.

4. Approval handling:
   - When step is approval type:
     - Resolve assignee (role → all users with role; user → specific user; dynamic → call resolver)
     - Send notification to assignee(s)
     - Wait for action via API
     - On approval: advance to next step
     - On rejection: cancel instance or branch (configurable per workflow)
     - On timeout: escalate or expire (configurable)

5. Notification step:
   - When step is notification type:
     - Resolve recipients
     - Send via Phase 0 communication module (P0-15+)
     - Auto-advance to next step

6. Action step:
   - Invokes a registered handler function
   - Handler signature: (instanceContext, payload) => Promise<result>
   - Handler can: update entity status, trigger another workflow, write to audit, send notification

7. APIs:
   - POST /api/workflows/start (admin/system internal)
   - POST /api/workflows/instances/:id/approve
   - POST /api/workflows/instances/:id/reject
   - POST /api/workflows/instances/:id/cancel
   - GET /api/workflows/instances/:id
   - GET /api/workflows/instances?target_entity=&status=&assignee=

8. Background scheduler:
   - Daily check: workflow timeouts → auto-escalate or expire
   - Daily check: pending approvals → reminder notifications

9. Tests:
   - Linear workflow execution
   - Approval and rejection paths
   - Branching condition steps
   - Module bypass: disabled module's step auto-skipped
   - Timeout handling

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-08
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Generic workflow engine
- Module bypass mechanism
- Approval/notification/condition/action step types
- Workflow execution and advancement

❌ OUT OF SCOPE:
- Specific workflow definitions for orders/POs/etc. → Built in their phases
- Visual workflow designer UI → P0-14 (admin UI section)
- Workflow analytics → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Specific workflows are in their respective phases. Engine only here.
Continue with engine scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-08] Workflow engine with module bypass and approval/notification/action steps`

---

### PROMPT P0-09 — Audit Trail (Auto-Logging)

```
Build the audit trail system with auto-logging on all CRUD operations.

Implementation:

1. Audit logger service:
   - logAction(entityType, entityId, action, beforeData, afterData, actor, request): writes to audit_logs
   - Computes changes_summary as JSON diff
   - Sanitizes sensitive fields (passwords, tokens, secrets) before storage
   - Includes request_id for correlation

2. Prisma middleware:
   - Intercept all create/update/delete operations
   - Capture before-state for updates (read first)
   - Capture after-state
   - Call audit logger with detected changes
   - Skip logging for: audit_logs (no recursion), notification_log, login_attempts (high volume)

3. Manual audit logging:
   - For non-Prisma actions (login, logout, permission check failures, password changes)
   - Helper: auditEvent(eventType, details, actor)

4. Audit query APIs:
   - GET /api/audit/logs?entity_type=&entity_id=&actor=&action=&date_from=&date_to=
   - GET /api/audit/logs/:id (single log with full diff)
   - GET /api/audit/entity/:entityType/:entityId/history (timeline view)

5. Audit retention:
   - Setting: AUDIT_RETENTION_DAYS (default 730 — 2 years)
   - Background job: archive old logs to cold storage (or just mark archived)
   - Don't delete (regulatory/legal value)

6. Audit search:
   - Full-text search across changes_summary
   - Filtering by action type, entity, actor, date range
   - Indexed appropriately

7. Sensitive field protection:
   - Never log: password, password_hash, secret, token, ssn, pan, credit_card
   - Mask: ***REDACTED***

8. Tests:
   - Create logs creation
   - Update logs before+after with diff
   - Delete logs deletion
   - Sensitive fields redacted
   - Manual events logged
   - Query and filter

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-09
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Auto-logging via Prisma middleware
- Manual event logging
- Query and filtering APIs
- Sensitive field redaction

❌ OUT OF SCOPE:
- Audit log UI viewer → P0-14
- Compliance reports (SOC 2, etc.) → Out of scope for now
- Real-time audit alerting → Phase 8 if needed

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Audit UI is P0-14. Compliance reports are out of scope. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-09] Audit trail with auto-logging and sensitive field protection`

---

### PROMPT P0-10 — User Management APIs

```
Build user management APIs (CRUD for internal users).

Endpoints:

1. POST /api/users — create user
   Permission: users.create
   Input: email, employee_code, first_name, last_name, phone, branch_id, department_id, designation_id, role_ids[]
   Logic: validate unique email/employee_code, generate temp password, hash, send welcome email with reset link, assign roles
   Response: created user (without password hash)

2. GET /api/users
   Permission: users.view (data-filtered)
   Query: search, branch_id, department_id, role_id, is_active, page, limit
   Response: paginated list with role names

3. GET /api/users/:id
   Permission: users.view
   Response: full user details with roles, last login, sessions count

4. PUT /api/users/:id
   Permission: users.edit
   Input: name, phone, branch, department, designation, is_active
   (Cannot change email, employee_code, password from this endpoint)

5. DELETE /api/users/:id (soft delete)
   Permission: users.delete
   Cannot delete: own account, last super_admin
   Sets is_active=false, deleted_at, deleted_by, revokes all sessions

6. POST /api/users/:id/reactivate
   Permission: users.edit

7. POST /api/users/:id/lock and /unlock
   Permission: users.edit
   Lock: sets is_locked=true, locked_until (manual or admin-removable)
   Unlock: clears lock fields

8. POST /api/users/:id/reset-password
   Permission: users.reset_password
   Generates reset token, sends to user's email

9. POST /api/users/:id/force-logout
   Permission: users.edit
   Revokes all sessions

10. POST /api/users/:id/roles
    Permission: users.manage_roles
    Input: role_ids[] (replaces all current roles)
    Logs role change to audit

11. POST /api/users/:id/permission-overrides
    Permission: users.manage_permissions (rare, likely super_admin only)
    Input: permission_id, grant_type (allow/deny), reason, expires_at

12. GET /api/users/:id/audit-trail
    Permission: users.view
    Returns audit logs filtered to this user

13. CSV import:
    POST /api/users/import (multipart)
    Validates each row, creates users, returns per-row outcome
    Default password = temp generated, force-change-on-first-login

Tests:
- CRUD lifecycle
- Permission enforcement (someone without users.create gets 403)
- Cannot delete last super_admin
- Soft delete revokes sessions
- Role change updates effective permissions
- Permission override applied

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-10
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Internal user management (CRUD)
- Role assignment
- Permission overrides
- Account lock/unlock
- CSV bulk import

❌ OUT OF SCOPE:
- Customer user management → P0-21
- Employee master with HR fields (DOB, address, salary, etc.) → Phase 8 HR module
- Recruitment/onboarding workflows → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Customer users are P0-21. Full HR is Phase 8. This is system users only.
Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-10] User management APIs with role assignment and CSV import`

---

### PROMPT P0-11 — Organization, Branches, Departments, Designations

```
Build organization structure management.

1. Organizations (your company — typically only one record):
   - GET /api/organization (returns the org — assumed singleton for now)
   - PUT /api/organization (admin only)
   - Fields: name, legal name, GSTIN, PAN, addresses, financial year start, timezone, default currency, logo upload

2. Branches:
   - Full CRUD: GET, POST, PUT, DELETE (soft)
   - Branch types: head_office, factory, warehouse, showroom
   - Each branch has its own GSTIN (for multi-state)
   - Linked locations under branch

3. Departments:
   - CRUD
   - Hierarchical (parent_department_id)
   - Linked to branch (department in factory vs showroom)

4. Designations:
   - CRUD
   - Linked to department
   - Used for user designations and HR (later)

5. Locations:
   - CRUD under branches
   - Used for physical storage areas (linked to inventory in Phase 3)

6. Logo upload:
   - POST /api/organization/logo (multipart)
   - Stores in core.documents
   - Updates organization.logo_url

7. Settings exposure:
   - These are referenced by every other module
   - Provide a getOrganizationContext() helper used throughout

Tests:
- Org single-record enforcement
- Branch CRUD with multi-state GSTIN
- Department hierarchy
- Logo upload with valid/invalid file types

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-11
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Organization (single-tenant), branches, departments, designations, locations
- Basic admin UI later in P0-14

❌ OUT OF SCOPE:
- Multi-tenant (multiple companies) → Out of scope entirely
- Org chart visualization → P0-14 (basic) / Phase 8 (detailed)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Multi-tenant is out of scope. Single-tenant only. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-11] Organization, branches, departments, designations, locations`

---

### PROMPT P0-12 — Roles, Permissions, Documents Management

```
Build role and permission management endpoints, plus generic document management.

Roles management:
1. GET /api/roles
2. POST /api/roles (admin only) — create custom role
3. PUT /api/roles/:id — update non-system roles only
4. DELETE /api/roles/:id — soft delete; cannot delete system roles or roles with assigned users
5. POST /api/roles/:id/permissions — set permission set (replaces all)
   Input: permissions[] = [{permission_id, scope_filter}]
6. GET /api/roles/:id/permissions
7. GET /api/roles/:id/users — users assigned to this role

Permissions registry:
- All permissions seeded based on FORWARD_REFERENCES.md
- GET /api/permissions — list all available
- Format: {module_code}.{feature}.{action} — e.g., users.list.view, orders.detail.edit

Documents (generic file management):
1. POST /api/documents (multipart)
   Input: file, document_type, related_entity_type, related_entity_id
   Validates: file size (max 50MB default), file type whitelist
   Stores: file in /uploads/{year}/{month}/{uuid}.{ext}, metadata in core.documents
2. GET /api/documents/:id (auth + permission check based on related entity)
3. DELETE /api/documents/:id (soft delete; file remains for audit)
4. GET /api/documents?related_entity_type=&related_entity_id=
5. POST /api/documents/:id/version — upload new version, links via parent_document_id

File storage:
- Local filesystem for now (configurable path)
- Provider abstraction: LocalStorage, S3 (future)
- Setting: STORAGE_PROVIDER (default 'local')

Document types whitelist (admin can extend):
- General: pdf, doc, docx, xls, xlsx, jpg, jpeg, png, txt, csv
- CAD: dwg, dxf (download only, no preview)
- Compressed: zip, rar (admin restricted)

Tests:
- Role CRUD
- Permission assignment to role
- Cannot delete role with assigned users
- File upload, retrieval, version chain
- File type validation
- Permission check on document access

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-12
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Role and permission management APIs
- Generic document upload/version/retrieve

❌ OUT OF SCOPE:
- Document expiry alerts → Phase 8
- Document approval workflow → Phase 8
- DRM / watermarking → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Advanced document features are Phase 8. Continue with basic CRUD?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-12] Role/permission APIs and generic document management`

---

### PROMPT P0-13 — Field Configuration & Custom Fields

```
Build per-role field visibility configuration and custom fields framework.

1. Field visibility config:
   - Admin defines: for entity X, role Y sees field Z as (visible/readonly/hidden)
   - APIs:
     POST /api/admin/field-visibility/bulk
     GET /api/admin/field-visibility?entity=&role=
     PUT /api/admin/field-visibility/:id
   - Engine: filterFieldsForRole(data, entity, role) returns transformed data

2. Custom fields framework:
   - Admin defines custom fields per entity (e.g., add "Customer GST Type" to customers)
   - Field types: text, number, date, dropdown, multiselect, checkbox, textarea, url, email
   - Storage: custom field values in JSONB column on parent entity OR separate values table (use JSONB for simplicity)
   - APIs:
     POST /api/admin/custom-fields
     GET /api/admin/custom-fields?entity=
     PUT /api/admin/custom-fields/:id
     DELETE /api/admin/custom-fields/:id (only if no data uses it; else deactivate)

3. Custom field rendering:
   - Frontend reads custom field definitions
   - Renders dynamically alongside built-in fields
   - Validation enforced on save

4. Field metadata API:
   - GET /api/entities/:entityType/field-config
   - Returns: built-in fields + custom fields + visibility for current user's role
   - Used by frontend to render forms dynamically

5. Tests:
   - Field visibility hides/shows fields per role
   - Custom field create and use
   - Custom field validation
   - Cannot delete custom field with data

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-13
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Field visibility per role
- Custom fields framework (definition + storage)

❌ OUT OF SCOPE:
- Material attribute system → Phase 2 (different system, more complex)
- Form builder UI for end users → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Material attributes are Phase 2 and use a different system. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-13] Field visibility config and custom fields framework`

---

### PROMPT P0-14 — Admin UI Foundation (Layout, Navigation, Common Components)

```
Build the admin UI foundation in Next.js 14.

Read /mnt/skills/public/frontend-design/SKILL.md before starting (or apply equivalent design principles).

1. Layout:
   - App Router structure: /app/admin/layout.tsx
   - Top bar: company logo, app title, search, notifications icon, user menu
   - Sidebar: dynamic navigation built from active modules + user permissions
   - Main content area
   - Footer: minimal, version info

2. Navigation:
   - Reads active modules from API
   - Filters by user's permissions
   - Hierarchical (modules → features)
   - Persistent collapsed/expanded state per user

3. Common components (shadcn/ui base):
   - DataTable with: column config, sorting, filtering, pagination, row actions, bulk actions, empty state
   - FormBuilder with: zod schema integration, field types, validation display
   - Modal/Dialog wrappers
   - Confirmation dialogs (destructive actions)
   - Toast notifications
   - Loading states (skeleton screens for tables, spinners for actions)

4. Auth-related screens:
   - /login (internal users)
   - /forgot-password
   - /reset-password
   - /change-password (post-login if must_change_password)
   - /portal/login (external users — separate UI)

5. Dashboard placeholder:
   - /admin/dashboard with permission-filtered widget grid
   - Initial widgets: "Welcome", "Active modules", "Recent audit events"
   - More widgets added in later phases

6. Workflow visualizer:
   - /admin/workflows
   - List of defined workflows
   - Per-workflow: visual step diagram (simple flowchart)
   - Active instances list

7. Module management UI:
   - /admin/modules
   - Tab view: All modules, Active, Available
   - Toggle activate/deactivate (with dependency check)
   - History view per module

8. Settings UI:
   - /admin/settings
   - Categories: General, Security, Communication, Payment, Compliance
   - Edit individual settings with type-aware controls

9. Audit log viewer:
   - /admin/audit-logs
   - Filterable, paginated
   - Per-entry detail view with diff visualization

10. Mobile responsive:
    - Sidebar collapses on mobile
    - Tables scroll horizontally OR show card layout on small screens

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-14
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Layout foundation
- Common reusable components
- Auth screens
- Module/settings/audit admin screens
- Permission-filtered navigation

❌ OUT OF SCOPE:
- Order/product/BOM/etc. screens → Their respective phases
- Customer portal UI → Phase 7
- Advanced visualizations → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Module-specific screens are in their phases. Continue with foundation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-14] Admin UI foundation with layout, navigation, and common components`

---

### PROMPT P0-15 — Email Provider Module

```
Build the email provider abstraction with multi-provider support.

1. Provider interface:
   IEmailProvider {
     send(input: { to, subject, html, text, attachments?, cc?, bcc? }): Promise<SendResult>
     verify(): Promise<boolean>
   }

2. Concrete implementations:
   - SmtpProvider (nodemailer)
   - SendGridProvider (sendgrid sdk)
   - SesProvider (@aws-sdk/client-ses)
   - MailgunProvider (mailgun.js)

3. Provider factory:
   - createEmailProvider(providerCode, config) returns IEmailProvider

4. Email service:
   - send(toEmail, templateCode, variables, options?) → renders template, calls primary provider
   - On failure: retry with secondary provider (if configured), log to notification_log
   - Bulk send with rate limiting

5. Template rendering:
   - Read communication_templates by code (channel='email')
   - Variable substitution (handlebars-like {{variable}} syntax)
   - HTML and plain-text versions
   - Default templates seeded:
     - welcome_user
     - password_reset
     - account_locked
     - login_alert (suspicious login)

6. Admin APIs:
   - GET /api/admin/email-providers
   - POST /api/admin/email-providers (configure)
   - POST /api/admin/email-providers/:id/test (sends test email)
   - PUT /api/admin/email-providers/:id/set-primary
   - GET /api/admin/email-templates
   - POST /api/admin/email-templates
   - PUT /api/admin/email-templates/:id

7. Tracking:
   - Every send logged to notification_log
   - status: sent → delivered (if webhook) → bounced/opened (open tracking is Phase 6)

8. Tests:
   - Send via configured provider
   - Failover to secondary on primary failure
   - Template rendering with variables
   - Invalid template handling

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-15
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Email provider abstraction
- Multi-provider support
- Template management
- Send and basic delivery tracking

❌ OUT OF SCOPE:
- Email open tracking (pixel) → Phase 6, P6-24
- Inbound email parsing → Phase 6, P6-24
- Email campaigns → Out of scope unless added later

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Open tracking and inbound parsing are Phase 6. Continue with send-only?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-15] Email provider module with multi-provider support and templates`

---

### PROMPT P0-16 — SMS Provider Module

```
Build SMS provider abstraction.

1. Provider implementations:
   - MSG91Provider (Indian DLT compliant)
   - TwilioProvider
   - GupshupProvider
   - TextlocalProvider

2. Indian DLT compliance:
   - Sender ID configuration (6 alpha chars, DLT registered)
   - Template ID per template (registered with TRAI)
   - Validation: cannot send unregistered template
   - Setting: DLT_ENFORCEMENT_ENABLED (default true for production)

3. SMS service:
   - send(toPhone, templateCode, variables) → renders, validates DLT, sends
   - Phone format normalization (+91 prefix)
   - Length awareness (160 char limit, splits long messages)

4. Templates:
   - communication_templates with channel='sms'
   - Default seeded:
     - login_otp
     - password_reset_otp
     - mfa_otp
   - Each linked to DLT template ID

5. Admin APIs:
   - GET /api/admin/sms-providers
   - POST /api/admin/sms-providers
   - POST /api/admin/sms-providers/:id/test
   - PUT /api/admin/sms-providers/:id/set-primary
   - GET/POST/PUT for sms templates

6. Rate limiting:
   - Per-recipient: max 5 SMS per hour (prevents abuse)
   - Per-template: configurable limit

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-16
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- SMS provider abstraction
- Indian DLT compliance
- Template management

❌ OUT OF SCOPE:
- Two-way SMS conversations → Out of scope
- SMS marketing campaigns → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"SMS module is for transactional only. Marketing is out of scope. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-16] SMS provider module with DLT compliance and templates`

---

### PROMPT P0-17 — WhatsApp Business Provider Module

```
Build WhatsApp Business API integration.

1. BSP (Business Service Provider) implementations:
   - InteraktProvider
   - WatiProvider
   - GupshupWhatsAppProvider
   - Direct360DialogProvider

2. Template system:
   - WhatsApp requires pre-approved templates for proactive messaging
   - communication_templates with channel='whatsapp', includes header/body/footer/buttons structure
   - Template approval status tracked: draft → submitted → approved → rejected

3. Service:
   - sendTemplate(toPhone, templateCode, variables, mediaUrl?) → BSP API call
   - sendSession(toPhone, message) — session messaging within 24-hour window
   - Phone format: international without +

4. Webhook handler:
   - POST /api/webhooks/whatsapp
   - Receives delivery/read receipts, inbound messages
   - Updates notification_log status
   - Inbound messages: store but don't auto-act (Phase 6 will handle for CRM)

5. Media handling:
   - Send images, PDFs as attachments
   - Receive media: download, store in core.documents, link to inbound message

6. Admin APIs and template admin (similar pattern to email/SMS).

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-17
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- WhatsApp BSP abstraction
- Template messaging
- Delivery/read receipts via webhook
- Inbound message storage (no auto-action)

❌ OUT OF SCOPE:
- AI-based reply parsing → Phase 6 or beyond
- WhatsApp chatbot → Out of scope unless added
- Broadcast lists → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"AI parsing is Phase 6+. Chatbot out of scope. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-17] WhatsApp Business provider module with template messaging`

---

### PROMPT P0-18 — Multi-Channel Notification Orchestrator

```
Build the unified notification system that fires email + SMS + WhatsApp from a single template trigger.

1. Notification service:
   - notify(recipientId, eventCode, variables, options?) →
     - Determine recipient's preferred channels (or all configured channels)
     - For each channel, look up template by event+channel
     - Send via respective provider
     - Log to notifications and notification_log

2. Event-driven:
   - Other modules call notify() with event codes
   - Examples: 'user.welcome', 'password.reset_requested', 'login.suspicious'

3. Recipient preferences:
   - User has communication_preferences (jsonb)
   - { email: true, sms: true, whatsapp: true, in_app: true }
   - User can opt out of specific channels (DPDP requirement)

4. In-app notifications:
   - Stored in notifications table
   - GET /api/notifications (current user)
   - POST /api/notifications/:id/mark-read
   - POST /api/notifications/mark-all-read
   - Unread count for header badge
   - Real-time via WebSocket or polling (use polling for now, WebSocket later)

5. Admin APIs:
   - GET /api/admin/notifications/log (filterable)
   - POST /api/admin/notifications/test (admin trigger any event for testing)

6. Failure handling:
   - Channel-by-channel: failure on one channel doesn't block others
   - Each failure logged
   - Retry policy: retry immediately on transient errors, give up after 3 attempts

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-18
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Multi-channel orchestration
- User preferences
- In-app notification center

❌ OUT OF SCOPE:
- Push notifications (mobile) → Out of scope unless mobile app added
- Notification scheduling (delayed sends) → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Push and scheduling out of scope. Continue with email/SMS/WhatsApp/in-app?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-18] Multi-channel notification orchestrator with preferences and in-app inbox`

---

### PROMPT P0-19 — MFA, OAuth, Security Hardening

```
Build MFA, OAuth foundation, and security hardening.

1. MFA (TOTP-based):
   - POST /api/auth/mfa/setup (auth required)
     Generates TOTP secret, returns provisioning URI for QR code, returns backup codes (10)
     Sets two_factor_secret_encrypted (not yet activated)
   - POST /api/auth/mfa/verify-setup
     Input: TOTP code
     Verifies, activates two_factor_enabled=true
   - POST /api/auth/mfa/disable
     Requires current TOTP or backup code + password
   - POST /api/auth/login (modified)
     If user has MFA, returns { mfa_required: true, temp_token } instead of full token
   - POST /api/auth/mfa/verify
     Input: temp_token, code
     Verifies code (TOTP or backup), issues full token pair
   - POST /api/auth/mfa/regenerate-backup-codes (auth required)

2. OAuth/OIDC foundation:
   - OAuth providers configurable in admin
   - Redirect endpoints: GET /api/auth/oauth/:provider/start, GET /api/auth/oauth/:provider/callback
   - Connection model: oauth_connections links external account to internal user
   - Login via OAuth: existing user → log in; new email → create user (admin approval flow optional)

3. Rate limiting:
   - Use express-rate-limit with Redis store (in-memory fallback)
   - Per-endpoint limits:
     - /api/auth/login: 5 per 15min per IP
     - /api/auth/register or /api/portal/auth/signup: 3 per hour per IP
     - /api/* (general): 100 per minute per user
   - Global IP rate limit: 1000 per minute per IP

4. CAPTCHA integration:
   - reCAPTCHA v3 (server-side verification)
   - Required on: signup, login (after 3 failures), forgot-password
   - Setting: CAPTCHA_ENABLED, RECAPTCHA_SITE_KEY, RECAPTCHA_SECRET

5. Security headers:
   - helmet.js configured
   - CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
   - Custom security headers for sensitive endpoints

6. CSRF protection:
   - For state-changing endpoints used by browser
   - csurf or modern equivalent

7. Session security:
   - Cookie flags: httpOnly, secure, sameSite=strict
   - Session invalidation on password change
   - Suspicious session detection: new device + new location → email alert

8. DPDP compliance features:
   - Consent capture endpoints
   - Data export request: POST /api/dpdp/export-request → background job → emails ZIP
   - Data erasure request: POST /api/dpdp/erasure-request → admin approval workflow
   - Consent withdrawal: POST /api/dpdp/withdraw-consent

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-19
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- TOTP-based MFA
- OAuth foundation (Google/Microsoft)
- Rate limiting + CAPTCHA
- Security headers + CSRF
- DPDP consent and data request endpoints

❌ OUT OF SCOPE:
- Hardware security keys (FIDO/WebAuthn) → Out of scope
- Risk-based authentication → Out of scope
- Full GDPR machinery (only DPDP) → Out of scope unless EU customers

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Hardware keys and GDPR specifics are out of scope. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-19] MFA, OAuth foundation, rate limiting, CAPTCHA, and DPDP compliance`

---

### PROMPT P0-20 — Payment Foundation (Razorpay + Offline)

```
Build payment foundation. This is the engine; specific use (e.g., portal payment) comes in Phase 7.

1. Payment gateway abstraction:
   IPaymentGateway {
     createOrder(amount, currency, metadata): Promise<{gatewayOrderId}>
     verifyPayment(payload): Promise<{verified, paymentId, signature}>
     refund(paymentId, amount, reason): Promise<{refundId}>
   }

2. Concrete:
   - RazorpayGateway (primary for India)
   - StripeGateway (placeholder for international, future)

3. Payment service:
   - initiatePayment(transactionInput): records core.payment_transactions, calls gateway.createOrder
   - verifyAndCapture(verificationInput): verifies signature, marks transaction completed
   - recordOfflinePayment(transactionInput): no gateway, just records (UTR/cheque/cash)
   - refund(transactionId, amount, reason)

4. Offline payment recording:
   - APIs:
     POST /api/payments/offline (record bank transfer, cheque, cash)
     POST /api/payments/:id/verify-offline (admin verifies receipt)
     POST /api/payments/:id/reject (with reason if cheque bounces, etc.)

5. Online payment endpoints:
   - POST /api/payments/online/initiate
   - POST /api/payments/online/verify (called from frontend after gateway success)
   - POST /api/webhooks/razorpay (server-side webhook for reliability)

6. Refunds:
   - POST /api/payments/:id/refunds
   - For online: calls gateway refund
   - For offline: marks reverse transaction (manual reconciliation)

7. Admin APIs:
   - GET /api/admin/payment-gateways
   - POST/PUT /api/admin/payment-gateways
   - GET /api/admin/payment-transactions (filterable)
   - GET /api/admin/payment-transactions/:id

8. Tests:
   - Online payment full flow with Razorpay test keys
   - Offline UTR recording
   - Refund flow
   - Webhook signature verification

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-20
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Payment gateway abstraction (Razorpay primary)
- Online + offline payment recording
- Refunds
- Webhook handling

❌ OUT OF SCOPE:
- Customer-facing payment screens → Phase 7
- Payment milestone enforcement on dispatch → Phase 5, P5-06
- Auto-billing post-install → Phase 5, P5-17
- Subscription/recurring → Out of scope unless added

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Customer payment UI is Phase 7. Milestone logic is Phase 5. Continue with foundation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-20] Payment foundation with Razorpay and offline recording`

---

### PROMPT P0-21 — Customer Portal Foundation (Accounts, Users, Signup)

```
Build customer portal foundation: accounts, users, self-signup with admin approval.

1. Customer accounts:
   - Represents external organizations (architect firms, dealer companies, corporate clients)
   - Created via signup approval OR manually by admin
   - APIs (admin):
     GET /api/admin/customer-accounts
     POST /api/admin/customer-accounts (manual create, bypasses approval)
     PUT /api/admin/customer-accounts/:id
     DELETE /api/admin/customer-accounts/:id (soft, with care — affects logins)
     POST /api/admin/customer-accounts/:id/activate
     POST /api/admin/customer-accounts/:id/deactivate

2. Customer users (people within accounts):
   - Multiple users per account (purchase head, design head, owner)
   - APIs:
     GET /api/admin/customer-accounts/:id/users
     POST /api/admin/customer-accounts/:id/users
     PUT /api/portal/customer-users/:id (limited self-edit)

3. Self-signup workflow:
   - Public endpoint: POST /api/public/signup-request
     Input: company_name, contact_name, email, phone, account_type, business_proof_file
     Validates, stores in customer_signup_requests with status=pending
     Sends notification to admin reviewers
     Returns confirmation message to user
   - Admin review:
     GET /api/admin/signup-requests?status=pending
     POST /api/admin/signup-requests/:id/approve
       Creates customer_account + admin customer_user
       Sends welcome email with credentials
     POST /api/admin/signup-requests/:id/reject
       Stores rejection reason
       Sends polite rejection email

4. Customer portal authentication:
   - Endpoints already built in P0-05 (under /api/portal/auth/*)
   - Tokens marked user_type='external'
   - Sessions tracked separately

5. Customer portal RBAC:
   - Customer users can only access customer portal endpoints
   - Strict isolation: cannot see other customers' data
   - customer_portal_permissions for granular control

6. Public landing page:
   - / route (Next.js)
   - "Login" button → /portal/login
   - "Apply for portal access" → signup form
   - Public, no auth required

7. Tests:
   - Signup request submission
   - Admin approval creates account+user
   - Customer login
   - Customer cannot access /api/admin/* endpoints
   - Customer A cannot see Customer B's data

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-21
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Customer accounts and users CRUD
- Self-signup with admin approval
- Customer auth foundation
- Portal isolation

❌ OUT OF SCOPE:
- Customer portal UI screens → Phase 7
- Quote viewing → Phase 6, P6-22
- Order tracking screens → Phase 7
- Catalog browsing → Phase 7

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Portal screens are Phase 7. This builds the data foundation only. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-21] Customer portal foundation with accounts, users, and signup approval`

---

### PROMPT P0-22 — Numbering Series & System Settings UI

```
Finalize numbering series engine and admin UI for system settings.

1. Numbering series engine:
   - Function: getNextNumber(seriesCode, branchCode?, year?) returns formatted string
     E.g., ORD-2026-00042
   - Atomic increment via DB transaction (no race conditions)
   - Year reset based on financial year (April-March in India)
   - Branch prefix optional

2. Admin APIs:
   - GET /api/admin/numbering-series
   - POST /api/admin/numbering-series (admin-defined custom series)
   - PUT /api/admin/numbering-series/:id (cannot reduce current_number)
   - POST /api/admin/numbering-series/:id/reset (with confirmation, audit logged)

3. System settings UI:
   - /admin/settings
   - Categorized: General, Security, Communication, Payment, Compliance, Notifications
   - Type-aware inputs: string (text), integer (number), boolean (toggle), json (textarea with validation)
   - Search across settings
   - Audit on change

4. Numbering series UI:
   - /admin/settings/numbering-series
   - List with current numbers
   - Create new series
   - Test next-number button (read-only preview)
   - Reset action (admin-only, confirmation dialog)

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-22
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Numbering engine
- Settings admin UI

❌ OUT OF SCOPE:
- Module-specific number formats → Their respective phases register their series

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Module-specific series come with their phases. Generic engine here. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-22] Numbering series engine and system settings admin UI`

---

### PROMPT P0-23 — Communication Templates Admin UI

```
Build admin UI for managing communication templates and providers.

1. Templates UI:
   - /admin/communication/templates
   - Tabbed: Email, SMS, WhatsApp
   - Each: list with name, channel, last used
   - Create/edit:
     - Email: rich text editor for HTML body, plain text alternative, variable insertion
     - SMS: 160-char counter, DLT template ID field
     - WhatsApp: structured (header/body/footer/buttons), media support
   - Test send (admin only)
   - Variable schema: defined as array of {key, label, default}

2. Providers UI:
   - /admin/communication/providers
   - Per channel: list of configured providers
   - Add new provider with provider-specific config
   - Set primary
   - Test send

3. Notification log viewer:
   - /admin/communication/log
   - Filterable by channel, status, date, recipient
   - Per-entry detail: payload, response, error if any

4. Communication preferences UI (per user):
   - /profile/preferences
   - Toggle channels per category (transactional always on, marketing optional)

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-23
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Template CRUD UI
- Provider configuration UI
- Notification log viewer
- User communication preferences

❌ OUT OF SCOPE:
- Marketing campaign builder → Out of scope
- A/B testing of templates → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Marketing features out of scope. Continue with transactional UI?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-23] Communication templates and providers admin UI`

---

### PROMPT P0-24 — User & Role Admin UI

```
Build admin UI for user, role, and permission management.

1. Users UI:
   - /admin/users
   - DataTable: code, name, email, branch, designation, roles (badges), last login, status
   - Filters: branch, department, role, status
   - Actions: edit, lock/unlock, force-logout, reset-password, deactivate
   - Bulk: assign role, deactivate

2. User detail/edit:
   - Tabs: Basic Info, Roles, Permissions (overrides), Sessions, Audit
   - Role assignment with multi-select
   - Permission overrides (advanced — admin only)
   - Session list with revoke action

3. CSV import:
   - Upload, validation preview, execute
   - Error report download

4. Roles UI:
   - /admin/roles
   - List with name, type (system/custom), assigned user count
   - Create custom role
   - Edit (system roles read-only)

5. Role detail:
   - Permission matrix: modules → features → actions
   - Tree view with checkboxes
   - Scope filter per permission (data-level)
   - Save updates role_permissions

6. Permission overrides UI (per user):
   - List of explicit allows/denies
   - Add/remove with reason

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-24
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- User CRUD UI
- Role and permission UI
- Audit and session views

❌ OUT OF SCOPE:
- Org chart visualization → Out of scope (basic hierarchy in P0-25)
- Performance reviews → Out of scope (Phase 8 if HR built)

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"HR features are Phase 8. Continue with user/role admin?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-24] User, role, and permission management admin UI`

---

### PROMPT P0-25 — Organization Setup UI

```
Build admin UI for organization, branches, departments, designations.

1. Organization profile:
   - /admin/organization
   - Single-form view (your company details)
   - Logo upload with preview
   - GST/PAN, addresses, FY settings

2. Branches:
   - /admin/branches
   - List + create + edit
   - Branch-specific GSTIN, addresses
   - Linked locations sub-list

3. Departments:
   - /admin/departments
   - Tree view (hierarchical)
   - Drag-drop to restructure (optional, post-MVP)

4. Designations:
   - /admin/designations
   - Per-department list
   - Used in user assignment

5. Locations:
   - /admin/locations
   - Per-branch
   - Used by inventory in Phase 3 (foundation here)

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-25
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All org structure admin UIs

❌ OUT OF SCOPE:
- Reporting/dashboards → Phase 8
- Organization-wide policies UI → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with org structure admin only?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-25] Organization, branches, departments, designations, locations admin UI`

---

### PROMPT P0-26 — Customer Portal Foundation UI

```
Build the basic customer portal layout and authentication screens.

1. Portal layout:
   - /portal/layout.tsx
   - Header: logo, current account name, user menu
   - Side nav (placeholder — actual nav fills in Phase 7)
   - Different theme from admin (lighter, customer-friendly)

2. Login:
   - /portal/login
   - Email + password
   - Forgot password link

3. Signup:
   - /portal/signup
   - Form: company info, contact info, business proof upload, account type
   - Submit → confirmation screen
   - Status check link

4. Dashboard placeholder:
   - /portal/dashboard
   - Welcome card
   - Placeholder cards: "Your orders" (empty for now), "Recent quotes" (empty), "Documents"
   - Functional widgets fill in Phase 7

5. Profile:
   - /portal/profile
   - View account info
   - Update own user details
   - Change password
   - Communication preferences

6. Mobile-first design:
   - Architects/designers use phones heavily
   - Touch-friendly, large tap targets

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-26
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Portal layout, auth screens
- Dashboard placeholder
- Profile management

❌ OUT OF SCOPE:
- Catalog browsing → Phase 7
- Order placement → Phase 7
- Quote viewing → Phase 6, P6-22

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Functional portal screens are Phase 6 and 7. Continue with auth foundation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-26] Customer portal foundation UI with layout, auth, and dashboard placeholder`

---

### PROMPT P0-27 — DPDP Compliance UI

```
Build DPDP Act 2023 compliance UI elements.

1. Privacy policy management:
   - /admin/compliance/privacy-policy
   - Versioned content
   - Effective date
   - Active version flagging

2. Terms of service management:
   - /admin/compliance/terms-of-service
   - Same as above

3. Consent capture:
   - On signup (both internal user creation and customer signup)
   - Display current privacy policy + terms
   - Required checkboxes
   - Logged to dpdp_consents

4. Consent withdrawal:
   - /portal/privacy or /profile/privacy
   - User can withdraw marketing/non-essential consents
   - Cannot withdraw transactional consent (legal basis = contract)

5. Data export request:
   - /profile/privacy → "Download my data"
   - Submits POST /api/dpdp/export-request
   - Background job collects all data, ZIPs, emails link
   - Available for 7 days

6. Data erasure request:
   - /profile/privacy → "Delete my account"
   - Submits with reason
   - Goes to admin queue: /admin/compliance/erasure-requests
   - Admin reviews and processes (some data must be retained for legal — invoices etc.)

7. Cookie banner:
   - On first visit, accept/reject non-essential cookies
   - Stored in cookie + dpdp_consents

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-27
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- DPDP compliance UI
- Consent capture and withdrawal
- Data export and erasure flows

❌ OUT OF SCOPE:
- Full GDPR (only DPDP) → Out of scope
- Automated PII detection → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"GDPR specifics out of scope. DPDP only. Continue?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-27] DPDP compliance UI with consent, data export, and erasure`

---

### PROMPT P0-28 — Audit Log Viewer UI

```
Build the audit log viewer.

1. Audit log list:
   - /admin/audit-logs
   - DataTable with columns: timestamp, action, entity_type, entity_id, actor, summary
   - Filters: entity_type, action, actor, date range, free text search in summary
   - Pagination (50 per page)
   - Export to CSV (admin only)

2. Audit log detail:
   - Click entry → modal/side-panel
   - Shows: full before+after JSON, actor info (user, IP, user-agent), request_id
   - Visual diff for updates
   - Related logs (same request_id)

3. Entity history:
   - From any entity detail page (user, order, etc.), "View history" button
   - Shows audit logs filtered to that entity
   - Timeline view

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-28
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Audit viewer UI
- Filtering, search, export

❌ OUT OF SCOPE:
- Audit-based reporting → Phase 8
- Real-time alerting on suspicious activity → Phase 8

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with viewer scope?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-28] Audit log viewer UI with filtering and entity history`

---

### PROMPT P0-29 — Workflow Designer UI

```
Build a basic visual workflow designer.

1. Workflow list:
   - /admin/workflows
   - All defined workflows
   - Active/inactive toggle
   - Active instances count per workflow

2. Workflow editor:
   - /admin/workflows/:id/edit
   - Visual flowchart (use react-flow or similar)
   - Drag-drop step types: approval, notification, condition, action
   - Connect steps with arrows
   - Edit step properties in side panel
   - Save updates workflow_steps

3. Workflow viewer (read-only):
   - For non-editable workflows
   - Display only

4. Instance viewer:
   - /admin/workflows/instances/:id
   - Visual representation of where it is in the flow
   - History timeline
   - For pending approvals: show assignee
   - Manual override actions (cancel, force-advance — with confirmation)

5. Template workflows seeded:
   - Empty list initially; specific workflows defined in their phases
   - Examples will populate later (PO approval, quote approval, etc.)

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-29
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- Visual workflow designer (basic)
- Instance viewer
- Manual interventions

❌ OUT OF SCOPE:
- Sub-workflows / nested workflows → Out of scope
- AI-suggested workflow → Out of scope

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Continue with basic designer?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-29] Workflow designer UI with visual editor and instance viewer`

---

### PROMPT P0-30 — Phase 0 Integration Tests & Checklist Validation

```
Final Phase 0 prompt. Build end-to-end integration tests and validate the completion checklist.

End-to-end scenarios:

1. Full user lifecycle:
   - Admin creates user via API
   - User receives welcome email with reset link
   - User sets password (meets policy)
   - User logs in
   - User enables MFA
   - User logs in with MFA
   - Admin assigns role
   - User accesses module per role
   - User without permission gets 403
   - Admin disables module → user can no longer access
   - Admin re-enables → access restored

2. Customer signup lifecycle:
   - External user submits signup request
   - Admin sees pending in queue
   - Admin approves
   - Customer account + customer user created
   - Welcome email sent
   - Customer logs in via portal
   - Customer cannot access admin endpoints (verified)
   - Customer A cannot see Customer B's data (verified)

3. Workflow with module bypass:
   - Define test workflow with 4 steps
   - Step 3 marked skip_if_module_inactive=true, target_module=test_module
   - Disable test_module
   - Start workflow instance
   - Verify step 3 is auto-skipped, instance proceeds to step 4 directly
   - Re-enable test_module
   - Start new instance
   - Verify step 3 executes normally

4. Audit trail:
   - Create user, update user, delete user
   - Verify all 3 logged with proper before/after
   - Verify password redacted
   - Search audit logs by entity, actor, date
   - Export CSV

5. Communication multi-channel:
   - Configure email, SMS, WhatsApp providers
   - Trigger 'user.welcome' event
   - Verify all 3 channels attempted
   - Check notification_log for status

6. Payment flow:
   - Initiate online payment via Razorpay test mode
   - Complete via test card
   - Verify webhook received and transaction completed
   - Test refund flow
   - Record offline UTR
   - Verify recorded correctly

7. DPDP flow:
   - User submits data export request
   - Admin processes
   - User receives ZIP
   - User submits erasure
   - Admin processes
   - User account deactivated, retained data anonymized

Checklist validation:
- [ ] All 52 tables exist with correct constraints
- [ ] All 6 base roles seeded
- [ ] All 35 modules registered with correct flags
- [ ] All numbering series functional
- [ ] All system settings present
- [ ] Authentication works (internal + customer)
- [ ] MFA setup, verify, disable
- [ ] OAuth foundation present (no UI for connections yet, that's portal-specific)
- [ ] RBAC 6-level resolver works
- [ ] Module bypass in workflows works
- [ ] Audit captures all writes
- [ ] Email/SMS/WhatsApp providers send (with test creds)
- [ ] Payment flow works (Razorpay test + offline)
- [ ] Customer portal foundation isolated correctly
- [ ] DPDP compliance flows work
- [ ] Rate limiting active
- [ ] CAPTCHA on signup/login-after-failures
- [ ] All admin UIs functional
- [ ] Audit viewer shows entries
- [ ] Workflow designer creates and runs workflows

Documentation:
- Generate Phase 0 README with API list, screen list, settings list
- Document any deviations from spec
- Generate ER diagram for documentation

If any check fails, fix with [P0-30-FIX] commits before proceeding to Phase 1.

═══════════════════════════════════════════════════════════
SCOPE BOUNDARIES — PROMPT P0-30
═══════════════════════════════════════════════════════════
✅ IN SCOPE:
- All Phase 0 integration testing
- Final validation
- Documentation

❌ OUT OF SCOPE:
- Phase 1 features → Phase 1
- Performance optimization beyond basics → Address as issues arise

⚠️ IF USER ASKS FOR OUT-OF-SCOPE FEATURES:
"Phase 0 is complete with this prompt. Phase 1 starts after this is green.
Continue with Phase 0 validation?"
═══════════════════════════════════════════════════════════
```

**Commit:** `[P0-30] Phase 0 integration tests and checklist validation`

---

## PART 4 — COMMIT MESSAGES QUICK REFERENCE

| # | Commit Message |
|---|----------------|
| P0-01 | `[P0-01] Project initialization with Node + Next.js + Prisma stack` |
| P0-02 | `[P0-02] PostgreSQL connection and Prisma multi-schema setup` |
| P0-03 | `[P0-03] Backend core structure with middleware, errors, and logging` |
| P0-04 | `[P0-04] Complete Phase 0 schema with 52 tables, indexes, and seed data` |
| P0-05 | `[P0-05] Authentication with JWT, sessions, password policy, and reset flow` |
| P0-06 | `[P0-06] RBAC permission resolver with 6-level resolution and middleware` |
| P0-07 | `[P0-07] Module registry with dependency checks and bypass support` |
| P0-08 | `[P0-08] Workflow engine with module bypass and approval/notification/action steps` |
| P0-09 | `[P0-09] Audit trail with auto-logging and sensitive field protection` |
| P0-10 | `[P0-10] User management APIs with role assignment and CSV import` |
| P0-11 | `[P0-11] Organization, branches, departments, designations, locations` |
| P0-12 | `[P0-12] Role/permission APIs and generic document management` |
| P0-13 | `[P0-13] Field visibility config and custom fields framework` |
| P0-14 | `[P0-14] Admin UI foundation with layout, navigation, and common components` |
| P0-15 | `[P0-15] Email provider module with multi-provider support and templates` |
| P0-16 | `[P0-16] SMS provider module with DLT compliance and templates` |
| P0-17 | `[P0-17] WhatsApp Business provider module with template messaging` |
| P0-18 | `[P0-18] Multi-channel notification orchestrator with preferences and in-app inbox` |
| P0-19 | `[P0-19] MFA, OAuth foundation, rate limiting, CAPTCHA, and DPDP compliance` |
| P0-20 | `[P0-20] Payment foundation with Razorpay and offline recording` |
| P0-21 | `[P0-21] Customer portal foundation with accounts, users, and signup approval` |
| P0-22 | `[P0-22] Numbering series engine and system settings admin UI` |
| P0-23 | `[P0-23] Communication templates and providers admin UI` |
| P0-24 | `[P0-24] User, role, and permission management admin UI` |
| P0-25 | `[P0-25] Organization, branches, departments, designations, locations admin UI` |
| P0-26 | `[P0-26] Customer portal foundation UI with layout, auth, and dashboard placeholder` |
| P0-27 | `[P0-27] DPDP compliance UI with consent, data export, and erasure` |
| P0-28 | `[P0-28] Audit log viewer UI with filtering and entity history` |
| P0-29 | `[P0-29] Workflow designer UI with visual editor and instance viewer` |
| P0-30 | `[P0-30] Phase 0 integration tests and checklist validation` |

---

## PART 5 — BEFORE STARTING PHASE 0

**Required setup:**
1. PostgreSQL 16 installed locally with database `erp_dev` created
2. Node.js 20 LTS installed
3. Git installed and configured (name, email)
4. GitHub account with private repo created (e.g., `erp-manufacturing`)
5. Claude Code installed (`npm install -g @anthropic-ai/claude-code`)
6. VS Code recommended

**Required files in project root before P0-01:**
- ERP_SPEC.md (master plan)
- FORWARD_REFERENCES.md (this file's companion — feature index across all phases)
- PROMPTS_P0.md (this file)

**After each prompt, the workflow is:**
1. Run prompt in Claude Code (copy verbatim)
2. Test what was built
3. If broken → tell Claude Code to fix (no scope expansion)
4. Once working → `git add . && git commit -m "[P0-XX] ..." && git push origin main`
5. Verify GitHub shows the commit (proof of backup)
6. Move to next prompt

**End of Phase 0 specification — Version 2.0**

When you complete P0-30 successfully and all checklist items are green, message me and I'll prepare you for Phase 1 build.

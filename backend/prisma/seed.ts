/**
 * Foundation seed — idempotent, safe to run repeatedly.
 *
 * Populates (P0-04 + P0-06):
 *   1. A single placeholder Organization (admin updates via UI later).
 *   2. 6 system Roles (super_admin / admin / manager / supervisor / employee / customer).
 *   3. 35 Module entries derived from /specs/FORWARD_REFERENCES.md domain headers.
 *   4. 7 NumberingSeries (ORD, INV, PO, GRN, MIN, DC, CERT).
 *   5. 12 SystemSettings keys covering timezone, currency, FY start, auth, comm, audit.
 *   6. 122 baseline Permissions (one per module × applicable action).
 *   7. Role-Permission grants for the 6 system roles.
 *
 * Run via: `npm run db:seed` (from /backend) or as part of
 *          `npx prisma migrate reset` (which calls the seed config below).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_ROLES = [
  { roleCode: 'super_admin', name: 'Super Administrator', description: 'Full system access including module management' },
  { roleCode: 'admin',       name: 'Administrator',       description: 'Organization-level admin; cannot toggle core modules' },
  { roleCode: 'manager',     name: 'Manager',             description: 'Department/branch manager with approval authority' },
  { roleCode: 'supervisor',  name: 'Supervisor',          description: 'Floor / shift supervisor; limited approval scope' },
  { roleCode: 'employee',    name: 'Employee',            description: 'Standard internal user' },
  { roleCode: 'customer',    name: 'Customer',            description: 'External customer-portal user (placeholder for FK targets)' },
] as const;

/**
 * 35 Phase-0..Phase-4 modules derived from FORWARD_REFERENCES.md domains.
 * is_core = true: cannot be disabled (AUTH/RBAC/ORG/MOD_MGMT/AUDIT).
 * is_bypassable = true: workflow steps targeting this module skip when off
 * (matches the FR-doc "(Bypassable)" annotations).
 */
const MODULES = [
  // Phase 0 — Foundation
  { moduleCode: 'AUTH',           name: 'Authentication & Identity', category: 'foundation',  isCore: true,  isBypassable: false, displayOrder: 10 },
  { moduleCode: 'RBAC',           name: 'Authorization (RBAC)',      category: 'foundation',  isCore: true,  isBypassable: false, displayOrder: 20 },
  { moduleCode: 'ORG',            name: 'Organization Structure',    category: 'foundation',  isCore: true,  isBypassable: false, displayOrder: 30 },
  { moduleCode: 'MOD_MGMT',       name: 'Module Management',         category: 'foundation',  isCore: true,  isBypassable: false, displayOrder: 40 },
  { moduleCode: 'WORKFLOW',       name: 'Workflow Engine',           category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 50 },
  { moduleCode: 'AUDIT',          name: 'Audit & Compliance',        category: 'foundation',  isCore: true,  isBypassable: false, displayOrder: 60 },
  { moduleCode: 'COMM',           name: 'Communication',             category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 70 },
  { moduleCode: 'PAYMENT',        name: 'Payment Foundation',        category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 80 },
  { moduleCode: 'CUST_PORTAL',    name: 'Customer Portal',           category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 90 },
  { moduleCode: 'DOC_MGMT',       name: 'Document Management',       category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 100 },
  { moduleCode: 'NUM_SERIES',     name: 'Numbering Series',          category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 110 },
  { moduleCode: 'MASTER_DATA',    name: 'Master Data',               category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 120 },
  { moduleCode: 'SETTINGS',       name: 'System Settings',           category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 130 },
  { moduleCode: 'CUSTOM_FIELDS',  name: 'Custom Fields Framework',   category: 'foundation',  isCore: false, isBypassable: false, displayOrder: 140 },

  // Phase 1 — Order Entry & Masters
  { moduleCode: 'CUSTOMER',       name: 'Customer Master',           category: 'sales',       isCore: false, isBypassable: false, displayOrder: 200 },
  { moduleCode: 'PRODUCT',        name: 'Product Master',            category: 'engineering', isCore: false, isBypassable: false, displayOrder: 210 },
  { moduleCode: 'ORDER',          name: 'Order Management',          category: 'sales',       isCore: false, isBypassable: false, displayOrder: 220 },
  { moduleCode: 'PAY_TERMS',      name: 'Payment Terms',             category: 'sales',       isCore: false, isBypassable: false, displayOrder: 230 },
  { moduleCode: 'DOC_GEN',        name: 'Document Generation',       category: 'sales',       isCore: false, isBypassable: false, displayOrder: 240 },

  // Phase 2 — Product Engineering
  { moduleCode: 'MATERIAL',       name: 'Material Master',           category: 'engineering', isCore: false, isBypassable: false, displayOrder: 300 },
  { moduleCode: 'PROCESS',        name: 'Process Master',            category: 'engineering', isCore: false, isBypassable: false, displayOrder: 310 },
  { moduleCode: 'BOM',            name: 'BOM Management',            category: 'engineering', isCore: false, isBypassable: false, displayOrder: 320 },
  { moduleCode: 'COSTING',        name: 'Costing & Pricing',         category: 'engineering', isCore: false, isBypassable: false, displayOrder: 330 },

  // Phase 3 — Supply Chain
  { moduleCode: 'VENDOR',         name: 'Vendor Master',             category: 'procurement', isCore: false, isBypassable: false, displayOrder: 400 },
  { moduleCode: 'STORAGE',        name: 'Storage & Locations',       category: 'inventory',   isCore: false, isBypassable: false, displayOrder: 410 },
  { moduleCode: 'PURCHASE',       name: 'Purchase Orders',           category: 'procurement', isCore: false, isBypassable: false, displayOrder: 420 },
  { moduleCode: 'IMPORT',         name: 'Import Tracking',           category: 'procurement', isCore: false, isBypassable: false, displayOrder: 430 },
  { moduleCode: 'GRN',            name: 'Goods Receipt (GRN)',       category: 'procurement', isCore: false, isBypassable: false, displayOrder: 440 },
  { moduleCode: 'QC',             name: 'Quality Check',             category: 'procurement', isCore: false, isBypassable: true,  displayOrder: 450 },
  { moduleCode: 'INVENTORY',      name: 'Inventory Management',      category: 'inventory',   isCore: false, isBypassable: false, displayOrder: 460 },
  { moduleCode: 'MATERIAL_ISSUE', name: 'Material Issue',            category: 'inventory',   isCore: false, isBypassable: false, displayOrder: 470 },

  // Phase 4 — Production
  { moduleCode: 'PRODUCTION',     name: 'Production Job',            category: 'production',  isCore: false, isBypassable: false, displayOrder: 500 },
  { moduleCode: 'NESTING',        name: 'Nesting Run',               category: 'production',  isCore: false, isBypassable: true,  displayOrder: 510 },
  { moduleCode: 'PANEL_QR',       name: 'Panel Master & QR Tracking',category: 'production',  isCore: false, isBypassable: false, displayOrder: 520 },
  { moduleCode: 'JOB_WORK',       name: 'Job Work Outsourcing',      category: 'production',  isCore: false, isBypassable: true,  displayOrder: 530 },
] as const;

const NUMBERING_SERIES = [
  { seriesCode: 'ORD',  name: 'Sales Order',          prefix: 'ORD',  paddingLength: 5 },
  { seriesCode: 'INV',  name: 'Invoice',              prefix: 'INV',  paddingLength: 5 },
  { seriesCode: 'PO',   name: 'Purchase Order',       prefix: 'PO',   paddingLength: 5 },
  { seriesCode: 'GRN',  name: 'Goods Receipt Note',   prefix: 'GRN',  paddingLength: 5 },
  { seriesCode: 'MIN',  name: 'Material Issue Note',  prefix: 'MIN',  paddingLength: 5 },
  { seriesCode: 'DC',   name: 'Delivery Challan',     prefix: 'DC',   paddingLength: 5 },
  { seriesCode: 'CERT', name: 'Certificate',          prefix: 'CERT', paddingLength: 4 },
] as const;

const SYSTEM_SETTINGS = [
  { settingKey: 'system.timezone',                     settingValue: 'Asia/Kolkata',  dataType: 'string',  category: 'system', description: 'Default org timezone',                                          isUserEditable: true },
  { settingKey: 'system.currency.default',             settingValue: 'INR',           dataType: 'string',  category: 'system', description: 'Default currency code (ISO 4217)',                              isUserEditable: true },
  { settingKey: 'system.financial_year.start_month',   settingValue: '4',             dataType: 'integer', category: 'system', description: 'Indian FY starts in April (month 4)',                            isUserEditable: true },

  { settingKey: 'auth.session.access_token_ttl_minutes', settingValue: '15',          dataType: 'integer', category: 'auth',   description: 'JWT access-token lifetime in minutes',                         isUserEditable: true },
  { settingKey: 'auth.session.refresh_token_ttl_days',   settingValue: '7',           dataType: 'integer', category: 'auth',   description: 'JWT refresh-token lifetime in days',                           isUserEditable: true },
  { settingKey: 'auth.password.min_length',              settingValue: '12',          dataType: 'integer', category: 'auth',   description: 'Minimum password length on set / change',                      isUserEditable: true },
  { settingKey: 'auth.password.history_count',           settingValue: '5',           dataType: 'integer', category: 'auth',   description: 'Number of past passwords disallowed on change',                isUserEditable: true },
  { settingKey: 'auth.lockout.max_attempts',             settingValue: '5',           dataType: 'integer', category: 'auth',   description: 'Failed-login threshold before lockout',                        isUserEditable: true },
  { settingKey: 'auth.lockout.duration_minutes',         settingValue: '15',          dataType: 'integer', category: 'auth',   description: 'Lockout duration on threshold breach',                         isUserEditable: true },
  { settingKey: 'auth.mfa.enforced_for_admins',          settingValue: 'false',       dataType: 'boolean', category: 'auth',   description: 'When true, super_admin/admin must enroll MFA before access',   isUserEditable: true },

  { settingKey: 'comm.email.test_mode',                  settingValue: 'true',        dataType: 'boolean', category: 'comm',   description: 'Suppress real email sends; route to dev sink',                 isUserEditable: true },
  { settingKey: 'audit.retention_days',                  settingValue: '730',         dataType: 'integer', category: 'audit',  description: 'How long to retain audit_logs before archive (2 years)',         isUserEditable: false },
] as const;

async function seedOrganization(): Promise<void> {
  // Idempotent: a placeholder org with a stable name. Admin replaces via UI later.
  const existing = await prisma.organization.findFirst({ where: { name: 'Default Organization' } });
  if (existing) {
    console.log(`organization      : kept existing (${existing.id})`);
    return;
  }
  const created = await prisma.organization.create({
    data: {
      name: 'Default Organization',
      legalName: 'Default Organization',
      financialYearStartMonth: 4,
      defaultCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      isActive: true,
    },
  });
  console.log(`organization      : created (${created.id})`);
}

async function seedRoles(): Promise<void> {
  for (const r of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { roleCode: r.roleCode },
      update: { name: r.name, description: r.description, isSystemRole: true, isActive: true },
      create: { ...r, isSystemRole: true, isActive: true },
    });
  }
  const total = await prisma.role.count({ where: { isSystemRole: true } });
  console.log(`system roles      : ${total} (target 6)`);
}

async function seedModules(): Promise<void> {
  for (const m of MODULES) {
    await prisma.module.upsert({
      where: { moduleCode: m.moduleCode },
      update: {
        name: m.name,
        category: m.category,
        isCore: m.isCore,
        isBypassable: m.isBypassable,
        displayOrder: m.displayOrder,
        isActive: true,
      },
      create: {
        moduleCode: m.moduleCode,
        name: m.name,
        category: m.category,
        isCore: m.isCore,
        isBypassable: m.isBypassable,
        displayOrder: m.displayOrder,
        isActive: true,
        activatedAt: new Date(),
      },
    });
  }
  const total = await prisma.module.count();
  console.log(`modules           : ${total} (target 35)`);
}

async function seedNumberingSeries(): Promise<void> {
  for (const n of NUMBERING_SERIES) {
    await prisma.numberingSeries.upsert({
      where: { seriesCode: n.seriesCode },
      update: { name: n.name },
      create: {
        seriesCode: n.seriesCode,
        name: n.name,
        prefix: n.prefix,
        yearFormat: 'YYYY',
        separator: '/',
        paddingLength: n.paddingLength,
        currentNumber: 0,
        resetYearly: true,
        isActive: true,
      },
    });
  }
  const total = await prisma.numberingSeries.count();
  console.log(`numbering series  : ${total} (target 7)`);
}

// =============================================================================
// P0-06 — Permissions and role grants
// =============================================================================

/**
 * Per-module action sets. Some modules are read-only (AUDIT), some toggle-only
 * (MOD_MGMT), most are full CRUD, and workflow-relevant ones add `approve`.
 * Permission codes: `<MODULE>:<feature>:<action>`. `feature` defaults to the
 * lowercased module code; specific modules later split into multiple features.
 */
const ACTIONS_BY_MODULE: Record<string, readonly string[]> = {
  // Foundation
  AUTH:           ['view'],
  RBAC:           ['view', 'create', 'edit', 'delete'],
  ORG:            ['view', 'create', 'edit', 'delete'],
  MOD_MGMT:       ['view', 'edit'],
  WORKFLOW:       ['view', 'create', 'edit', 'delete', 'approve'],
  AUDIT:          ['view'],
  COMM:           ['view', 'create', 'edit', 'delete'],
  PAYMENT:        ['view', 'create', 'approve'],
  CUST_PORTAL:    ['view', 'create', 'edit', 'delete'],
  DOC_MGMT:       ['view', 'create', 'edit', 'delete'],
  NUM_SERIES:     ['view', 'edit'],
  MASTER_DATA:    ['view', 'create', 'edit', 'delete'],
  SETTINGS:       ['view', 'edit'],
  CUSTOM_FIELDS:  ['view', 'create', 'edit', 'delete'],
  // Sales / engineering / procurement / inventory / production
  CUSTOMER:       ['view', 'create', 'edit', 'delete'],
  PRODUCT:        ['view', 'create', 'edit', 'delete'],
  ORDER:          ['view', 'create', 'edit', 'delete', 'approve'],
  PAY_TERMS:      ['view', 'create', 'edit', 'delete'],
  DOC_GEN:        ['view', 'create'],
  MATERIAL:       ['view', 'create', 'edit', 'delete'],
  PROCESS:        ['view', 'create', 'edit', 'delete'],
  BOM:            ['view', 'create', 'edit', 'delete', 'approve'],
  COSTING:        ['view', 'create', 'edit'],
  VENDOR:         ['view', 'create', 'edit', 'delete'],
  STORAGE:        ['view', 'create', 'edit', 'delete'],
  PURCHASE:       ['view', 'create', 'edit', 'delete', 'approve'],
  IMPORT:         ['view', 'create', 'edit'],
  GRN:            ['view', 'create', 'edit', 'approve'],
  QC:             ['view', 'create', 'edit', 'approve'],
  INVENTORY:      ['view', 'edit'],
  MATERIAL_ISSUE: ['view', 'create', 'edit', 'approve'],
  PRODUCTION:     ['view', 'create', 'edit', 'approve'],
  NESTING:        ['view', 'create', 'edit'],
  PANEL_QR:       ['view', 'edit'],
  JOB_WORK:       ['view', 'create', 'edit', 'approve'],
};

const FOUNDATION_CATEGORIES = new Set(['foundation']);
const OPERATIONAL_CATEGORIES = new Set(['procurement', 'inventory', 'production']);
const SYSTEM_MODULE_CODES = new Set(['AUTH', 'RBAC', 'MOD_MGMT']);

function permissionCode(moduleCode: string, action: string): string {
  return `${moduleCode}:${moduleCode.toLowerCase()}:${action}`;
}

/**
 * Sub-feature permissions that don't fit the one-feature-per-module default.
 * As specific modules grow they add their own features here.
 *
 * P0-10 added: AUTH:users:* — admin-side user management actions are
 * separate from the generic AUTH:auth:view (which gates "can read auth flow
 * state at all"), and so live as their own feature.
 */
interface SubFeaturePermission {
  moduleCode: string;
  feature: string;
  actions: readonly string[];
}

const SUB_FEATURE_PERMISSIONS: readonly SubFeaturePermission[] = [
  {
    moduleCode: 'AUTH',
    feature: 'users',
    actions: [
      'view',
      'create',
      'edit',
      'delete',
      'reset_password',
      'manage_roles',
      'manage_permissions',
    ],
  },
];

function subPermissionCode(moduleCode: string, feature: string, action: string): string {
  return `${moduleCode}:${feature}:${action}`;
}

interface ResolvedPermission {
  code: string;
  moduleCode: string;
  feature: string;
  action: string;
}

function buildBaselinePermissions(): ResolvedPermission[] {
  const out: ResolvedPermission[] = [];
  for (const m of MODULES) {
    const actions = ACTIONS_BY_MODULE[m.moduleCode] ?? ['view'];
    for (const action of actions) {
      out.push({
        code: permissionCode(m.moduleCode, action),
        moduleCode: m.moduleCode,
        feature: m.moduleCode.toLowerCase(),
        action,
      });
    }
  }
  for (const sf of SUB_FEATURE_PERMISSIONS) {
    for (const action of sf.actions) {
      out.push({
        code: subPermissionCode(sf.moduleCode, sf.feature, action),
        moduleCode: sf.moduleCode,
        feature: sf.feature,
        action,
      });
    }
  }
  return out;
}

/**
 * Decide which permissions a given system role gets by default.
 * Customer role gets nothing on internal modules — customer permissions live
 * in core.customer_portal_permissions and are scoped per CustomerAccount.
 */
function permissionsForRole(roleCode: string, all: ResolvedPermission[]): ResolvedPermission[] {
  const isOperational = (m: string): boolean => {
    const mod = MODULES.find((x) => x.moduleCode === m);
    return mod ? OPERATIONAL_CATEGORIES.has(mod.category) : false;
  };
  const isFoundation = (m: string): boolean => {
    const mod = MODULES.find((x) => x.moduleCode === m);
    return mod ? FOUNDATION_CATEGORIES.has(mod.category) : false;
  };

  // AUTH:users:* sub-feature grants — handled explicitly to keep destructive
  // user-management actions tightly held.
  const isUsersAction = (p: ResolvedPermission, action: string): boolean =>
    p.moduleCode === 'AUTH' && p.feature === 'users' && p.action === action;

  switch (roleCode) {
    case 'super_admin':
      return all;
    case 'admin':
      return all.filter((p) => {
        // Everything except destructive on system modules.
        if (SYSTEM_MODULE_CODES.has(p.moduleCode) && p.action === 'delete') return false;
        // Admins manage users heavily but never delete or grant overrides
        // (those stay super_admin-only by default).
        if (isUsersAction(p, 'delete')) return false;
        if (isUsersAction(p, 'manage_permissions')) return false;
        return true;
      });
    case 'manager':
      // Read-only on foundation; full + approve on business modules.
      // Plus AUTH:users:view so managers can see their team in admin lists.
      return all.filter((p) => {
        if (isUsersAction(p, 'view')) return true;
        if (isFoundation(p.moduleCode)) return p.action === 'view';
        return ['view', 'create', 'edit', 'approve'].includes(p.action);
      });
    case 'supervisor':
      // View on most; create/edit on operational; no delete, no approve.
      // AUTH:users:view granted so supervisors can see team rosters.
      return all.filter((p) => {
        if (isUsersAction(p, 'view')) return true;
        if (p.action === 'view') return true;
        if (isOperational(p.moduleCode)) return p.action === 'create' || p.action === 'edit';
        return false;
      });
    case 'employee':
      // View everywhere except foundation system modules; create on ORDER + GRN.
      // No AUTH:users:* — employees don't manage users.
      return all.filter((p) => {
        if (SYSTEM_MODULE_CODES.has(p.moduleCode)) return false;
        if (p.action === 'view') return true;
        if (p.action === 'create' && (p.moduleCode === 'ORDER' || p.moduleCode === 'GRN')) {
          return true;
        }
        return false;
      });
    case 'customer':
      return [];
    default:
      return [];
  }
}

async function seedPermissions(): Promise<ResolvedPermission[]> {
  const baseline = buildBaselinePermissions();
  const moduleByCode = new Map(
    (await prisma.module.findMany({ select: { id: true, moduleCode: true } })).map((m) => [
      m.moduleCode,
      m.id,
    ]),
  );

  for (const p of baseline) {
    const moduleId = moduleByCode.get(p.moduleCode) ?? null;
    await prisma.permission.upsert({
      where: { permissionCode: p.code },
      update: {
        moduleId,
        feature: p.feature,
        action: p.action,
        description: `${p.action} ${p.moduleCode}`,
      },
      create: {
        permissionCode: p.code,
        moduleId,
        feature: p.feature,
        action: p.action,
        description: `${p.action} ${p.moduleCode}`,
      },
    });
  }
  const total = await prisma.permission.count();
  console.log(`permissions       : ${total} (target ${baseline.length})`);
  return baseline;
}

// =============================================================================
// P0-07 — Module dependencies
// =============================================================================

/**
 * Each entry: [moduleCode, dependsOnModuleCode, isHardDependency]
 *
 * `isHardDependency=true` means the dependent cannot be activated unless the
 * upstream is active, AND the upstream cannot be deactivated while this one
 * is on. Soft dependencies are advisory — they show up in `getDependents()`
 * but don't block activation/deactivation. Use sparingly; prefer hard.
 *
 * Rationale by line:
 *   ORDER → CUSTOMER, PRODUCT     — can't take orders without master data
 *   BOM   → PRODUCT, MATERIAL     — bills of materials are made of materials
 *   COSTING → BOM                 — costs roll up from BOM
 *   PRODUCTION → BOM              — work orders consume BOMs
 *   INVENTORY → STORAGE, MATERIAL — stock lives in locations and is of materials
 *   GRN → PURCHASE                — goods received against POs
 *   MATERIAL_ISSUE → INVENTORY    — issuing material requires stock
 *   PURCHASE → VENDOR             — POs are placed on vendors
 *   IMPORT → PURCHASE             — import tracking attaches to POs
 *   QC → GRN                      — inbound QC checks GRN line items (soft;
 *                                   QC is bypassable)
 *   NESTING → PRODUCTION          — nesting runs are part of production
 *                                   (soft; NESTING is bypassable)
 *   PANEL_QR → PRODUCTION         — QR codes attach to panels in production
 *   JOB_WORK → PRODUCTION         — outsourced ops part of production
 *                                   (soft; JOB_WORK is bypassable)
 */
const MODULE_DEPENDENCIES: ReadonlyArray<readonly [string, string, boolean]> = [
  ['ORDER',          'CUSTOMER', true],
  ['ORDER',          'PRODUCT',  true],
  ['BOM',            'PRODUCT',  true],
  ['BOM',            'MATERIAL', true],
  ['COSTING',        'BOM',      true],
  ['PRODUCTION',     'BOM',      true],
  ['INVENTORY',      'STORAGE',  true],
  ['INVENTORY',      'MATERIAL', true],
  ['GRN',            'PURCHASE', true],
  ['MATERIAL_ISSUE', 'INVENTORY',true],
  ['PURCHASE',       'VENDOR',   true],
  ['IMPORT',         'PURCHASE', true],
  ['QC',             'GRN',      false],
  ['NESTING',        'PRODUCTION', false],
  ['PANEL_QR',       'PRODUCTION', true],
  ['JOB_WORK',       'PRODUCTION', false],
];

async function seedModuleDependencies(): Promise<void> {
  const byCode = new Map(
    (await prisma.module.findMany({ select: { id: true, moduleCode: true } })).map(
      (m) => [m.moduleCode, m.id],
    ),
  );

  let upserts = 0;
  for (const [code, depCode, isHard] of MODULE_DEPENDENCIES) {
    const moduleId = byCode.get(code);
    const dependsOnId = byCode.get(depCode);
    if (!moduleId || !dependsOnId) {
      throw new Error(`Module dependency seed references unknown module: ${code}/${depCode}`);
    }
    await prisma.moduleDependency.upsert({
      where: {
        moduleId_dependsOnModuleId: { moduleId, dependsOnModuleId: dependsOnId },
      },
      update: { isHardDependency: isHard },
      create: { moduleId, dependsOnModuleId: dependsOnId, isHardDependency: isHard },
    });
    upserts++;
  }
  const total = await prisma.moduleDependency.count();
  console.log(`module dependencies : ${total} (target ${upserts})`);
}

async function seedRolePermissions(allPerms: ResolvedPermission[]): Promise<void> {
  const roles = await prisma.role.findMany({
    where: { isSystemRole: true },
    select: { id: true, roleCode: true },
  });
  const permIdByCode = new Map(
    (await prisma.permission.findMany({ select: { id: true, permissionCode: true } })).map(
      (p) => [p.permissionCode, p.id],
    ),
  );

  let totalGrants = 0;
  for (const role of roles) {
    const perms = permissionsForRole(role.roleCode, allPerms);

    // Replace-style sync: the seed is the source of truth for system role
    // grants. Delete any role-permission rows not in the desired set, then
    // upsert the rest. Custom (non-system) roles created via UI later are
    // unaffected because we only touch this role's rows.
    const desiredCodes = new Set(perms.map((p) => p.code));
    const desiredIds = perms
      .map((p) => permIdByCode.get(p.code))
      .filter((x): x is string => Boolean(x));

    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { id: true, permissionId: true },
    });
    const existingByPermId = new Map(existing.map((e) => [e.permissionId, e.id]));

    const toDelete = existing
      .filter((e) => !desiredIds.includes(e.permissionId))
      .map((e) => e.id);
    if (toDelete.length > 0) {
      await prisma.rolePermission.deleteMany({ where: { id: { in: toDelete } } });
    }

    for (const id of desiredIds) {
      if (!existingByPermId.has(id)) {
        await prisma.rolePermission.create({
          data: { roleId: role.id, permissionId: id },
        });
      }
    }

    totalGrants += desiredCodes.size;
    console.log(`  ${role.roleCode.padEnd(12)}: ${desiredCodes.size} permissions`);
  }
  console.log(`role-permission grants : ${totalGrants} total across ${roles.length} roles`);
}

async function seedSystemSettings(): Promise<void> {
  for (const s of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { settingKey: s.settingKey },
      update: {
        settingValue: s.settingValue,
        dataType: s.dataType,
        category: s.category,
        description: s.description,
        isUserEditable: s.isUserEditable,
      },
      create: { ...s },
    });
  }
  const total = await prisma.systemSetting.count();
  console.log(`system settings   : ${total} (target 12)`);
}

// =============================================================================
// P0-15 — Communication templates (seeded baselines)
// =============================================================================

interface CommTemplateSeed {
  templateCode: string;
  name: string;
  channel: 'email' | 'sms' | 'whatsapp';
  subjectTemplate: string;
  bodyTemplate: string;
  variablesSchema: Record<string, string>;
  /** TRAI/DLT template id for SMS templates (placeholder until registered). */
  dltTemplateId?: string;
}

const COMMUNICATION_TEMPLATES: readonly CommTemplateSeed[] = [
  {
    templateCode: 'welcome_user',
    name: 'Welcome new user',
    channel: 'email',
    subjectTemplate: 'Welcome to {{orgName}} — set your password',
    bodyTemplate: `<p>Hi {{firstName}},</p>
<p>An account has been created for you on the <strong>{{orgName}}</strong> ERP. Use the link below to set your password:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>The link expires in {{ttlMinutes}} minutes. If you didn&#39;t expect this, please contact your administrator.</p>
<p>— The {{orgName}} team</p>`,
    variablesSchema: {
      firstName: 'string',
      orgName: 'string',
      resetUrl: 'string',
      ttlMinutes: 'number',
    },
  },
  {
    templateCode: 'password_reset',
    name: 'Password reset',
    channel: 'email',
    subjectTemplate: 'Reset your {{orgName}} password',
    bodyTemplate: `<p>Hi {{firstName}},</p>
<p>We received a request to reset your password. Use the link below to set a new one:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
<p>This link expires in {{ttlMinutes}} minutes. If you didn&#39;t request this, ignore this email — your account is unchanged.</p>`,
    variablesSchema: {
      firstName: 'string',
      orgName: 'string',
      resetUrl: 'string',
      ttlMinutes: 'number',
    },
  },
  {
    templateCode: 'account_locked',
    name: 'Account locked notification',
    channel: 'email',
    subjectTemplate: 'Your {{orgName}} account is temporarily locked',
    bodyTemplate: `<p>Hi {{firstName}},</p>
<p>Your account has been locked after {{maxAttempts}} unsuccessful sign-in attempts. The lock will lift automatically at <strong>{{unlockAt}}</strong>.</p>
<p>If this wasn&#39;t you, please reset your password as soon as possible:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>`,
    variablesSchema: {
      firstName: 'string',
      orgName: 'string',
      maxAttempts: 'number',
      unlockAt: 'string',
      resetUrl: 'string',
    },
  },
  {
    templateCode: 'login_alert',
    name: 'Suspicious login alert',
    channel: 'email',
    subjectTemplate: 'New sign-in to your {{orgName}} account',
    bodyTemplate: `<p>Hi {{firstName}},</p>
<p>We noticed a sign-in to your account from a device or location we don&#39;t recognise:</p>
<ul>
  <li>Time: {{loginAt}}</li>
  <li>IP: {{ipAddress}}</li>
  <li>Device: {{userAgent}}</li>
</ul>
<p>If this was you, no action is needed. If not, please change your password immediately:</p>
<p><a href="{{resetUrl}}">{{resetUrl}}</a></p>`,
    variablesSchema: {
      firstName: 'string',
      orgName: 'string',
      loginAt: 'string',
      ipAddress: 'string',
      userAgent: 'string',
      resetUrl: 'string',
    },
  },

  // -- SMS templates (P0-16) ---------------------------------------------
  // dltTemplateId values are PLACEHOLDERS — replace with the actual
  // TRAI-registered IDs before flipping DLT_ENFORCEMENT_ENABLED on in prod.
  {
    templateCode: 'login_otp',
    name: 'Login OTP',
    channel: 'sms',
    subjectTemplate: '',
    bodyTemplate: `Your {{orgName}} login OTP is {{otp}}. Valid for {{ttlMinutes}} minutes. Do not share.`,
    variablesSchema: { orgName: 'string', otp: 'string', ttlMinutes: 'number' },
    dltTemplateId: 'DLT_PLACEHOLDER_LOGIN_OTP',
  },
  {
    templateCode: 'password_reset_otp',
    name: 'Password reset OTP',
    channel: 'sms',
    subjectTemplate: '',
    bodyTemplate: `Your {{orgName}} password reset OTP is {{otp}}. Valid for {{ttlMinutes}} minutes. If you did not request this, ignore.`,
    variablesSchema: { orgName: 'string', otp: 'string', ttlMinutes: 'number' },
    dltTemplateId: 'DLT_PLACEHOLDER_PASSWORD_RESET_OTP',
  },
  {
    templateCode: 'mfa_otp',
    name: 'MFA OTP',
    channel: 'sms',
    subjectTemplate: '',
    bodyTemplate: `Your {{orgName}} MFA code is {{otp}}. Valid for {{ttlMinutes}} minutes.`,
    variablesSchema: { orgName: 'string', otp: 'string', ttlMinutes: 'number' },
    dltTemplateId: 'DLT_PLACEHOLDER_MFA_OTP',
  },
];

async function seedCommunicationTemplates(): Promise<void> {
  for (const t of COMMUNICATION_TEMPLATES) {
    await prisma.communicationTemplate.upsert({
      where: { templateCode: t.templateCode },
      update: {
        name: t.name,
        channel: t.channel,
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        variablesSchema: t.variablesSchema,
        dltTemplateId: t.dltTemplateId ?? null,
        isActive: true,
      },
      create: {
        templateCode: t.templateCode,
        name: t.name,
        channel: t.channel,
        subjectTemplate: t.subjectTemplate,
        bodyTemplate: t.bodyTemplate,
        variablesSchema: t.variablesSchema,
        dltTemplateId: t.dltTemplateId ?? null,
        isActive: true,
      },
    });
  }
  const total = await prisma.communicationTemplate.count();
  console.log(`comm templates    : ${total} (target ${COMMUNICATION_TEMPLATES.length}+)`);
}

async function main(): Promise<void> {
  console.log('--- foundation seed ---');
  await seedOrganization();
  await seedRoles();
  await seedModules();
  await seedModuleDependencies();
  await seedNumberingSeries();
  await seedSystemSettings();
  const baseline = await seedPermissions();
  await seedRolePermissions(baseline);
  await seedCommunicationTemplates();
  console.log('-----------------------');
  console.log('seed complete.');
}

main()
  .catch((err) => {
    console.error('seed FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * 6-level permission resolver — see /specs/PROMPTS_P0.md PROMPT P0-06.
 *
 * Levels:
 *   1. Module access     — user must have ANY permission in the target module,
 *                          and the module itself must be active
 *   2. Feature access    — user must have a permission for (module, feature)
 *   3. Action access     — user must have a permission for (module, feature, action)
 *   4. Field visibility  — applied to response shapes via filterFields()
 *   5. Data-level filter — applied to Prisma where clauses via applyDataFilter()
 *   6. User overrides    — explicit allow/deny in user_permission_overrides;
 *                          an active deny short-circuits to deny
 *
 * Caching is per-user, in-memory, 1-hour TTL. Admin APIs that mutate
 * permission state must call invalidateUser(userId) (or invalidateAll() for
 * role/permission table edits).
 */
import { prisma } from '../lib/prisma';
import type { Prisma } from '@prisma/client';

// -- types ---------------------------------------------------------------

export type Visibility = 'visible' | 'readonly' | 'hidden';

export interface FieldRestriction {
  fieldCode: string;
  visibility: Visibility;
}

/**
 * Data filter spec returned alongside an allow decision. Callers feed it to
 * applyDataFilter() to extend a Prisma where clause.
 *
 * `all`              — no filter (full access)
 * `own_records`      — `createdById = userId`
 * `own_branch`       — `branchId = user.branchId`   (no filter when user has no branch)
 * `own_department`   — `departmentId = user.departmentId`
 * `custom`           — arbitrary Prisma where fragment from scope_filter JSON
 */
export type DataFilter =
  | { type: 'all' }
  | { type: 'own_records' }
  | { type: 'own_branch' }
  | { type: 'own_department' }
  | { type: 'custom'; where: Record<string, unknown> };

export interface PermissionContext {
  userId: string;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  dataFilter?: DataFilter;
  fieldRestrictions?: FieldRestriction[];
}

// -- internal cache ------------------------------------------------------

interface RoleGrant {
  permissionCode: string;
  scopeFilter: Prisma.JsonValue | null;
}

interface UserOverride {
  permissionCode: string;
  grantType: 'allow' | 'deny';
  scopeFilter: Prisma.JsonValue | null;
}

interface CacheEntry {
  context: PermissionContext;
  /** Code → list of grants (one per role granting it). */
  roleGrants: Map<string, RoleGrant[]>;
  /** Code → override. If grantType is 'deny', it short-circuits. */
  overrides: Map<string, UserOverride>;
  /** ModuleCode → isActive. */
  moduleStatus: Map<string, boolean>;
  /** targetEntity → fieldCode → most-permissive visibility across user's roles. */
  fieldVisibility: Map<string, Map<string, Visibility>>;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const cache = new Map<string, CacheEntry>();

function visibilityRank(v: Visibility): number {
  // Higher number = more permissive. Used to merge across roles.
  return v === 'visible' ? 2 : v === 'readonly' ? 1 : 0;
}

async function loadEntry(userId: string): Promise<CacheEntry> {
  // 1. user + active roles
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: {
                  permission: { select: { permissionCode: true } },
                },
              },
              fieldVisibility: true,
            },
          },
        },
      },
      permissionOverrides: {
        where: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        include: { permission: { select: { permissionCode: true } } },
      },
    },
  });

  if (!user) {
    throw new Error(`User ${userId} not found while resolving permissions`);
  }

  // 2. module status
  const modules = await prisma.module.findMany({
    select: { moduleCode: true, isActive: true },
  });
  const moduleStatus = new Map(modules.map((m) => [m.moduleCode, m.isActive]));

  // 3. role grants
  const roleGrants = new Map<string, RoleGrant[]>();
  for (const ur of user.userRoles) {
    if (!ur.role.isActive) continue;
    for (const rp of ur.role.rolePermissions) {
      const code = rp.permission.permissionCode;
      const list = roleGrants.get(code) ?? [];
      list.push({ permissionCode: code, scopeFilter: rp.scopeFilter });
      roleGrants.set(code, list);
    }
  }

  // 4. overrides
  const overrides = new Map<string, UserOverride>();
  for (const o of user.permissionOverrides) {
    overrides.set(o.permission.permissionCode, {
      permissionCode: o.permission.permissionCode,
      grantType: o.grantType === 'allow' ? 'allow' : 'deny',
      scopeFilter: null,
    });
  }

  // 5. field visibility — merge across roles, most permissive wins
  const fieldVisibility = new Map<string, Map<string, Visibility>>();
  for (const ur of user.userRoles) {
    if (!ur.role.isActive) continue;
    for (const fv of ur.role.fieldVisibility) {
      const cur = fieldVisibility.get(fv.targetEntity) ?? new Map<string, Visibility>();
      const incoming = fv.visibility as Visibility;
      const existing = cur.get(fv.fieldCode);
      if (!existing || visibilityRank(incoming) > visibilityRank(existing)) {
        cur.set(fv.fieldCode, incoming);
      }
      fieldVisibility.set(fv.targetEntity, cur);
    }
  }

  return {
    context: {
      userId: user.id,
      branchId: user.branchId,
      departmentId: user.departmentId,
      designationId: user.designationId,
    },
    roleGrants,
    overrides,
    moduleStatus,
    fieldVisibility,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

async function getEntry(userId: string): Promise<CacheEntry> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached;
  const fresh = await loadEntry(userId);
  cache.set(userId, fresh);
  return fresh;
}

// -- public API ----------------------------------------------------------

export function invalidateUser(userId: string): void {
  cache.delete(userId);
}

export function invalidateAll(): void {
  cache.clear();
}

function buildPermissionCode(moduleCode: string, feature: string, action: string): string {
  return `${moduleCode}:${feature}:${action}`;
}

function pickDataFilter(grants: RoleGrant[]): DataFilter {
  // Most permissive across granting roles.
  // Recognised tokens in scope_filter: { type: "all" | "own_records" | ... }
  // or { where: {...} } for custom.
  let best: DataFilter = { type: 'own_records' };
  let bestRank = 0;
  for (const g of grants) {
    const sf = g.scopeFilter;
    let cur: DataFilter;
    if (!sf || typeof sf !== 'object' || Array.isArray(sf)) {
      // No filter declared on the role grant → treat as `all` (broadest).
      cur = { type: 'all' };
    } else {
      const obj = sf as Record<string, unknown>;
      if (obj.type === 'all') cur = { type: 'all' };
      else if (obj.type === 'own_records') cur = { type: 'own_records' };
      else if (obj.type === 'own_branch') cur = { type: 'own_branch' };
      else if (obj.type === 'own_department') cur = { type: 'own_department' };
      else if (obj.type === 'custom' && typeof obj.where === 'object' && obj.where) {
        cur = { type: 'custom', where: obj.where as Record<string, unknown> };
      } else {
        cur = { type: 'all' };
      }
    }
    const rank =
      cur.type === 'all' ? 4 :
      cur.type === 'own_branch' ? 3 :
      cur.type === 'own_department' ? 2 :
      cur.type === 'custom' ? 1 :
      0;
    if (rank > bestRank) {
      best = cur;
      bestRank = rank;
    }
  }
  return best;
}

function pickFieldRestrictions(
  entry: CacheEntry,
  targetEntity: string,
): FieldRestriction[] {
  const m = entry.fieldVisibility.get(targetEntity);
  if (!m) return [];
  return [...m.entries()].map(([fieldCode, visibility]) => ({ fieldCode, visibility }));
}

export interface ResolveInput {
  userId: string;
  moduleCode: string;
  feature: string;
  action: string;
  /** When set, field restrictions for that targetEntity are included. */
  targetEntity?: string;
}

export async function resolvePermission(input: ResolveInput): Promise<PermissionResult> {
  const entry = await getEntry(input.userId);
  const code = buildPermissionCode(input.moduleCode, input.feature, input.action);

  // Level 6 (override deny) — short-circuits.
  const override = entry.overrides.get(code);
  if (override?.grantType === 'deny') {
    return { allowed: false, reason: 'Explicit user-level deny override' };
  }

  // Level 1 (module active)
  const moduleActive = entry.moduleStatus.get(input.moduleCode);
  if (moduleActive === undefined) {
    return { allowed: false, reason: `Unknown module: ${input.moduleCode}` };
  }
  if (!moduleActive) {
    return { allowed: false, reason: `Module ${input.moduleCode} is disabled` };
  }

  // Levels 2 + 3 (feature + action via role grants)
  const grants = entry.roleGrants.get(code) ?? [];
  const allowedByRole = grants.length > 0;
  const allowedByOverride = override?.grantType === 'allow';

  if (!allowedByRole && !allowedByOverride) {
    return {
      allowed: false,
      reason: 'No role grants or allow override for this permission',
    };
  }

  // Level 5 — strictest data filter from matching role grants. If the user
  // is allowed only via override, default to `all` (overrides bypass scope).
  const dataFilter: DataFilter = allowedByRole ? pickDataFilter(grants) : { type: 'all' };

  // Level 4 — field restrictions for the named entity, when requested.
  const fieldRestrictions = input.targetEntity
    ? pickFieldRestrictions(entry, input.targetEntity)
    : [];

  return {
    allowed: true,
    reason: allowedByRole ? 'Granted by role' : 'Granted by user override',
    dataFilter,
    fieldRestrictions,
  };
}

/**
 * Lighter-weight check that returns just true/false. Skips field/data filter
 * computation. Useful for routes that only need to gate access, not shape the
 * response.
 */
export async function hasPermission(input: ResolveInput): Promise<boolean> {
  const r = await resolvePermission(input);
  return r.allowed;
}

/**
 * Effective permission summary for a user (admin API output).
 * Returns the merged set of grants from roles + active overrides, with the
 * effective decision per code.
 */
export async function getEffectivePermissions(userId: string): Promise<{
  context: PermissionContext;
  permissions: { permissionCode: string; source: 'role' | 'override-allow' | 'override-deny' }[];
  modulesActive: string[];
  modulesInactive: string[];
}> {
  const entry = await getEntry(userId);
  const codes = new Set<string>([...entry.roleGrants.keys(), ...entry.overrides.keys()]);
  const out: { permissionCode: string; source: 'role' | 'override-allow' | 'override-deny' }[] = [];

  for (const code of codes) {
    const ovr = entry.overrides.get(code);
    if (ovr?.grantType === 'deny') {
      out.push({ permissionCode: code, source: 'override-deny' });
      continue;
    }
    if (entry.roleGrants.has(code)) {
      out.push({ permissionCode: code, source: 'role' });
      continue;
    }
    if (ovr?.grantType === 'allow') {
      out.push({ permissionCode: code, source: 'override-allow' });
    }
  }
  out.sort((a, b) => a.permissionCode.localeCompare(b.permissionCode));

  const modulesActive: string[] = [];
  const modulesInactive: string[] = [];
  for (const [m, active] of entry.moduleStatus.entries()) {
    (active ? modulesActive : modulesInactive).push(m);
  }
  modulesActive.sort();
  modulesInactive.sort();

  return {
    context: entry.context,
    permissions: out,
    modulesActive,
    modulesInactive,
  };
}

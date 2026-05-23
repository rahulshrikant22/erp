/**
 * Module registry — list / get / activate / deactivate / dependents / growth.
 *
 * Activation rules:
 *   - Module must already exist in core.modules (seeded at install time).
 *   - Activating a module whose hard dependencies are inactive is rejected
 *     with a list of the missing upstreams.
 *   - Deactivating a core module is rejected.
 *   - Deactivating a module with active hard dependents is rejected with the
 *     list of dependents (the caller can then choose to deactivate them first).
 *   - Activate / deactivate is idempotent: calling activate on an already-on
 *     module is a no-op (still appends an activation history row only when the
 *     state actually changes).
 *
 * Caching:
 *   - `isModuleActive(code)` is the hot path used by the permission resolver
 *     and (later) the workflow engine. Backed by an in-memory Map with a
 *     short TTL (5 min) and synchronous invalidation on every state change.
 *   - On activate / deactivate we also call permissions.invalidateAll() so
 *     in-flight users immediately lose / regain access without waiting for
 *     the resolver's 1-hour TTL.
 */
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { invalidateAll as invalidatePermissions } from './permissions';

// -- isActive cache ------------------------------------------------------

interface ActiveCacheEntry {
  byCode: Map<string, boolean>;
  expiresAt: number;
}

const ACTIVE_CACHE_TTL_MS = 5 * 60 * 1000;
let activeCache: ActiveCacheEntry | null = null;

async function refreshActiveCache(): Promise<ActiveCacheEntry> {
  const rows = await prisma.module.findMany({
    select: { moduleCode: true, isActive: true },
  });
  const entry: ActiveCacheEntry = {
    byCode: new Map(rows.map((r) => [r.moduleCode, r.isActive])),
    expiresAt: Date.now() + ACTIVE_CACHE_TTL_MS,
  };
  activeCache = entry;
  return entry;
}

export async function isModuleActive(moduleCode: string): Promise<boolean> {
  const e = activeCache && activeCache.expiresAt > Date.now()
    ? activeCache
    : await refreshActiveCache();
  // Unknown module → treat as inactive (callers should treat that as deny).
  return e.byCode.get(moduleCode) ?? false;
}

function invalidateActiveCache(): void {
  activeCache = null;
}

// -- types ---------------------------------------------------------------

export interface ModuleSummary {
  moduleCode: string;
  name: string;
  description: string | null;
  category: string | null;
  isCore: boolean;
  isBypassable: boolean;
  isActive: boolean;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  parentModuleCode: string | null;
  displayOrder: number;
}

export interface DependencyEdge {
  moduleCode: string;
  isHardDependency: boolean;
  isActive: boolean;
}

export interface ModuleDetail extends ModuleSummary {
  dependsOn: DependencyEdge[];
  dependents: DependencyEdge[];
}

// -- queries -------------------------------------------------------------

interface ListFilters {
  active?: boolean;
  category?: string;
}

export async function listModules(filters: ListFilters = {}): Promise<ModuleSummary[]> {
  const rows = await prisma.module.findMany({
    where: {
      ...(filters.active !== undefined ? { isActive: filters.active } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    include: { parent: { select: { moduleCode: true } } },
    orderBy: [{ displayOrder: 'asc' }, { moduleCode: 'asc' }],
  });
  return rows.map((m) => ({
    moduleCode: m.moduleCode,
    name: m.name,
    description: m.description,
    category: m.category,
    isCore: m.isCore,
    isBypassable: m.isBypassable,
    isActive: m.isActive,
    activatedAt: m.activatedAt,
    deactivatedAt: m.deactivatedAt,
    parentModuleCode: m.parent?.moduleCode ?? null,
    displayOrder: m.displayOrder,
  }));
}

export async function getModule(moduleCode: string): Promise<ModuleDetail> {
  const m = await prisma.module.findUnique({
    where: { moduleCode },
    include: {
      parent: { select: { moduleCode: true } },
      dependencies: {
        include: { dependsOn: { select: { moduleCode: true, isActive: true } } },
      },
      dependentOf: {
        include: { module: { select: { moduleCode: true, isActive: true } } },
      },
    },
  });
  if (!m) throw new NotFoundError(`Module ${moduleCode} not found`);

  return {
    moduleCode: m.moduleCode,
    name: m.name,
    description: m.description,
    category: m.category,
    isCore: m.isCore,
    isBypassable: m.isBypassable,
    isActive: m.isActive,
    activatedAt: m.activatedAt,
    deactivatedAt: m.deactivatedAt,
    parentModuleCode: m.parent?.moduleCode ?? null,
    displayOrder: m.displayOrder,
    dependsOn: m.dependencies.map((d) => ({
      moduleCode: d.dependsOn.moduleCode,
      isHardDependency: d.isHardDependency,
      isActive: d.dependsOn.isActive,
    })),
    dependents: m.dependentOf.map((d) => ({
      moduleCode: d.module.moduleCode,
      isHardDependency: d.isHardDependency,
      isActive: d.module.isActive,
    })),
  };
}

export async function getDependents(moduleCode: string): Promise<DependencyEdge[]> {
  const m = await prisma.module.findUnique({
    where: { moduleCode },
    include: {
      dependentOf: {
        include: { module: { select: { moduleCode: true, isActive: true } } },
      },
    },
  });
  if (!m) throw new NotFoundError(`Module ${moduleCode} not found`);
  return m.dependentOf.map((d) => ({
    moduleCode: d.module.moduleCode,
    isHardDependency: d.isHardDependency,
    isActive: d.module.isActive,
  }));
}

// -- mutations -----------------------------------------------------------

export interface ToggleResult {
  moduleCode: string;
  previousState: 'active' | 'inactive';
  newState: 'active' | 'inactive';
  noop: boolean;
}

async function recordHistory(args: {
  moduleId: string;
  action: 'activated' | 'deactivated';
  reason?: string;
  actorUserId?: string;
}): Promise<void> {
  await prisma.moduleActivationHistory.create({
    data: {
      moduleId: args.moduleId,
      action: args.action,
      reason: args.reason,
      actorUserId: args.actorUserId,
    },
  });
}

export async function activateModule(args: {
  moduleCode: string;
  actorUserId?: string;
  reason?: string;
}): Promise<ToggleResult> {
  const m = await prisma.module.findUnique({
    where: { moduleCode: args.moduleCode },
    include: {
      dependencies: {
        where: { isHardDependency: true },
        include: { dependsOn: { select: { moduleCode: true, isActive: true } } },
      },
    },
  });
  if (!m) throw new NotFoundError(`Module ${args.moduleCode} not found`);
  if (m.isActive) {
    return {
      moduleCode: m.moduleCode,
      previousState: 'active',
      newState: 'active',
      noop: true,
    };
  }

  const missingDeps = m.dependencies.filter((d) => !d.dependsOn.isActive);
  if (missingDeps.length > 0) {
    throw new ConflictError('Cannot activate: hard dependencies are inactive', {
      module: m.moduleCode,
      missing: missingDeps.map((d) => d.dependsOn.moduleCode),
    });
  }

  await prisma.module.update({
    where: { id: m.id },
    data: { isActive: true, activatedAt: new Date(), deactivatedAt: null },
  });
  await recordHistory({
    moduleId: m.id,
    action: 'activated',
    reason: args.reason,
    actorUserId: args.actorUserId,
  });

  invalidateActiveCache();
  invalidatePermissions();

  return {
    moduleCode: m.moduleCode,
    previousState: 'inactive',
    newState: 'active',
    noop: false,
  };
}

export async function deactivateModule(args: {
  moduleCode: string;
  actorUserId?: string;
  reason?: string;
}): Promise<ToggleResult> {
  const m = await prisma.module.findUnique({
    where: { moduleCode: args.moduleCode },
    include: {
      dependentOf: {
        where: { isHardDependency: true },
        include: { module: { select: { moduleCode: true, isActive: true } } },
      },
    },
  });
  if (!m) throw new NotFoundError(`Module ${args.moduleCode} not found`);

  if (m.isCore) {
    throw new ValidationError('Core modules cannot be disabled', {
      module: m.moduleCode,
    });
  }
  if (!m.isActive) {
    return {
      moduleCode: m.moduleCode,
      previousState: 'inactive',
      newState: 'inactive',
      noop: true,
    };
  }

  const activeDependents = m.dependentOf.filter((d) => d.module.isActive);
  if (activeDependents.length > 0) {
    throw new ConflictError('Cannot deactivate: active modules depend on this one', {
      module: m.moduleCode,
      activeDependents: activeDependents.map((d) => d.module.moduleCode),
    });
  }

  await prisma.module.update({
    where: { id: m.id },
    data: { isActive: false, deactivatedAt: new Date() },
  });
  await recordHistory({
    moduleId: m.id,
    action: 'deactivated',
    reason: args.reason,
    actorUserId: args.actorUserId,
  });

  invalidateActiveCache();
  invalidatePermissions();

  return {
    moduleCode: m.moduleCode,
    previousState: 'active',
    newState: 'inactive',
    noop: false,
  };
}

// -- growth path --------------------------------------------------------

/**
 * Suggested order in which a small company should turn modules on as they
 * grow. Static — based on dependency direction and typical onboarding.
 * Foundation modules are assumed already on.
 */
const GROWTH_PATH: { stage: string; modules: string[] }[] = [
  { stage: '1. Master data (start here)', modules: ['CUSTOMER', 'PRODUCT', 'VENDOR'] },
  { stage: '2. Selling',                   modules: ['ORDER', 'PAY_TERMS', 'DOC_GEN'] },
  { stage: '3. Engineering',               modules: ['MATERIAL', 'PROCESS', 'BOM', 'COSTING'] },
  { stage: '4. Procurement',               modules: ['PURCHASE', 'GRN', 'IMPORT', 'QC'] },
  { stage: '5. Inventory',                 modules: ['STORAGE', 'INVENTORY', 'MATERIAL_ISSUE'] },
  { stage: '6. Production',                modules: ['PRODUCTION', 'PANEL_QR', 'NESTING', 'JOB_WORK'] },
];

export interface GrowthPathStage {
  stage: string;
  modules: { moduleCode: string; isActive: boolean; name: string }[];
}

export async function getGrowthPath(): Promise<GrowthPathStage[]> {
  const allCodes = GROWTH_PATH.flatMap((s) => s.modules);
  const rows = await prisma.module.findMany({
    where: { moduleCode: { in: allCodes } },
    select: { moduleCode: true, name: true, isActive: true },
  });
  const byCode = new Map(rows.map((r) => [r.moduleCode, r]));
  return GROWTH_PATH.map((stage) => ({
    stage: stage.stage,
    modules: stage.modules.map((code) => {
      const m = byCode.get(code);
      return {
        moduleCode: code,
        name: m?.name ?? code,
        isActive: m?.isActive ?? false,
      };
    }),
  }));
}

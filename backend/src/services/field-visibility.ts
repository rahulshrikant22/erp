/**
 * Field-visibility config — admin CRUD for `core.field_visibility_config`.
 *
 * Stored shape (per row):  (role_id, target_entity, field_code) → visibility
 * Visibility levels: visible | readonly | hidden.
 *
 * The permission resolver (services/permissions.ts) already consumes this
 * table and merges the most-permissive setting across the user's roles. So
 * once an admin posts here, the resolver picks it up on the next cache
 * miss / invalidation. We invalidate explicitly on every mutation so it's
 * immediate.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { invalidateAll as invalidateRbacCache } from './permissions';

export type Visibility = 'visible' | 'readonly' | 'hidden';
const VISIBILITY: ReadonlySet<Visibility> = new Set(['visible', 'readonly', 'hidden']);

export interface FieldVisibilityRow {
  id: string;
  roleId: string;
  roleCode: string;
  targetEntity: string;
  fieldCode: string;
  visibility: Visibility;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

interface ListFilters {
  targetEntity?: string;
  roleId?: string;
}

export async function listFieldVisibility(
  filters: ListFilters,
): Promise<FieldVisibilityRow[]> {
  const where: Prisma.FieldVisibilityConfigWhereInput = {
    ...(filters.targetEntity ? { targetEntity: filters.targetEntity } : {}),
    ...(filters.roleId ? { roleId: filters.roleId } : {}),
  };
  const rows = await prisma.fieldVisibilityConfig.findMany({
    where,
    include: { role: { select: { roleCode: true } } },
    orderBy: [{ targetEntity: 'asc' }, { fieldCode: 'asc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    roleId: r.roleId,
    roleCode: r.role.roleCode,
    targetEntity: r.targetEntity,
    fieldCode: r.fieldCode,
    visibility: r.visibility as Visibility,
    displayOrder: r.displayOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export interface BulkVisibilityEntry {
  fieldCode: string;
  visibility: string;
  displayOrder?: number;
}

/**
 * Replace the visibility set for (roleId, targetEntity) with the given list.
 * Any existing rows for that pair NOT in the list are removed.
 *
 * This is the natural unit of editing — the admin UI surfaces "edit fields
 * for role X on entity Y" as one form, and submits the whole list.
 */
export async function bulkUpsertVisibility(args: {
  roleId: string;
  targetEntity: string;
  entries: BulkVisibilityEntry[];
}): Promise<FieldVisibilityRow[]> {
  const role = await prisma.role.findUnique({ where: { id: args.roleId } });
  if (!role) throw new NotFoundError('Role not found');

  for (const e of args.entries) {
    if (!VISIBILITY.has(e.visibility as Visibility)) {
      throw new ValidationError(
        `Invalid visibility "${e.visibility}". Allowed: visible | readonly | hidden`,
        { fieldCode: e.fieldCode },
      );
    }
  }

  const desiredCodes = new Set(args.entries.map((e) => e.fieldCode));
  const existing = await prisma.fieldVisibilityConfig.findMany({
    where: { roleId: args.roleId, targetEntity: args.targetEntity },
  });
  const existingByCode = new Map(existing.map((r) => [r.fieldCode, r]));

  // Delete rows we no longer want.
  const toDeleteIds = existing
    .filter((r) => !desiredCodes.has(r.fieldCode))
    .map((r) => r.id);
  if (toDeleteIds.length > 0) {
    await rawPrisma.fieldVisibilityConfig.deleteMany({
      where: { id: { in: toDeleteIds } },
    });
  }

  // Upsert each desired row. Sequential keeps audit log entries deterministic.
  for (const e of args.entries) {
    const cur = existingByCode.get(e.fieldCode);
    if (cur) {
      if (
        cur.visibility !== e.visibility ||
        cur.displayOrder !== (e.displayOrder ?? 0)
      ) {
        await prisma.fieldVisibilityConfig.update({
          where: { id: cur.id },
          data: { visibility: e.visibility, displayOrder: e.displayOrder ?? 0 },
        });
      }
    } else {
      await prisma.fieldVisibilityConfig.create({
        data: {
          roleId: args.roleId,
          targetEntity: args.targetEntity,
          fieldCode: e.fieldCode,
          visibility: e.visibility,
          displayOrder: e.displayOrder ?? 0,
        },
      });
    }
  }

  invalidateRbacCache();
  return listFieldVisibility({ roleId: args.roleId, targetEntity: args.targetEntity });
}

export async function updateVisibility(args: {
  id: string;
  visibility?: string;
  displayOrder?: number;
}): Promise<FieldVisibilityRow> {
  const row = await prisma.fieldVisibilityConfig.findUnique({ where: { id: args.id } });
  if (!row) throw new NotFoundError('Field visibility row not found');

  if (args.visibility !== undefined && !VISIBILITY.has(args.visibility as Visibility)) {
    throw new ValidationError('Invalid visibility', { value: args.visibility });
  }

  const data: Record<string, unknown> = {};
  if (args.visibility !== undefined) data.visibility = args.visibility;
  if (args.displayOrder !== undefined) data.displayOrder = args.displayOrder;

  await prisma.fieldVisibilityConfig.update({ where: { id: args.id }, data });
  invalidateRbacCache();
  const r = await prisma.fieldVisibilityConfig.findUniqueOrThrow({
    where: { id: args.id },
    include: { role: { select: { roleCode: true } } },
  });
  return {
    id: r.id,
    roleId: r.roleId,
    roleCode: r.role.roleCode,
    targetEntity: r.targetEntity,
    fieldCode: r.fieldCode,
    visibility: r.visibility as Visibility,
    displayOrder: r.displayOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function deleteVisibility(id: string): Promise<void> {
  const row = await prisma.fieldVisibilityConfig.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('Field visibility row not found');
  await prisma.fieldVisibilityConfig.delete({ where: { id } });
  invalidateRbacCache();
}

/**
 * Compute the most-permissive visibility map for a single user on a single
 * entity. The same merging logic the resolver uses, surfaced here so the
 * field-config endpoint can return ready-to-render data.
 *
 * Returns a record keyed by fieldCode → visibility. Fields not configured
 * default to 'visible' (the convention is "everything is visible unless a
 * rule restricts it").
 */
export async function computeVisibilityForUser(
  userId: string,
  targetEntity: string,
): Promise<Record<string, Visibility>> {
  const u = await rawPrisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        where: {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { roleId: true, role: { select: { isActive: true } } },
      },
    },
  });
  if (!u) {
    throw new ConflictError('Cannot compute visibility for unknown user', { userId });
  }
  const activeRoleIds = u.userRoles.filter((r) => r.role.isActive).map((r) => r.roleId);
  if (activeRoleIds.length === 0) return {};

  const rules = await rawPrisma.fieldVisibilityConfig.findMany({
    where: { roleId: { in: activeRoleIds }, targetEntity },
    select: { fieldCode: true, visibility: true },
  });

  const rank = (v: Visibility): number =>
    v === 'visible' ? 2 : v === 'readonly' ? 1 : 0;

  const out: Record<string, Visibility> = {};
  for (const r of rules) {
    const cur = out[r.fieldCode];
    const next = r.visibility as Visibility;
    if (!cur || rank(next) > rank(cur)) out[r.fieldCode] = next;
  }
  return out;
}

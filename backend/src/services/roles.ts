/**
 * Roles & permissions admin APIs.
 *
 * System roles (super_admin, admin, manager, supervisor, employee, customer)
 * are seeded and protected:
 *   - Cannot be deleted.
 *   - Their permission grants can still be edited (administrators may want
 *     to broaden or narrow them) — but `roleCode` and `isSystemRole` are
 *     immutable.
 *
 * Custom roles can be created freely. "Soft delete" here means flipping
 * `isActive` to false — the schema doesn't have explicit deletion columns
 * on Role, and isActive=false is already used by the resolver to skip
 * granting from inactive roles.
 *
 * Every mutation invalidates the entire RBAC cache because role-permission
 * changes affect every user holding that role.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { invalidateAll as invalidateRbacCache } from './permissions';

export interface RoleSummary {
  id: string;
  roleCode: string;
  name: string;
  description: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissionCount: number;
  userCount: number;
}

interface ListFilters {
  isActive?: boolean;
  isSystemRole?: boolean;
  page: number;
  limit: number;
}

export async function listRoles(filters: ListFilters): Promise<{
  total: number;
  page: number;
  limit: number;
  roles: RoleSummary[];
}> {
  const where: Prisma.RoleWhereInput = {
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.isSystemRole !== undefined ? { isSystemRole: filters.isSystemRole } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.role.count({ where }),
    prisma.role.findMany({
      where,
      orderBy: [{ isSystemRole: 'desc' }, { roleCode: 'asc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      include: {
        _count: {
          select: { rolePermissions: true, userRoles: { where: { isActive: true } } },
        },
      },
    }),
  ]);
  return {
    total,
    page: filters.page,
    limit: filters.limit,
    roles: rows.map((r) => ({
      id: r.id,
      roleCode: r.roleCode,
      name: r.name,
      description: r.description,
      isSystemRole: r.isSystemRole,
      isActive: r.isActive,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      permissionCount: r._count.rolePermissions,
      userCount: r._count.userRoles,
    })),
  };
}

export async function getRole(id: string): Promise<RoleSummary> {
  const r = await prisma.role.findUnique({
    where: { id },
    include: {
      _count: {
        select: { rolePermissions: true, userRoles: { where: { isActive: true } } },
      },
    },
  });
  if (!r) throw new NotFoundError('Role not found');
  return {
    id: r.id,
    roleCode: r.roleCode,
    name: r.name,
    description: r.description,
    isSystemRole: r.isSystemRole,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    permissionCount: r._count.rolePermissions,
    userCount: r._count.userRoles,
  };
}

// -- create / update / delete -------------------------------------------

export interface CreateRoleInput {
  roleCode: string;
  name: string;
  description?: string;
}

export async function createRole(input: CreateRoleInput): Promise<RoleSummary> {
  // System roles are off-limits — guard against an admin trying to create
  // a role that shadows a seeded one.
  if (/^(super_admin|admin|manager|supervisor|employee|customer)$/i.test(input.roleCode)) {
    throw new ConflictError('That role code is reserved for system roles', {
      field: 'roleCode',
    });
  }
  const dup = await prisma.role.findUnique({ where: { roleCode: input.roleCode } });
  if (dup) {
    throw new ConflictError('Role code already exists', { field: 'roleCode' });
  }

  const created = await prisma.role.create({
    data: {
      roleCode: input.roleCode,
      name: input.name,
      description: input.description,
      isSystemRole: false,
      isActive: true,
    },
  });
  invalidateRbacCache();
  return getRole(created.id);
}

export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<RoleSummary> {
  const r = await prisma.role.findUnique({ where: { id } });
  if (!r) throw new NotFoundError('Role not found');
  if (r.isSystemRole && input.isActive === false) {
    throw new ConflictError('Cannot deactivate a system role', { roleCode: r.roleCode });
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.isActive !== undefined && !r.isSystemRole) data.isActive = input.isActive;

  await prisma.role.update({ where: { id }, data });
  invalidateRbacCache();
  return getRole(id);
}

/**
 * Soft delete: flip isActive to false. Refuses on system roles, refuses if
 * any users hold the role.
 */
export async function softDeleteRole(id: string): Promise<void> {
  const r = await prisma.role.findUnique({ where: { id } });
  if (!r) throw new NotFoundError('Role not found');
  if (r.isSystemRole) {
    throw new ConflictError('Cannot delete a system role', { roleCode: r.roleCode });
  }
  if (!r.isActive) return; // idempotent

  const userCount = await prisma.userRole.count({
    where: { roleId: id, isActive: true },
  });
  if (userCount > 0) {
    throw new ConflictError(`Cannot delete: ${userCount} user(s) hold this role`, {
      activeUsers: userCount,
    });
  }

  await prisma.role.update({
    where: { id },
    data: { isActive: false },
  });
  invalidateRbacCache();
}

// -- role permissions --------------------------------------------------

export interface RoleAssignment {
  permissionId?: string;
  permissionCode?: string;
  scopeFilter?: Record<string, unknown> | null;
}

export interface RolePermissionRow {
  id: string;
  permissionCode: string;
  scopeFilter: unknown;
}

export async function getRolePermissions(roleId: string): Promise<RolePermissionRow[]> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw new NotFoundError('Role not found');
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: { select: { permissionCode: true } } },
    orderBy: { permission: { permissionCode: 'asc' } },
  });
  return rows.map((rp) => ({
    id: rp.id,
    permissionCode: rp.permission.permissionCode,
    scopeFilter: rp.scopeFilter,
  }));
}

/**
 * Replace the role's full permission set with the supplied list. Each entry
 * may identify the permission by `permissionId` OR `permissionCode` (one
 * required) and may carry a JSON `scopeFilter` to constrain matching grants.
 *
 * Every mutation runs within a single transaction so partial updates can't
 * leave orphaned grants. Cache invalidated globally on success.
 */
export async function setRolePermissions(
  roleId: string,
  assignments: RoleAssignment[],
): Promise<RolePermissionRow[]> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new NotFoundError('Role not found');

  // Resolve every assignment to a concrete permission id up front.
  const codes = assignments.filter((a) => a.permissionCode).map((a) => a.permissionCode!);
  const ids = assignments.filter((a) => a.permissionId).map((a) => a.permissionId!);

  const byCode = codes.length
    ? new Map(
        (
          await prisma.permission.findMany({
            where: { permissionCode: { in: codes } },
            select: { id: true, permissionCode: true },
          })
        ).map((p) => [p.permissionCode, p.id]),
      )
    : new Map<string, string>();
  const knownIds = ids.length
    ? new Set(
        (
          await prisma.permission.findMany({
            where: { id: { in: ids } },
            select: { id: true },
          })
        ).map((p) => p.id),
      )
    : new Set<string>();

  const resolved: { permissionId: string; scopeFilter: unknown }[] = [];
  for (const a of assignments) {
    let id: string | undefined;
    if (a.permissionId) {
      if (!knownIds.has(a.permissionId)) {
        throw new ValidationError('Unknown permission id', { value: a.permissionId });
      }
      id = a.permissionId;
    } else if (a.permissionCode) {
      id = byCode.get(a.permissionCode);
      if (!id) {
        throw new ValidationError('Unknown permission code', { value: a.permissionCode });
      }
    } else {
      throw new ValidationError('Each assignment requires permissionId or permissionCode');
    }
    resolved.push({ permissionId: id, scopeFilter: a.scopeFilter ?? null });
  }

  // Replace strategy: delete all, recreate. Done in a transaction so an
  // empty intermediate state is never visible to readers.
  // Prisma JSON nullability quirk: `null` in a `Json?` column is represented
  // as `Prisma.JsonNull` for createMany; the omitted/`undefined` form leaves
  // the column unset rather than nullified. We want explicit null.
  const Pjson = (await import('@prisma/client')).Prisma;
  await rawPrisma.$transaction([
    rawPrisma.rolePermission.deleteMany({ where: { roleId } }),
    rawPrisma.rolePermission.createMany({
      data: resolved.map((r) => ({
        roleId,
        permissionId: r.permissionId,
        scopeFilter:
          r.scopeFilter == null
            ? Pjson.JsonNull
            : (r.scopeFilter as Prisma.InputJsonValue),
      })),
      skipDuplicates: true,
    }),
  ]);

  invalidateRbacCache();
  return getRolePermissions(roleId);
}

// -- role users -------------------------------------------------------

export async function getRoleUsers(
  roleId: string,
  page: number,
  limit: number,
): Promise<{
  total: number;
  page: number;
  limit: number;
  users: { id: string; email: string; firstName: string; lastName: string; isActive: boolean }[];
}> {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw new NotFoundError('Role not found');

  const [total, rows] = await Promise.all([
    prisma.userRole.count({ where: { roleId, isActive: true } }),
    prisma.userRole.findMany({
      where: { roleId, isActive: true },
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true, isActive: true, isDeleted: true },
        },
      },
      orderBy: { user: { email: 'asc' } },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return {
    total,
    page,
    limit,
    users: rows
      .filter((r) => !r.user.isDeleted)
      .map((r) => ({
        id: r.user.id,
        email: r.user.email,
        firstName: r.user.firstName,
        lastName: r.user.lastName,
        isActive: r.user.isActive,
      })),
  };
}

// -- permissions registry --------------------------------------------

export async function listAllPermissions(filters: { module?: string }): Promise<{
  total: number;
  permissions: {
    id: string;
    permissionCode: string;
    moduleCode: string | null;
    feature: string;
    action: string;
    description: string | null;
  }[];
}> {
  const where: Prisma.PermissionWhereInput = {};
  if (filters.module) {
    where.module = { moduleCode: filters.module };
  }
  const rows = await prisma.permission.findMany({
    where,
    orderBy: [{ permissionCode: 'asc' }],
    include: { module: { select: { moduleCode: true } } },
  });
  return {
    total: rows.length,
    permissions: rows.map((p) => ({
      id: p.id,
      permissionCode: p.permissionCode,
      moduleCode: p.module?.moduleCode ?? null,
      feature: p.feature,
      action: p.action,
      description: p.description,
    })),
  };
}

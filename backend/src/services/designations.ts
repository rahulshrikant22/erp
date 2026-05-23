/**
 * Designations — CRUD. Linked optionally to a department; used as user
 * designations and (later) HR roles. No hierarchy here.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getOrganizationContext } from './organization';

export interface DesignationView {
  id: string;
  organizationId: string;
  departmentId: string | null;
  code: string;
  name: string;
  level: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListDesignationFilters {
  departmentId?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

async function assertDepartmentExists(deptId: string, orgId: string): Promise<void> {
  const d = await rawPrisma.department.findUnique({ where: { id: deptId } });
  if (!d) throw new ValidationError('Unknown departmentId', { field: 'departmentId' });
  if (d.organizationId !== orgId) {
    throw new ValidationError('Department belongs to a different organization', {
      field: 'departmentId',
    });
  }
}

export async function listDesignations(filters: ListDesignationFilters): Promise<{
  total: number;
  page: number;
  limit: number;
  designations: DesignationView[];
}> {
  const where: Prisma.DesignationWhereInput = {
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.designation.count({ where }),
    prisma.designation.findMany({
      where,
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return { total, page: filters.page, limit: filters.limit, designations: rows };
}

export async function getDesignation(id: string): Promise<DesignationView> {
  const d = await prisma.designation.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Designation not found');
  return d;
}

export interface CreateDesignationInput {
  code: string;
  name: string;
  departmentId?: string;
  level?: number;
}

export async function createDesignation(
  input: CreateDesignationInput,
): Promise<DesignationView> {
  const org = await getOrganizationContext();
  const dup = await prisma.designation.findFirst({
    where: { organizationId: org.id, code: input.code },
  });
  if (dup) {
    throw new ConflictError('Designation code already exists in this organization', {
      field: 'code',
    });
  }
  if (input.departmentId) await assertDepartmentExists(input.departmentId, org.id);

  return prisma.designation.create({
    data: {
      organizationId: org.id,
      departmentId: input.departmentId,
      code: input.code,
      name: input.name,
      level: input.level,
      isActive: true,
    },
  });
}

export interface UpdateDesignationInput {
  name?: string;
  departmentId?: string | null;
  level?: number | null;
  isActive?: boolean;
}

export async function updateDesignation(
  id: string,
  input: UpdateDesignationInput,
): Promise<DesignationView> {
  const d = await prisma.designation.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Designation not found');

  if (input.departmentId !== undefined && input.departmentId !== null) {
    await assertDepartmentExists(input.departmentId, d.organizationId);
  }

  const data: Record<string, unknown> = {};
  for (const k of ['name', 'departmentId', 'level', 'isActive'] as const) {
    if (input[k] !== undefined) data[k] = input[k] as unknown;
  }
  return prisma.designation.update({ where: { id }, data });
}

export async function deleteDesignation(id: string): Promise<void> {
  const userCount = await prisma.user.count({
    where: { designationId: id, isDeleted: false },
  });
  if (userCount > 0) {
    throw new ConflictError(
      `Cannot delete: ${userCount} user(s) hold this designation`,
      { activeUsers: userCount },
    );
  }
  await prisma.designation.delete({ where: { id } });
}

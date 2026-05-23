/**
 * Departments — CRUD with self-referential parent_department_id (hierarchical).
 *
 * Cycle prevention on update: when changing parentId, walk up the chain from
 * the candidate parent and refuse if we hit `id`.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getOrganizationContext } from './organization';

export interface DepartmentView {
  id: string;
  organizationId: string;
  branchId: string | null;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toView(d: DepartmentView): DepartmentView {
  return d;
}

export interface ListDeptFilters {
  branchId?: string;
  parentId?: string | null;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listDepartments(filters: ListDeptFilters): Promise<{
  total: number;
  page: number;
  limit: number;
  departments: DepartmentView[];
}> {
  const where: Prisma.DepartmentWhereInput = {
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.parentId === null ? { parentId: null } : {}),
    ...(filters.parentId && filters.parentId !== null ? { parentId: filters.parentId } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.department.count({ where }),
    prisma.department.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return {
    total,
    page: filters.page,
    limit: filters.limit,
    departments: rows.map(toView),
  };
}

export async function getDepartment(id: string): Promise<DepartmentView> {
  const d = await prisma.department.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Department not found');
  return toView(d);
}

export interface CreateDeptInput {
  code: string;
  name: string;
  description?: string;
  branchId?: string;
  parentId?: string;
}

async function assertBranchExists(branchId: string): Promise<void> {
  const b = await rawPrisma.branch.findUnique({ where: { id: branchId } });
  if (!b || b.isDeleted) {
    throw new ValidationError('Unknown branchId', { field: 'branchId' });
  }
}
async function assertParentExists(parentId: string, organizationId: string): Promise<void> {
  const p = await rawPrisma.department.findUnique({ where: { id: parentId } });
  if (!p) throw new ValidationError('Unknown parentId', { field: 'parentId' });
  if (p.organizationId !== organizationId) {
    throw new ValidationError('Parent department belongs to a different organization', {
      field: 'parentId',
    });
  }
}

export async function createDepartment(input: CreateDeptInput): Promise<DepartmentView> {
  const org = await getOrganizationContext();

  const dup = await prisma.department.findFirst({
    where: { organizationId: org.id, code: input.code },
  });
  if (dup) {
    throw new ConflictError('Department code already exists in this organization', {
      field: 'code',
    });
  }
  if (input.branchId) await assertBranchExists(input.branchId);
  if (input.parentId) await assertParentExists(input.parentId, org.id);

  const created = await prisma.department.create({
    data: {
      organizationId: org.id,
      branchId: input.branchId,
      parentId: input.parentId,
      code: input.code,
      name: input.name,
      description: input.description,
      isActive: true,
    },
  });
  return toView(created);
}

export interface UpdateDeptInput {
  name?: string;
  description?: string | null;
  branchId?: string | null;
  parentId?: string | null;
  isActive?: boolean;
}

async function wouldCreateCycle(targetId: string, candidateParentId: string): Promise<boolean> {
  let cursor: string | null = candidateParentId;
  // Bounded walk — depth cap stops pathological data.
  for (let i = 0; cursor && i < 100; i++) {
    if (cursor === targetId) return true;
    const next: { parentId: string | null } | null = await rawPrisma.department.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = next?.parentId ?? null;
  }
  return false;
}

export async function updateDepartment(
  id: string,
  input: UpdateDeptInput,
): Promise<DepartmentView> {
  const d = await prisma.department.findUnique({ where: { id } });
  if (!d) throw new NotFoundError('Department not found');

  if (input.parentId !== undefined && input.parentId !== null) {
    if (input.parentId === id) {
      throw new ValidationError('A department cannot be its own parent', { field: 'parentId' });
    }
    await assertParentExists(input.parentId, d.organizationId);
    if (await wouldCreateCycle(id, input.parentId)) {
      throw new ConflictError(
        'Refusing parent change: it would create a cycle in the department hierarchy',
        { field: 'parentId' },
      );
    }
  }
  if (input.branchId !== undefined && input.branchId !== null) {
    await assertBranchExists(input.branchId);
  }

  const data: Record<string, unknown> = {};
  for (const k of ['name', 'description', 'branchId', 'parentId', 'isActive'] as const) {
    if (input[k] !== undefined) data[k] = input[k] as unknown;
  }
  const updated = await prisma.department.update({ where: { id }, data });
  return toView(updated);
}

export async function deleteDepartment(id: string): Promise<void> {
  // Block delete if children or active designations / users reference it.
  const children = await prisma.department.count({ where: { parentId: id } });
  if (children > 0) {
    throw new ConflictError(`Cannot delete: ${children} child department(s) reference this`, {
      childCount: children,
    });
  }
  const userCount = await prisma.user.count({
    where: { departmentId: id, isDeleted: false },
  });
  if (userCount > 0) {
    throw new ConflictError(
      `Cannot delete: ${userCount} user(s) are assigned to this department`,
      { activeUsers: userCount },
    );
  }
  // Hard delete is fine here — Department doesn't have soft-delete columns
  // in the schema. The audit trail captures the deletion via the Prisma
  // extension automatically.
  await prisma.department.delete({ where: { id } });
}

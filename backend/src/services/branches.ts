/**
 * Branches CRUD. A branch is a physical site under the organization
 * (head office, factory, warehouse, showroom). Each can have its own GSTIN
 * for multi-state India operations.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getOrganizationContext } from './organization';

export type BranchType = 'head_office' | 'factory' | 'warehouse' | 'showroom';
const BRANCH_TYPES: ReadonlySet<BranchType> = new Set([
  'head_office',
  'factory',
  'warehouse',
  'showroom',
]);

export interface BranchView {
  id: string;
  organizationId: string;
  branchCode: string;
  name: string;
  branchType: BranchType;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toView(b: { branchType: string } & Omit<BranchView, 'branchType'>): BranchView {
  return { ...b, branchType: b.branchType as BranchType };
}

function assertBranchType(t: string): asserts t is BranchType {
  if (!BRANCH_TYPES.has(t as BranchType)) {
    throw new ValidationError(
      `Unknown branchType "${t}". Allowed: ${[...BRANCH_TYPES].join(', ')}`,
      { field: 'branchType' },
    );
  }
}

export interface ListBranchFilters {
  branchType?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listBranches(filters: ListBranchFilters): Promise<{
  total: number;
  page: number;
  limit: number;
  branches: BranchView[];
}> {
  const where: Prisma.BranchWhereInput = {
    isDeleted: false,
    ...(filters.branchType ? { branchType: filters.branchType } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.branch.count({ where }),
    prisma.branch.findMany({
      where,
      orderBy: [{ branchType: 'asc' }, { name: 'asc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);
  return {
    total,
    page: filters.page,
    limit: filters.limit,
    branches: rows.map(toView),
  };
}

export async function getBranch(id: string): Promise<BranchView> {
  const b = await prisma.branch.findUnique({ where: { id } });
  if (!b || b.isDeleted) throw new NotFoundError('Branch not found');
  return toView(b);
}

export interface CreateBranchInput {
  branchCode: string;
  name: string;
  branchType: string;
  gstin?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export async function createBranch(input: CreateBranchInput): Promise<BranchView> {
  assertBranchType(input.branchType);
  const org = await getOrganizationContext();

  const dup = await prisma.branch.findFirst({
    where: { organizationId: org.id, branchCode: input.branchCode },
  });
  if (dup) {
    throw new ConflictError('Branch code already exists for this organization', {
      field: 'branchCode',
    });
  }

  const created = await prisma.branch.create({
    data: {
      organizationId: org.id,
      branchCode: input.branchCode,
      name: input.name,
      branchType: input.branchType,
      gstin: input.gstin,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country ?? 'India',
      isActive: true,
    },
  });
  return toView(created);
}

export interface UpdateBranchInput {
  name?: string;
  branchType?: string;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string;
  isActive?: boolean;
}

export async function updateBranch(id: string, input: UpdateBranchInput): Promise<BranchView> {
  const b = await prisma.branch.findUnique({ where: { id } });
  if (!b || b.isDeleted) throw new NotFoundError('Branch not found');
  if (input.branchType !== undefined) assertBranchType(input.branchType);

  const data: Record<string, unknown> = {};
  for (const k of [
    'name', 'branchType', 'gstin', 'addressLine1', 'addressLine2',
    'city', 'state', 'postalCode', 'country', 'isActive',
  ] as const) {
    if (input[k] !== undefined) data[k] = input[k] as unknown;
  }

  const updated = await prisma.branch.update({ where: { id }, data });
  return toView(updated);
}

export async function softDeleteBranch(args: {
  id: string;
  actorUserId?: string;
}): Promise<void> {
  const b = await prisma.branch.findUnique({ where: { id: args.id } });
  if (!b) throw new NotFoundError('Branch not found');
  if (b.isDeleted) return;

  // Block deletion if there are active users or departments under this branch.
  // (Soft-delete keeps the row, but the spec implies branches are hierarchy
  // anchors — better to fail loudly than silently orphan data.)
  const userCount = await prisma.user.count({
    where: { branchId: args.id, isDeleted: false },
  });
  if (userCount > 0) {
    throw new ConflictError(
      `Cannot delete branch: ${userCount} active user(s) are assigned to it`,
      { activeUsers: userCount },
    );
  }
  const deptCount = await prisma.department.count({
    where: { branchId: args.id, isActive: true },
  });
  if (deptCount > 0) {
    throw new ConflictError(
      `Cannot delete branch: ${deptCount} active department(s) live under it`,
      { activeDepartments: deptCount },
    );
  }

  await prisma.branch.update({
    where: { id: args.id },
    data: {
      isDeleted: true,
      isActive: false,
      deletedAt: new Date(),
      deletedById: args.actorUserId,
    },
  });
}

export async function reactivateBranch(id: string): Promise<BranchView> {
  const b = await prisma.branch.findUnique({ where: { id } });
  if (!b) throw new NotFoundError('Branch not found');
  if (!b.isDeleted && b.isActive) return toView(b);
  const updated = await prisma.branch.update({
    where: { id },
    data: { isDeleted: false, deletedAt: null, deletedById: null, isActive: true },
  });
  return toView(updated);
}

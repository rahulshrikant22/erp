import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateSelectionListInput {
  orderId: string;
  finishGroupName?: string | null;
  notes?: string | null;
}

export interface UpdateSelectionListInput {
  finishGroupName?: string | null;
  notes?: string | null;
}

export interface ListSelectionListsFilter {
  orderId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface AddItemInput {
  orderLineId?: string | null;
  bomMaterialLineId: string;
  selectedMaterialId: string;
  alternateChosen?: boolean;
  quantityOverride?: number | null;
  notes?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function generateSelectionListCode(orderId: string): Promise<string> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  if (!order) throw new NotFoundError('Order not found');

  const count = await prisma.selectionList.count({ where: { orderId } });
  const seq = String(count + 1).padStart(4, '0');
  return `SL-${order.orderNumber}-${seq}`;
}

function ensureDraft(status: string) {
  if (status !== 'draft') throw new ValidationError('Can only edit draft selection lists');
}

// ─── Selection list include ─────────────────────────────────────────────────────

const SL_INCLUDE = {
  order: { select: { id: true, orderNumber: true } },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      bomMaterialLine: {
        include: {
          materialCategory: true,
          materialType: true,
          specificMaterial: true,
        },
      },
      selectedMaterial: {
        select: { id: true, materialCode: true, materialName: true },
      },
      orderLine: {
        select: { id: true, lineSequence: true },
      },
    },
  },
};

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export async function createSelectionList(input: CreateSelectionListInput) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new NotFoundError('Order not found');

  const code = await generateSelectionListCode(input.orderId);

  const sl = await prisma.selectionList.create({
    data: {
      selectionListCode: code,
      orderId: input.orderId,
      finishGroupName: input.finishGroupName ?? null,
      notes: input.notes ?? null,
      status: 'draft',
    },
    include: SL_INCLUDE,
  });

  return sl;
}

export async function listSelectionLists(filter: ListSelectionListsFilter) {
  const where: Prisma.SelectionListWhereInput = { isDeleted: false };

  if (filter.orderId) where.orderId = filter.orderId;
  if (filter.status) where.status = filter.status;

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, selectionLists] = await Promise.all([
    prisma.selectionList.count({ where }),
    prisma.selectionList.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true } },
        _count: { select: { items: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, selectionLists };
}

export async function getSelectionList(id: string) {
  const sl = await prisma.selectionList.findUnique({
    where: { id },
    include: SL_INCLUDE,
  });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  return sl;
}

export async function updateSelectionList(id: string, input: UpdateSelectionListInput) {
  const sl = await prisma.selectionList.findUnique({ where: { id } });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  ensureDraft(sl.status);

  return prisma.selectionList.update({
    where: { id },
    data: {
      ...(input.finishGroupName !== undefined && { finishGroupName: input.finishGroupName }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: SL_INCLUDE,
  });
}

export async function deleteSelectionList(id: string) {
  const sl = await prisma.selectionList.findUnique({ where: { id } });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');

  if (sl.status === 'applied_to_bom') {
    throw new ConflictError('Cannot delete selection list already applied to BOM', { code: 'IN_USE' });
  }

  await prisma.selectionList.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), status: 'archived' },
  });
}

// ─── Items ──────────────────────────────────────────────────────────────────────

export async function addItem(selectionListId: string, input: AddItemInput) {
  const sl = await prisma.selectionList.findUnique({ where: { id: selectionListId } });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  ensureDraft(sl.status);

  const bomLine = await prisma.bomMaterialLine.findUnique({ where: { id: input.bomMaterialLineId } });
  if (!bomLine) throw new NotFoundError('BOM material line not found');

  const material = await prisma.material.findUnique({ where: { id: input.selectedMaterialId } });
  if (!material) throw new NotFoundError('Material not found');

  const item = await prisma.selectionListItem.create({
    data: {
      selectionListId,
      orderLineId: input.orderLineId ?? null,
      bomMaterialLineId: input.bomMaterialLineId,
      selectedMaterialId: input.selectedMaterialId,
      alternateChosen: input.alternateChosen ?? false,
      quantityOverride: input.quantityOverride ?? null,
      notes: input.notes ?? null,
    },
    include: {
      bomMaterialLine: { include: { materialCategory: true, materialType: true, specificMaterial: true } },
      selectedMaterial: { select: { id: true, materialCode: true, materialName: true } },
    },
  });

  return item;
}

export async function updateItem(
  selectionListId: string,
  itemId: string,
  input: Partial<Omit<AddItemInput, 'bomMaterialLineId'>>,
) {
  const sl = await prisma.selectionList.findUnique({ where: { id: selectionListId } });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  ensureDraft(sl.status);

  const item = await prisma.selectionListItem.findUnique({ where: { id: itemId } });
  if (!item || item.selectionListId !== selectionListId) throw new NotFoundError('Item not found');

  return prisma.selectionListItem.update({
    where: { id: itemId },
    data: {
      ...(input.selectedMaterialId !== undefined && { selectedMaterialId: input.selectedMaterialId }),
      ...(input.alternateChosen !== undefined && { alternateChosen: input.alternateChosen }),
      ...(input.quantityOverride !== undefined && { quantityOverride: input.quantityOverride }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: {
      bomMaterialLine: { include: { materialCategory: true, materialType: true, specificMaterial: true } },
      selectedMaterial: { select: { id: true, materialCode: true, materialName: true } },
    },
  });
}

export async function deleteItem(selectionListId: string, itemId: string) {
  const sl = await prisma.selectionList.findUnique({ where: { id: selectionListId } });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  ensureDraft(sl.status);

  const item = await prisma.selectionListItem.findUnique({ where: { id: itemId } });
  if (!item || item.selectionListId !== selectionListId) throw new NotFoundError('Item not found');

  await prisma.selectionListItem.delete({ where: { id: itemId } });
}

// ─── Workflow transitions ───────────────────────────────────────────────────────

export async function submitSelectionList(
  id: string,
  submittedBy: { type: string; userId?: string },
) {
  const sl = await prisma.selectionList.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  if (sl.status !== 'draft') throw new ValidationError('Only draft selection lists can be submitted');
  if (sl._count.items === 0) throw new ValidationError('Selection list must have at least one item');

  return prisma.selectionList.update({
    where: { id },
    data: {
      status: 'submitted',
      submittedByType: submittedBy.type,
      submittedByUserId: submittedBy.userId ?? null,
      submittedAt: new Date(),
    },
    include: SL_INCLUDE,
  });
}

export async function approveSelectionList(id: string, approvedBy?: string) {
  const sl = await prisma.selectionList.findUnique({ where: { id } });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  if (sl.status !== 'submitted') throw new ValidationError('Only submitted selection lists can be approved');

  return prisma.selectionList.update({
    where: { id },
    data: {
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    },
    include: SL_INCLUDE,
  });
}

export async function rejectSelectionList(id: string) {
  const sl = await prisma.selectionList.findUnique({ where: { id } });
  if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
  if (sl.status !== 'submitted') throw new ValidationError('Only submitted selection lists can be rejected');

  return prisma.selectionList.update({
    where: { id },
    data: { status: 'draft' },
    include: SL_INCLUDE,
  });
}

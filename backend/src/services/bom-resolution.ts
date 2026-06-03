import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { calculateProcessCost } from './processes';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ResolveInput {
  orderId: string;
  orderLineId: string;
  bomVersionId: string;
  selectionListId?: string | null;
  resolvedBy?: string | null;
}

export interface ListResolvedFilter {
  orderId?: string;
  orderLineId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

const RESOLVED_INCLUDE = {
  order: { select: { id: true, orderNumber: true } },
  orderLine: { select: { id: true, lineSequence: true } },
  bomVersion: {
    select: {
      id: true,
      versionNumber: true,
      bom: { select: { id: true, bomCode: true, bomName: true } },
    },
  },
  selectionList: { select: { id: true, selectionListCode: true } },
  materialLines: {
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      bomMaterialLine: { select: { id: true, lineSequence: true, lineType: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  processLines: {
    include: {
      process: { select: { id: true, processCode: true, processName: true } },
      bomProcessLine: { select: { id: true, lineSequence: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

// ─── Resolution Engine ──────────────────────────────────────────────────────────

export async function resolveBom(input: ResolveInput) {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) throw new NotFoundError('Order not found');

  const orderLine = await prisma.orderLine.findUnique({ where: { id: input.orderLineId } });
  if (!orderLine || orderLine.orderId !== input.orderId) throw new NotFoundError('Order line not found');

  const bomVersion = await prisma.bomVersion.findUnique({
    where: { id: input.bomVersionId },
    include: {
      materialLines: {
        where: { lineType: 'primary' },
        orderBy: { lineSequence: 'asc' },
      },
      processLines: {
        orderBy: { lineSequence: 'asc' },
        include: { process: true },
      },
    },
  });
  if (!bomVersion || bomVersion.isDeleted) throw new NotFoundError('BOM version not found');

  let selectionMap = new Map<string, { materialId: string; quantityOverride: number | null }>();
  if (input.selectionListId) {
    const sl = await prisma.selectionList.findUnique({
      where: { id: input.selectionListId },
      include: { items: true },
    });
    if (!sl || sl.isDeleted) throw new NotFoundError('Selection list not found');
    if (sl.status !== 'approved') throw new ValidationError('Selection list must be approved before resolution');

    for (const item of sl.items) {
      selectionMap.set(item.bomMaterialLineId, {
        materialId: item.selectedMaterialId,
        quantityOverride: item.quantityOverride ? Number(item.quantityOverride) : null,
      });
    }
  }

  const orderQty = Number(orderLine.quantity);

  const resolved = await prisma.resolvedBom.create({
    data: {
      orderId: input.orderId,
      orderLineId: input.orderLineId,
      bomVersionId: input.bomVersionId,
      selectionListId: input.selectionListId ?? null,
      resolvedBy: input.resolvedBy ?? null,
      resolvedAt: new Date(),
      status: 'draft',
    },
  });

  let totalMaterialCost = new Prisma.Decimal(0);

  for (const ml of bomVersion.materialLines) {
    const selection = selectionMap.get(ml.id);
    const materialId = selection?.materialId ?? ml.specificMaterialId;
    if (!materialId) continue;

    const material = await prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true },
    });
    if (!material) continue;

    const qty = selection?.quantityOverride ?? Number(ml.quantityPerUnit);
    const wastage = Number(ml.wastagePercent);
    const qtyWithWastage = qty * (1 + wastage / 100);
    const totalQty = qtyWithWastage * orderQty;
    const unitCost = 0;
    const lineCost = totalQty * unitCost;

    await prisma.resolvedBomMaterialLine.create({
      data: {
        resolvedBomId: resolved.id,
        bomMaterialLineId: ml.id,
        materialId,
        quantityRequired: qty * orderQty,
        uom: ml.uom,
        wastagePercentApplied: ml.wastagePercent,
        theoreticalQuantityWithWastage: totalQty,
        unitCostAtResolution: unitCost,
        lineCost: Math.round(lineCost * 100) / 100,
      },
    });

    totalMaterialCost = totalMaterialCost.add(new Prisma.Decimal(Math.round(lineCost * 100) / 100));
  }

  for (const pl of bomVersion.processLines) {
    const costResult = calculateProcessCost(pl.process, {
      quantity: Number(pl.quantity) * orderQty,
      timeMinutes: pl.timePerUnitMinutes ? Number(pl.timePerUnitMinutes) : undefined,
    });

    await prisma.resolvedBomProcessLine.create({
      data: {
        resolvedBomId: resolved.id,
        bomProcessLineId: pl.id,
        processId: pl.processId,
        quantity: Number(pl.quantity) * orderQty,
        timePerUnitMinutes: pl.timePerUnitMinutes,
        costPerUnitAtResolution: costResult.totalCost,
      },
    });
  }

  if (input.selectionListId) {
    await prisma.selectionList.update({
      where: { id: input.selectionListId },
      data: { status: 'applied_to_bom' },
    });
  }

  await prisma.resolvedBom.update({
    where: { id: resolved.id },
    data: { totalTheoreticalMaterialCost: totalMaterialCost },
  });

  return getResolvedBom(resolved.id);
}

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export async function getResolvedBom(id: string) {
  const rb = await prisma.resolvedBom.findUnique({
    where: { id },
    include: RESOLVED_INCLUDE,
  });
  if (!rb || rb.isDeleted) throw new NotFoundError('Resolved BOM not found');
  return rb;
}

export async function listResolvedBoms(filter: ListResolvedFilter) {
  const where: Prisma.ResolvedBomWhereInput = { isDeleted: false };

  if (filter.orderId) where.orderId = filter.orderId;
  if (filter.orderLineId) where.orderLineId = filter.orderLineId;
  if (filter.status) where.status = filter.status;

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, resolvedBoms] = await Promise.all([
    prisma.resolvedBom.count({ where }),
    prisma.resolvedBom.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true } },
        orderLine: { select: { id: true, lineSequence: true } },
        bomVersion: {
          select: {
            id: true,
            versionNumber: true,
            bom: { select: { id: true, bomCode: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, resolvedBoms };
}

export async function approveResolvedBom(id: string) {
  const rb = await prisma.resolvedBom.findUnique({ where: { id } });
  if (!rb || rb.isDeleted) throw new NotFoundError('Resolved BOM not found');
  if (rb.status !== 'draft') throw new ValidationError('Only draft resolved BOMs can be approved');

  return prisma.resolvedBom.update({
    where: { id },
    data: { status: 'approved' },
    include: RESOLVED_INCLUDE,
  });
}

export async function lockResolvedBom(id: string) {
  const rb = await prisma.resolvedBom.findUnique({ where: { id } });
  if (!rb || rb.isDeleted) throw new NotFoundError('Resolved BOM not found');
  if (rb.status !== 'approved') throw new ValidationError('Only approved resolved BOMs can be locked');

  return prisma.resolvedBom.update({
    where: { id },
    data: { status: 'locked_for_production' },
    include: RESOLVED_INCLUDE,
  });
}

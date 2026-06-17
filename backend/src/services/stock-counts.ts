import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';
import { createStockMovement } from './inventory';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateCountSessionInput {
  countType: string;
  locationId: string;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
}

export interface RecordCountInput {
  countedQuantity: number;
  countedBy: string;
  varianceReason?: string | null;
}

export interface CreateAdjustmentInput {
  adjustmentType: string;
  reason?: string | null;
  requestedBy?: string | null;
  lines: CreateAdjustmentLineInput[];
}

export interface CreateAdjustmentLineInput {
  materialId: string;
  batchId?: string | null;
  locationId: string;
  binId?: string | null;
  direction: 'plus' | 'minus';
  quantity: number;
  unitCostUsed?: number | null;
}

export interface ListCountFilter {
  locationId?: string;
  status?: string;
  countType?: string;
  page?: number;
  limit?: number;
}

export interface ListAdjustmentFilter {
  adjustmentType?: string;
  approvalStatus?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const SESSION_INCLUDE = {
  location: { select: { id: true, locationCode: true, locationName: true } },
  lines: {
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      bin: { select: { binCode: true } },
      generalArea: { select: { areaCode: true, areaName: true } },
    },
    orderBy: { material: { materialCode: 'asc' as const } },
  },
};

// ─── Count Session CRUD ─────────────────────────────────────────────────────────

export async function createCountSession(input: CreateCountSessionInput) {
  const location = await prisma.storageLocation.findUnique({ where: { id: input.locationId } });
  if (!location) throw new NotFoundError('Location not found');

  const { number: countNumber } = await getNextNumber('SC');

  return prisma.stockCountSession.create({
    data: {
      countNumber,
      countType: input.countType,
      locationId: input.locationId,
      plannedStartDate: input.plannedStartDate ? new Date(input.plannedStartDate) : null,
      plannedEndDate: input.plannedEndDate ? new Date(input.plannedEndDate) : null,
    },
    include: SESSION_INCLUDE,
  });
}

export async function listCountSessions(filter: ListCountFilter) {
  const where: Prisma.StockCountSessionWhereInput = {};

  if (filter.locationId) where.locationId = filter.locationId;
  if (filter.status) where.status = filter.status;
  if (filter.countType) where.countType = filter.countType;

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, sessions] = await Promise.all([
    prisma.stockCountSession.count({ where }),
    prisma.stockCountSession.findMany({
      where,
      include: {
        location: { select: { locationCode: true, locationName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, sessions };
}

export async function getCountSession(id: string) {
  const session = await prisma.stockCountSession.findUnique({
    where: { id },
    include: SESSION_INCLUDE,
  });
  if (!session) throw new NotFoundError('Count session not found');
  return session;
}

// ─── Generate Count Lines ───────────────────────────────────────────────────────

export async function generateCountLines(sessionId: string) {
  const session = await prisma.stockCountSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError('Count session not found');
  if (session.status !== 'planned') throw new ValidationError('Session must be in planned status');

  // Delete existing lines
  await prisma.stockCountLine.deleteMany({ where: { countSessionId: sessionId } });

  const stockQuery: Prisma.StockWhereInput = { locationId: session.locationId };

  if (session.countType === 'spot') {
    // For spot counts, only include materials that have stock
    stockQuery.currentQuantity = { gt: 0 };
  }

  const stockRecords = await prisma.stock.findMany({
    where: stockQuery,
    include: { bin: true, generalArea: true },
  });

  const lines = stockRecords.map((s) => ({
    countSessionId: sessionId,
    materialId: s.materialId,
    binId: s.binId ?? null,
    generalAreaId: s.generalAreaId ?? null,
    systemQuantity: s.currentQuantity,
  }));

  if (lines.length === 0) {
    throw new ValidationError('No stock found at this location to count');
  }

  await prisma.stockCountLine.createMany({ data: lines });

  // Freeze the location during count
  await prisma.storageLocation.update({
    where: { id: session.locationId },
    data: { isFrozen: true },
  });

  // Start the session
  await prisma.stockCountSession.update({
    where: { id: sessionId },
    data: { status: 'in_progress', startedAt: new Date() },
  });

  return prisma.stockCountSession.findUnique({ where: { id: sessionId }, include: SESSION_INCLUDE });
}

// ─── Record Counts ──────────────────────────────────────────────────────────────

export async function recordCount(lineId: string, input: RecordCountInput) {
  const line = await prisma.stockCountLine.findUnique({
    where: { id: lineId },
    include: { countSession: true },
  });
  if (!line) throw new NotFoundError('Count line not found');
  if (line.countSession.status !== 'in_progress') throw new ValidationError('Session is not in progress');

  const variance = input.countedQuantity - Number(line.systemQuantity);

  return prisma.stockCountLine.update({
    where: { id: lineId },
    data: {
      countedQuantity: input.countedQuantity,
      countedBy: input.countedBy,
      countedAt: new Date(),
      variance,
      varianceReason: input.varianceReason ?? null,
    },
  });
}

// ─── Recount ────────────────────────────────────────────────────────────────────

export async function markForRecount(lineId: string) {
  const line = await prisma.stockCountLine.findUnique({ where: { id: lineId } });
  if (!line) throw new NotFoundError('Count line not found');

  return prisma.stockCountLine.update({
    where: { id: lineId },
    data: { recountRequired: true },
  });
}

export async function recordRecount(lineId: string, recountedQuantity: number, countedBy: string) {
  const line = await prisma.stockCountLine.findUnique({ where: { id: lineId } });
  if (!line) throw new NotFoundError('Count line not found');
  if (!line.recountRequired) throw new ValidationError('Line is not marked for recount');

  const variance = recountedQuantity - Number(line.systemQuantity);

  return prisma.stockCountLine.update({
    where: { id: lineId },
    data: {
      recountedQuantity,
      recountRequired: false,
      countedQuantity: recountedQuantity,
      variance,
      countedBy,
      countedAt: new Date(),
    },
  });
}

// ─── Finalize Session ───────────────────────────────────────────────────────────

export async function finalizeCountSession(sessionId: string, requestedBy?: string) {
  const session = await prisma.stockCountSession.findUnique({
    where: { id: sessionId },
    include: { lines: true },
  });
  if (!session) throw new NotFoundError('Count session not found');
  if (session.status !== 'in_progress') throw new ValidationError('Session must be in progress');

  // Check all lines are counted
  const uncounted = session.lines.filter((l) => l.countedQuantity === null);
  if (uncounted.length > 0) {
    throw new ValidationError(`${uncounted.length} lines have not been counted yet`);
  }

  // Check no recounts pending
  const pendingRecounts = session.lines.filter((l) => l.recountRequired);
  if (pendingRecounts.length > 0) {
    throw new ValidationError(`${pendingRecounts.length} lines have pending recounts`);
  }

  // Create adjustments for variance lines
  const varianceLines = session.lines.filter((l) => Number(l.variance ?? 0) !== 0);

  if (varianceLines.length > 0) {
    const { number: adjNumber } = await getNextNumber('ADJ');

    const adjLines = varianceLines.map((l) => {
      const variance = Number(l.variance ?? 0);
      return {
        materialId: l.materialId,
        locationId: session.locationId,
        binId: l.binId ?? null,
        direction: variance > 0 ? 'plus' : 'minus',
        quantity: Math.abs(variance),
      };
    });

    await prisma.stockAdjustment.create({
      data: {
        adjustmentNumber: adjNumber,
        adjustmentType: 'count_variance',
        requestedBy: requestedBy ?? null,
        reason: `Stock count variance from session ${session.countNumber}`,
        lines: { create: adjLines },
      },
    });
  }

  // Complete session
  await prisma.stockCountSession.update({
    where: { id: sessionId },
    data: { status: 'completed', completedAt: new Date() },
  });

  // Unfreeze location
  await prisma.storageLocation.update({
    where: { id: session.locationId },
    data: { isFrozen: false },
  });

  return prisma.stockCountSession.findUnique({ where: { id: sessionId }, include: SESSION_INCLUDE });
}

export async function cancelCountSession(sessionId: string) {
  const session = await prisma.stockCountSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new NotFoundError('Count session not found');
  if (session.status === 'completed') throw new ValidationError('Cannot cancel a completed session');

  await prisma.stockCountSession.update({
    where: { id: sessionId },
    data: { status: 'cancelled' },
  });

  // Unfreeze location if it was frozen
  await prisma.storageLocation.update({
    where: { id: session.locationId },
    data: { isFrozen: false },
  });
}

// ─── Stock Adjustment CRUD ──────────────────────────────────────────────────────

export async function createAdjustment(input: CreateAdjustmentInput) {
  if (!input.lines.length) throw new ValidationError('At least one line is required');

  const { number: adjNumber } = await getNextNumber('ADJ');

  let totalValueImpact = 0;
  const lineData = input.lines.map((l) => {
    const lineValue = l.unitCostUsed ? l.quantity * l.unitCostUsed : 0;
    const impact = l.direction === 'plus' ? lineValue : -lineValue;
    totalValueImpact += impact;

    return {
      materialId: l.materialId,
      batchId: l.batchId ?? null,
      locationId: l.locationId,
      binId: l.binId ?? null,
      direction: l.direction,
      quantity: l.quantity,
      unitCostUsed: l.unitCostUsed ?? null,
      lineValueImpact: Math.round(impact * 100) / 100,
    };
  });

  return prisma.stockAdjustment.create({
    data: {
      adjustmentNumber: adjNumber,
      adjustmentType: input.adjustmentType,
      requestedBy: input.requestedBy ?? null,
      reason: input.reason ?? null,
      totalValueImpact: Math.round(totalValueImpact * 100) / 100,
      lines: { create: lineData },
    },
    include: {
      lines: {
        include: {
          material: { select: { materialCode: true, materialName: true } },
        },
      },
    },
  });
}

export async function listAdjustments(filter: ListAdjustmentFilter) {
  const where: Prisma.StockAdjustmentWhereInput = {};
  if (filter.adjustmentType) where.adjustmentType = filter.adjustmentType;
  if (filter.approvalStatus) where.approvalStatus = filter.approvalStatus;

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, adjustments] = await Promise.all([
    prisma.stockAdjustment.count({ where }),
    prisma.stockAdjustment.findMany({
      where,
      include: { _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, adjustments };
}

export async function getAdjustment(id: string) {
  const adjustment = await prisma.stockAdjustment.findUnique({
    where: { id },
    include: {
      lines: {
        include: { material: { select: { materialCode: true, materialName: true } } },
      },
    },
  });
  if (!adjustment) throw new NotFoundError('Stock adjustment not found');
  return adjustment;
}

export async function approveAdjustment(id: string, approvedBy: string) {
  const adjustment = await prisma.stockAdjustment.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!adjustment) throw new NotFoundError('Stock adjustment not found');
  if (adjustment.approvalStatus !== 'pending') throw new ValidationError('Adjustment is not pending approval');

  // Apply stock movements
  for (const line of adjustment.lines) {
    const movementType = line.direction === 'plus' ? 'adjustment_plus' : 'adjustment_minus';
    const movement = await createStockMovement({
      movementType: movementType as any,
      materialId: line.materialId,
      sourceLocationId: line.direction === 'minus' ? line.locationId : null,
      destinationLocationId: line.direction === 'plus' ? line.locationId : null,
      sourceBinId: line.direction === 'minus' ? line.binId ?? null : null,
      destinationBinId: line.direction === 'plus' ? line.binId ?? null : null,
      quantity: Number(line.quantity),
      batchId: line.batchId ?? null,
      unitCost: line.unitCostUsed ? Number(line.unitCostUsed) : null,
      referenceDocType: 'adjustment_voucher',
      referenceDocId: id,
      movedBy: approvedBy,
    });

    await prisma.stockAdjustmentLine.update({
      where: { id: line.id },
      data: { resultingMovementId: movement.movementNumber },
    });
  }

  return prisma.stockAdjustment.update({
    where: { id },
    data: {
      approvalStatus: 'approved',
      approvedBy,
      approvedAt: new Date(),
    },
    include: {
      lines: {
        include: { material: { select: { materialCode: true, materialName: true } } },
      },
    },
  });
}

export async function rejectAdjustment(id: string, approvedBy: string, reason?: string) {
  const adjustment = await prisma.stockAdjustment.findUnique({ where: { id } });
  if (!adjustment) throw new NotFoundError('Stock adjustment not found');
  if (adjustment.approvalStatus !== 'pending') throw new ValidationError('Adjustment is not pending approval');

  return prisma.stockAdjustment.update({
    where: { id },
    data: {
      approvalStatus: 'rejected',
      approvedBy,
      approvedAt: new Date(),
      reason: reason ? `${adjustment.reason ?? ''}\nRejected: ${reason}` : adjustment.reason,
    },
  });
}

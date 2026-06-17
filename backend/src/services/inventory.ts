import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type MovementType = 'inward_grn' | 'outward_min' | 'transfer' | 'adjustment_plus' | 'adjustment_minus' | 'return_from_production' | 'scrap';

export interface CreateMovementInput {
  movementType: MovementType;
  materialId: string;
  sourceLocationId?: string | null;
  destinationLocationId?: string | null;
  sourceBinId?: string | null;
  destinationBinId?: string | null;
  quantity: number;
  batchId?: string | null;
  unitCost?: number | null;
  referenceDocType?: string | null;
  referenceDocId?: string | null;
  movedBy?: string | null;
  reason?: string | null;
  notes?: string | null;
}

export interface CreateReservationInput {
  materialId: string;
  locationId?: string | null;
  reservedQuantity: number;
  reservationType: 'soft' | 'hard';
  sourceType: string;
  sourceId: string;
  reservedBy?: string | null;
  expiresAt?: string | null;
}

export interface ListMovementsFilter {
  materialId?: string;
  movementType?: string;
  locationId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Core Stock Movement ────────────────────────────────────────────────────────

export async function createStockMovement(input: CreateMovementInput) {
  const material = await prisma.material.findUnique({ where: { id: input.materialId } });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');

  const { number: movementNumber } = await getNextNumber('MOV');

  const totalCost = input.unitCost != null
    ? Math.round(input.quantity * input.unitCost * 100) / 100
    : null;

  // Validate locations aren't frozen
  if (input.sourceLocationId) {
    const srcLoc = await prisma.storageLocation.findUnique({ where: { id: input.sourceLocationId } });
    if (srcLoc?.isFrozen) throw new ValidationError('Source location is frozen');
  }
  if (input.destinationLocationId) {
    const dstLoc = await prisma.storageLocation.findUnique({ where: { id: input.destinationLocationId } });
    if (dstLoc?.isFrozen) throw new ValidationError('Destination location is frozen');
  }

  const movement = await prisma.stockMovement.create({
    data: {
      movementNumber,
      movementType: input.movementType,
      materialId: input.materialId,
      sourceLocationId: input.sourceLocationId ?? null,
      destinationLocationId: input.destinationLocationId ?? null,
      sourceBinId: input.sourceBinId ?? null,
      destinationBinId: input.destinationBinId ?? null,
      quantity: input.quantity,
      batchId: input.batchId ?? null,
      unitCostAtMovement: input.unitCost ?? null,
      totalCost,
      referenceDocType: input.referenceDocType ?? null,
      referenceDocId: input.referenceDocId ?? null,
      movedBy: input.movedBy ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
    },
  });

  // Apply stock impact
  switch (input.movementType) {
    case 'inward_grn':
    case 'return_from_production':
    case 'adjustment_plus': {
      if (!input.destinationLocationId) throw new ValidationError('Destination location required for inward movement');
      await incrementStock(input.materialId, input.destinationLocationId, input.destinationBinId ?? null, null, input.quantity);
      break;
    }
    case 'outward_min':
    case 'scrap':
    case 'adjustment_minus': {
      if (!input.sourceLocationId) throw new ValidationError('Source location required for outward movement');
      await decrementStock(input.materialId, input.sourceLocationId, input.sourceBinId ?? null, input.quantity);
      if (input.batchId) {
        await decrementBatch(input.batchId, input.quantity);
      }
      break;
    }
    case 'transfer': {
      if (!input.sourceLocationId || !input.destinationLocationId) {
        throw new ValidationError('Both source and destination locations required for transfer');
      }
      await decrementStock(input.materialId, input.sourceLocationId, input.sourceBinId ?? null, input.quantity);
      await incrementStock(input.materialId, input.destinationLocationId, input.destinationBinId ?? null, null, input.quantity);
      if (input.batchId) {
        // For transfers, we move batch to new stock record
        await transferBatch(input.batchId, input.materialId, input.destinationLocationId, input.destinationBinId ?? null, input.quantity);
      }
      break;
    }
  }

  return movement;
}

async function incrementStock(materialId: string, locationId: string, binId: string | null, generalAreaId: string | null, quantity: number) {
  await prisma.stock.upsert({
    where: {
      materialId_locationId_binId: {
        materialId,
        locationId,
        binId: binId ?? '',
      },
    },
    create: {
      materialId,
      locationId,
      binId: binId || null,
      generalAreaId: generalAreaId || null,
      currentQuantity: quantity,
      lastMovementAt: new Date(),
    },
    update: {
      currentQuantity: { increment: quantity },
      lastMovementAt: new Date(),
    },
  });
}

async function decrementStock(materialId: string, locationId: string, binId: string | null, quantity: number) {
  const stock = await prisma.stock.findUnique({
    where: {
      materialId_locationId_binId: {
        materialId,
        locationId,
        binId: binId ?? '',
      },
    },
  });

  if (!stock) throw new ValidationError('No stock found at this location');
  if (Number(stock.currentQuantity) < quantity) {
    throw new ValidationError(`Insufficient stock. Available: ${stock.currentQuantity}, Requested: ${quantity}`);
  }

  await prisma.stock.update({
    where: { id: stock.id },
    data: {
      currentQuantity: { decrement: quantity },
      lastMovementAt: new Date(),
    },
  });
}

async function decrementBatch(batchId: string, quantity: number) {
  const batch = await prisma.stockBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError('Batch not found');
  if (Number(batch.currentQuantity) < quantity) {
    throw new ValidationError('Insufficient batch quantity');
  }

  await prisma.stockBatch.update({
    where: { id: batchId },
    data: { currentQuantity: { decrement: quantity } },
  });
}

async function transferBatch(batchId: string, materialId: string, destLocationId: string, destBinId: string | null, quantity: number) {
  await decrementBatch(batchId, quantity);

  const batch = await prisma.stockBatch.findUnique({ where: { id: batchId } });
  if (!batch) return;

  // Find or create destination stock
  const destStock = await prisma.stock.upsert({
    where: {
      materialId_locationId_binId: {
        materialId,
        locationId: destLocationId,
        binId: destBinId ?? '',
      },
    },
    create: {
      materialId,
      locationId: destLocationId,
      binId: destBinId || null,
      currentQuantity: 0,
      lastMovementAt: new Date(),
    },
    update: {},
  });

  // Create a new batch at destination
  await prisma.stockBatch.create({
    data: {
      stockId: destStock.id,
      batchNumber: batch.batchNumber,
      grnId: batch.grnId,
      originalQuantity: quantity,
      currentQuantity: quantity,
      unitCost: batch.unitCost,
      totalCost: Math.round(quantity * Number(batch.unitCost) * 100) / 100,
      expiryDate: batch.expiryDate,
      lotNumber: batch.lotNumber,
    },
  });
}

// ─── FIFO Pick ──────────────────────────────────────────────────────────────────

export async function fifoPickBatches(
  materialId: string,
  locationId: string,
  binId: string | null,
  quantityNeeded: number,
): Promise<Array<{ batchId: string; quantity: number; unitCost: number }>> {
  const stock = await prisma.stock.findUnique({
    where: {
      materialId_locationId_binId: {
        materialId,
        locationId,
        binId: binId ?? '',
      },
    },
    include: {
      batches: {
        where: { currentQuantity: { gt: 0 }, isQuarantined: false },
        orderBy: { receivedAt: 'asc' },
      },
    },
  });

  if (!stock) throw new ValidationError('No stock found');

  const picks: Array<{ batchId: string; quantity: number; unitCost: number }> = [];
  let remaining = quantityNeeded;

  for (const batch of stock.batches) {
    if (remaining <= 0) break;

    const available = Number(batch.currentQuantity);
    const pickQty = Math.min(available, remaining);

    picks.push({
      batchId: batch.id,
      quantity: pickQty,
      unitCost: Number(batch.unitCost),
    });

    remaining -= pickQty;
  }

  if (remaining > 0) {
    throw new ValidationError(`Insufficient stock. Short by ${remaining.toFixed(4)}`);
  }

  return picks;
}

// ─── Reservation Management ─────────────────────────────────────────────────────

export async function createReservation(input: CreateReservationInput) {
  const { number: reservationNumber } = await getNextNumber('RES');

  const reservation = await prisma.reservation.create({
    data: {
      reservationNumber,
      materialId: input.materialId,
      locationId: input.locationId ?? null,
      reservedQuantity: input.reservedQuantity,
      reservationType: input.reservationType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      reservedBy: input.reservedBy ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });

  // Update stock reserved quantities
  if (input.locationId) {
    const field = input.reservationType === 'soft' ? 'reservedQuantitySoft' : 'reservedQuantityHard';
    await prisma.stock.updateMany({
      where: { materialId: input.materialId, locationId: input.locationId },
      data: { [field]: { increment: input.reservedQuantity } },
    });
  }

  return reservation;
}

export async function releaseReservation(reservationId: string, reason?: string) {
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw new NotFoundError('Reservation not found');
  if (reservation.releasedAt) throw new ValidationError('Reservation already released');

  await prisma.reservation.update({
    where: { id: reservationId },
    data: { releasedAt: new Date(), releaseReason: reason ?? null },
  });

  if (reservation.locationId) {
    const field = reservation.reservationType === 'soft' ? 'reservedQuantitySoft' : 'reservedQuantityHard';
    await prisma.stock.updateMany({
      where: { materialId: reservation.materialId, locationId: reservation.locationId },
      data: { [field]: { decrement: reservation.reservedQuantity } },
    });
  }
}

export async function convertSoftToHard(materialId: string, sourceType: string, sourceId: string) {
  // Find and release soft reservations
  const softReservations = await prisma.reservation.findMany({
    where: {
      materialId,
      sourceType,
      sourceId,
      reservationType: 'soft',
      releasedAt: null,
    },
  });

  for (const soft of softReservations) {
    await releaseReservation(soft.id, 'Converted to hard reservation');

    await createReservation({
      materialId: soft.materialId,
      locationId: soft.locationId ?? undefined,
      reservedQuantity: Number(soft.reservedQuantity),
      reservationType: 'hard',
      sourceType: soft.sourceType,
      sourceId: soft.sourceId,
      reservedBy: soft.reservedBy ?? undefined,
    });
  }
}

export async function listReservations(materialId?: string, sourceType?: string) {
  const where: Prisma.ReservationWhereInput = { releasedAt: null };
  if (materialId) where.materialId = materialId;
  if (sourceType) where.sourceType = sourceType;

  return prisma.reservation.findMany({
    where,
    include: { material: { select: { materialCode: true, materialName: true } } },
    orderBy: { reservedAt: 'desc' },
  });
}

// ─── Stock Queries ──────────────────────────────────────────────────────────────

export async function getStockByMaterial(materialId: string) {
  return prisma.stock.findMany({
    where: { materialId },
    include: {
      location: { select: { locationCode: true, locationName: true } },
      bin: { select: { binCode: true } },
      generalArea: { select: { areaCode: true, areaName: true } },
      batches: {
        where: { currentQuantity: { gt: 0 } },
        orderBy: { receivedAt: 'asc' },
      },
    },
  });
}

export async function getStockByLocation(locationId: string) {
  return prisma.stock.findMany({
    where: { locationId, currentQuantity: { gt: 0 } },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      bin: { select: { binCode: true } },
      generalArea: { select: { areaCode: true, areaName: true } },
    },
    orderBy: { material: { materialCode: 'asc' } },
  });
}

export async function getAggregateStock(materialId: string) {
  const agg = await prisma.stock.aggregate({
    where: { materialId },
    _sum: {
      currentQuantity: true,
      reservedQuantitySoft: true,
      reservedQuantityHard: true,
    },
  });

  const current = Number(agg._sum.currentQuantity ?? 0);
  const soft = Number(agg._sum.reservedQuantitySoft ?? 0);
  const hard = Number(agg._sum.reservedQuantityHard ?? 0);

  return {
    materialId,
    currentQuantity: current,
    reservedSoft: soft,
    reservedHard: hard,
    availableQuantity: current - soft - hard,
  };
}

export async function getStockValuation(locationId?: string) {
  const where: Prisma.StockBatchWhereInput = { currentQuantity: { gt: 0 } };
  if (locationId) {
    where.stock = { locationId };
  }

  const batches = await prisma.stockBatch.findMany({
    where,
    include: {
      stock: {
        include: {
          material: { select: { materialCode: true, materialName: true } },
          location: { select: { locationCode: true, locationName: true } },
        },
      },
    },
  });

  let totalValue = 0;
  const items = batches.map((b) => {
    const value = Number(b.currentQuantity) * Number(b.unitCost);
    totalValue += value;
    return {
      batchId: b.id,
      batchNumber: b.batchNumber,
      materialCode: b.stock.material.materialCode,
      materialName: b.stock.material.materialName,
      locationCode: b.stock.location.locationCode,
      quantity: Number(b.currentQuantity),
      unitCost: Number(b.unitCost),
      totalValue: Math.round(value * 100) / 100,
    };
  });

  return { items, totalValue: Math.round(totalValue * 100) / 100 };
}

// ─── Reorder Alerts ─────────────────────────────────────────────────────────────

export async function generateReorderAlerts() {
  const materials = await prisma.material.findMany({
    where: { isDeleted: false, isActive: true, reorderLevel: { not: null } },
    select: { id: true, reorderLevel: true, minStockLevel: true },
  });

  const alerts = [];

  for (const mat of materials) {
    const agg = await prisma.stock.aggregate({
      where: { materialId: mat.id },
      _sum: { currentQuantity: true, reservedQuantitySoft: true, reservedQuantityHard: true },
    });

    const current = Number(agg._sum.currentQuantity ?? 0);
    const reserved = Number(agg._sum.reservedQuantitySoft ?? 0) + Number(agg._sum.reservedQuantityHard ?? 0);
    const available = current - reserved;

    if (available <= Number(mat.reorderLevel ?? 0)) {
      // Check if active alert already exists
      const existing = await prisma.reorderAlert.findFirst({
        where: { materialId: mat.id, alertStatus: 'active' },
      });
      if (existing) continue;

      const alert = await prisma.reorderAlert.create({
        data: {
          materialId: mat.id,
          locationId: (await prisma.stock.findFirst({ where: { materialId: mat.id } }))?.locationId ?? '',
          currentQuantity: available,
          minThreshold: mat.reorderLevel!,
          reorderQuantitySuggested: Number(mat.minStockLevel ?? 0) > 0
            ? Number(mat.minStockLevel) - available
            : null,
        },
      });
      alerts.push(alert);
    }
  }

  return alerts;
}

export async function listReorderAlerts(status?: string) {
  const where: Prisma.ReorderAlertWhereInput = {};
  if (status) where.alertStatus = status;

  return prisma.reorderAlert.findMany({
    where,
    include: { material: { select: { materialCode: true, materialName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function acknowledgeAlert(alertId: string, acknowledgedBy: string) {
  const alert = await prisma.reorderAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new NotFoundError('Alert not found');

  return prisma.reorderAlert.update({
    where: { id: alertId },
    data: { alertStatus: 'acknowledged', acknowledgedBy, acknowledgedAt: new Date() },
  });
}

// ─── Stock Transfer ─────────────────────────────────────────────────────────────

export async function transferStock(
  materialId: string,
  sourceLocationId: string,
  destinationLocationId: string,
  quantity: number,
  sourceBinId?: string | null,
  destinationBinId?: string | null,
  movedBy?: string,
  notes?: string,
) {
  return createStockMovement({
    movementType: 'transfer',
    materialId,
    sourceLocationId,
    destinationLocationId,
    sourceBinId: sourceBinId ?? null,
    destinationBinId: destinationBinId ?? null,
    quantity,
    movedBy: movedBy ?? null,
    referenceDocType: 'transfer_note',
    notes: notes ?? null,
  });
}

// ─── Movement List ──────────────────────────────────────────────────────────────

export async function listMovements(filter: ListMovementsFilter) {
  const where: Prisma.StockMovementWhereInput = {};

  if (filter.materialId) where.materialId = filter.materialId;
  if (filter.movementType) where.movementType = filter.movementType;
  if (filter.locationId) {
    where.OR = [
      { sourceLocationId: filter.locationId },
      { destinationLocationId: filter.locationId },
    ];
  }
  if (filter.search) {
    where.movementNumber = { contains: filter.search, mode: 'insensitive' };
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, movements] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: {
        material: { select: { materialCode: true, materialName: true } },
        sourceLocation: { select: { locationCode: true, locationName: true } },
        destinationLocation: { select: { locationCode: true, locationName: true } },
      },
      orderBy: { movedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, movements };
}

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';
import { createStockMovement, fifoPickBatches } from './inventory';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateMrInput {
  productionJobId?: string | null;
  nestingRunId?: string | null;
  requestType?: string;
  requiredByDate?: string | null;
  notes?: string | null;
  requestingUserId?: string | null;
  lines: CreateMrLineInput[];
}

export interface CreateMrLineInput {
  materialId: string;
  quantityRequired: number;
  uom?: string;
  nestingRunLineId?: string | null;
  preferredLocationId?: string | null;
}

export interface ListMrFilter {
  status?: string;
  requestType?: string;
  productionJobId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateMinInput {
  mrId: string;
  issuedFromLocationId: string;
  issuedToDestination?: string | null;
  productionJobId?: string | null;
  nestingRunId?: string | null;
  lineAllocations: Array<{
    mrLineId: string;
    materialId: string;
    quantityToIssue: number;
    uom?: string;
    binId?: string | null;
  }>;
  issuedBy?: string | null;
}

export interface CreateMrnInput {
  originalMinId: string;
  receivedAtLocationId: string;
  productionJobId?: string | null;
  reason?: string;
  notes?: string | null;
  returnedBy?: string | null;
  lines: Array<{
    minLineId: string;
    materialId: string;
    quantityReturned: number;
    uom?: string;
    condition?: string;
    destinationLocationId?: string | null;
    destinationBinId?: string | null;
  }>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const MR_INCLUDE = {
  lines: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
    },
  },
};

const MIN_INCLUDE = {
  lines: {
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      batch: { select: { id: true, batchNumber: true } },
      mrLine: { select: { id: true, quantityRequired: true } },
    },
  },
  mr: { select: { id: true, mrNumber: true } },
  issuedFromLocation: { select: { id: true, locationCode: true, locationName: true } },
};

// ─── MR CRUD ────────────────────────────────────────────────────────────────────

export async function createMr(input: CreateMrInput) {
  if (!input.lines.length) throw new ValidationError('At least one line is required');

  const { number: mrNumber } = await getNextNumber('MR');

  return prisma.materialRequisition.create({
    data: {
      mrNumber,
      productionJobId: input.productionJobId ?? null,
      nestingRunId: input.nestingRunId ?? null,
      requestType: input.requestType ?? 'general',
      requestingUserId: input.requestingUserId ?? null,
      requiredByDate: input.requiredByDate ? new Date(input.requiredByDate) : null,
      notes: input.notes ?? null,
      // Auto-approve production type
      approvalStatus: input.requestType === 'production' ? 'auto_approved' : 'pending',
      status: 'draft',
      lines: {
        create: input.lines.map((line) => ({
          materialId: line.materialId,
          quantityRequired: line.quantityRequired,
          uom: line.uom ?? 'PCS',
          nestingRunLineId: line.nestingRunLineId ?? null,
          preferredLocationId: line.preferredLocationId ?? null,
        })),
      },
    },
    include: MR_INCLUDE,
  });
}

export async function listMrs(filter: ListMrFilter) {
  const where: Prisma.MaterialRequisitionWhereInput = {};

  if (filter.status) where.status = filter.status;
  if (filter.requestType) where.requestType = filter.requestType;
  if (filter.productionJobId) where.productionJobId = filter.productionJobId;
  if (filter.search) {
    where.OR = [
      { mrNumber: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, mrs] = await Promise.all([
    prisma.materialRequisition.count({ where }),
    prisma.materialRequisition.findMany({
      where,
      include: { _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, mrs };
}

export async function getMr(id: string) {
  const mr = await prisma.materialRequisition.findUnique({
    where: { id },
    include: MR_INCLUDE,
  });
  if (!mr) throw new NotFoundError('Material requisition not found');
  return mr;
}

// ─── MR Workflow ────────────────────────────────────────────────────────────────

export async function submitMr(id: string) {
  const mr = await prisma.materialRequisition.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!mr) throw new NotFoundError('Material requisition not found');
  if (mr.status !== 'draft') throw new ValidationError('MR must be in draft status');
  if (!mr.lines.length) throw new ValidationError('MR must have at least one line');

  const newStatus = mr.approvalStatus === 'auto_approved' ? 'approved' : 'submitted';

  return prisma.materialRequisition.update({
    where: { id },
    data: { status: newStatus },
    include: MR_INCLUDE,
  });
}

export async function approveMr(id: string, approverUserId: string) {
  const mr = await prisma.materialRequisition.findUnique({ where: { id } });
  if (!mr) throw new NotFoundError('Material requisition not found');
  if (mr.status !== 'submitted') throw new ValidationError('MR must be submitted');

  return prisma.materialRequisition.update({
    where: { id },
    data: {
      status: 'approved',
      approvalStatus: 'approved',
      approverUserId,
      approvedAt: new Date(),
    },
    include: MR_INCLUDE,
  });
}

export async function rejectMr(id: string, approverUserId: string, reason: string) {
  const mr = await prisma.materialRequisition.findUnique({ where: { id } });
  if (!mr) throw new NotFoundError('Material requisition not found');
  if (mr.status !== 'submitted') throw new ValidationError('MR must be submitted');

  return prisma.materialRequisition.update({
    where: { id },
    data: {
      status: 'cancelled',
      approvalStatus: 'rejected',
      approverUserId,
      rejectionReason: reason,
    },
    include: MR_INCLUDE,
  });
}

// ─── Pick List Generation ───────────────────────────────────────────────────────

export async function generatePickList(mrId: string, locationId: string) {
  const mr = await prisma.materialRequisition.findUnique({
    where: { id: mrId },
    include: { lines: { include: { material: { select: { materialCode: true, materialName: true } } } } },
  });
  if (!mr) throw new NotFoundError('Material requisition not found');
  if (!['approved', 'partially_issued'].includes(mr.status)) {
    throw new ValidationError('MR must be approved to generate pick list');
  }

  const picks = [];
  for (const line of mr.lines) {
    const remaining = Number(line.quantityRequired) - Number(line.issuedQuantity);
    if (remaining <= 0) continue;

    try {
      const batchPicks = await fifoPickBatches(
        line.materialId,
        locationId,
        null,
        remaining,
      );
      picks.push({
        mrLineId: line.id,
        materialId: line.materialId,
        materialCode: line.material.materialCode,
        materialName: line.material.materialName,
        quantityNeeded: remaining,
        batches: batchPicks,
      });
    } catch {
      picks.push({
        mrLineId: line.id,
        materialId: line.materialId,
        materialCode: line.material.materialCode,
        materialName: line.material.materialName,
        quantityNeeded: remaining,
        batches: [],
        shortfall: true,
      });
    }
  }

  return picks;
}

// ─── Material Issue Note (MIN) ──────────────────────────────────────────────────

export async function createMin(input: CreateMinInput) {
  const mr = await prisma.materialRequisition.findUnique({
    where: { id: input.mrId },
    include: { lines: true },
  });
  if (!mr) throw new NotFoundError('Material requisition not found');
  if (!['approved', 'partially_issued'].includes(mr.status)) {
    throw new ValidationError('MR must be approved to issue materials');
  }

  const location = await prisma.storageLocation.findUnique({ where: { id: input.issuedFromLocationId } });
  if (!location) throw new NotFoundError('Issue location not found');
  if (location.isFrozen) throw new ValidationError('Issue location is frozen');

  const { number: minNumber } = await getNextNumber('MIN-SC');

  // FIFO batch selection for each line
  const lineData = [];
  for (const alloc of input.lineAllocations) {
    const mrLine = mr.lines.find((l) => l.id === alloc.mrLineId);
    if (!mrLine) throw new NotFoundError(`MR line ${alloc.mrLineId} not found`);

    const remaining = Number(mrLine.quantityRequired) - Number(mrLine.issuedQuantity);
    if (alloc.quantityToIssue > remaining) {
      throw new ValidationError(`Cannot issue more than remaining quantity for MR line ${alloc.mrLineId}`);
    }

    const batchPicks = await fifoPickBatches(
      alloc.materialId,
      input.issuedFromLocationId,
      alloc.binId ?? null,
      alloc.quantityToIssue,
    );

    for (const pick of batchPicks) {
      lineData.push({
        mrLineId: alloc.mrLineId,
        materialId: alloc.materialId,
        quantityIssued: pick.quantity,
        uom: alloc.uom ?? 'PCS',
        batchId: pick.batchId,
        unitCost: pick.unitCost,
        binId: alloc.binId ?? null,
      });
    }
  }

  const min = await prisma.materialIssueNote.create({
    data: {
      minNumber,
      mrId: input.mrId,
      productionJobId: input.productionJobId ?? mr.productionJobId ?? null,
      nestingRunId: input.nestingRunId ?? mr.nestingRunId ?? null,
      issuedFromLocationId: input.issuedFromLocationId,
      issuedToDestination: input.issuedToDestination ?? null,
      issuedBy: input.issuedBy ?? null,
      status: 'draft',
      lines: {
        create: lineData,
      },
    },
    include: MIN_INCLUDE,
  });

  return min;
}

export async function issueMin(minId: string, issuedBy?: string) {
  const min = await prisma.materialIssueNote.findUnique({
    where: { id: minId },
    include: { lines: true },
  });
  if (!min) throw new NotFoundError('Material issue note not found');
  if (min.status !== 'draft') throw new ValidationError('MIN must be in draft status');

  // Create stock movements for each line
  for (const line of min.lines) {
    await createStockMovement({
      movementType: 'outward_min',
      materialId: line.materialId,
      sourceLocationId: min.issuedFromLocationId,
      sourceBinId: line.binId ?? null,
      quantity: Number(line.quantityIssued),
      batchId: line.batchId ?? null,
      unitCost: line.unitCost ? Number(line.unitCost) : null,
      referenceDocType: 'min',
      referenceDocId: minId,
      movedBy: issuedBy ?? min.issuedBy ?? null,
    });

    // Update MR line issued quantity
    await prisma.materialRequisitionLine.update({
      where: { id: line.mrLineId },
      data: { issuedQuantity: { increment: line.quantityIssued } },
    });
  }

  // Update MIN status
  await prisma.materialIssueNote.update({
    where: { id: minId },
    data: { status: 'issued', issuedAt: new Date(), issuedBy: issuedBy ?? min.issuedBy },
  });

  // Update MR line statuses
  const mr = await prisma.materialRequisition.findUnique({
    where: { id: min.mrId },
    include: { lines: true },
  });
  if (mr) {
    for (const line of mr.lines) {
      const issued = Number(line.issuedQuantity);
      const required = Number(line.quantityRequired);
      let lineStatus = 'pending';
      if (issued >= required) lineStatus = 'fully_issued';
      else if (issued > 0) lineStatus = 'partially_issued';

      await prisma.materialRequisitionLine.update({
        where: { id: line.id },
        data: { status: lineStatus },
      });
    }

    // Refresh after updates
    const updatedLines = await prisma.materialRequisitionLine.findMany({ where: { mrId: mr.id } });
    const allFully = updatedLines.every((l) => l.status === 'fully_issued');
    const anyIssued = updatedLines.some((l) => Number(l.issuedQuantity) > 0);

    await prisma.materialRequisition.update({
      where: { id: mr.id },
      data: { status: allFully ? 'issued' : anyIssued ? 'partially_issued' : mr.status },
    });
  }

  return prisma.materialIssueNote.findUnique({ where: { id: minId }, include: MIN_INCLUDE });
}

export async function listMins(mrId?: string, status?: string, page = 1, limit = 50) {
  const where: Prisma.MaterialIssueNoteWhereInput = {};
  if (mrId) where.mrId = mrId;
  if (status) where.status = status;

  const [total, mins] = await Promise.all([
    prisma.materialIssueNote.count({ where }),
    prisma.materialIssueNote.findMany({
      where,
      include: {
        mr: { select: { mrNumber: true } },
        issuedFromLocation: { select: { locationCode: true, locationName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, mins };
}

export async function getMin(id: string) {
  const min = await prisma.materialIssueNote.findUnique({
    where: { id },
    include: MIN_INCLUDE,
  });
  if (!min) throw new NotFoundError('Material issue note not found');
  return min;
}

// ─── Material Return Note (MRN) ─────────────────────────────────────────────────

export async function createMrn(input: CreateMrnInput) {
  const min = await prisma.materialIssueNote.findUnique({
    where: { id: input.originalMinId },
    include: { lines: true },
  });
  if (!min) throw new NotFoundError('Original MIN not found');

  // Validate return quantities
  for (const returnLine of input.lines) {
    const minLine = min.lines.find((l) => l.id === returnLine.minLineId);
    if (!minLine) throw new NotFoundError(`MIN line ${returnLine.minLineId} not found`);

    const alreadyReturned = Number(minLine.returnQuantity);
    const issued = Number(minLine.quantityIssued);
    if (returnLine.quantityReturned + alreadyReturned > issued) {
      throw new ValidationError(`Return quantity exceeds issued quantity for MIN line ${returnLine.minLineId}`);
    }
  }

  const { number: mrnNumber } = await getNextNumber('MRN');

  const mrn = await prisma.materialReturnNote.create({
    data: {
      mrnNumber,
      originalMinId: input.originalMinId,
      productionJobId: input.productionJobId ?? min.productionJobId ?? null,
      returnedBy: input.returnedBy ?? null,
      receivedAtLocationId: input.receivedAtLocationId,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      lines: {
        create: input.lines.map((line) => {
          const minLine = min.lines.find((l) => l.id === line.minLineId);
          return {
            minLineId: line.minLineId,
            materialId: line.materialId,
            quantityReturned: line.quantityReturned,
            uom: line.uom ?? 'PCS',
            batchId: minLine?.batchId ?? null,
            unitCost: minLine?.unitCost ?? null,
            condition: line.condition ?? 'good_back_to_stock',
            destinationLocationId: line.destinationLocationId ?? input.receivedAtLocationId,
            destinationBinId: line.destinationBinId ?? null,
          };
        }),
      },
    },
    include: {
      lines: {
        include: { material: { select: { materialCode: true, materialName: true } } },
      },
      originalMin: { select: { minNumber: true } },
    },
  });

  // Process stock movements for each return line
  for (const line of mrn.lines) {
    const condition = line.condition;

    if (condition === 'good_back_to_stock') {
      await createStockMovement({
        movementType: 'return_from_production',
        materialId: line.materialId,
        destinationLocationId: line.destinationLocationId ?? input.receivedAtLocationId,
        destinationBinId: line.destinationBinId ?? null,
        quantity: Number(line.quantityReturned),
        batchId: line.batchId ?? null,
        unitCost: line.unitCost ? Number(line.unitCost) : null,
        referenceDocType: 'return_note',
        referenceDocId: mrn.id,
        movedBy: input.returnedBy ?? null,
      });
    } else if (condition === 'damaged_scrap') {
      await createStockMovement({
        movementType: 'scrap',
        materialId: line.materialId,
        sourceLocationId: input.receivedAtLocationId,
        quantity: Number(line.quantityReturned),
        batchId: line.batchId ?? null,
        unitCost: line.unitCost ? Number(line.unitCost) : null,
        referenceDocType: 'return_note',
        referenceDocId: mrn.id,
        movedBy: input.returnedBy ?? null,
        reason: 'Damaged - scrap',
      });
    }
    // quarantine_for_review — no stock movement, flagged for inspection

    // Update MIN line return quantity
    await prisma.materialIssueNoteLine.update({
      where: { id: line.minLineId },
      data: { returnQuantity: { increment: line.quantityReturned } },
    });
  }

  return mrn;
}

export async function listMrns(minId?: string, page = 1, limit = 50) {
  const where: Prisma.MaterialReturnNoteWhereInput = {};
  if (minId) where.originalMinId = minId;

  const [total, mrns] = await Promise.all([
    prisma.materialReturnNote.count({ where }),
    prisma.materialReturnNote.findMany({
      where,
      include: {
        originalMin: { select: { minNumber: true } },
        receivedAtLocation: { select: { locationCode: true, locationName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { returnedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, mrns };
}

export async function getMrn(id: string) {
  const mrn = await prisma.materialReturnNote.findUnique({
    where: { id },
    include: {
      lines: {
        include: { material: { select: { materialCode: true, materialName: true } } },
      },
      originalMin: { select: { minNumber: true, mrId: true } },
      receivedAtLocation: { select: { locationCode: true, locationName: true } },
    },
  });
  if (!mrn) throw new NotFoundError('Material return note not found');
  return mrn;
}

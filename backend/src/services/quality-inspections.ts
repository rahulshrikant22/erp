import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';
import { acceptGrn } from './grn';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateInspectionInput {
  grnId: string;
  grnLineId?: string | null;
  materialId: string;
  inspectionType?: string;
  inspectorUserId?: string | null;
}

export interface RecordParameterInput {
  parameterName: string;
  expectedValue?: string | null;
  actualValue?: string | null;
  tolerance?: string | null;
  result?: string | null;
  notes?: string | null;
}

export interface CompleteInspectionInput {
  overallResult: 'accepted' | 'rejected' | 'accepted_with_deviation';
  deviationNotes?: string | null;
  approvedByForDeviation?: string | null;
}

export interface ListInspectionFilter {
  grnId?: string;
  materialId?: string;
  overallResult?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const INSPECTION_INCLUDE = {
  grn: { select: { id: true, grnNumber: true } },
  grnLine: { select: { id: true, quantityReceived: true } },
  material: { select: { id: true, materialCode: true, materialName: true } },
  parameters: { orderBy: { createdAt: 'asc' as const } },
  photos: { orderBy: { uploadedAt: 'desc' as const } },
};

export async function isQcModuleActive(): Promise<boolean> {
  const mod = await prisma.module.findUnique({ where: { moduleCode: 'quality_check_inbound' } });
  return mod?.isActive ?? false;
}

// ─── Inspection CRUD ────────────────────────────────────────────────────────────

export async function createInspection(input: CreateInspectionInput) {
  const grn = await prisma.goodsReceiptNote.findUnique({ where: { id: input.grnId } });
  if (!grn || grn.isDeleted) throw new NotFoundError('GRN not found');

  if (input.grnLineId) {
    const line = await prisma.goodsReceiptLine.findUnique({ where: { id: input.grnLineId } });
    if (!line || line.grnId !== input.grnId) throw new NotFoundError('GRN line not found');
  }

  const { number: inspectionNumber } = await getNextNumber('QIN');

  return prisma.qualityInspection.create({
    data: {
      inspectionNumber,
      grnId: input.grnId,
      grnLineId: input.grnLineId ?? null,
      materialId: input.materialId,
      inspectionType: input.inspectionType ?? 'incoming',
      inspectorUserId: input.inspectorUserId ?? null,
      inspectionStartedAt: new Date(),
    },
    include: INSPECTION_INCLUDE,
  });
}

export async function triggerInspectionsForGrn(grnId: string, inspectorUserId?: string) {
  const grn = await prisma.goodsReceiptNote.findUnique({
    where: { id: grnId },
    include: { lines: true },
  });
  if (!grn || grn.isDeleted) throw new NotFoundError('GRN not found');

  const inspections = [];
  for (const line of grn.lines) {
    const inspection = await createInspection({
      grnId,
      grnLineId: line.id,
      materialId: line.materialId,
      inspectorUserId,
    });
    inspections.push(inspection);
  }

  // Update GRN line statuses
  await prisma.goodsReceiptLine.updateMany({
    where: { grnId },
    data: { status: 'in_qc' },
  });

  return inspections;
}

export async function listInspections(filter: ListInspectionFilter) {
  const where: Prisma.QualityInspectionWhereInput = {};

  if (filter.grnId) where.grnId = filter.grnId;
  if (filter.materialId) where.materialId = filter.materialId;
  if (filter.overallResult) where.overallResult = filter.overallResult;
  if (filter.search) {
    where.OR = [
      { inspectionNumber: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, inspections] = await Promise.all([
    prisma.qualityInspection.count({ where }),
    prisma.qualityInspection.findMany({
      where,
      include: {
        grn: { select: { grnNumber: true } },
        material: { select: { materialCode: true, materialName: true } },
        _count: { select: { parameters: true, photos: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, inspections };
}

export async function getInspection(id: string) {
  const inspection = await prisma.qualityInspection.findUnique({
    where: { id },
    include: INSPECTION_INCLUDE,
  });
  if (!inspection) throw new NotFoundError('Quality inspection not found');
  return inspection;
}

// ─── Parameters ─────────────────────────────────────────────────────────────────

export async function addParameter(inspectionId: string, input: RecordParameterInput) {
  const inspection = await prisma.qualityInspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw new NotFoundError('Inspection not found');
  if (inspection.overallResult !== 'pending') throw new ValidationError('Inspection is already completed');

  return prisma.qualityInspectionParameter.create({
    data: {
      inspectionId,
      parameterName: input.parameterName,
      expectedValue: input.expectedValue ?? null,
      actualValue: input.actualValue ?? null,
      tolerance: input.tolerance ?? null,
      result: input.result ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function updateParameter(parameterId: string, input: Partial<RecordParameterInput>) {
  const param = await prisma.qualityInspectionParameter.findUnique({ where: { id: parameterId } });
  if (!param) throw new NotFoundError('Parameter not found');

  return prisma.qualityInspectionParameter.update({
    where: { id: parameterId },
    data: {
      ...(input.parameterName !== undefined && { parameterName: input.parameterName }),
      ...(input.expectedValue !== undefined && { expectedValue: input.expectedValue }),
      ...(input.actualValue !== undefined && { actualValue: input.actualValue }),
      ...(input.tolerance !== undefined && { tolerance: input.tolerance }),
      ...(input.result !== undefined && { result: input.result }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
}

// ─── Photos ─────────────────────────────────────────────────────────────────────

export async function addPhoto(inspectionId: string, photoType: string, photoPath: string, caption?: string) {
  const inspection = await prisma.qualityInspection.findUnique({ where: { id: inspectionId } });
  if (!inspection) throw new NotFoundError('Inspection not found');

  return prisma.qualityInspectionPhoto.create({
    data: {
      inspectionId,
      photoType,
      photoPath,
      caption: caption ?? null,
    },
  });
}

export async function deletePhoto(inspectionId: string, photoId: string) {
  const photo = await prisma.qualityInspectionPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.inspectionId !== inspectionId) throw new NotFoundError('Photo not found');

  await prisma.qualityInspectionPhoto.delete({ where: { id: photoId } });
}

// ─── Complete Inspection ────────────────────────────────────────────────────────

export async function completeInspection(id: string, input: CompleteInspectionInput) {
  const inspection = await prisma.qualityInspection.findUnique({
    where: { id },
    include: { grnLine: true },
  });
  if (!inspection) throw new NotFoundError('Inspection not found');
  if (inspection.overallResult !== 'pending') throw new ValidationError('Inspection is already completed');

  if (input.overallResult === 'accepted_with_deviation' && !input.deviationNotes) {
    throw new ValidationError('Deviation notes are required for accepted_with_deviation');
  }

  await prisma.qualityInspection.update({
    where: { id },
    data: {
      overallResult: input.overallResult,
      inspectionCompletedAt: new Date(),
      deviationNotes: input.deviationNotes ?? null,
      approvedByForDeviation: input.approvedByForDeviation ?? null,
      approvedAt: input.overallResult === 'accepted_with_deviation' ? new Date() : null,
    },
  });

  if (inspection.grnLineId) {
    if (input.overallResult === 'accepted' || input.overallResult === 'accepted_with_deviation') {
      await prisma.goodsReceiptLine.update({
        where: { id: inspection.grnLineId },
        data: {
          status: 'accepted',
          acceptedQuantity: inspection.grnLine?.quantityReceived ?? null,
        },
      });
    } else {
      // Rejected — move to quarantine
      await prisma.goodsReceiptLine.update({
        where: { id: inspection.grnLineId },
        data: {
          status: 'rejected_full',
          rejectedQuantity: inspection.grnLine?.quantityReceived ?? null,
          rejectionReason: input.deviationNotes ?? 'QC rejected',
        },
      });
    }
  }

  // Check if all inspections for this GRN are complete
  const grnId = inspection.grnId;
  const allInspections = await prisma.qualityInspection.findMany({ where: { grnId } });
  const allDone = allInspections.every((i) => i.id === id ? true : i.overallResult !== 'pending');

  if (allDone) {
    const anyRejected = allInspections.some((i) => {
      const result = i.id === id ? input.overallResult : i.overallResult;
      return result === 'rejected';
    });

    if (anyRejected) {
      const allRejected = allInspections.every((i) => {
        const result = i.id === id ? input.overallResult : i.overallResult;
        return result === 'rejected';
      });
      await prisma.goodsReceiptNote.update({
        where: { id: grnId },
        data: { status: allRejected ? 'rejected' : 'partially_accepted' },
      });
    } else {
      // All accepted — trigger stock impact
      await acceptGrn(grnId);
    }

    await prisma.goodsReceiptNote.update({
      where: { id: grnId },
      data: { status: 'qc_completed' },
    });
  }

  return prisma.qualityInspection.findUnique({ where: { id }, include: INSPECTION_INCLUDE });
}

// ─── Re-inspection ──────────────────────────────────────────────────────────────

export async function createReInspection(originalInspectionId: string, inspectorUserId?: string) {
  const original = await prisma.qualityInspection.findUnique({
    where: { id: originalInspectionId },
  });
  if (!original) throw new NotFoundError('Original inspection not found');
  if (original.overallResult === 'pending') throw new ValidationError('Original inspection is still pending');

  return createInspection({
    grnId: original.grnId,
    grnLineId: original.grnLineId,
    materialId: original.materialId,
    inspectorUserId,
  });
}

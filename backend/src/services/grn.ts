import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';
import { getSettingOrDefault } from './settings';
import { updatePoLineReceivedQuantity } from './purchase-orders';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateGrnInput {
  poId: string;
  shipmentId?: string | null;
  deliveryChallanNumber?: string | null;
  deliveryChallanDate?: string | null;
  vehicleNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  receivedAtLocationId: string;
  gatePassNumber?: string | null;
  notes?: string | null;
  receivedBy?: string | null;
  lines: CreateGrnLineInput[];
}

export interface CreateGrnLineInput {
  poLineId: string;
  materialId: string;
  quantityReceived: number;
  uom?: string;
  batchNumber?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  binId?: string | null;
  generalAreaId?: string | null;
  notes?: string | null;
}

export interface ListGrnFilter {
  status?: string;
  poId?: string;
  vendorId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const GRN_INCLUDE = {
  po: { select: { id: true, poNumber: true, poType: true, vendor: { select: { id: true, vendorCode: true, vendorName: true } } } },
  vendor: { select: { id: true, vendorCode: true, vendorName: true } },
  receivedAtLocation: { select: { id: true, locationCode: true, locationName: true } },
  lines: {
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      poLine: { select: { id: true, quantityOrdered: true, receivedQuantity: true, unitPrice: true } },
    },
  },
  documents: true,
};

// ─── GRN CRUD ───────────────────────────────────────────────────────────────────

export async function createGrn(input: CreateGrnInput) {
  if (!input.lines.length) throw new ValidationError('At least one line is required');

  const po = await prisma.purchaseOrder.findUnique({ where: { id: input.poId } });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (!['acknowledged', 'sent_to_vendor', 'approved', 'partially_received'].includes(po.status)) {
    throw new ValidationError('PO must be in an appropriate status to receive goods');
  }

  const location = await prisma.storageLocation.findUnique({ where: { id: input.receivedAtLocationId } });
  if (!location) throw new NotFoundError('Receiving location not found');
  if (location.isFrozen) throw new ValidationError('Receiving location is frozen');

  // Tolerance check
  const tolerancePercent = await getSettingOrDefault<number>('GRN_QUANTITY_TOLERANCE_PERCENT', 5);

  for (const line of input.lines) {
    const poLine = await prisma.purchaseOrderLine.findUnique({ where: { id: line.poLineId } });
    if (!poLine || poLine.poId !== input.poId) throw new NotFoundError(`PO line ${line.poLineId} not found`);

    const maxAllowed = Number(poLine.quantityOrdered) * (1 + tolerancePercent / 100);
    const alreadyReceived = Number(poLine.receivedQuantity);
    const remaining = maxAllowed - alreadyReceived;

    if (line.quantityReceived > remaining) {
      throw new ValidationError(
        `Quantity ${line.quantityReceived} exceeds tolerance for PO line (max remaining: ${remaining.toFixed(4)})`,
      );
    }
  }

  const { number: grnNumber } = await getNextNumber('GRN-SC');

  const totalQuantity = input.lines.reduce((s, l) => s + l.quantityReceived, 0);

  const grn = await prisma.goodsReceiptNote.create({
    data: {
      grnNumber,
      grnType: po.poType === 'import' ? 'import' : 'domestic',
      poId: input.poId,
      shipmentId: input.shipmentId ?? null,
      vendorId: po.vendorId,
      deliveryChallanNumber: input.deliveryChallanNumber ?? null,
      deliveryChallanDate: input.deliveryChallanDate ? new Date(input.deliveryChallanDate) : null,
      vehicleNumber: input.vehicleNumber ?? null,
      driverName: input.driverName ?? null,
      driverPhone: input.driverPhone ?? null,
      receivedAtLocationId: input.receivedAtLocationId,
      receivedBy: input.receivedBy ?? null,
      gatePassNumber: input.gatePassNumber ?? null,
      notes: input.notes ?? null,
      totalQuantityReceived: totalQuantity,
      lines: {
        create: input.lines.map((line) => {
          return {
            poLineId: line.poLineId,
            materialId: line.materialId,
            quantityReceived: line.quantityReceived,
            uom: line.uom ?? 'PCS',
            unitPrice: 0, // placeholder, set after creation
            batchNumber: line.batchNumber ?? null,
            lotNumber: line.lotNumber ?? null,
            expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
            binId: line.binId ?? null,
            generalAreaId: line.generalAreaId ?? null,
            notes: line.notes ?? null,
          };
        }),
      },
    },
    include: GRN_INCLUDE,
  });

  // Set unit prices from PO lines and compute tolerance used
  for (const grnLine of grn.lines) {
    const poLine = await prisma.purchaseOrderLine.findUnique({ where: { id: grnLine.poLineId } });
    if (poLine) {
      const toleranceUsed = ((Number(grnLine.quantityReceived) - Number(poLine.quantityOrdered)) / Number(poLine.quantityOrdered)) * 100;
      await prisma.goodsReceiptLine.update({
        where: { id: grnLine.id },
        data: {
          unitPrice: poLine.unitPrice,
          quantityToleranceUsed: Math.max(0, toleranceUsed),
        },
      });
    }
  }

  // Compute total value
  const updatedLines = await prisma.goodsReceiptLine.findMany({ where: { grnId: grn.id } });
  const totalValue = updatedLines.reduce((s, l) => s + Number(l.quantityReceived) * Number(l.unitPrice), 0);
  await prisma.goodsReceiptNote.update({
    where: { id: grn.id },
    data: { totalValue: Math.round(totalValue * 100) / 100 },
  });

  return prisma.goodsReceiptNote.findUnique({ where: { id: grn.id }, include: GRN_INCLUDE });
}

export async function listGrns(filter: ListGrnFilter) {
  const where: Prisma.GoodsReceiptNoteWhereInput = { isDeleted: false };

  if (filter.status) where.status = filter.status;
  if (filter.poId) where.poId = filter.poId;
  if (filter.vendorId) where.vendorId = filter.vendorId;
  if (filter.search) {
    where.OR = [
      { grnNumber: { contains: filter.search, mode: 'insensitive' } },
      { deliveryChallanNumber: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, grns] = await Promise.all([
    prisma.goodsReceiptNote.count({ where }),
    prisma.goodsReceiptNote.findMany({
      where,
      include: {
        po: { select: { poNumber: true } },
        vendor: { select: { vendorCode: true, vendorName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, grns };
}

export async function getGrn(id: string) {
  const grn = await prisma.goodsReceiptNote.findUnique({
    where: { id },
    include: GRN_INCLUDE,
  });
  if (!grn || grn.isDeleted) throw new NotFoundError('GRN not found');
  return grn;
}

// ─── Submit GRN ─────────────────────────────────────────────────────────────────

export async function submitGrn(id: string) {
  const grn = await prisma.goodsReceiptNote.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!grn || grn.isDeleted) throw new NotFoundError('GRN not found');
  if (grn.status !== 'draft') throw new ValidationError('GRN must be in draft status to submit');

  // Check if QC module is active
  const qcModule = await prisma.module.findUnique({
    where: { moduleCode: 'quality_check_inbound' },
  });
  const qcActive = qcModule?.isActive ?? false;

  if (qcActive) {
    await prisma.goodsReceiptNote.update({
      where: { id },
      data: { status: 'qc_pending' },
    });
    // QC inspections will be triggered by the quality inspections service
  } else {
    await acceptGrn(id);
  }

  return prisma.goodsReceiptNote.findUnique({ where: { id }, include: GRN_INCLUDE });
}

// ─── Accept GRN (stock impact) ──────────────────────────────────────────────────

export async function acceptGrn(grnId: string) {
  const grn = await prisma.goodsReceiptNote.findUnique({
    where: { id: grnId },
    include: {
      lines: { include: { poLine: true } },
      po: true,
    },
  });
  if (!grn || grn.isDeleted) throw new NotFoundError('GRN not found');

  for (const line of grn.lines) {
    let unitCost: number;

    if (grn.grnType === 'import' && grn.shipmentId) {
      // Use landed cost for imports
      const allocation = await prisma.importLandedCostAllocation.findFirst({
        where: { shipmentId: grn.shipmentId, poLineId: line.poLineId },
      });
      unitCost = allocation ? Number(allocation.totalLandedCostPerUnit) : Number(line.unitPrice);
    } else {
      unitCost = Number(line.unitPrice);
    }

    const totalCost = Math.round(Number(line.quantityReceived) * unitCost * 100) / 100;

    // Find or create Stock record
    const stock = await prisma.stock.upsert({
      where: {
        materialId_locationId_binId: {
          materialId: line.materialId,
          locationId: grn.receivedAtLocationId,
          binId: line.binId ?? '',
        },
      },
      create: {
        materialId: line.materialId,
        locationId: grn.receivedAtLocationId,
        binId: line.binId ?? null,
        generalAreaId: line.generalAreaId ?? null,
        currentQuantity: line.quantityReceived,
        lastMovementAt: new Date(),
      },
      update: {
        currentQuantity: { increment: line.quantityReceived },
        lastMovementAt: new Date(),
      },
    });

    // Create stock batch
    await prisma.stockBatch.create({
      data: {
        stockId: stock.id,
        batchNumber: line.batchNumber ?? grn.grnNumber,
        grnId: grnId,
        originalQuantity: line.quantityReceived,
        currentQuantity: line.quantityReceived,
        unitCost,
        totalCost,
        expiryDate: line.expiryDate ?? null,
        lotNumber: line.lotNumber ?? null,
      },
    });

    // Create stock movement
    const { number: movementNumber } = await getNextNumber('MOV');
    await prisma.stockMovement.create({
      data: {
        movementNumber,
        movementType: 'inward_grn',
        materialId: line.materialId,
        destinationLocationId: grn.receivedAtLocationId,
        destinationBinId: line.binId ?? null,
        quantity: line.quantityReceived,
        unitCostAtMovement: unitCost,
        totalCost,
        referenceDocType: 'grn',
        referenceDocId: grnId,
        movedBy: grn.receivedBy ?? null,
      },
    });

    // Update PO line received quantity
    await updatePoLineReceivedQuantity(line.poLineId, Number(line.quantityReceived));

    // Update GRN line status
    await prisma.goodsReceiptLine.update({
      where: { id: line.id },
      data: { status: 'accepted', acceptedQuantity: line.quantityReceived },
    });
  }

  return prisma.goodsReceiptNote.update({
    where: { id: grnId },
    data: { status: 'accepted' },
    include: GRN_INCLUDE,
  });
}

// ─── Documents ──────────────────────────────────────────────────────────────────

export async function addGrnDocument(grnId: string, documentType: string, documentPath: string, uploadedBy?: string) {
  const grn = await prisma.goodsReceiptNote.findUnique({ where: { id: grnId } });
  if (!grn || grn.isDeleted) throw new NotFoundError('GRN not found');

  return prisma.grnDocument.create({
    data: {
      grnId,
      documentType,
      documentPath,
      uploadedBy: uploadedBy ?? null,
    },
  });
}

export async function listGrnDocuments(grnId: string) {
  return prisma.grnDocument.findMany({
    where: { grnId },
    orderBy: { uploadedAt: 'desc' },
  });
}

export async function deleteGrnDocument(grnId: string, documentId: string) {
  const doc = await prisma.grnDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.grnId !== grnId) throw new NotFoundError('Document not found');

  await prisma.grnDocument.delete({ where: { id: documentId } });
}

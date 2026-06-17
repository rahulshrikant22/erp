import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreatePrInput {
  prType?: string;
  sourceType?: string;
  sourceOrders?: string[];
  requiredByDate?: string | null;
  currencyCode?: string;
  notes?: string | null;
  requestedBy?: string | null;
  lines: CreatePrLineInput[];
}

export interface CreatePrLineInput {
  materialId: string;
  quantityRequested: number;
  uom?: string;
  estimatedUnitPrice?: number | null;
  suggestedVendorId?: string | null;
  notes?: string | null;
}

export interface UpdatePrInput {
  requiredByDate?: string | null;
  notes?: string | null;
}

export interface ListPrFilter {
  status?: string;
  prType?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function computeLineValue(qty: number, price: number | null | undefined): number | null {
  if (price == null) return null;
  return Math.round(qty * price * 100) / 100;
}

function computeTotalEstimated(lines: Array<{ estimatedLineValue?: Prisma.Decimal | null }>): number {
  return lines.reduce((sum, l) => {
    const val = l.estimatedLineValue ? Number(l.estimatedLineValue) : 0;
    return sum + val;
  }, 0);
}

const PR_INCLUDE = {
  lines: {
    orderBy: { lineSequence: 'asc' as const },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true, purchaseUom: true } },
    },
  },
};

// ─── PR CRUD ────────────────────────────────────────────────────────────────────

export async function createPr(input: CreatePrInput) {
  if (!input.lines.length) throw new ValidationError('At least one line is required');

  const { number: prNumber } = await getNextNumber('PR');

  const pr = await prisma.purchaseRequisition.create({
    data: {
      prNumber,
      prType: input.prType ?? 'manual',
      sourceType: input.sourceType ?? 'manual',
      sourceOrders: input.sourceOrders ?? undefined,
      requiredByDate: input.requiredByDate ? new Date(input.requiredByDate) : null,
      currencyCode: input.currencyCode ?? 'INR',
      notes: input.notes ?? null,
      requestedBy: input.requestedBy ?? null,
      lines: {
        create: input.lines.map((line, idx) => ({
          lineSequence: (idx + 1) * 10,
          materialId: line.materialId,
          quantityRequested: line.quantityRequested,
          uom: line.uom ?? 'PCS',
          estimatedUnitPrice: line.estimatedUnitPrice ?? null,
          estimatedLineValue: computeLineValue(line.quantityRequested, line.estimatedUnitPrice),
          suggestedVendorId: line.suggestedVendorId ?? null,
          notes: line.notes ?? null,
        })),
      },
    },
    include: PR_INCLUDE,
  });

  const totalEstimated = computeTotalEstimated(pr.lines);
  if (totalEstimated > 0) {
    await prisma.purchaseRequisition.update({
      where: { id: pr.id },
      data: { totalEstimatedValue: totalEstimated },
    });
  }

  return prisma.purchaseRequisition.findUnique({ where: { id: pr.id }, include: PR_INCLUDE });
}

export async function listPrs(filter: ListPrFilter) {
  const where: Prisma.PurchaseRequisitionWhereInput = { isDeleted: false };

  if (filter.status) where.status = filter.status;
  if (filter.prType) where.prType = filter.prType;
  if (filter.search) {
    where.OR = [
      { prNumber: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, prs] = await Promise.all([
    prisma.purchaseRequisition.count({ where }),
    prisma.purchaseRequisition.findMany({
      where,
      include: { _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, prs };
}

export async function getPr(id: string) {
  const pr = await prisma.purchaseRequisition.findUnique({
    where: { id },
    include: PR_INCLUDE,
  });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  return pr;
}

export async function updatePr(id: string, input: UpdatePrInput) {
  const pr = await prisma.purchaseRequisition.findUnique({ where: { id } });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  if (pr.status !== 'draft') throw new ValidationError('Can only edit draft PRs');

  return prisma.purchaseRequisition.update({
    where: { id },
    data: {
      ...(input.requiredByDate !== undefined && { requiredByDate: input.requiredByDate ? new Date(input.requiredByDate) : null }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: PR_INCLUDE,
  });
}

export async function addPrLine(prId: string, input: CreatePrLineInput) {
  const pr = await prisma.purchaseRequisition.findUnique({ where: { id: prId } });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  if (pr.status !== 'draft') throw new ValidationError('Can only add lines to draft PRs');

  const lastLine = await prisma.purchaseRequisitionLine.findFirst({
    where: { prId },
    orderBy: { lineSequence: 'desc' },
    select: { lineSequence: true },
  });

  return prisma.purchaseRequisitionLine.create({
    data: {
      prId,
      lineSequence: (lastLine?.lineSequence ?? 0) + 10,
      materialId: input.materialId,
      quantityRequested: input.quantityRequested,
      uom: input.uom ?? 'PCS',
      estimatedUnitPrice: input.estimatedUnitPrice ?? null,
      estimatedLineValue: computeLineValue(input.quantityRequested, input.estimatedUnitPrice),
      suggestedVendorId: input.suggestedVendorId ?? null,
      notes: input.notes ?? null,
    },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
    },
  });
}

export async function removePrLine(prId: string, lineId: string) {
  const pr = await prisma.purchaseRequisition.findUnique({ where: { id: prId } });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  if (pr.status !== 'draft') throw new ValidationError('Can only remove lines from draft PRs');

  const line = await prisma.purchaseRequisitionLine.findUnique({ where: { id: lineId } });
  if (!line || line.prId !== prId) throw new NotFoundError('PR line not found');

  await prisma.purchaseRequisitionLine.delete({ where: { id: lineId } });
}

// ─── Workflow ───────────────────────────────────────────────────────────────────

export async function submitPr(id: string) {
  const pr = await prisma.purchaseRequisition.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  if (pr.status !== 'draft') throw new ValidationError('PR must be in draft status to submit');
  if (!pr.lines.length) throw new ValidationError('PR must have at least one line');

  return prisma.purchaseRequisition.update({
    where: { id },
    data: { status: 'submitted' },
    include: PR_INCLUDE,
  });
}

export async function approvePr(id: string, approvedBy: string) {
  const pr = await prisma.purchaseRequisition.findUnique({ where: { id } });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  if (pr.status !== 'submitted') throw new ValidationError('PR must be submitted before approval');

  return prisma.purchaseRequisition.update({
    where: { id },
    data: {
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    },
    include: PR_INCLUDE,
  });
}

export async function rejectPr(id: string, rejectedBy: string, reason: string) {
  const pr = await prisma.purchaseRequisition.findUnique({ where: { id } });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  if (pr.status !== 'submitted') throw new ValidationError('PR must be submitted before rejection');

  return prisma.purchaseRequisition.update({
    where: { id },
    data: {
      status: 'rejected',
      approvedBy: rejectedBy,
      rejectionReason: reason,
    },
    include: PR_INCLUDE,
  });
}

// ─── Auto-generation from confirmed orders ──────────────────────────────────────

export async function generatePrFromOrders(orderIds: string[], requestedBy?: string) {
  const materialDemand = new Map<string, { materialId: string; totalQty: number; uom: string }>();

  const resolvedBoms = await prisma.resolvedBom.findMany({
    where: { isDeleted: false, orderId: { in: orderIds } },
    include: {
      materialLines: {
        include: { material: { select: { id: true, purchaseUom: true } } },
      },
    },
  });

  for (const rb of resolvedBoms) {
    for (const ml of rb.materialLines) {
      const key = ml.materialId;
      const existing = materialDemand.get(key);
      const wastageMultiplier = 1 + Number(ml.wastagePercentApplied ?? 0) / 100;
      const qty = Number(ml.quantityRequired) * wastageMultiplier;
      if (existing) {
        existing.totalQty += qty;
      } else {
        materialDemand.set(key, {
          materialId: ml.materialId,
          totalQty: qty,
          uom: ml.material?.purchaseUom ?? 'PCS',
        });
      }
    }
  }

  if (materialDemand.size === 0) {
    throw new ValidationError('No material demand found for given orders');
  }

  const lines: CreatePrLineInput[] = [];

  for (const [materialId, demand] of materialDemand) {
    // Subtract available stock
    const stockAgg = await prisma.stock.aggregate({
      where: { materialId },
      _sum: { currentQuantity: true, reservedQuantitySoft: true, reservedQuantityHard: true },
    });
    const available = Number(stockAgg._sum.currentQuantity ?? 0)
      - Number(stockAgg._sum.reservedQuantitySoft ?? 0)
      - Number(stockAgg._sum.reservedQuantityHard ?? 0);

    // Subtract open PO quantities
    const openPoAgg = await prisma.purchaseOrderLine.aggregate({
      where: {
        materialId,
        status: { in: ['open', 'partially_received'] },
        po: { isDeleted: false, status: { notIn: ['cancelled', 'closed'] } },
      },
      _sum: { quantityOrdered: true, receivedQuantity: true },
    });
    const pendingPoQty = Number(openPoAgg._sum.quantityOrdered ?? 0) - Number(openPoAgg._sum.receivedQuantity ?? 0);

    const netRequired = demand.totalQty - available - pendingPoQty;
    if (netRequired <= 0) continue;

    // Find suggested vendor from rate contracts
    const now = new Date();
    const bestContract = await prisma.rateContract.findFirst({
      where: {
        materialId,
        isDeleted: false,
        validityFrom: { lte: now },
        OR: [{ validityUntil: null }, { validityUntil: { gte: now } }],
        vendor: { isDeleted: false, isActive: true, isBlacklisted: false },
      },
      orderBy: [{ isPreferred: 'desc' }, { unitPrice: 'asc' }],
    });

    lines.push({
      materialId,
      quantityRequested: Math.ceil(netRequired * 10000) / 10000,
      uom: demand.uom,
      estimatedUnitPrice: bestContract ? Number(bestContract.unitPrice) : undefined,
      suggestedVendorId: bestContract?.vendorId ?? undefined,
    });
  }

  if (!lines.length) {
    return { message: 'All materials have sufficient stock or pending POs', pr: null };
  }

  const pr = await createPr({
    prType: 'auto_from_bom',
    sourceType: 'order_consolidated',
    sourceOrders: orderIds,
    requestedBy,
    lines,
  });

  return { message: 'PR generated', pr };
}

// ─── Consolidation Preview ──────────────────────────────────────────────────────

export async function getConsolidationPreview(prIds: string[]) {
  const materialMap = new Map<string, { materialId: string; totalQty: number; uom: string; vendors: Set<string> }>();

  for (const prId of prIds) {
    const pr = await prisma.purchaseRequisition.findUnique({
      where: { id: prId },
      include: { lines: true },
    });
    if (!pr || pr.isDeleted) continue;

    for (const line of pr.lines) {
      const key = line.materialId;
      const existing = materialMap.get(key);
      if (existing) {
        existing.totalQty += Number(line.quantityRequested);
        if (line.suggestedVendorId) existing.vendors.add(line.suggestedVendorId);
      } else {
        const vendors = new Set<string>();
        if (line.suggestedVendorId) vendors.add(line.suggestedVendorId);
        materialMap.set(key, {
          materialId: line.materialId,
          totalQty: Number(line.quantityRequested),
          uom: line.uom,
          vendors,
        });
      }
    }
  }

  const preview = [];
  for (const [, v] of materialMap) {
    const material = await prisma.material.findUnique({
      where: { id: v.materialId },
      select: { id: true, materialCode: true, materialName: true },
    });
    preview.push({
      material,
      totalQuantity: v.totalQty,
      uom: v.uom,
      suggestedVendorIds: Array.from(v.vendors),
    });
  }

  return preview;
}

// ─── PR to PO ───────────────────────────────────────────────────────────────────

export async function createPoFromPrLines(
  prId: string,
  lineIds: string[],
  vendorId: string,
  createdById?: string,
) {
  const pr = await prisma.purchaseRequisition.findUnique({
    where: { id: prId },
    include: { lines: true },
  });
  if (!pr || pr.isDeleted) throw new NotFoundError('Purchase requisition not found');
  if (!['approved', 'partially_po_raised'].includes(pr.status)) {
    throw new ValidationError('PR must be approved before creating PO');
  }

  const selectedLines = pr.lines.filter((l) => lineIds.includes(l.id));
  if (!selectedLines.length) throw new ValidationError('No valid lines selected');

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted || !vendor.isActive) {
    throw new NotFoundError('Vendor not found or inactive');
  }
  if (vendor.isBlacklisted) {
    throw new ValidationError('Cannot create PO for blacklisted vendor');
  }

  const { number: poNumber } = await getNextNumber('PO-SC');

  let subtotal = 0;
  const poLines = selectedLines.map((line, idx) => {
    const unitPrice = Number(line.estimatedUnitPrice ?? 0);
    const lineValue = Math.round(Number(line.quantityRequested) * unitPrice * 100) / 100;
    subtotal += lineValue;
    return {
      lineSequence: (idx + 1) * 10,
      materialId: line.materialId,
      prLineId: line.id,
      quantityOrdered: line.quantityRequested,
      uom: line.uom,
      unitPrice: unitPrice,
      lineValue: lineValue,
    };
  });

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      poType: vendor.vendorType === 'import' ? 'import' : 'domestic',
      vendorId,
      sourcePrId: prId,
      currencyCode: vendor.currencyCode,
      subtotal,
      taxableValue: subtotal,
      totalAmount: subtotal,
      createdById: createdById ?? null,
      lines: { create: poLines },
    },
    include: {
      lines: { include: { material: { select: { id: true, materialCode: true, materialName: true } } } },
      vendor: { select: { id: true, vendorCode: true, vendorName: true } },
    },
  });

  // Update PR line po_raised_quantity
  for (const line of selectedLines) {
    await prisma.purchaseRequisitionLine.update({
      where: { id: line.id },
      data: {
        poRaisedQuantity: { increment: line.quantityRequested },
      },
    });
  }

  // Update PR status
  const allLines = await prisma.purchaseRequisitionLine.findMany({ where: { prId } });
  const allRaised = allLines.every((l) => Number(l.poRaisedQuantity) >= Number(l.quantityRequested));

  await prisma.purchaseRequisition.update({
    where: { id: prId },
    data: { status: allRaised ? 'fully_po_raised' : 'partially_po_raised' },
  });

  return po;
}

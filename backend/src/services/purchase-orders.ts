import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';
import { getSettingOrDefault } from './settings';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreatePoInput {
  vendorId: string;
  vendorContactId?: string | null;
  sourcePrId?: string | null;
  branchId?: string | null;
  deliveryLocationId?: string | null;
  expectedDeliveryDate?: string | null;
  currencyCode?: string;
  exchangeRateAtPo?: number | null;
  discount?: number;
  otherCharges?: number;
  paymentTermsTemplateId?: string | null;
  paymentTermsNotes?: string | null;
  deliveryTerms?: string | null;
  shippingMode?: string | null;
  createdById?: string | null;
  lines: CreatePoLineInput[];
}

export interface CreatePoLineInput {
  materialId: string;
  prLineId?: string | null;
  quantityOrdered: number;
  uom?: string;
  unitPrice: number;
  hsnCode?: string | null;
  taxRate?: number | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
}

export interface UpdatePoInput {
  vendorContactId?: string | null;
  expectedDeliveryDate?: string | null;
  discount?: number;
  otherCharges?: number;
  paymentTermsTemplateId?: string | null;
  paymentTermsNotes?: string | null;
  deliveryTerms?: string | null;
  shippingMode?: string | null;
  updatedById?: string | null;
}

export interface ListPoFilter {
  search?: string;
  status?: string;
  vendorId?: string;
  poType?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function computeLineTotals(line: { quantityOrdered: number; unitPrice: number; taxRate?: number | null }) {
  const lineValue = Math.round(line.quantityOrdered * line.unitPrice * 100) / 100;
  const taxAmount = line.taxRate ? Math.round(lineValue * Number(line.taxRate) / 100 * 100) / 100 : 0;
  return { lineValue, taxAmount };
}

function computePoTotals(
  lines: Array<{ lineValue: number; taxAmount: number }>,
  discount: number,
  otherCharges: number,
) {
  const subtotal = lines.reduce((s, l) => s + l.lineValue, 0);
  const totalTax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const taxableValue = subtotal - discount;
  const totalAmount = taxableValue + totalTax + otherCharges;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    taxableValue: Math.round(taxableValue * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

const PO_INCLUDE = {
  vendor: { select: { id: true, vendorCode: true, vendorName: true, vendorType: true } },
  lines: {
    orderBy: { lineSequence: 'asc' as const },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
    },
  },
  approvals: { orderBy: { approvalLevel: 'asc' as const } },
  communications: { orderBy: { sentAt: 'desc' as const } },
};

// ─── PO CRUD ────────────────────────────────────────────────────────────────────

export async function createPo(input: CreatePoInput) {
  if (!input.lines.length) throw new ValidationError('At least one line is required');

  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor || vendor.isDeleted || !vendor.isActive) throw new NotFoundError('Vendor not found or inactive');
  if (vendor.isBlacklisted) throw new ValidationError('Cannot create PO for blacklisted vendor');

  const { number: poNumber } = await getNextNumber('PO-SC');

  const lineTotals = input.lines.map((l) => computeLineTotals(l));
  const totals = computePoTotals(lineTotals, input.discount ?? 0, input.otherCharges ?? 0);

  return prisma.purchaseOrder.create({
    data: {
      poNumber,
      poType: vendor.vendorType === 'import' ? 'import' : 'domestic',
      vendorId: input.vendorId,
      vendorContactId: input.vendorContactId ?? null,
      sourcePrId: input.sourcePrId ?? null,
      branchId: input.branchId ?? null,
      deliveryLocationId: input.deliveryLocationId ?? null,
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
      currencyCode: input.currencyCode ?? vendor.currencyCode,
      exchangeRateAtPo: input.exchangeRateAtPo ?? null,
      subtotal: totals.subtotal,
      discount: input.discount ?? 0,
      taxableValue: totals.taxableValue,
      totalTax: totals.totalTax,
      otherCharges: input.otherCharges ?? 0,
      totalAmount: totals.totalAmount,
      paymentTermsTemplateId: input.paymentTermsTemplateId ?? vendor.paymentTermsTemplateId,
      paymentTermsNotes: input.paymentTermsNotes ?? null,
      deliveryTerms: input.deliveryTerms ?? null,
      shippingMode: input.shippingMode ?? null,
      createdById: input.createdById ?? null,
      lines: {
        create: input.lines.map((l, idx) => {
          const lt = lineTotals[idx];
          return {
            lineSequence: (idx + 1) * 10,
            materialId: l.materialId,
            prLineId: l.prLineId ?? null,
            quantityOrdered: l.quantityOrdered,
            uom: l.uom ?? 'PCS',
            unitPrice: l.unitPrice,
            lineValue: lt.lineValue,
            hsnCode: l.hsnCode ?? null,
            taxRate: l.taxRate ?? null,
            taxAmount: lt.taxAmount,
            expectedDeliveryDate: l.expectedDeliveryDate ? new Date(l.expectedDeliveryDate) : null,
            notes: l.notes ?? null,
          };
        }),
      },
    },
    include: PO_INCLUDE,
  });
}

export async function listPos(filter: ListPoFilter) {
  const where: Prisma.PurchaseOrderWhereInput = { isDeleted: false };

  if (filter.status) where.status = filter.status;
  if (filter.vendorId) where.vendorId = filter.vendorId;
  if (filter.poType) where.poType = filter.poType;
  if (filter.search) {
    where.OR = [
      { poNumber: { contains: filter.search, mode: 'insensitive' } },
      { vendor: { vendorName: { contains: filter.search, mode: 'insensitive' } } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, pos] = await Promise.all([
    prisma.purchaseOrder.count({ where }),
    prisma.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { id: true, vendorCode: true, vendorName: true } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, pos };
}

export async function getPo(id: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: PO_INCLUDE,
  });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  return po;
}

export async function updatePo(id: string, input: UpdatePoInput) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'draft') throw new ValidationError('Can only edit draft POs');

  const data: any = {
    ...(input.vendorContactId !== undefined && { vendorContactId: input.vendorContactId }),
    ...(input.expectedDeliveryDate !== undefined && { expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null }),
    ...(input.paymentTermsTemplateId !== undefined && { paymentTermsTemplateId: input.paymentTermsTemplateId }),
    ...(input.paymentTermsNotes !== undefined && { paymentTermsNotes: input.paymentTermsNotes }),
    ...(input.deliveryTerms !== undefined && { deliveryTerms: input.deliveryTerms }),
    ...(input.shippingMode !== undefined && { shippingMode: input.shippingMode }),
    updatedById: input.updatedById ?? null,
  };

  if (input.discount !== undefined || input.otherCharges !== undefined) {
    const lines = await prisma.purchaseOrderLine.findMany({ where: { poId: id } });
    const lineTotals = lines.map((l) => ({
      lineValue: Number(l.lineValue),
      taxAmount: Number(l.taxAmount ?? 0),
    }));
    const totals = computePoTotals(lineTotals, input.discount ?? Number(po.discount), input.otherCharges ?? Number(po.otherCharges));
    Object.assign(data, {
      ...(input.discount !== undefined && { discount: input.discount }),
      ...(input.otherCharges !== undefined && { otherCharges: input.otherCharges }),
      subtotal: totals.subtotal,
      taxableValue: totals.taxableValue,
      totalTax: totals.totalTax,
      totalAmount: totals.totalAmount,
    });
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data,
    include: PO_INCLUDE,
  });
}

export async function addPoLine(poId: string, input: CreatePoLineInput) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'draft') throw new ValidationError('Can only add lines to draft POs');

  const lastLine = await prisma.purchaseOrderLine.findFirst({
    where: { poId },
    orderBy: { lineSequence: 'desc' },
    select: { lineSequence: true },
  });

  const lt = computeLineTotals(input);

  const line = await prisma.purchaseOrderLine.create({
    data: {
      poId,
      lineSequence: (lastLine?.lineSequence ?? 0) + 10,
      materialId: input.materialId,
      prLineId: input.prLineId ?? null,
      quantityOrdered: input.quantityOrdered,
      uom: input.uom ?? 'PCS',
      unitPrice: input.unitPrice,
      lineValue: lt.lineValue,
      hsnCode: input.hsnCode ?? null,
      taxRate: input.taxRate ?? null,
      taxAmount: lt.taxAmount,
      expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
      notes: input.notes ?? null,
    },
  });

  await recalcPoTotals(poId);
  return line;
}

export async function removePoLine(poId: string, lineId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'draft') throw new ValidationError('Can only remove lines from draft POs');

  const line = await prisma.purchaseOrderLine.findUnique({ where: { id: lineId } });
  if (!line || line.poId !== poId) throw new NotFoundError('PO line not found');

  await prisma.purchaseOrderLine.delete({ where: { id: lineId } });
  await recalcPoTotals(poId);
}

async function recalcPoTotals(poId: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) return;

  const lines = await prisma.purchaseOrderLine.findMany({ where: { poId } });
  const lineTotals = lines.map((l) => ({
    lineValue: Number(l.lineValue),
    taxAmount: Number(l.taxAmount ?? 0),
  }));
  const totals = computePoTotals(lineTotals, Number(po.discount), Number(po.otherCharges));

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      subtotal: totals.subtotal,
      taxableValue: totals.taxableValue,
      totalTax: totals.totalTax,
      totalAmount: totals.totalAmount,
    },
  });
}

// ─── Approval Workflow ──────────────────────────────────────────────────────────

export async function submitPo(id: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lines: true },
  });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'draft') throw new ValidationError('PO must be in draft status to submit');
  if (!po.lines.length) throw new ValidationError('PO must have at least one line');

  // Determine approval levels based on amount thresholds
  const thresholds = await getSettingOrDefault<any>('PO_APPROVAL_THRESHOLDS', [
    { level: 1, role: 'procurement_manager', minAmount: 0 },
    { level: 2, role: 'finance_head', minAmount: 500000 },
    { level: 3, role: 'director', minAmount: 2000000 },
  ]);

  const amount = Number(po.totalAmount);
  const requiredLevels = Array.isArray(thresholds)
    ? thresholds.filter((t: any) => amount >= (t.minAmount ?? 0))
    : [];

  if (requiredLevels.length > 0) {
    for (const level of requiredLevels) {
      await prisma.poApproval.create({
        data: {
          poId: id,
          approvalLevel: level.level,
          requiredRole: level.role,
        },
      });
    }
    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'pending_approval' },
    });
  } else {
    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'approved' },
    });
  }

  return prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
}

export async function approvePo(id: string, approverUserId: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { approvals: { orderBy: { approvalLevel: 'asc' } } },
  });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'pending_approval') throw new ValidationError('PO is not pending approval');

  const pendingApproval = po.approvals.find((a) => a.approvalStatus === 'pending');
  if (!pendingApproval) throw new ValidationError('No pending approval found');

  await prisma.poApproval.update({
    where: { id: pendingApproval.id },
    data: {
      approvalStatus: 'approved',
      approverUserId,
      respondedAt: new Date(),
    },
  });

  const remainingPending = await prisma.poApproval.count({
    where: { poId: id, approvalStatus: 'pending' },
  });

  if (remainingPending === 0) {
    await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'approved' },
    });
  }

  return prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
}

export async function rejectPo(id: string, approverUserId: string, notes?: string) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { approvals: { orderBy: { approvalLevel: 'asc' } } },
  });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'pending_approval') throw new ValidationError('PO is not pending approval');

  const pendingApproval = po.approvals.find((a) => a.approvalStatus === 'pending');
  if (!pendingApproval) throw new ValidationError('No pending approval found');

  await prisma.poApproval.update({
    where: { id: pendingApproval.id },
    data: {
      approvalStatus: 'rejected',
      approverUserId,
      respondedAt: new Date(),
      notes: notes ?? null,
    },
  });

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'draft' },
  });

  return prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
}

// ─── Send to Vendor / Acknowledge ───────────────────────────────────────────────

export async function sendPoToVendor(id: string, commType: string, recipient: string, sentBy?: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (po.status !== 'approved') throw new ValidationError('PO must be approved before sending');

  await prisma.poCommunication.create({
    data: {
      poId: id,
      commType,
      recipient,
      sentBy: sentBy ?? null,
    },
  });

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'sent_to_vendor', sentToVendorAt: new Date() },
  });

  return prisma.purchaseOrder.findUnique({ where: { id }, include: PO_INCLUDE });
}

export async function acknowledgePoByVendor(id: string, method?: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');
  if (!['sent_to_vendor', 'approved'].includes(po.status)) {
    throw new ValidationError('PO must be sent to vendor or approved before acknowledgement');
  }

  return prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'acknowledged',
      vendorAcknowledgedAt: new Date(),
      vendorAcknowledgementMethod: method ?? null,
    },
    include: PO_INCLUDE,
  });
}

// ─── Cancel ─────────────────────────────────────────────────────────────────────

export async function cancelPo(id: string, reason: string, updatedById?: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.isDeleted) throw new NotFoundError('Purchase order not found');

  const grnCount = await prisma.goodsReceiptNote.count({
    where: { poId: id, isDeleted: false },
  });
  if (grnCount > 0) {
    throw new ConflictError('Cannot cancel PO with existing GRNs');
  }

  await prisma.purchaseOrderLine.updateMany({
    where: { poId: id },
    data: { status: 'cancelled' },
  });

  return prisma.purchaseOrder.update({
    where: { id },
    data: {
      status: 'cancelled',
      cancellationReason: reason,
      updatedById: updatedById ?? null,
    },
    include: PO_INCLUDE,
  });
}

// ─── PO Line Tracking ──────────────────────────────────────────────────────────

export async function updatePoLineReceivedQuantity(poLineId: string, additionalQty: number) {
  const line = await prisma.purchaseOrderLine.findUnique({ where: { id: poLineId } });
  if (!line) throw new NotFoundError('PO line not found');

  const newReceived = Number(line.receivedQuantity) + additionalQty;
  const ordered = Number(line.quantityOrdered);

  let lineStatus: string;
  if (newReceived >= ordered) {
    lineStatus = 'fully_received';
  } else if (newReceived > 0) {
    lineStatus = 'partially_received';
  } else {
    lineStatus = 'open';
  }

  await prisma.purchaseOrderLine.update({
    where: { id: poLineId },
    data: { receivedQuantity: newReceived, status: lineStatus },
  });

  // Check overall PO status
  const allLines = await prisma.purchaseOrderLine.findMany({ where: { poId: line.poId } });
  const allFully = allLines.every((l) => l.id === poLineId ? lineStatus === 'fully_received' : l.status === 'fully_received');
  const anyReceived = allLines.some((l) => l.id === poLineId ? newReceived > 0 : Number(l.receivedQuantity) > 0);

  let poStatus: string | null = null;
  if (allFully) {
    poStatus = 'fully_received';
  } else if (anyReceived) {
    poStatus = 'partially_received';
  }

  if (poStatus) {
    await prisma.purchaseOrder.update({
      where: { id: line.poId },
      data: { status: poStatus },
    });
  }
}

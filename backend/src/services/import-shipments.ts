import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateShipmentInput {
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: string | null;
  supplierInvoiceValue?: number | null;
  currencyCode?: string;
  exchangeRate?: number | null;
  containerNumber?: string | null;
  containerSize?: string | null;
  sealNumber?: string | null;
  vesselName?: string | null;
  voyageNumber?: string | null;
  billOfLadingNumber?: string | null;
  billOfLadingDate?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  eta?: string | null;
  shippingLine?: string | null;
  freightForwarder?: string | null;
  poIds: string[];
  createdById?: string | null;
}

export interface UpdateShipmentInput {
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: string | null;
  supplierInvoiceValue?: number | null;
  exchangeRate?: number | null;
  containerNumber?: string | null;
  containerSize?: string | null;
  sealNumber?: string | null;
  vesselName?: string | null;
  voyageNumber?: string | null;
  billOfLadingNumber?: string | null;
  billOfLadingDate?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  eta?: string | null;
  ata?: string | null;
  shippingLine?: string | null;
  freightForwarder?: string | null;
}

export interface CreateCustomsInput {
  billOfEntryNumber?: string | null;
  billOfEntryDate?: string | null;
  assessableValue?: number | null;
  basicCustomsDuty?: number | null;
  igstAmount?: number | null;
  socialWelfareSurcharge?: number | null;
  antiDumpingDuty?: number | null;
  chaCharges?: number | null;
  portCharges?: number | null;
  transportCharges?: number | null;
  insurance?: number | null;
  otherCharges?: number | null;
  chaName?: string | null;
  chaContact?: string | null;
}

export interface ListShipmentFilter {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_FLOW: Record<string, string[]> = {
  in_transit: ['arrived_port'],
  arrived_port: ['customs_clearance'],
  customs_clearance: ['cleared'],
  cleared: ['in_transit_to_factory'],
  in_transit_to_factory: ['received'],
};

const SHIPMENT_INCLUDE = {
  pos: {
    include: {
      po: {
        select: { id: true, poNumber: true, vendorId: true, totalAmount: true, vendor: { select: { vendorName: true } } },
      },
    },
  },
  customs: true,
  landedCostAllocations: {
    include: {
      poLine: { include: { material: { select: { id: true, materialCode: true, materialName: true } } } },
    },
  },
};

// ─── Shipment CRUD ──────────────────────────────────────────────────────────────

export async function createShipment(input: CreateShipmentInput) {
  if (!input.poIds.length) throw new ValidationError('At least one PO is required');

  for (const poId of input.poIds) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po || po.isDeleted) throw new NotFoundError(`PO ${poId} not found`);
    if (po.poType !== 'import') throw new ValidationError(`PO ${po.poNumber} is not an import PO`);
  }

  const { number: shipmentNumber } = await getNextNumber('IMP');

  return prisma.importShipment.create({
    data: {
      shipmentNumber,
      supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
      supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : null,
      supplierInvoiceValue: input.supplierInvoiceValue ?? null,
      currencyCode: input.currencyCode ?? 'USD',
      exchangeRate: input.exchangeRate ?? null,
      containerNumber: input.containerNumber ?? null,
      containerSize: input.containerSize ?? null,
      sealNumber: input.sealNumber ?? null,
      vesselName: input.vesselName ?? null,
      voyageNumber: input.voyageNumber ?? null,
      billOfLadingNumber: input.billOfLadingNumber ?? null,
      billOfLadingDate: input.billOfLadingDate ? new Date(input.billOfLadingDate) : null,
      portOfLoading: input.portOfLoading ?? null,
      portOfDischarge: input.portOfDischarge ?? null,
      eta: input.eta ? new Date(input.eta) : null,
      shippingLine: input.shippingLine ?? null,
      freightForwarder: input.freightForwarder ?? null,
      createdById: input.createdById ?? null,
      pos: {
        create: input.poIds.map((poId) => ({ poId })),
      },
    },
    include: SHIPMENT_INCLUDE,
  });
}

export async function listShipments(filter: ListShipmentFilter) {
  const where: Prisma.ImportShipmentWhereInput = {};

  if (filter.status) where.status = filter.status;
  if (filter.search) {
    where.OR = [
      { shipmentNumber: { contains: filter.search, mode: 'insensitive' } },
      { containerNumber: { contains: filter.search, mode: 'insensitive' } },
      { billOfLadingNumber: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, shipments] = await Promise.all([
    prisma.importShipment.count({ where }),
    prisma.importShipment.findMany({
      where,
      include: {
        pos: { include: { po: { select: { poNumber: true, vendor: { select: { vendorName: true } } } } } },
        _count: { select: { landedCostAllocations: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, shipments };
}

export async function getShipment(id: string) {
  const shipment = await prisma.importShipment.findUnique({
    where: { id },
    include: SHIPMENT_INCLUDE,
  });
  if (!shipment) throw new NotFoundError('Import shipment not found');
  return shipment;
}

export async function updateShipment(id: string, input: UpdateShipmentInput) {
  const shipment = await prisma.importShipment.findUnique({ where: { id } });
  if (!shipment) throw new NotFoundError('Import shipment not found');

  return prisma.importShipment.update({
    where: { id },
    data: {
      ...(input.supplierInvoiceNumber !== undefined && { supplierInvoiceNumber: input.supplierInvoiceNumber }),
      ...(input.supplierInvoiceDate !== undefined && { supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : null }),
      ...(input.supplierInvoiceValue !== undefined && { supplierInvoiceValue: input.supplierInvoiceValue }),
      ...(input.exchangeRate !== undefined && { exchangeRate: input.exchangeRate }),
      ...(input.containerNumber !== undefined && { containerNumber: input.containerNumber }),
      ...(input.containerSize !== undefined && { containerSize: input.containerSize }),
      ...(input.sealNumber !== undefined && { sealNumber: input.sealNumber }),
      ...(input.vesselName !== undefined && { vesselName: input.vesselName }),
      ...(input.voyageNumber !== undefined && { voyageNumber: input.voyageNumber }),
      ...(input.billOfLadingNumber !== undefined && { billOfLadingNumber: input.billOfLadingNumber }),
      ...(input.billOfLadingDate !== undefined && { billOfLadingDate: input.billOfLadingDate ? new Date(input.billOfLadingDate) : null }),
      ...(input.portOfLoading !== undefined && { portOfLoading: input.portOfLoading }),
      ...(input.portOfDischarge !== undefined && { portOfDischarge: input.portOfDischarge }),
      ...(input.eta !== undefined && { eta: input.eta ? new Date(input.eta) : null }),
      ...(input.ata !== undefined && { ata: input.ata ? new Date(input.ata) : null }),
      ...(input.shippingLine !== undefined && { shippingLine: input.shippingLine }),
      ...(input.freightForwarder !== undefined && { freightForwarder: input.freightForwarder }),
    },
    include: SHIPMENT_INCLUDE,
  });
}

// ─── Status Transitions ─────────────────────────────────────────────────────────

export async function transitionShipmentStatus(id: string, newStatus: string) {
  const shipment = await prisma.importShipment.findUnique({ where: { id } });
  if (!shipment) throw new NotFoundError('Import shipment not found');

  const allowed = STATUS_FLOW[shipment.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new ValidationError(`Cannot transition from "${shipment.status}" to "${newStatus}"`);
  }

  const data: any = { status: newStatus };
  if (newStatus === 'received') {
    data.ata = data.ata ?? new Date();
  }

  return prisma.importShipment.update({
    where: { id },
    data,
    include: SHIPMENT_INCLUDE,
  });
}

// ─── Add/Remove POs ─────────────────────────────────────────────────────────────

export async function addPoToShipment(shipmentId: string, poId: string) {
  const shipment = await prisma.importShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new NotFoundError('Shipment not found');

  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po || po.isDeleted) throw new NotFoundError('PO not found');
  if (po.poType !== 'import') throw new ValidationError('Only import POs can be added to shipments');

  return prisma.importShipmentPo.create({
    data: { shipmentId, poId },
  });
}

export async function removePoFromShipment(shipmentId: string, poId: string) {
  const link = await prisma.importShipmentPo.findUnique({
    where: { shipmentId_poId: { shipmentId, poId } },
  });
  if (!link) throw new NotFoundError('PO not linked to this shipment');

  await prisma.importShipmentPo.delete({
    where: { shipmentId_poId: { shipmentId, poId } },
  });
}

// ─── Customs ────────────────────────────────────────────────────────────────────

export async function createOrUpdateCustoms(shipmentId: string, input: CreateCustomsInput) {
  const shipment = await prisma.importShipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new NotFoundError('Shipment not found');

  const totalCustomsCharges =
    (input.basicCustomsDuty ?? 0) + (input.igstAmount ?? 0) + (input.socialWelfareSurcharge ?? 0) +
    (input.antiDumpingDuty ?? 0) + (input.chaCharges ?? 0) + (input.portCharges ?? 0) +
    (input.transportCharges ?? 0) + (input.insurance ?? 0) + (input.otherCharges ?? 0);

  const totalLandedCost = (input.assessableValue ?? 0) + totalCustomsCharges;

  const data = {
    billOfEntryNumber: input.billOfEntryNumber ?? null,
    billOfEntryDate: input.billOfEntryDate ? new Date(input.billOfEntryDate) : null,
    assessableValue: input.assessableValue ?? null,
    basicCustomsDuty: input.basicCustomsDuty ?? null,
    igstAmount: input.igstAmount ?? null,
    socialWelfareSurcharge: input.socialWelfareSurcharge ?? null,
    antiDumpingDuty: input.antiDumpingDuty ?? null,
    chaCharges: input.chaCharges ?? null,
    portCharges: input.portCharges ?? null,
    transportCharges: input.transportCharges ?? null,
    insurance: input.insurance ?? null,
    otherCharges: input.otherCharges ?? null,
    totalCustomsCharges: Math.round(totalCustomsCharges * 100) / 100,
    totalLandedCost: Math.round(totalLandedCost * 100) / 100,
    chaName: input.chaName ?? null,
    chaContact: input.chaContact ?? null,
    clearedAt: null as Date | null,
  };

  return prisma.importCustoms.upsert({
    where: { shipmentId },
    create: { shipmentId, ...data },
    update: data,
  });
}

// ─── Landed Cost Allocation ─────────────────────────────────────────────────────

export async function allocateLandedCosts(shipmentId: string) {
  const shipment = await prisma.importShipment.findUnique({
    where: { id: shipmentId },
    include: {
      customs: true,
      pos: {
        include: {
          po: {
            include: { lines: true },
          },
        },
      },
    },
  });
  if (!shipment) throw new NotFoundError('Shipment not found');
  if (!shipment.customs) throw new ValidationError('Customs data must be entered before allocation');

  // Delete existing allocations
  await prisma.importLandedCostAllocation.deleteMany({ where: { shipmentId } });

  // Collect all PO lines with their FOB value
  const allPoLines: Array<{ poLineId: string; materialId: string; fobValue: number }> = [];
  let totalFobValue = 0;

  for (const sp of shipment.pos) {
    for (const line of sp.po.lines) {
      const fob = Number(line.lineValue);
      allPoLines.push({ poLineId: line.id, materialId: line.materialId, fobValue: fob });
      totalFobValue += fob;
    }
  }

  if (totalFobValue === 0 || allPoLines.length === 0) {
    throw new ValidationError('No PO lines found for cost allocation');
  }

  const allocations = [];

  for (const pl of allPoLines) {
    const ratio = pl.fobValue / totalFobValue;
    const freightAllocated = Number(shipment.customs.transportCharges ?? 0) * ratio;
    const insuranceAllocated = Number(shipment.customs.insurance ?? 0) * ratio;
    const customsDutyAllocated = (
      Number(shipment.customs.basicCustomsDuty ?? 0) +
      Number(shipment.customs.socialWelfareSurcharge ?? 0) +
      Number(shipment.customs.antiDumpingDuty ?? 0)
    ) * ratio;
    const otherAllocated = (
      Number(shipment.customs.chaCharges ?? 0) +
      Number(shipment.customs.portCharges ?? 0) +
      Number(shipment.customs.otherCharges ?? 0) +
      Number(shipment.customs.igstAmount ?? 0)
    ) * ratio;

    const totalAllocatedForLine = pl.fobValue + freightAllocated + insuranceAllocated + customsDutyAllocated + otherAllocated;

    // Find the PO line to get quantity for per-unit cost
    let quantity = 1;
    for (const sp of shipment.pos) {
      const poLine = sp.po.lines.find((l) => l.id === pl.poLineId);
      if (poLine) { quantity = Number(poLine.quantityOrdered); break; }
    }

    const perUnit = quantity > 0 ? totalAllocatedForLine / quantity : 0;

    allocations.push({
      shipmentId,
      poLineId: pl.poLineId,
      materialId: pl.materialId,
      fobValue: Math.round(pl.fobValue * 100) / 100,
      freightAllocated: Math.round(freightAllocated * 100) / 100,
      insuranceAllocated: Math.round(insuranceAllocated * 100) / 100,
      customsDutyAllocated: Math.round(customsDutyAllocated * 100) / 100,
      otherChargesAllocated: Math.round(otherAllocated * 100) / 100,
      totalLandedCostPerUnit: Math.round(perUnit * 10000) / 10000,
    });
  }

  await prisma.importLandedCostAllocation.createMany({ data: allocations });

  return prisma.importLandedCostAllocation.findMany({
    where: { shipmentId },
    include: { poLine: { include: { material: { select: { id: true, materialCode: true, materialName: true } } } } },
  });
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────

export async function getShipmentDashboard() {
  const now = new Date();

  const [activeShipments, overdueShipments, pendingCustoms, recentlyReceived] = await Promise.all([
    prisma.importShipment.count({
      where: { status: { notIn: ['received'] } },
    }),
    prisma.importShipment.count({
      where: { status: { notIn: ['received'] }, eta: { lt: now } },
    }),
    prisma.importShipment.count({
      where: { status: 'customs_clearance' },
    }),
    prisma.importShipment.findMany({
      where: { status: 'received' },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { id: true, shipmentNumber: true, ata: true },
    }),
  ]);

  return {
    activeShipments,
    overdueShipments,
    pendingCustoms,
    recentlyReceived,
  };
}

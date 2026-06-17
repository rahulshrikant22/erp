import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export async function materialUsageReport(filters: { materialId?: string; bomId?: string }) {
  const where: any = {};
  if (filters.materialId) where.specificMaterialId = filters.materialId;
  if (filters.bomId) where.bomVersion = { bomId: filters.bomId };

  const lines = await prisma.bomMaterialLine.findMany({
    where,
    include: {
      specificMaterial: { select: { id: true, materialCode: true, materialName: true } },
      materialCategory: { select: { id: true, name: true } },
      bomVersion: {
        select: {
          id: true,
          versionNumber: true,
          versionStatus: true,
          bom: { select: { id: true, bomCode: true, bomName: true, status: true } },
        },
      },
    },
    orderBy: { bomVersion: { bom: { bomCode: 'asc' } } },
  });

  return lines.map((l) => ({
    bomCode: l.bomVersion.bom.bomCode,
    bomName: l.bomVersion.bom.bomName,
    bomStatus: l.bomVersion.bom.status,
    versionNumber: l.bomVersion.versionNumber,
    versionStatus: l.bomVersion.versionStatus,
    materialCode: l.specificMaterial?.materialCode ?? null,
    materialName: l.specificMaterial?.materialName ?? null,
    name: l.materialCategory?.name ?? null,
    lineType: l.lineType,
    quantityPerUnit: Number(l.quantityPerUnit),
    uom: l.uom,
    wastagePercent: Number(l.wastagePercent),
    isFinishDependent: l.isFinishDependent,
  }));
}

export async function bomSummaryReport() {
  const boms = await prisma.bom.findMany({
    where: { isDeleted: false },
    include: {
      product: { select: { productCode: true, productName: true } },
      versions: {
        where: { isDeleted: false },
        select: {
          id: true,
          versionNumber: true,
          versionStatus: true,
          _count: { select: { materialLines: true, processLines: true, subassemblies: true } },
        },
        orderBy: { versionNumber: 'desc' },
      },
    },
    orderBy: { bomCode: 'asc' },
  });

  return boms.map((b) => ({
    bomCode: b.bomCode,
    bomName: b.bomName,
    status: b.status,
    productCode: b.product.productCode,
    productName: b.product.productName,
    currentVersion: b.currentVersion,
    totalVersions: b.versions.length,
    latestVersion: b.versions[0]
      ? {
          versionNumber: b.versions[0].versionNumber,
          status: b.versions[0].versionStatus,
          materialLines: b.versions[0]._count.materialLines,
          processLines: b.versions[0]._count.processLines,
          subassemblies: b.versions[0]._count.subassemblies,
        }
      : null,
  }));
}

export async function costingSummaryReport(filters: { bomVersionId?: string }) {
  const where: any = {};
  if (filters.bomVersionId) where.bomVersionId = filters.bomVersionId;

  const runs = await prisma.costingRun.findMany({
    where,
    include: {
      bomVersion: {
        select: {
          versionNumber: true,
          bom: { select: { bomCode: true, bomName: true } },
        },
      },
    },
    orderBy: { runAt: 'desc' },
  });

  return runs.map((r) => ({
    costingRunNumber: r.costingRunNumber,
    bomCode: r.bomVersion.bom.bomCode,
    bomName: r.bomVersion.bom.bomName,
    versionNumber: r.bomVersion.versionNumber,
    runType: r.runType,
    materialCost: Number(r.materialCostTotal),
    laborCost: Number(r.laborCostTotal),
    overheadCost: Number(r.overheadCostTotal),
    outsourcingCost: Number(r.outsourcingCostTotal),
    manufacturingCost: Number(r.manufacturingCost),
    landingCost: r.landingCost ? Number(r.landingCost) : null,
    sellingPriceExclTax: r.sellingPriceExclTax ? Number(r.sellingPriceExclTax) : null,
    mrpInclTax: r.mrpInclTax ? Number(r.mrpInclTax) : null,
    overheadPercent: r.overheadPercentApplied ? Number(r.overheadPercentApplied) : null,
    marginPercent: r.marginPercentApplied ? Number(r.marginPercentApplied) : null,
    runAt: r.runAt,
  }));
}

// ─── Supply Chain Reports ──────────────────────────────────────────────────────

export async function poAgingReport() {
  const openPos = await prisma.purchaseOrder.findMany({
    where: {
      isDeleted: false,
      status: { in: ['draft', 'pending_approval', 'approved', 'sent_to_vendor', 'acknowledged', 'partially_received'] },
    },
    select: {
      id: true,
      poNumber: true,
      status: true,
      poDate: true,
      totalAmount: true,
      vendor: { select: { vendorCode: true, vendorName: true } },
    },
    orderBy: { poDate: 'asc' },
  });

  const now = new Date();
  const buckets = { '0_30': [] as any[], '31_60': [] as any[], '61_90': [] as any[], 'over_90': [] as any[] };

  for (const po of openPos) {
    const ageDays = Math.floor((now.getTime() - po.poDate.getTime()) / (1000 * 60 * 60 * 24));
    const item = {
      poNumber: po.poNumber,
      vendorCode: po.vendor.vendorCode,
      vendorName: po.vendor.vendorName,
      status: po.status,
      poDate: po.poDate,
      ageDays,
      totalAmount: Number(po.totalAmount),
    };

    if (ageDays <= 30) buckets['0_30'].push(item);
    else if (ageDays <= 60) buckets['31_60'].push(item);
    else if (ageDays <= 90) buckets['61_90'].push(item);
    else buckets['over_90'].push(item);
  }

  return {
    buckets,
    summary: {
      '0_30': { count: buckets['0_30'].length, value: buckets['0_30'].reduce((s, p) => s + p.totalAmount, 0) },
      '31_60': { count: buckets['31_60'].length, value: buckets['31_60'].reduce((s, p) => s + p.totalAmount, 0) },
      '61_90': { count: buckets['61_90'].length, value: buckets['61_90'].reduce((s, p) => s + p.totalAmount, 0) },
      'over_90': { count: buckets['over_90'].length, value: buckets['over_90'].reduce((s, p) => s + p.totalAmount, 0) },
    },
    totalOpenPos: openPos.length,
  };
}

export async function spendByVendorReport(dateRange: { from?: string; to?: string }) {
  const where: Prisma.PurchaseOrderWhereInput = {
    isDeleted: false,
    status: { notIn: ['draft', 'cancelled'] },
  };
  if (dateRange.from || dateRange.to) {
    where.poDate = {};
    if (dateRange.from) where.poDate.gte = new Date(dateRange.from);
    if (dateRange.to) where.poDate.lte = new Date(dateRange.to);
  }

  const pos = await prisma.purchaseOrder.findMany({
    where,
    select: {
      vendorId: true,
      totalAmount: true,
      vendor: { select: { vendorCode: true, vendorName: true, vendorType: true } },
    },
  });

  const vendorSpend = new Map<string, { vendorCode: string; vendorName: string; vendorType: string; totalSpend: number; poCount: number }>();
  for (const po of pos) {
    const existing = vendorSpend.get(po.vendorId);
    if (existing) {
      existing.totalSpend += Number(po.totalAmount);
      existing.poCount++;
    } else {
      vendorSpend.set(po.vendorId, {
        vendorCode: po.vendor.vendorCode,
        vendorName: po.vendor.vendorName,
        vendorType: po.vendor.vendorType,
        totalSpend: Number(po.totalAmount),
        poCount: 1,
      });
    }
  }

  const vendors = Array.from(vendorSpend.values())
    .map((v) => ({ ...v, totalSpend: Math.round(v.totalSpend * 100) / 100 }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const grandTotal = vendors.reduce((s, v) => s + v.totalSpend, 0);

  return { vendors, grandTotal: Math.round(grandTotal * 100) / 100 };
}

export async function spendByMaterialReport(dateRange: { from?: string; to?: string }) {
  const where: Prisma.PurchaseOrderLineWhereInput = {
    po: {
      isDeleted: false,
      status: { notIn: ['draft', 'cancelled'] },
    },
  };
  if (dateRange.from || dateRange.to) {
    const poDate: any = {};
    if (dateRange.from) poDate.gte = new Date(dateRange.from);
    if (dateRange.to) poDate.lte = new Date(dateRange.to);
    (where.po as any).poDate = poDate;
  }

  const lines = await prisma.purchaseOrderLine.findMany({
    where,
    select: {
      materialId: true,
      lineValue: true,
      material: {
        select: {
          materialCode: true,
          materialName: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  const materialSpend = new Map<string, { materialCode: string; materialName: string; category: string; totalSpend: number; lineCount: number }>();
  for (const line of lines) {
    const existing = materialSpend.get(line.materialId);
    const val = Number(line.lineValue);
    if (existing) {
      existing.totalSpend += val;
      existing.lineCount++;
    } else {
      materialSpend.set(line.materialId, {
        materialCode: line.material.materialCode,
        materialName: line.material.materialName,
        category: line.material.category.name,
        totalSpend: val,
        lineCount: 1,
      });
    }
  }

  const materials = Array.from(materialSpend.values())
    .map((m) => ({ ...m, totalSpend: Math.round(m.totalSpend * 100) / 100 }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  const grandTotal = materials.reduce((s, m) => s + m.totalSpend, 0);

  return { materials, grandTotal: Math.round(grandTotal * 100) / 100 };
}

export async function vendorPerformanceReport() {
  const vendors = await prisma.vendor.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, vendorCode: true, vendorName: true, rating: true },
  });

  const results = [];
  for (const vendor of vendors) {
    const [totalPOs, grns] = await Promise.all([
      prisma.purchaseOrder.count({ where: { vendorId: vendor.id, isDeleted: false, status: { not: 'cancelled' } } }),
      prisma.goodsReceiptNote.findMany({
        where: { vendorId: vendor.id, isDeleted: false },
        select: {
          receivedAt: true,
          po: { select: { expectedDeliveryDate: true } },
          lines: { select: { quantityReceived: true, status: true, rejectedQuantity: true } },
        },
      }),
    ]);

    if (totalPOs === 0) continue;

    let onTimeCount = 0;
    let lateCount = 0;
    let totalReceived = 0;
    let totalRejected = 0;
    const deliveryDays: number[] = [];

    for (const grn of grns) {
      if (grn.po.expectedDeliveryDate) {
        const diff = Math.floor((grn.receivedAt.getTime() - grn.po.expectedDeliveryDate.getTime()) / (1000 * 60 * 60 * 24));
        deliveryDays.push(diff);
        if (grn.receivedAt <= grn.po.expectedDeliveryDate) onTimeCount++;
        else lateCount++;
      }
      for (const line of grn.lines) {
        totalReceived += Number(line.quantityReceived);
        totalRejected += Number(line.rejectedQuantity ?? 0);
      }
    }

    const deliveriesWithExpected = onTimeCount + lateCount;
    const avgLeadTimeDays = deliveryDays.length > 0
      ? Math.round(deliveryDays.reduce((s, d) => s + d, 0) / deliveryDays.length)
      : null;

    results.push({
      vendorCode: vendor.vendorCode,
      vendorName: vendor.vendorName,
      rating: vendor.rating,
      totalPOs,
      totalGRNs: grns.length,
      onTimePercent: deliveriesWithExpected > 0 ? Math.round((onTimeCount / deliveriesWithExpected) * 100) : null,
      avgLeadTimeDays,
      rejectPercent: totalReceived > 0 ? Math.round((totalRejected / totalReceived) * 10000) / 100 : null,
    });
  }

  return results.sort((a, b) => (b.onTimePercent ?? 0) - (a.onTimePercent ?? 0));
}

export async function stockValuationReport(locationId?: string) {
  const where: Prisma.StockBatchWhereInput = { currentQuantity: { gt: 0 } };
  if (locationId) where.stock = { locationId };

  const batches = await prisma.stockBatch.findMany({
    where,
    include: {
      stock: {
        include: {
          material: { select: { materialCode: true, materialName: true, category: { select: { name: true } } } },
          location: { select: { locationCode: true, locationName: true } },
        },
      },
    },
  });

  const locationSummary = new Map<string, { locationCode: string; locationName: string; totalValue: number; itemCount: number }>();
  let grandTotal = 0;

  for (const b of batches) {
    const value = Number(b.currentQuantity) * Number(b.unitCost);
    grandTotal += value;

    const locId = b.stock.locationId;
    const existing = locationSummary.get(locId);
    if (existing) {
      existing.totalValue += value;
      existing.itemCount++;
    } else {
      locationSummary.set(locId, {
        locationCode: b.stock.location.locationCode,
        locationName: b.stock.location.locationName,
        totalValue: value,
        itemCount: 1,
      });
    }
  }

  const locations = Array.from(locationSummary.values()).map((l) => ({
    ...l,
    totalValue: Math.round(l.totalValue * 100) / 100,
  }));

  return { locations, grandTotal: Math.round(grandTotal * 100) / 100 };
}

export async function slowMovingMaterialsReport(daysSinceMovement: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceMovement);

  const stocks = await prisma.stock.findMany({
    where: {
      currentQuantity: { gt: 0 },
      OR: [
        { lastMovementAt: null },
        { lastMovementAt: { lt: cutoffDate } },
      ],
    },
    include: {
      material: { select: { materialCode: true, materialName: true, category: { select: { name: true } } } },
      location: { select: { locationCode: true, locationName: true } },
    },
    orderBy: { lastMovementAt: 'asc' },
  });

  return stocks.map((s) => ({
    materialCode: s.material.materialCode,
    materialName: s.material.materialName,
    category: s.material.category.name,
    locationCode: s.location.locationCode,
    locationName: s.location.locationName,
    currentQuantity: Number(s.currentQuantity),
    lastMovementAt: s.lastMovementAt,
    daysSinceLastMovement: s.lastMovementAt
      ? Math.floor((new Date().getTime() - s.lastMovementAt.getTime()) / (1000 * 60 * 60 * 24))
      : null,
  }));
}

export async function inventoryTurnoverReport() {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const materials = await prisma.material.findMany({
    where: { isDeleted: false, isActive: true },
    select: { id: true, materialCode: true, materialName: true },
  });

  const results = [];
  for (const mat of materials) {
    const [consumptionMovements, stockAgg] = await Promise.all([
      prisma.stockMovement.aggregate({
        where: {
          materialId: mat.id,
          movementType: { in: ['outward_min', 'scrap'] },
          movedAt: { gte: sixMonthsAgo },
        },
        _sum: { quantity: true },
      }),
      prisma.stock.aggregate({
        where: { materialId: mat.id },
        _sum: { currentQuantity: true },
      }),
    ]);

    const consumption = Number(consumptionMovements._sum.quantity ?? 0);
    const currentStock = Number(stockAgg._sum.currentQuantity ?? 0);

    if (consumption === 0 && currentStock === 0) continue;

    const avgStock = currentStock;
    const annualizedConsumption = consumption * 2;
    const turnoverRatio = avgStock > 0 ? Math.round((annualizedConsumption / avgStock) * 100) / 100 : null;

    results.push({
      materialCode: mat.materialCode,
      materialName: mat.materialName,
      consumptionLast6Months: Math.round(consumption * 10000) / 10000,
      annualizedConsumption: Math.round(annualizedConsumption * 10000) / 10000,
      currentStock: Math.round(currentStock * 10000) / 10000,
      turnoverRatio,
    });
  }

  return results.sort((a, b) => (a.turnoverRatio ?? 0) - (b.turnoverRatio ?? 0));
}

export async function importSummaryReport() {
  const activeShipments = await prisma.importShipment.findMany({
    where: { status: { not: 'received' } },
    include: {
      pos: {
        include: {
          po: { select: { poNumber: true, totalAmount: true, vendor: { select: { vendorName: true } } } },
        },
      },
      customs: { select: { totalCustomsCharges: true, totalLandedCost: true, clearedAt: true } },
    },
    orderBy: { eta: 'asc' },
  });

  const now = new Date();
  const fyStart = now.getMonth() >= 3
    ? new Date(now.getFullYear(), 3, 1)
    : new Date(now.getFullYear() - 1, 3, 1);

  const ytdCustoms = await prisma.importCustoms.findMany({
    where: {
      clearedAt: { gte: fyStart },
    },
    select: { totalCustomsCharges: true, totalLandedCost: true },
  });

  const dutyPaidYtd = ytdCustoms.reduce((s, c) => s + Number(c.totalCustomsCharges ?? 0), 0);
  const landedCostYtd = ytdCustoms.reduce((s, c) => s + Number(c.totalLandedCost ?? 0), 0);

  return {
    activeShipments: activeShipments.map((s) => ({
      shipmentNumber: s.shipmentNumber,
      status: s.status,
      eta: s.eta,
      containerNumber: s.containerNumber,
      portOfDischarge: s.portOfDischarge,
      poCount: s.pos.length,
      totalPoValue: s.pos.reduce((sum, p) => sum + Number(p.po.totalAmount), 0),
      vendors: [...new Set(s.pos.map((p) => p.po.vendor.vendorName))],
      customsCleared: !!s.customs?.clearedAt,
    })),
    activeShipmentCount: activeShipments.length,
    dutyPaidYtd: Math.round(dutyPaidYtd * 100) / 100,
    landedCostYtd: Math.round(landedCostYtd * 100) / 100,
  };
}

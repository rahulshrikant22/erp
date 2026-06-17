import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { getSettingOrDefault } from './settings';
import { createReservation, releaseReservation } from './inventory';

export async function checkMaterialActive(materialId: string) {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { id: true, isActive: true, isDeleted: true, materialCode: true },
  });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');
  if (!material.isActive) {
    throw new ValidationError(`Material ${material.materialCode} is inactive — cannot be used in new supply chain transactions`);
  }
  return material;
}

export async function getOrderMaterialRequirements(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lines: {
        select: { id: true, lineSequence: true, quantity: true, productId: true },
      },
      resolvedBoms: {
        where: { isDeleted: false },
        include: {
          materialLines: {
            include: {
              material: { select: { id: true, materialCode: true, materialName: true, purchaseUom: true } },
            },
          },
        },
      },
    },
  });
  if (!order || order.isDeleted) throw new NotFoundError('Order not found');

  const materialMap = new Map<string, {
    materialId: string;
    materialCode: string;
    materialName: string;
    uom: string;
    totalQuantityRequired: number;
    totalWithWastage: number;
    fromLines: Array<{ orderLineId: string; lineSequence: number; quantity: number }>;
  }>();

  if (order.resolvedBoms.length > 0) {
    for (const rb of order.resolvedBoms) {
      const orderLine = order.lines.find((l) => l.id === rb.orderLineId);
      for (const ml of rb.materialLines) {
        const existing = materialMap.get(ml.materialId);
        const qty = Number(ml.quantityRequired);
        const qtyWithWastage = Number(ml.theoreticalQuantityWithWastage ?? qty);
        if (existing) {
          existing.totalQuantityRequired += qty;
          existing.totalWithWastage += qtyWithWastage;
          existing.fromLines.push({
            orderLineId: rb.orderLineId,
            lineSequence: orderLine?.lineSequence ?? 0,
            quantity: qty,
          });
        } else {
          materialMap.set(ml.materialId, {
            materialId: ml.materialId,
            materialCode: ml.material.materialCode,
            materialName: ml.material.materialName,
            uom: ml.uom,
            totalQuantityRequired: qty,
            totalWithWastage: qtyWithWastage,
            fromLines: [{
              orderLineId: rb.orderLineId,
              lineSequence: orderLine?.lineSequence ?? 0,
              quantity: qty,
            }],
          });
        }
      }
    }
  } else {
    for (const line of order.lines) {
      if (!line.productId) continue;
      const bom = await prisma.bom.findFirst({
        where: { productId: line.productId, isDeleted: false, status: 'active' },
        include: {
          versions: {
            where: { isDeleted: false, versionStatus: 'approved' },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: {
              materialLines: {
                where: { lineType: 'primary' },
                include: {
                  specificMaterial: { select: { id: true, materialCode: true, materialName: true, purchaseUom: true } },
                },
              },
            },
          },
        },
      });
      if (!bom || !bom.versions[0]) continue;
      const version = bom.versions[0];
      const orderQty = Number(line.quantity);

      for (const ml of version.materialLines) {
        if (!ml.specificMaterialId || !ml.specificMaterial) continue;
        const qty = Number(ml.quantityPerUnit) * orderQty;
        const wastage = Number(ml.wastagePercent);
        const qtyWithWastage = qty * (1 + wastage / 100);

        const existing = materialMap.get(ml.specificMaterialId);
        if (existing) {
          existing.totalQuantityRequired += qty;
          existing.totalWithWastage += qtyWithWastage;
          existing.fromLines.push({
            orderLineId: line.id,
            lineSequence: line.lineSequence,
            quantity: qty,
          });
        } else {
          materialMap.set(ml.specificMaterialId, {
            materialId: ml.specificMaterialId,
            materialCode: ml.specificMaterial.materialCode,
            materialName: ml.specificMaterial.materialName,
            uom: ml.uom,
            totalQuantityRequired: qty,
            totalWithWastage: qtyWithWastage,
            fromLines: [{
              orderLineId: line.id,
              lineSequence: line.lineSequence,
              quantity: qty,
            }],
          });
        }
      }
    }
  }

  return {
    orderId,
    orderNumber: order.orderNumber,
    hasResolvedBoms: order.resolvedBoms.length > 0,
    materials: Array.from(materialMap.values()).map((m) => ({
      ...m,
      totalQuantityRequired: Math.round(m.totalQuantityRequired * 10000) / 10000,
      totalWithWastage: Math.round(m.totalWithWastage * 10000) / 10000,
    })),
  };
}

export async function flagBomsForRecosting(materialId: string) {
  const autoRecost = await getSettingOrDefault<boolean>('AUTO_RECOST_ON_RATE_CHANGE', false);
  if (!autoRecost) return { flagged: 0 };

  const bomVersionIds = await prisma.bomMaterialLine.findMany({
    where: {
      specificMaterialId: materialId,
      bomVersion: { isDeleted: false, versionStatus: 'approved' },
    },
    select: { bomVersionId: true },
    distinct: ['bomVersionId'],
  });

  const ids = bomVersionIds.map((b) => b.bomVersionId);
  if (ids.length === 0) return { flagged: 0 };

  const costingRuns = await prisma.costingRun.findMany({
    where: { bomVersionId: { in: ids } },
    select: {
      id: true,
      bomVersionId: true,
      bomVersion: { select: { bom: { select: { bomCode: true } } } },
    },
    orderBy: { runAt: 'desc' },
    distinct: ['bomVersionId'],
  });

  for (const run of costingRuns) {
    await prisma.costingRun.update({
      where: { id: run.id },
      data: { notes: `[AUTO] Flagged for re-costing — rate change on material ${materialId}` },
    });
  }

  return {
    flagged: costingRuns.length,
    bomVersionIds: ids,
    costingRunIds: costingRuns.map((r) => r.id),
  };
}

export async function getMaterialSupplyOverview(materialId: string) {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { id: true, materialCode: true, materialName: true, isDeleted: true },
  });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');

  const now = new Date();
  const [rateContracts, stockAgg, openPoLines] = await Promise.all([
    prisma.rateContract.findMany({
      where: {
        materialId,
        isDeleted: false,
        validityFrom: { lte: now },
        OR: [{ validityUntil: null }, { validityUntil: { gte: now } }],
        vendor: { isDeleted: false, isActive: true },
      },
      include: {
        vendor: { select: { id: true, vendorCode: true, vendorName: true, vendorType: true, rating: true } },
      },
      orderBy: [{ isPreferred: 'desc' }, { unitPrice: 'asc' }],
    }),
    prisma.stock.aggregate({
      where: { materialId },
      _sum: { currentQuantity: true, reservedQuantitySoft: true, reservedQuantityHard: true },
    }),
    prisma.purchaseOrderLine.findMany({
      where: {
        materialId,
        status: { in: ['open', 'partially_received'] },
        po: { isDeleted: false, status: { notIn: ['cancelled', 'closed'] } },
      },
      include: {
        po: { select: { id: true, poNumber: true, status: true, expectedDeliveryDate: true, vendor: { select: { vendorName: true } } } },
      },
    }),
  ]);

  const currentQty = Number(stockAgg._sum.currentQuantity ?? 0);
  const reservedSoft = Number(stockAgg._sum.reservedQuantitySoft ?? 0);
  const reservedHard = Number(stockAgg._sum.reservedQuantityHard ?? 0);

  return {
    material: { id: material.id, materialCode: material.materialCode, materialName: material.materialName },
    vendors: rateContracts.map((rc) => ({
      vendor: rc.vendor,
      unitPrice: Number(rc.unitPrice),
      currencyCode: rc.currencyCode,
      isPreferred: rc.isPreferred,
      isAuthorizedDealer: rc.isAuthorizedDealer,
      leadTimeDays: rc.leadTimeDays,
      validityUntil: rc.validityUntil,
    })),
    stock: {
      currentQuantity: currentQty,
      reservedSoft,
      reservedHard,
      availableQuantity: currentQty - reservedSoft - reservedHard,
    },
    openPurchaseOrders: openPoLines.map((l) => ({
      poId: l.po.id,
      poNumber: l.po.poNumber,
      poStatus: l.po.status,
      vendorName: l.po.vendor.vendorName,
      quantityOrdered: Number(l.quantityOrdered),
      quantityReceived: Number(l.receivedQuantity),
      quantityPending: Number(l.quantityOrdered) - Number(l.receivedQuantity),
      expectedDeliveryDate: l.po.expectedDeliveryDate,
    })),
  };
}

export async function getVendorSupplyOverview(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, vendorCode: true, vendorName: true, isDeleted: true },
  });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  const now = new Date();
  const fyStart = now.getMonth() >= 3
    ? new Date(now.getFullYear(), 3, 1)
    : new Date(now.getFullYear() - 1, 3, 1);

  const [rateContracts, ytdPos] = await Promise.all([
    prisma.rateContract.findMany({
      where: {
        vendorId,
        isDeleted: false,
        validityFrom: { lte: now },
        OR: [{ validityUntil: null }, { validityUntil: { gte: now } }],
      },
      include: {
        material: { select: { id: true, materialCode: true, materialName: true } },
      },
      orderBy: { material: { materialCode: 'asc' } },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        vendorId,
        isDeleted: false,
        poDate: { gte: fyStart },
        status: { not: 'cancelled' },
      },
      select: { totalAmount: true },
    }),
  ]);

  const totalPoValueYtd = ytdPos.reduce((sum, po) => sum + Number(po.totalAmount), 0);

  return {
    vendor: { id: vendor.id, vendorCode: vendor.vendorCode, vendorName: vendor.vendorName },
    materials: rateContracts.map((rc) => ({
      material: rc.material,
      unitPrice: Number(rc.unitPrice),
      currencyCode: rc.currencyCode,
      isPreferred: rc.isPreferred,
      leadTimeDays: rc.leadTimeDays,
    })),
    totalPoValueYtd: Math.round(totalPoValueYtd * 100) / 100,
    poCountYtd: ytdPos.length,
  };
}

export async function createSoftReservationsForOrder(orderId: string, reservedBy?: string) {
  const requirements = await getOrderMaterialRequirements(orderId);

  const reservations = [];
  for (const mat of requirements.materials) {
    const reservation = await createReservation({
      materialId: mat.materialId,
      reservedQuantity: mat.totalWithWastage,
      reservationType: 'soft',
      sourceType: 'order',
      sourceId: orderId,
      reservedBy,
    });
    reservations.push(reservation);
  }

  return { orderId, reservationCount: reservations.length, reservations };
}

export async function releaseSoftReservationsForOrder(orderId: string) {
  const reservations = await prisma.reservation.findMany({
    where: {
      sourceType: 'order',
      sourceId: orderId,
      reservationType: 'soft',
      releasedAt: null,
    },
  });

  for (const r of reservations) {
    await releaseReservation(r.id, 'Order cancellation');
  }

  return { orderId, releasedCount: reservations.length };
}

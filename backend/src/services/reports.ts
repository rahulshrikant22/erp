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

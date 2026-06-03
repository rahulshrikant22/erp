import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { calculateProcessCost } from './processes';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateBomInput {
  productId: string;
  productSizeVariantId?: string | null;
  description?: string | null;
}

export interface UpdateBomInput {
  bomName?: string;
  description?: string | null;
}

export interface ListBomsFilter {
  productId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AddMaterialLineInput {
  lineSequence?: number;
  lineType?: string;
  alternateGroupId?: string | null;
  materialCategoryId?: string | null;
  materialTypeId?: string | null;
  specificMaterialId?: string | null;
  isFinishDependent?: boolean;
  quantityPerUnit: number;
  uom?: string;
  wastagePercent?: number;
  notes?: string | null;
}

export interface AddProcessLineInput {
  lineSequence?: number;
  processId: string;
  quantity?: number;
  timePerUnitMinutes?: number | null;
  isOutsourced?: boolean;
  outsourceVendorNotes?: string | null;
  notes?: string | null;
}

export interface AddSubassemblyInput {
  childBomId: string;
  quantity?: number;
  notes?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function generateBomCode(productId: string): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { productCode: true },
  });
  if (!product) throw new NotFoundError('Product not found');

  const count = await prisma.bom.count({ where: { productId } });
  const seq = String(count + 1).padStart(4, '0');
  return `BOM-${product.productCode}-${seq}`;
}

async function ensureDraftVersion(versionId: string) {
  const version = await prisma.bomVersion.findUnique({ where: { id: versionId } });
  if (!version) throw new NotFoundError('BOM version not found');
  if (version.isDeleted) throw new NotFoundError('BOM version not found');
  if (version.versionStatus !== 'draft') {
    throw new ValidationError('Can only edit draft versions');
  }
  if (version.lockedAtProductionStart) {
    throw new ValidationError('Version is locked for production');
  }
  return version;
}

async function logChange(bomId: string, versionId: string | null, changeType: string, changedBy: string | null, details: unknown) {
  await prisma.bomChangeLog.create({
    data: {
      bomId,
      versionId,
      changeType,
      changedBy,
      changeDetails: details as Prisma.InputJsonValue,
    },
  });
}

async function nextLineSequence(versionId: string, table: 'material' | 'process'): Promise<number> {
  if (table === 'material') {
    const last = await prisma.bomMaterialLine.findFirst({
      where: { bomVersionId: versionId },
      orderBy: { lineSequence: 'desc' },
      select: { lineSequence: true },
    });
    return (last?.lineSequence ?? 0) + 10;
  }
  const last = await prisma.bomProcessLine.findFirst({
    where: { bomVersionId: versionId },
    orderBy: { lineSequence: 'desc' },
    select: { lineSequence: true },
  });
  return (last?.lineSequence ?? 0) + 10;
}

// ─── BOM CRUD ───────────────────────────────────────────────────────────────────

const BOM_INCLUDE = {
  product: { select: { id: true, productCode: true, productName: true } },
  sizeVariant: { select: { id: true, variantName: true } },
  versions: {
    where: { isDeleted: false },
    orderBy: { versionNumber: 'desc' as const },
    include: {
      materialLines: { orderBy: { lineSequence: 'asc' as const }, include: { materialCategory: true, materialType: true, specificMaterial: true } },
      processLines: { orderBy: { lineSequence: 'asc' as const }, include: { process: true } },
      subassemblies: { include: { childBom: { select: { id: true, bomCode: true, bomName: true } } } },
    },
  },
};

export async function createBom(input: CreateBomInput) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw new NotFoundError('Product not found');

  if (input.productSizeVariantId) {
    const sv = await prisma.productSizeVariant.findUnique({ where: { id: input.productSizeVariantId } });
    if (!sv || sv.productId !== input.productId) throw new ValidationError('Size variant does not belong to this product');
  }

  const bomCode = await generateBomCode(input.productId);
  const bomName = input.productSizeVariantId
    ? `${product.productName} — ${(await prisma.productSizeVariant.findUnique({ where: { id: input.productSizeVariantId } }))?.variantName ?? ''}`
    : product.productName;

  const bom = await prisma.bom.create({
    data: {
      bomCode,
      productId: input.productId,
      productSizeVariantId: input.productSizeVariantId ?? null,
      bomName,
      description: input.description ?? null,
      status: 'draft',
      currentVersion: 1,
      versions: {
        create: {
          versionNumber: 1,
          versionStatus: 'draft',
        },
      },
    },
    include: BOM_INCLUDE,
  });

  await logChange(bom.id, bom.versions[0]?.id ?? null, 'bom_created', null, { bomCode });

  return bom;
}

export async function listBoms(filter: ListBomsFilter) {
  const where: Prisma.BomWhereInput = { isDeleted: false };

  if (filter.productId) where.productId = filter.productId;
  if (filter.status) where.status = filter.status;
  if (filter.search) {
    where.OR = [
      { bomCode: { contains: filter.search, mode: 'insensitive' } },
      { bomName: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, boms] = await Promise.all([
    prisma.bom.count({ where }),
    prisma.bom.findMany({
      where,
      include: {
        product: { select: { id: true, productCode: true, productName: true } },
        sizeVariant: { select: { id: true, variantName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, boms };
}

export async function getBom(id: string) {
  const bom = await prisma.bom.findUnique({
    where: { id },
    include: BOM_INCLUDE,
  });
  if (!bom || bom.isDeleted) throw new NotFoundError('BOM not found');
  return bom;
}

export async function updateBom(id: string, input: UpdateBomInput) {
  const bom = await prisma.bom.findUnique({ where: { id } });
  if (!bom || bom.isDeleted) throw new NotFoundError('BOM not found');

  return prisma.bom.update({
    where: { id },
    data: {
      ...(input.bomName !== undefined && { bomName: input.bomName }),
      ...(input.description !== undefined && { description: input.description }),
    },
    include: BOM_INCLUDE,
  });
}

export async function deleteBom(id: string) {
  const bom = await prisma.bom.findUnique({ where: { id } });
  if (!bom || bom.isDeleted) throw new NotFoundError('BOM not found');

  const resolvedCount = await prisma.resolvedBom.count({
    where: { bomVersion: { bomId: id }, isDeleted: false },
  });
  if (resolvedCount > 0) {
    throw new ConflictError('Cannot delete BOM linked to resolved orders', { code: 'IN_USE', resolvedBomCount: resolvedCount });
  }

  await prisma.bom.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), status: 'archived' },
  });
}

// ─── Version Management ─────────────────────────────────────────────────────────

export async function createNewVersion(bomId: string) {
  const bom = await prisma.bom.findUnique({
    where: { id: bomId },
    include: {
      versions: {
        where: { isDeleted: false },
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: {
          materialLines: true,
          processLines: true,
          subassemblies: true,
        },
      },
    },
  });
  if (!bom || bom.isDeleted) throw new NotFoundError('BOM not found');

  const currentVersion = bom.versions[0];
  const newVersionNumber = (currentVersion?.versionNumber ?? 0) + 1;

  const newVersion = await prisma.bomVersion.create({
    data: {
      bomId,
      versionNumber: newVersionNumber,
      versionStatus: 'draft',
      supersedesVersionId: currentVersion?.id ?? null,
    },
  });

  if (currentVersion) {
    if (currentVersion.versionStatus === 'approved') {
      await prisma.bomVersion.update({
        where: { id: currentVersion.id },
        data: { versionStatus: 'superseded' },
      });
    }

    for (const ml of currentVersion.materialLines) {
      await prisma.bomMaterialLine.create({
        data: {
          bomVersionId: newVersion.id,
          lineSequence: ml.lineSequence,
          lineType: ml.lineType,
          alternateGroupId: ml.alternateGroupId,
          materialCategoryId: ml.materialCategoryId,
          materialTypeId: ml.materialTypeId,
          specificMaterialId: ml.specificMaterialId,
          isFinishDependent: ml.isFinishDependent,
          quantityPerUnit: ml.quantityPerUnit,
          uom: ml.uom,
          wastagePercent: ml.wastagePercent,
          notes: ml.notes,
        },
      });
    }

    for (const pl of currentVersion.processLines) {
      await prisma.bomProcessLine.create({
        data: {
          bomVersionId: newVersion.id,
          lineSequence: pl.lineSequence,
          processId: pl.processId,
          quantity: pl.quantity,
          timePerUnitMinutes: pl.timePerUnitMinutes,
          isOutsourced: pl.isOutsourced,
          outsourceVendorNotes: pl.outsourceVendorNotes,
          estimatedCost: pl.estimatedCost,
          notes: pl.notes,
        },
      });
    }

    for (const sa of currentVersion.subassemblies) {
      await prisma.bomSubassembly.create({
        data: {
          parentBomVersionId: newVersion.id,
          childBomId: sa.childBomId,
          quantity: sa.quantity,
          notes: sa.notes,
        },
      });
    }
  }

  await prisma.bom.update({
    where: { id: bomId },
    data: { currentVersion: newVersionNumber },
  });

  await logChange(bomId, newVersion.id, 'version_created', null, { versionNumber: newVersionNumber });

  return prisma.bomVersion.findUnique({
    where: { id: newVersion.id },
    include: {
      materialLines: { orderBy: { lineSequence: 'asc' }, include: { materialCategory: true, materialType: true, specificMaterial: true } },
      processLines: { orderBy: { lineSequence: 'asc' }, include: { process: true } },
      subassemblies: { include: { childBom: { select: { id: true, bomCode: true, bomName: true } } } },
    },
  });
}

export async function listVersions(bomId: string) {
  const bom = await prisma.bom.findUnique({ where: { id: bomId } });
  if (!bom || bom.isDeleted) throw new NotFoundError('BOM not found');

  return prisma.bomVersion.findMany({
    where: { bomId, isDeleted: false },
    orderBy: { versionNumber: 'desc' },
    select: {
      id: true,
      versionNumber: true,
      versionStatus: true,
      approvedBy: true,
      approvedAt: true,
      lockedAtProductionStart: true,
      createdAt: true,
      _count: { select: { materialLines: true, processLines: true, subassemblies: true } },
    },
  });
}

export async function getVersion(bomId: string, versionId: string) {
  const version = await prisma.bomVersion.findUnique({
    where: { id: versionId },
    include: {
      materialLines: { orderBy: { lineSequence: 'asc' }, include: { materialCategory: true, materialType: true, specificMaterial: true } },
      processLines: { orderBy: { lineSequence: 'asc' }, include: { process: true } },
      subassemblies: { include: { childBom: { select: { id: true, bomCode: true, bomName: true } } } },
    },
  });
  if (!version || version.bomId !== bomId || version.isDeleted) throw new NotFoundError('BOM version not found');
  return version;
}

export async function approveVersion(bomId: string, versionId: string, approvedBy?: string) {
  const version = await prisma.bomVersion.findUnique({ where: { id: versionId } });
  if (!version || version.bomId !== bomId || version.isDeleted) throw new NotFoundError('BOM version not found');
  if (version.versionStatus !== 'draft') {
    throw new ValidationError('Only draft versions can be approved');
  }

  const prev = await prisma.bomVersion.findMany({
    where: { bomId, versionStatus: 'approved', isDeleted: false, id: { not: versionId } },
  });
  for (const p of prev) {
    await prisma.bomVersion.update({
      where: { id: p.id },
      data: { versionStatus: 'superseded' },
    });
  }

  const updated = await prisma.bomVersion.update({
    where: { id: versionId },
    data: {
      versionStatus: 'approved',
      approvedBy,
      approvedAt: new Date(),
    },
  });

  await prisma.bom.update({
    where: { id: bomId },
    data: { status: 'active', currentVersion: version.versionNumber },
  });

  await logChange(bomId, versionId, 'version_approved', approvedBy ?? null, { versionNumber: version.versionNumber });

  return updated;
}

export async function compareVersions(bomId: string, versionId1: string, versionId2: string) {
  const [v1, v2] = await Promise.all([
    getVersion(bomId, versionId1),
    getVersion(bomId, versionId2),
  ]);

  const v1MaterialMap = new Map(v1.materialLines.map((l) => [l.id, l]));
  const v2MaterialMap = new Map(v2.materialLines.map((l) => [l.id, l]));

  const materialDiff = {
    added: v2.materialLines.filter((l) => !v1MaterialMap.has(l.id)),
    removed: v1.materialLines.filter((l) => !v2MaterialMap.has(l.id)),
    v1Lines: v1.materialLines,
    v2Lines: v2.materialLines,
  };

  const v1ProcessMap = new Map(v1.processLines.map((l) => [l.id, l]));
  const v2ProcessMap = new Map(v2.processLines.map((l) => [l.id, l]));

  const processDiff = {
    added: v2.processLines.filter((l) => !v1ProcessMap.has(l.id)),
    removed: v1.processLines.filter((l) => !v2ProcessMap.has(l.id)),
    v1Lines: v1.processLines,
    v2Lines: v2.processLines,
  };

  return {
    version1: { id: v1.id, versionNumber: v1.versionNumber, status: v1.versionStatus },
    version2: { id: v2.id, versionNumber: v2.versionNumber, status: v2.versionStatus },
    materialDiff,
    processDiff,
  };
}

// ─── Material Lines ─────────────────────────────────────────────────────────────

export async function addMaterialLine(bomId: string, versionId: string, input: AddMaterialLineInput) {
  await ensureDraftVersion(versionId);

  const seq = input.lineSequence ?? await nextLineSequence(versionId, 'material');
  const isGeneric = !input.specificMaterialId;
  const isFinish = input.isFinishDependent ?? isGeneric;

  const line = await prisma.bomMaterialLine.create({
    data: {
      bomVersionId: versionId,
      lineSequence: seq,
      lineType: input.lineType ?? 'primary',
      alternateGroupId: input.alternateGroupId ?? null,
      materialCategoryId: input.materialCategoryId ?? null,
      materialTypeId: input.materialTypeId ?? null,
      specificMaterialId: input.specificMaterialId ?? null,
      isFinishDependent: isFinish,
      quantityPerUnit: input.quantityPerUnit,
      uom: input.uom ?? 'PCS',
      wastagePercent: input.wastagePercent ?? 0,
      notes: input.notes ?? null,
    },
    include: { materialCategory: true, materialType: true, specificMaterial: true },
  });

  await logChange(bomId, versionId, 'line_added', null, { lineId: line.id, type: 'material', lineType: line.lineType });

  return line;
}

export async function addAlternateMaterial(bomId: string, versionId: string, primaryLineId: string, input: AddMaterialLineInput) {
  await ensureDraftVersion(versionId);

  const primaryLine = await prisma.bomMaterialLine.findUnique({ where: { id: primaryLineId } });
  if (!primaryLine || primaryLine.bomVersionId !== versionId) throw new NotFoundError('Primary line not found');

  const groupId = primaryLine.alternateGroupId ?? primaryLine.id;

  if (!primaryLine.alternateGroupId) {
    await prisma.bomMaterialLine.update({
      where: { id: primaryLineId },
      data: { alternateGroupId: groupId },
    });
  }

  return addMaterialLine(bomId, versionId, {
    ...input,
    lineType: 'alternate',
    alternateGroupId: groupId,
  });
}

export async function updateMaterialLine(bomId: string, versionId: string, lineId: string, input: Partial<AddMaterialLineInput>) {
  await ensureDraftVersion(versionId);

  const line = await prisma.bomMaterialLine.findUnique({ where: { id: lineId } });
  if (!line || line.bomVersionId !== versionId) throw new NotFoundError('Material line not found');

  const updated = await prisma.bomMaterialLine.update({
    where: { id: lineId },
    data: {
      ...(input.lineSequence !== undefined && { lineSequence: input.lineSequence }),
      ...(input.materialCategoryId !== undefined && { materialCategoryId: input.materialCategoryId }),
      ...(input.materialTypeId !== undefined && { materialTypeId: input.materialTypeId }),
      ...(input.specificMaterialId !== undefined && { specificMaterialId: input.specificMaterialId }),
      ...(input.isFinishDependent !== undefined && { isFinishDependent: input.isFinishDependent }),
      ...(input.quantityPerUnit !== undefined && { quantityPerUnit: input.quantityPerUnit }),
      ...(input.uom !== undefined && { uom: input.uom }),
      ...(input.wastagePercent !== undefined && { wastagePercent: input.wastagePercent }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: { materialCategory: true, materialType: true, specificMaterial: true },
  });

  await logChange(bomId, versionId, 'line_modified', null, { lineId, type: 'material' });

  return updated;
}

export async function deleteMaterialLine(bomId: string, versionId: string, lineId: string) {
  await ensureDraftVersion(versionId);

  const line = await prisma.bomMaterialLine.findUnique({ where: { id: lineId } });
  if (!line || line.bomVersionId !== versionId) throw new NotFoundError('Material line not found');

  await prisma.bomMaterialLine.delete({ where: { id: lineId } });
  await logChange(bomId, versionId, 'line_removed', null, { lineId, type: 'material' });
}

// ─── Process Lines ──────────────────────────────────────────────────────────────

export async function addProcessLine(bomId: string, versionId: string, input: AddProcessLineInput) {
  await ensureDraftVersion(versionId);

  const process = await prisma.process.findUnique({ where: { id: input.processId } });
  if (!process) throw new NotFoundError('Process not found');

  const seq = input.lineSequence ?? await nextLineSequence(versionId, 'process');
  const timePerUnit = input.timePerUnitMinutes ?? Number(process.standardTimeMinutes ?? 0);
  const qty = input.quantity ?? 1;

  const costResult = calculateProcessCost(process, { quantity: qty, timeMinutes: timePerUnit });

  const line = await prisma.bomProcessLine.create({
    data: {
      bomVersionId: versionId,
      lineSequence: seq,
      processId: input.processId,
      quantity: qty,
      timePerUnitMinutes: timePerUnit,
      isOutsourced: input.isOutsourced ?? process.isOutsourced,
      outsourceVendorNotes: input.outsourceVendorNotes ?? process.defaultOutsourceVendorNotes,
      estimatedCost: costResult.totalCost,
      notes: input.notes ?? null,
    },
    include: { process: true },
  });

  await logChange(bomId, versionId, 'line_added', null, { lineId: line.id, type: 'process' });

  return line;
}

export async function updateProcessLine(bomId: string, versionId: string, lineId: string, input: Partial<AddProcessLineInput>) {
  await ensureDraftVersion(versionId);

  const line = await prisma.bomProcessLine.findUnique({ where: { id: lineId }, include: { process: true } });
  if (!line || line.bomVersionId !== versionId) throw new NotFoundError('Process line not found');

  let estimatedCost = line.estimatedCost;
  if (input.quantity !== undefined || input.timePerUnitMinutes !== undefined) {
    const process = input.processId
      ? await prisma.process.findUnique({ where: { id: input.processId } })
      : line.process;
    if (process) {
      const costResult = calculateProcessCost(process, {
        quantity: input.quantity ?? Number(line.quantity),
        timeMinutes: input.timePerUnitMinutes ?? Number(line.timePerUnitMinutes ?? 0),
      });
      estimatedCost = new Prisma.Decimal(costResult.totalCost);
    }
  }

  const updated = await prisma.bomProcessLine.update({
    where: { id: lineId },
    data: {
      ...(input.lineSequence !== undefined && { lineSequence: input.lineSequence }),
      ...(input.processId !== undefined && { processId: input.processId }),
      ...(input.quantity !== undefined && { quantity: input.quantity }),
      ...(input.timePerUnitMinutes !== undefined && { timePerUnitMinutes: input.timePerUnitMinutes }),
      ...(input.isOutsourced !== undefined && { isOutsourced: input.isOutsourced }),
      ...(input.outsourceVendorNotes !== undefined && { outsourceVendorNotes: input.outsourceVendorNotes }),
      ...(input.notes !== undefined && { notes: input.notes }),
      estimatedCost,
    },
    include: { process: true },
  });

  await logChange(bomId, versionId, 'line_modified', null, { lineId, type: 'process' });

  return updated;
}

export async function deleteProcessLine(bomId: string, versionId: string, lineId: string) {
  await ensureDraftVersion(versionId);

  const line = await prisma.bomProcessLine.findUnique({ where: { id: lineId } });
  if (!line || line.bomVersionId !== versionId) throw new NotFoundError('Process line not found');

  await prisma.bomProcessLine.delete({ where: { id: lineId } });
  await logChange(bomId, versionId, 'line_removed', null, { lineId, type: 'process' });
}

// ─── Subassemblies ──────────────────────────────────────────────────────────────

async function detectCircularRef(parentBomId: string, childBomId: string, visited = new Set<string>()): Promise<boolean> {
  if (parentBomId === childBomId) return true;
  if (visited.has(childBomId)) return false;
  visited.add(childBomId);

  const childVersions = await prisma.bomVersion.findMany({
    where: { bomId: childBomId, isDeleted: false },
    include: { subassemblies: true },
  });

  for (const v of childVersions) {
    for (const sa of v.subassemblies) {
      if (await detectCircularRef(parentBomId, sa.childBomId, visited)) return true;
    }
  }
  return false;
}

export async function addSubassembly(bomId: string, versionId: string, input: AddSubassemblyInput) {
  await ensureDraftVersion(versionId);

  const childBom = await prisma.bom.findUnique({ where: { id: input.childBomId } });
  if (!childBom || childBom.isDeleted) throw new NotFoundError('Child BOM not found');

  if (await detectCircularRef(bomId, input.childBomId)) {
    throw new ValidationError('Circular reference detected: child BOM references parent');
  }

  const sa = await prisma.bomSubassembly.create({
    data: {
      parentBomVersionId: versionId,
      childBomId: input.childBomId,
      quantity: input.quantity ?? 1,
      notes: input.notes ?? null,
    },
    include: { childBom: { select: { id: true, bomCode: true, bomName: true } } },
  });

  await logChange(bomId, versionId, 'line_added', null, { type: 'subassembly', childBomId: input.childBomId });

  return sa;
}

export async function deleteSubassembly(bomId: string, versionId: string, saId: string) {
  await ensureDraftVersion(versionId);

  const sa = await prisma.bomSubassembly.findUnique({ where: { id: saId } });
  if (!sa || sa.parentBomVersionId !== versionId) throw new NotFoundError('Subassembly not found');

  await prisma.bomSubassembly.delete({ where: { id: saId } });
  await logChange(bomId, versionId, 'line_removed', null, { type: 'subassembly', saId });
}

// ─── Expanded BOM ───────────────────────────────────────────────────────────────

export async function getExpandedBom(bomId: string, versionId: string, depth = 0): Promise<unknown> {
  if (depth > 10) throw new ValidationError('BOM nesting too deep (max 10 levels)');

  const version = await getVersion(bomId, versionId);
  const children: unknown[] = [];

  for (const sa of version.subassemblies) {
    const childBom = await prisma.bom.findUnique({
      where: { id: sa.childBomId },
      include: { versions: { where: { isDeleted: false }, orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (childBom && childBom.versions[0]) {
      const expanded = await getExpandedBom(childBom.id, childBom.versions[0].id, depth + 1);
      children.push({ quantity: sa.quantity, notes: sa.notes, bom: expanded });
    }
  }

  return {
    bomId,
    versionId,
    versionNumber: version.versionNumber,
    materialLines: version.materialLines,
    processLines: version.processLines,
    subassemblies: children,
  };
}

// ─── Change Log ─────────────────────────────────────────────────────────────────

export async function getBomChangeLog(bomId: string) {
  const bom = await prisma.bom.findUnique({ where: { id: bomId } });
  if (!bom || bom.isDeleted) throw new NotFoundError('BOM not found');

  return prisma.bomChangeLog.findMany({
    where: { bomId },
    orderBy: { changedAt: 'desc' },
  });
}

// ─── Where-used ─────────────────────────────────────────────────────────────────

export async function materialWhereUsedInBoms(materialId: string) {
  const lines = await prisma.bomMaterialLine.findMany({
    where: { specificMaterialId: materialId },
    include: {
      bomVersion: {
        include: {
          bom: { select: { id: true, bomCode: true, bomName: true, status: true } },
        },
      },
    },
  });

  return lines.map((l) => ({
    bomId: l.bomVersion.bom.id,
    bomCode: l.bomVersion.bom.bomCode,
    bomName: l.bomVersion.bom.bomName,
    bomStatus: l.bomVersion.bom.status,
    versionNumber: l.bomVersion.versionNumber,
    versionStatus: l.bomVersion.versionStatus,
    lineId: l.id,
    lineType: l.lineType,
    quantityPerUnit: l.quantityPerUnit,
  }));
}

export async function processWhereUsedInBoms(processId: string) {
  const lines = await prisma.bomProcessLine.findMany({
    where: { processId },
    include: {
      bomVersion: {
        include: {
          bom: { select: { id: true, bomCode: true, bomName: true, status: true } },
        },
      },
    },
  });

  return lines.map((l) => ({
    bomId: l.bomVersion.bom.id,
    bomCode: l.bomVersion.bom.bomCode,
    bomName: l.bomVersion.bom.bomName,
    bomStatus: l.bomVersion.bom.status,
    versionNumber: l.bomVersion.versionNumber,
    versionStatus: l.bomVersion.versionStatus,
    lineId: l.id,
    quantity: l.quantity,
  }));
}

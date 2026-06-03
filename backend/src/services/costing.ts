import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../errors';
import { calculateProcessCost } from './processes';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RunCostingInput {
  bomVersionId: string;
  runType?: string;
  overheadPercent?: number;
  marginPercent?: number;
  taxRate?: number;
  quantity?: number;
  runBy?: string;
  notes?: string;
}

export interface ListCostingFilter {
  bomVersionId?: string;
  runType?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

async function getSettingValue(key: string): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { settingKey: key } });
  return s ? Number(s.settingValue) : 0;
}

async function generateCostingRunNumber(): Promise<string> {
  const count = await prisma.costingRun.count();
  return `COST-${String(count + 1).padStart(6, '0')}`;
}

// ─── Costing Engine ─────────────────────────────────────────────────────────────

export async function runCosting(input: RunCostingInput) {
  const bomVersion = await prisma.bomVersion.findUnique({
    where: { id: input.bomVersionId },
    include: {
      bom: { select: { id: true, bomCode: true } },
      materialLines: {
        where: { lineType: 'primary' },
        orderBy: { lineSequence: 'asc' },
        include: { specificMaterial: { select: { id: true } } },
      },
      processLines: {
        orderBy: { lineSequence: 'asc' },
        include: { process: true },
      },
    },
  });
  if (!bomVersion || bomVersion.isDeleted) throw new NotFoundError('BOM version not found');

  const quantity = input.quantity ?? 1;

  const overheadPercent = input.overheadPercent
    ?? await getSettingValue('costing.overhead_default_percent');
  const marginPercent = input.marginPercent
    ?? await getSettingValue('costing.margin_default_percent');
  const taxRate = input.taxRate ?? 18;

  let materialCostTotal = 0;
  for (const ml of bomVersion.materialLines) {
    if (!ml.specificMaterial) continue;
    // Material pricing placeholder — cost per unit will come from price catalogs in Phase 3
    void ml;
  }
  materialCostTotal = Math.round(materialCostTotal * 100) / 100;

  let laborCostTotal = 0;
  let outsourcingCostTotal = 0;
  for (const pl of bomVersion.processLines) {
    const cost = calculateProcessCost(pl.process, {
      quantity: Number(pl.quantity) * quantity,
      timeMinutes: pl.timePerUnitMinutes ? Number(pl.timePerUnitMinutes) : undefined,
    });
    if (pl.isOutsourced) {
      outsourcingCostTotal += cost.totalCost;
    } else {
      laborCostTotal += cost.laborCost;
    }
  }
  laborCostTotal = Math.round(laborCostTotal * 100) / 100;
  outsourcingCostTotal = Math.round(outsourcingCostTotal * 100) / 100;

  const baseCost = materialCostTotal + laborCostTotal + outsourcingCostTotal;
  const overheadCostTotal = Math.round(baseCost * (overheadPercent / 100) * 100) / 100;
  const manufacturingCost = Math.round((baseCost + overheadCostTotal) * 100) / 100;
  const landingCost = manufacturingCost;
  const sellingPriceExclTax = Math.round(landingCost / (1 - marginPercent / 100) * 100) / 100;
  const mrpInclTax = Math.round(sellingPriceExclTax * (1 + taxRate / 100) * 100) / 100;

  const costingRunNumber = await generateCostingRunNumber();

  const run = await prisma.costingRun.create({
    data: {
      bomVersionId: input.bomVersionId,
      costingRunNumber,
      runType: input.runType ?? 'initial',
      materialCostTotal,
      laborCostTotal,
      overheadCostTotal,
      outsourcingCostTotal,
      manufacturingCost,
      overheadPercentApplied: overheadPercent,
      marginPercentApplied: marginPercent,
      landingCost,
      sellingPriceExclTax,
      taxRate,
      mrpInclTax,
      runBy: input.runBy ?? null,
      notes: input.notes ?? null,
    },
    include: {
      bomVersion: {
        select: {
          id: true,
          versionNumber: true,
          bom: { select: { id: true, bomCode: true, bomName: true } },
        },
      },
    },
  });

  return run;
}

// ─── Read operations ────────────────────────────────────────────────────────────

export async function getCostingRun(id: string) {
  const run = await prisma.costingRun.findUnique({
    where: { id },
    include: {
      bomVersion: {
        select: {
          id: true,
          versionNumber: true,
          bom: { select: { id: true, bomCode: true, bomName: true } },
        },
      },
    },
  });
  if (!run) throw new NotFoundError('Costing run not found');
  return run;
}

export async function listCostingRuns(filter: ListCostingFilter) {
  const where: Prisma.CostingRunWhereInput = {};

  if (filter.bomVersionId) where.bomVersionId = filter.bomVersionId;
  if (filter.runType) where.runType = filter.runType;

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, runs] = await Promise.all([
    prisma.costingRun.count({ where }),
    prisma.costingRun.findMany({
      where,
      include: {
        bomVersion: {
          select: {
            id: true,
            versionNumber: true,
            bom: { select: { id: true, bomCode: true, bomName: true } },
          },
        },
      },
      orderBy: { runAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, runs };
}

export async function compareCostingRuns(id1: string, id2: string) {
  const [r1, r2] = await Promise.all([getCostingRun(id1), getCostingRun(id2)]);

  return {
    run1: r1,
    run2: r2,
    diff: {
      materialCost: Number(r2.materialCostTotal) - Number(r1.materialCostTotal),
      laborCost: Number(r2.laborCostTotal) - Number(r1.laborCostTotal),
      overheadCost: Number(r2.overheadCostTotal) - Number(r1.overheadCostTotal),
      outsourcingCost: Number(r2.outsourcingCostTotal) - Number(r1.outsourcingCostTotal),
      manufacturingCost: Number(r2.manufacturingCost) - Number(r1.manufacturingCost),
      landingCost: Number(r2.landingCost ?? 0) - Number(r1.landingCost ?? 0),
      sellingPrice: Number(r2.sellingPriceExclTax ?? 0) - Number(r1.sellingPriceExclTax ?? 0),
      mrp: Number(r2.mrpInclTax ?? 0) - Number(r1.mrpInclTax ?? 0),
    },
  };
}

// ─── Costing Assumptions ────────────────────────────────────────────────────────

export async function listAssumptions() {
  return prisma.costingAssumption.findMany({ orderBy: { key: 'asc' } });
}

export async function updateAssumption(key: string, value: string) {
  const existing = await prisma.costingAssumption.findUnique({ where: { key } });
  if (!existing) throw new NotFoundError('Costing assumption not found');

  return prisma.costingAssumption.update({
    where: { key },
    data: { value },
  });
}

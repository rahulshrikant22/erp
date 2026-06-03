import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

const VALID_CATEGORIES = [
  'cutting', 'edge_banding', 'drilling', 'lamination',
  'sanding', 'assembly', 'finishing', 'outsource',
] as const;

const VALID_TIME_UNITS = [
  'per_panel', 'per_sheet', 'per_job', 'per_panel_edge',
  'per_unit', 'per_kg', 'per_piece', 'per_part', 'per_joint',
] as const;

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateProcessInput {
  processCode: string;
  processName: string;
  processCategory: string;
  standardTimeMinutes?: number | null;
  timeUnit?: string;
  laborCostPerHour?: number | null;
  machineCostPerHour?: number | null;
  isOutsourced?: boolean;
  defaultOutsourceVendorNotes?: string | null;
  stationId?: string | null;
}

export interface UpdateProcessInput {
  processName?: string;
  processCategory?: string;
  standardTimeMinutes?: number | null;
  timeUnit?: string;
  laborCostPerHour?: number | null;
  machineCostPerHour?: number | null;
  isOutsourced?: boolean;
  defaultOutsourceVendorNotes?: string | null;
  stationId?: string | null;
  isActive?: boolean;
}

export interface ListProcessesFilter {
  category?: string;
  isOutsourced?: boolean;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function validateCategory(cat: string): void {
  if (!(VALID_CATEGORIES as readonly string[]).includes(cat)) {
    throw new ValidationError(`Invalid process category: ${cat}`, {
      allowed: VALID_CATEGORIES,
    });
  }
}

function validateTimeUnit(unit: string): void {
  if (!(VALID_TIME_UNITS as readonly string[]).includes(unit)) {
    throw new ValidationError(`Invalid time unit: ${unit}`, {
      allowed: VALID_TIME_UNITS,
    });
  }
}

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export async function createProcess(input: CreateProcessInput) {
  validateCategory(input.processCategory);
  if (input.timeUnit) validateTimeUnit(input.timeUnit);

  const code = input.processCode.trim().toUpperCase();
  const existing = await prisma.process.findUnique({ where: { processCode: code } });
  if (existing) {
    throw new ConflictError('Process code already exists', { code: 'DUPLICATE_FOUND', field: 'processCode' });
  }

  return prisma.process.create({
    data: {
      processCode: code,
      processName: input.processName.trim(),
      processCategory: input.processCategory,
      standardTimeMinutes: input.standardTimeMinutes ?? null,
      timeUnit: input.timeUnit ?? 'per_panel',
      laborCostPerHour: input.laborCostPerHour ?? null,
      machineCostPerHour: input.machineCostPerHour ?? null,
      isOutsourced: input.isOutsourced ?? false,
      defaultOutsourceVendorNotes: input.defaultOutsourceVendorNotes ?? null,
      stationId: input.stationId ?? null,
    },
    include: { capabilities: true },
  });
}

export async function listProcesses(filter: ListProcessesFilter) {
  const where: Prisma.ProcessWhereInput = {};

  if (filter.category) {
    validateCategory(filter.category);
    where.processCategory = filter.category;
  }
  if (filter.isOutsourced !== undefined) where.isOutsourced = filter.isOutsourced;
  if (filter.isActive !== undefined) where.isActive = filter.isActive;
  if (filter.search) {
    where.OR = [
      { processCode: { contains: filter.search, mode: 'insensitive' } },
      { processName: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, processes] = await Promise.all([
    prisma.process.count({ where }),
    prisma.process.findMany({
      where,
      include: { capabilities: true },
      orderBy: { processCode: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, processes };
}

export async function getProcess(id: string) {
  const process = await prisma.process.findUnique({
    where: { id },
    include: { capabilities: true },
  });
  if (!process) throw new NotFoundError('Process not found');
  return process;
}

export async function updateProcess(id: string, input: UpdateProcessInput) {
  const process = await prisma.process.findUnique({ where: { id } });
  if (!process) throw new NotFoundError('Process not found');

  if (input.processCategory) validateCategory(input.processCategory);
  if (input.timeUnit) validateTimeUnit(input.timeUnit);

  return prisma.process.update({
    where: { id },
    data: {
      ...(input.processName !== undefined && { processName: input.processName.trim() }),
      ...(input.processCategory !== undefined && { processCategory: input.processCategory }),
      ...(input.standardTimeMinutes !== undefined && { standardTimeMinutes: input.standardTimeMinutes }),
      ...(input.timeUnit !== undefined && { timeUnit: input.timeUnit }),
      ...(input.laborCostPerHour !== undefined && { laborCostPerHour: input.laborCostPerHour }),
      ...(input.machineCostPerHour !== undefined && { machineCostPerHour: input.machineCostPerHour }),
      ...(input.isOutsourced !== undefined && { isOutsourced: input.isOutsourced }),
      ...(input.defaultOutsourceVendorNotes !== undefined && { defaultOutsourceVendorNotes: input.defaultOutsourceVendorNotes }),
      ...(input.stationId !== undefined && { stationId: input.stationId }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: { capabilities: true },
  });
}

export async function deleteProcess(id: string) {
  const process = await prisma.process.findUnique({ where: { id } });
  if (!process) throw new NotFoundError('Process not found');

  const bomUsage = await prisma.bomProcessLine.count({ where: { processId: id } });
  if (bomUsage > 0) {
    throw new ConflictError('Cannot delete process used in active BOMs', {
      code: 'IN_USE',
      bomProcessLineCount: bomUsage,
    });
  }

  await prisma.process.update({
    where: { id },
    data: { isActive: false },
  });
}

// ─── Capabilities ───────────────────────────────────────────────────────────────

export async function addCapability(processId: string, key: string, value: string) {
  const process = await prisma.process.findUnique({ where: { id: processId } });
  if (!process) throw new NotFoundError('Process not found');

  return prisma.processCapability.create({
    data: {
      processId,
      capabilityKey: key.trim(),
      capabilityValue: value.trim(),
    },
  });
}

export async function updateCapability(processId: string, capId: string, key: string, value: string) {
  const cap = await prisma.processCapability.findUnique({ where: { id: capId } });
  if (!cap || cap.processId !== processId) throw new NotFoundError('Capability not found');

  return prisma.processCapability.update({
    where: { id: capId },
    data: {
      capabilityKey: key.trim(),
      capabilityValue: value.trim(),
    },
  });
}

export async function deleteCapability(processId: string, capId: string) {
  const cap = await prisma.processCapability.findUnique({ where: { id: capId } });
  if (!cap || cap.processId !== processId) throw new NotFoundError('Capability not found');

  await prisma.processCapability.delete({ where: { id: capId } });
}

// ─── Cost Calculation ───────────────────────────────────────────────────────────

export interface CostCalcInput {
  quantity: number;
  timeMinutes?: number;
}

export function calculateProcessCost(
  process: { standardTimeMinutes: Prisma.Decimal | null; laborCostPerHour: Prisma.Decimal | null; machineCostPerHour: Prisma.Decimal | null; isOutsourced: boolean },
  input: CostCalcInput,
) {
  const timePerUnit = input.timeMinutes ?? Number(process.standardTimeMinutes ?? 0);
  const totalMinutes = timePerUnit * input.quantity;
  const totalHours = totalMinutes / 60;

  const laborRate = Number(process.laborCostPerHour ?? 0);
  const machineRate = Number(process.machineCostPerHour ?? 0);

  const laborCost = totalHours * laborRate;
  const machineCost = totalHours * machineRate;
  const totalCost = laborCost + machineCost;

  return {
    quantity: input.quantity,
    timePerUnitMinutes: timePerUnit,
    totalMinutes,
    laborCostPerHour: laborRate,
    machineCostPerHour: machineRate,
    laborCost: Math.round(laborCost * 100) / 100,
    machineCost: Math.round(machineCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    isOutsourced: process.isOutsourced,
    note: process.isOutsourced ? 'Cost is an estimate; actual cost from vendor invoice' : undefined,
  };
}

// ─── CSV Import ─────────────────────────────────────────────────────────────────

import { parse } from 'csv-parse/sync';

interface CsvRow {
  process_code: string;
  process_name: string;
  process_category: string;
  standard_time_minutes?: string;
  time_unit?: string;
  labor_cost_per_hour?: string;
  machine_cost_per_hour?: string;
  is_outsourced?: string;
  default_outsource_vendor_notes?: string;
}

export async function importProcesses(buffer: Buffer) {
  const records: CsvRow[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new ValidationError('CSV file is empty');
  }

  const results: { created: number; skipped: number; errors: Array<{ row: number; message: string }> } = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2;

    if (!row.process_code || !row.process_name || !row.process_category) {
      results.errors.push({ row: rowNum, message: 'Missing required fields: process_code, process_name, process_category' });
      continue;
    }

    const code = row.process_code.trim().toUpperCase();
    if (!(VALID_CATEGORIES as readonly string[]).includes(row.process_category.trim())) {
      results.errors.push({ row: rowNum, message: `Invalid category: ${row.process_category}` });
      continue;
    }

    const existing = await prisma.process.findUnique({ where: { processCode: code } });
    if (existing) {
      results.skipped++;
      continue;
    }

    try {
      await prisma.process.create({
        data: {
          processCode: code,
          processName: row.process_name.trim(),
          processCategory: row.process_category.trim(),
          standardTimeMinutes: row.standard_time_minutes ? parseFloat(row.standard_time_minutes) : null,
          timeUnit: row.time_unit?.trim() || 'per_panel',
          laborCostPerHour: row.labor_cost_per_hour ? parseFloat(row.labor_cost_per_hour) : null,
          machineCostPerHour: row.machine_cost_per_hour ? parseFloat(row.machine_cost_per_hour) : null,
          isOutsourced: row.is_outsourced?.toLowerCase() === 'true',
          defaultOutsourceVendorNotes: row.default_outsource_vendor_notes?.trim() || null,
        },
      });
      results.created++;
    } catch (err) {
      results.errors.push({ row: rowNum, message: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return results;
}

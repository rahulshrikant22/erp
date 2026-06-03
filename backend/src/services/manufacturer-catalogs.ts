/**
 * Manufacturer Catalog service — P2-04.
 *
 * CRUD, CSV import, auto-fill lookup, bulk operations, per-manufacturer view.
 */
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

// ─── CRUD ───────────────────────────────────────────────────────────────────────

export interface CreateCatalogInput {
  manufacturerId: string;
  catalogType: string;
  code: string;
  name: string;
  additionalAttributes?: Record<string, unknown>;
  referenceImagePath?: string;
}

export async function createCatalogEntry(input: CreateCatalogInput) {
  const mfr = await prisma.materialManufacturer.findFirst({
    where: { id: input.manufacturerId, isDeleted: false },
  });
  if (!mfr) throw new NotFoundError('Manufacturer not found');

  const existing = await prisma.materialManufacturerCatalog.findUnique({
    where: {
      manufacturerId_catalogType_code: {
        manufacturerId: input.manufacturerId,
        catalogType: input.catalogType,
        code: input.code,
      },
    },
  });
  if (existing) {
    throw new ConflictError('Catalog entry already exists for this manufacturer + type + code', {
      existingId: existing.id,
    });
  }

  return prisma.materialManufacturerCatalog.create({
    data: {
      manufacturerId: input.manufacturerId,
      catalogType: input.catalogType,
      code: input.code,
      name: input.name,
      additionalAttributes: input.additionalAttributes ?? Prisma.DbNull,
      referenceImagePath: input.referenceImagePath ?? null,
      isActive: true,
    },
    include: { manufacturer: { select: { manufacturerCode: true, name: true } } },
  });
}

export interface UpdateCatalogInput {
  name?: string;
  additionalAttributes?: Record<string, unknown>;
  referenceImagePath?: string | null;
  isActive?: boolean;
}

export async function updateCatalogEntry(id: string, input: UpdateCatalogInput) {
  const existing = await prisma.materialManufacturerCatalog.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Catalog entry not found');

  return prisma.materialManufacturerCatalog.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.additionalAttributes !== undefined ? { additionalAttributes: input.additionalAttributes } : {}),
      ...(input.referenceImagePath !== undefined ? { referenceImagePath: input.referenceImagePath } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { manufacturer: { select: { manufacturerCode: true, name: true } } },
  });
}

export async function deleteCatalogEntry(id: string) {
  const existing = await prisma.materialManufacturerCatalog.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Catalog entry not found');

  // Soft deactivate — the table doesn't have a soft-delete pattern, so we set isActive=false
  return prisma.materialManufacturerCatalog.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function getCatalogEntry(id: string) {
  const entry = await prisma.materialManufacturerCatalog.findUnique({
    where: { id },
    include: { manufacturer: { select: { manufacturerCode: true, name: true } } },
  });
  if (!entry) throw new NotFoundError('Catalog entry not found');
  return entry;
}

// ─── list / search ──────────────────────────────────────────────────────────────

export interface ListCatalogFilters {
  manufacturerId?: string;
  catalogType?: string;
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listCatalogEntries(filters: ListCatalogFilters) {
  const where: Prisma.MaterialManufacturerCatalogWhereInput = {};

  if (filters.manufacturerId) where.manufacturerId = filters.manufacturerId;
  if (filters.catalogType) where.catalogType = filters.catalogType;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search) {
    where.OR = [
      { code: { contains: filters.search, mode: 'insensitive' } },
      { name: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [total, entries] = await Promise.all([
    prisma.materialManufacturerCatalog.count({ where }),
    prisma.materialManufacturerCatalog.findMany({
      where,
      include: { manufacturer: { select: { manufacturerCode: true, name: true } } },
      orderBy: [{ catalogType: 'asc' }, { code: 'asc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return { total, page: filters.page, limit: filters.limit, entries };
}

export async function searchCatalog(manufacturerId: string, query: string) {
  return prisma.materialManufacturerCatalog.findMany({
    where: {
      manufacturerId,
      isActive: true,
      OR: [
        { code: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { code: 'asc' },
    select: { id: true, catalogType: true, code: true, name: true, additionalAttributes: true, referenceImagePath: true },
  });
}

// ─── auto-fill lookup ───────────────────────────────────────────────────────────

export async function lookupCatalogEntry(manufacturerId: string, catalogType: string, code: string) {
  return prisma.materialManufacturerCatalog.findFirst({
    where: { manufacturerId, catalogType, code, isActive: true },
    select: { id: true, code: true, name: true, additionalAttributes: true, referenceImagePath: true },
  });
}

// ─── per-manufacturer view ──────────────────────────────────────────────────────

export async function getManufacturerCatalog(manufacturerId: string, catalogType?: string) {
  const mfr = await prisma.materialManufacturer.findFirst({
    where: { id: manufacturerId, isDeleted: false },
  });
  if (!mfr) throw new NotFoundError('Manufacturer not found');

  const where: Prisma.MaterialManufacturerCatalogWhereInput = {
    manufacturerId,
    isActive: true,
  };
  if (catalogType) where.catalogType = catalogType;

  const entries = await prisma.materialManufacturerCatalog.findMany({
    where,
    orderBy: [{ catalogType: 'asc' }, { code: 'asc' }],
    select: { id: true, catalogType: true, code: true, name: true, additionalAttributes: true, referenceImagePath: true },
  });

  // Group by catalog type
  const grouped: Record<string, typeof entries> = {};
  for (const e of entries) {
    (grouped[e.catalogType] ??= []).push(e);
  }

  return { manufacturer: { id: mfr.id, manufacturerCode: mfr.manufacturerCode, name: mfr.name }, catalog: grouped };
}

// ─── bulk operations ────────────────────────────────────────────────────────────

export async function bulkDeactivate(ids: string[]) {
  const result = await prisma.materialManufacturerCatalog.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false },
  });
  return { deactivated: result.count };
}

export async function mergeCatalogEntries(keepId: string, mergeIds: string[]) {
  const keep = await prisma.materialManufacturerCatalog.findUnique({ where: { id: keepId } });
  if (!keep) throw new NotFoundError('Target catalog entry not found');

  // Deactivate merged entries
  await prisma.materialManufacturerCatalog.updateMany({
    where: { id: { in: mergeIds } },
    data: { isActive: false },
  });

  return { keptId: keepId, mergedCount: mergeIds.length };
}

// ─── CSV import ─────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS: Record<string, string[]> = {
  color: ['code', 'name', 'hex_color', 'reference_image_url', 'notes'],
  variant: ['code', 'name', 'sub_variant', 'notes'],
  design: ['code', 'name', 'pattern_type', 'color_family', 'notes'],
};

export function generateImportTemplate(catalogType: string): string {
  const headers = TEMPLATE_HEADERS[catalogType] ?? TEMPLATE_HEADERS.color;
  const exampleRows: Record<string, string[]> = {
    color: ['1103', 'Frosty White', '#FFFFFF', '', 'Example entry'],
    variant: ['SENSYS', 'Sensys', '', 'Premium soft-close hinge series'],
    design: ['14177', 'Natural Oak', 'Wood', 'Brown', 'Popular laminate design'],
  };
  const example = exampleRows[catalogType] ?? exampleRows.color;
  return [headers.join(','), example.join(',')].join('\n');
}

interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  batchId: string;
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: ImportRowError[];
}

export async function importCatalogCsv(
  manufacturerId: string,
  catalogType: string,
  csvBuffer: Buffer,
  uploadedBy?: string,
): Promise<ImportResult> {
  const mfr = await prisma.materialManufacturer.findFirst({
    where: { id: manufacturerId, isDeleted: false },
  });
  if (!mfr) throw new NotFoundError('Manufacturer not found');

  let records: Record<string, string>[];
  try {
    records = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new ValidationError('Invalid CSV format');
  }

  const errors: ImportRowError[] = [];
  let successCount = 0;

  const batch = await prisma.materialCatalogImportBatch.create({
    data: {
      manufacturerId,
      catalogType,
      sourceFilename: 'import.csv',
      totalRows: records.length,
      status: 'processing',
      uploadedBy,
    },
  });

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // 1-indexed + header

    const code = row.code?.trim();
    const name = row.name?.trim();

    if (!code) {
      errors.push({ row: rowNum, field: 'code', message: 'code is required' });
      continue;
    }
    if (!name) {
      errors.push({ row: rowNum, field: 'name', message: 'name is required' });
      continue;
    }

    // Validate hex color if provided
    const hexColor = row.hex_color?.trim();
    if (hexColor && !/^#[0-9a-fA-F]{6}$/.test(hexColor)) {
      errors.push({ row: rowNum, field: 'hex_color', message: `Invalid hex color: ${hexColor}` });
      continue;
    }

    // Check for duplicate within this manufacturer + type
    const existing = await prisma.materialManufacturerCatalog.findUnique({
      where: {
        manufacturerId_catalogType_code: { manufacturerId, catalogType, code },
      },
    });

    const extraAttrs = buildAdditionalAttrs(catalogType, row);

    if (existing) {
      await prisma.materialManufacturerCatalog.update({
        where: { id: existing.id },
        data: {
          name,
          additionalAttributes: extraAttrs ?? Prisma.DbNull,
          isActive: true,
        },
      });
    } else {
      await prisma.materialManufacturerCatalog.create({
        data: {
          manufacturerId,
          catalogType,
          code,
          name,
          additionalAttributes: extraAttrs ?? Prisma.DbNull,
          referenceImagePath: row.reference_image_url?.trim() || null,
          isActive: true,
        },
      });
    }
    successCount++;
  }

  // Update batch
  await prisma.materialCatalogImportBatch.update({
    where: { id: batch.id },
    data: {
      successRows: successCount,
      failedRows: errors.length,
      status: errors.length > 0 ? 'completed_with_errors' : 'completed',
    },
  });

  return {
    batchId: batch.id,
    totalRows: records.length,
    successCount,
    errorCount: errors.length,
    errors,
  };
}

function buildAdditionalAttrs(
  catalogType: string,
  row: Record<string, string>,
): Record<string, string> | null {
  const attrs: Record<string, string> = {};
  switch (catalogType) {
    case 'color':
      if (row.hex_color?.trim()) attrs.hexColor = row.hex_color.trim();
      if (row.notes?.trim()) attrs.notes = row.notes.trim();
      break;
    case 'variant':
      if (row.sub_variant?.trim()) attrs.subVariant = row.sub_variant.trim();
      if (row.notes?.trim()) attrs.notes = row.notes.trim();
      break;
    case 'design':
      if (row.pattern_type?.trim()) attrs.patternType = row.pattern_type.trim();
      if (row.color_family?.trim()) attrs.colorFamily = row.color_family.trim();
      if (row.notes?.trim()) attrs.notes = row.notes.trim();
      break;
  }
  return Object.keys(attrs).length > 0 ? attrs : null;
}

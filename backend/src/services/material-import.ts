/**
 * Material CSV Import service — P2-06.
 *
 * Dynamic template generation, row-level validation, auto-generated name/SKU,
 * duplicate handling (skip/fail/update), batch tracking, error resolution.
 */
import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';

// ─── reused from materials.ts ──────────────────────────────────────────────────

const CATEGORY_PREFIX: Record<string, string> = {
  BOARDS: 'BRD', LAMINATES: 'LAM', EDGE_BAND: 'EBT', HARDWARE: 'HDW',
  METAL_COMP: 'MET', SEATING: 'CHR', FABRIC: 'FAB', ADHESIVE: 'ADH',
  TOOLS: 'TUL', RAW_STEEL: 'STL', PACKING: 'PKG', GAS_SPRING: 'MCH',
};

const ATTR_CODE_TO_MFR: Record<string, string> = {
  HET: 'HETTICH', EBC: 'EBCO', HAF: 'HAFELE', AT: 'ACTION_TESA',
  GPL: 'GREENPLY', CEN: 'CENTURY', REG: 'REGULAR', MER: 'MERINO',
  GRL: 'GREENLAM', RT: 'ROYALE_TOUCHE', GOD: 'GODREJ', IPS: 'IPSA',
  SOL: 'SOLITAIRE', PID: 'REGULAR', BSH: 'REGULAR', REH: 'REGULAR',
};

interface AttrMeta {
  id: string;
  attributeCode: string;
  label: string;
  fieldType: string;
  displayOrder: number;
  isIdentity: boolean;
  feedsName: boolean;
  feedsSku: boolean;
  namePosition: number | null;
  skuPosition: number | null;
  isRequired: boolean;
  isManufacturerScoped: boolean;
}

interface ValueMeta {
  id: string;
  valueLabel: string;
  valueShortCode: string;
  manufacturerId: string | null;
}

interface VisRule {
  attributeId: string;
  dependsOnAttributeId: string;
  conditionOperator: string;
  conditionValues: unknown;
  action: string;
}

function normalizeValue(val: string): string {
  return val.trim().toUpperCase().replace(/\s+/g, ' ');
}

function computeAttributeHash(identityParts: Array<{ position: number; value: string }>): string {
  identityParts.sort((a, b) => a.position - b.position);
  const payload = identityParts.map((p) => p.value).join('|');
  return createHash('sha256').update(payload).digest('hex');
}

interface NamingPart { position: number; label: string; code: string }

function buildAutoName(parts: NamingPart[]): string {
  return [...parts].sort((a, b) => a.position - b.position).map((p) => p.label).filter(Boolean).join(' ');
}

function buildAutoSku(prefix: string, parts: NamingPart[], sep: string): string {
  const codes = [...parts].sort((a, b) => a.position - b.position).map((p) => p.code).filter(Boolean);
  return [prefix, ...codes].join(sep);
}

function isAttributeVisible(
  attrId: string, rules: VisRule[],
  inputMap: Map<string, { attributeValueId?: string | null; rawValue?: string | null }>,
  valuesById: Map<string, ValueMeta>,
): boolean {
  const attrRules = rules.filter((r) => r.attributeId === attrId);
  if (attrRules.length === 0) return true;
  for (const rule of attrRules) {
    const sourceInput = inputMap.get(rule.dependsOnAttributeId);
    if (!sourceInput) return rule.action !== 'show';
    const sourceLabel = sourceInput.attributeValueId
      ? valuesById.get(sourceInput.attributeValueId)?.valueLabel ?? ''
      : sourceInput.rawValue ?? '';
    const condVals = Array.isArray(rule.conditionValues) ? (rule.conditionValues as string[]) : [];
    let condMet = false;
    switch (rule.conditionOperator) {
      case 'equals': case 'in': condMet = condVals.includes(sourceLabel); break;
      case 'not_equals': case 'not_in': condMet = !condVals.includes(sourceLabel); break;
    }
    if (rule.action === 'show') return condMet;
    if (rule.action === 'hide') return !condMet;
  }
  return true;
}

// ─── template generation ───────────────────────────────────────────────────────

export async function generateImportTemplate(categoryId: string, materialTypeId: string): Promise<{
  csv: string;
  columns: Array<{ header: string; attributeCode: string; required: boolean; allowedValues?: string[] }>;
}> {
  const profile = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId, materialTypeId } },
  });
  if (!profile) throw new NotFoundError('No profile for this category + type');

  const attrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: profile.id, isActive: true },
    orderBy: { displayOrder: 'asc' },
  });

  const columns: Array<{ header: string; attributeCode: string; required: boolean; allowedValues?: string[] }> = [];

  for (const attr of attrs) {
    if (attr.fieldType === 'image_single' || attr.fieldType === 'image_gallery' || attr.fieldType === 'auto_fill') continue;

    const col: typeof columns[number] = {
      header: attr.attributeCode,
      attributeCode: attr.attributeCode,
      required: attr.isRequired,
    };

    if (['dropdown', 'single_select', 'multi_select', 'text_autocomplete', 'dimension'].includes(attr.fieldType)) {
      const values = await prisma.materialAttributeValue.findMany({
        where: { attributeId: attr.id, isActive: true },
        orderBy: { displayOrder: 'asc' },
        select: { valueLabel: true, valueShortCode: true },
      });
      col.allowedValues = values.map((v) => `${v.valueShortCode} (${v.valueLabel})`);
    }

    columns.push(col);
  }

  // Add UOM columns
  columns.push({ header: 'purchase_uom', attributeCode: 'purchase_uom', required: true });
  columns.push({ header: 'consumption_uom', attributeCode: 'consumption_uom', required: true });
  columns.push({ header: 'conversion_factor', attributeCode: 'conversion_factor', required: false });
  columns.push({ header: 'notes', attributeCode: 'notes', required: false });

  const headerRow = columns.map((c) => c.header).join(',');
  const requiredRow = columns.map((c) => c.required ? 'REQUIRED' : 'optional').join(',');

  // Build allowed-values section
  let allowedSection = '\n\n# Allowed Values\n';
  for (const col of columns) {
    if (col.allowedValues && col.allowedValues.length > 0) {
      allowedSection += `# ${col.header}: ${col.allowedValues.join(' | ')}\n`;
    }
  }

  const csv = headerRow + '\n' + requiredRow + allowedSection;
  return { csv, columns };
}

// ─── import ────────────────────────────────────────────────────────────────────

export type OnDuplicate = 'skip' | 'fail' | 'update_existing';

export interface ImportMaterialsInput {
  categoryId: string;
  materialTypeId: string;
  csvBuffer: Buffer;
  onDuplicate: OnDuplicate;
  sourceFilename?: string;
  importedBy?: string;
}

interface RowError {
  row: number;
  field?: string;
  message: string;
  rowData: Record<string, string>;
}

export async function importMaterials(input: ImportMaterialsInput) {
  const profile = await prisma.materialCategoryTypeProfile.findUnique({
    where: {
      categoryId_materialTypeId: {
        categoryId: input.categoryId,
        materialTypeId: input.materialTypeId,
      },
    },
    include: { category: true },
  });
  if (!profile) throw new NotFoundError('No profile for this category + type');

  let records: Record<string, string>[];
  try {
    records = parse(input.csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      comment: '#',
    });
  } catch {
    throw new ValidationError('Invalid CSV format');
  }

  // Skip the "REQUIRED/optional" indicator row if present
  if (records.length > 0) {
    const firstVals = Object.values(records[0]);
    if (firstVals.every((v) => v === 'REQUIRED' || v === 'optional' || v === '')) {
      records.shift();
    }
  }

  const batch = await prisma.materialImportBatch.create({
    data: {
      categoryId: input.categoryId,
      materialTypeId: input.materialTypeId,
      sourceFilename: input.sourceFilename ?? 'import.csv',
      totalRows: records.length,
      status: 'processing',
      onDuplicate: input.onDuplicate,
      importedBy: input.importedBy,
    },
  });

  const attrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: profile.id, isActive: true },
    orderBy: { displayOrder: 'asc' },
  }) as AttrMeta[];

  // Pre-load all attribute values for this profile's attributes
  const allValues = await prisma.materialAttributeValue.findMany({
    where: { attributeId: { in: attrs.map((a) => a.id) }, isActive: true },
  });
  const valuesByAttrId = new Map<string, ValueMeta[]>();
  for (const v of allValues) {
    const list = valuesByAttrId.get(v.attributeId) ?? [];
    list.push(v as ValueMeta);
    valuesByAttrId.set(v.attributeId, list);
  }

  const visRules = await prisma.materialAttributeVisibilityRule.findMany({
    where: { attribute: { categoryTypeProfileId: profile.id } },
  }) as VisRule[];

  const categoryPrefix = CATEGORY_PREFIX[profile.category.categoryCode] ?? 'MAT';
  const skuFormat = await prisma.materialNamingFormat.findUnique({
    where: { categoryTypeProfileId_formatType: { categoryTypeProfileId: profile.id, formatType: 'sku' } },
  });

  const imageRule = await prisma.materialCategoryImageRule.findFirst({
    where: { categoryId: input.categoryId },
  });

  const errors: RowError[] = [];
  let successCount = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const rowNum = i + 2; // 1-indexed + header
    const rowErrors: string[] = [];

    // Resolve each attribute from CSV columns
    const inputMap = new Map<string, { attributeValueId?: string | null; rawValue?: string | null }>();
    const resolvedValues = new Map<string, ValueMeta>();

    for (const attr of attrs) {
      if (attr.fieldType === 'image_single' || attr.fieldType === 'image_gallery' || attr.fieldType === 'auto_fill') continue;

      const cellValue = row[attr.attributeCode]?.trim();
      if (!cellValue) continue;

      if (['dropdown', 'single_select', 'multi_select', 'text_autocomplete', 'dimension'].includes(attr.fieldType)) {
        const candidates = valuesByAttrId.get(attr.id) ?? [];
        const match = candidates.find(
          (v) => v.valueShortCode.toLowerCase() === cellValue.toLowerCase()
            || v.valueLabel.toLowerCase() === cellValue.toLowerCase(),
        );

        if (!match) {
          rowErrors.push(`${attr.label}: value "${cellValue}" not found in allowed values`);
          continue;
        }

        inputMap.set(attr.id, { attributeValueId: match.id });
        resolvedValues.set(match.id, match);
      } else {
        inputMap.set(attr.id, { rawValue: cellValue });
      }
    }

    // Check required attributes
    for (const attr of attrs) {
      if (!attr.isRequired) continue;
      if (attr.fieldType === 'image_single' || attr.fieldType === 'image_gallery' || attr.fieldType === 'auto_fill') continue;

      const visible = isAttributeVisible(attr.id, visRules, inputMap, resolvedValues);
      if (!visible) continue;

      const av = inputMap.get(attr.id);
      if (!av || (!av.attributeValueId && !av.rawValue)) {
        rowErrors.push(`${attr.label} is required`);
      }
    }

    // Validate manufacturer-scoped values
    const mfrAttr = attrs.find((a) => a.attributeCode === 'manufacturer');
    let resolvedMfrId: string | undefined;
    if (mfrAttr) {
      const mfrInput = inputMap.get(mfrAttr.id);
      if (mfrInput?.attributeValueId) {
        const val = resolvedValues.get(mfrInput.attributeValueId);
        if (val) {
          const mfrCode = ATTR_CODE_TO_MFR[val.valueShortCode];
          if (mfrCode) {
            const mfr = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: mfrCode } });
            if (mfr) resolvedMfrId = mfr.id;
          }
          if (!resolvedMfrId) {
            const direct = await prisma.materialManufacturer.findFirst({
              where: { OR: [{ manufacturerCode: val.valueShortCode }, { name: { contains: val.valueLabel, mode: 'insensitive' } }] },
            });
            if (direct) resolvedMfrId = direct.id;
          }
          if (!resolvedMfrId) {
            rowErrors.push(`Cannot resolve manufacturer: ${val.valueLabel}`);
          }
        }
      }
    }

    if (resolvedMfrId) {
      for (const attr of attrs) {
        if (!attr.isManufacturerScoped) continue;
        const av = inputMap.get(attr.id);
        if (!av?.attributeValueId) continue;
        const val = resolvedValues.get(av.attributeValueId);
        if (val?.manufacturerId && val.manufacturerId !== resolvedMfrId) {
          rowErrors.push(`${attr.label}: value belongs to a different manufacturer`);
        }
      }
    }

    // Check required UOMs
    if (!row.purchase_uom?.trim()) rowErrors.push('purchase_uom is required');
    if (!row.consumption_uom?.trim()) rowErrors.push('consumption_uom is required');

    if (rowErrors.length > 0) {
      errors.push({
        row: rowNum,
        message: rowErrors.join('; '),
        rowData: row,
      });
      continue;
    }

    // Build identity hash
    const identityParts: Array<{ position: number; value: string }> = [];
    const nameParts: NamingPart[] = [];
    const skuParts: NamingPart[] = [];

    for (const attr of attrs) {
      const av = inputMap.get(attr.id);
      if (!av) continue;
      const visible = isAttributeVisible(attr.id, visRules, inputMap, resolvedValues);
      if (!visible) continue;

      let label = '';
      let code = '';
      if (av.attributeValueId) {
        const v = resolvedValues.get(av.attributeValueId);
        if (v) { label = v.valueLabel; code = v.valueShortCode; }
      } else {
        label = av.rawValue ?? '';
        code = normalizeValue(label).replace(/[^A-Z0-9]/g, '');
      }

      if (attr.isIdentity) {
        identityParts.push({ position: attr.skuPosition ?? attr.displayOrder, value: normalizeValue(code || label) });
      }
      if (attr.feedsName && attr.namePosition != null) {
        nameParts.push({ position: attr.namePosition, label, code });
      }
      if (attr.feedsSku && attr.skuPosition != null) {
        skuParts.push({ position: attr.skuPosition, label, code });
      }
    }

    const attributeHash = computeAttributeHash(identityParts);

    // Duplicate check
    const existingDup = await prisma.material.findUnique({ where: { attributeHash } });
    if (existingDup) {
      if (input.onDuplicate === 'skip') {
        continue; // silently skip
      }
      if (input.onDuplicate === 'fail') {
        errors.push({
          row: rowNum,
          message: `Duplicate of existing material: ${existingDup.materialCode}`,
          rowData: row,
        });
        continue;
      }
      if (input.onDuplicate === 'update_existing') {
        await prisma.material.update({
          where: { id: existingDup.id },
          data: {
            notes: row.notes?.trim() || existingDup.notes,
            purchaseUom: row.purchase_uom?.trim() || existingDup.purchaseUom,
            consumptionUom: row.consumption_uom?.trim() || existingDup.consumptionUom,
          },
        });
        successCount++;
        continue;
      }
    }

    const materialName = buildAutoName(nameParts);
    const materialCode = buildAutoSku(categoryPrefix, skuParts, skuFormat?.separator ?? '-');

    const codeExists = await prisma.material.findUnique({ where: { materialCode } });
    if (codeExists) {
      errors.push({
        row: rowNum,
        message: `Generated code "${materialCode}" collides with existing material`,
        rowData: row,
      });
      continue;
    }

    const needsImage = imageRule?.imageRequirement === 'required' || imageRule?.imageRequirement === 'required_deferrable';
    const hasPendingImage = needsImage;

    try {
      await prisma.material.create({
        data: {
          materialCode,
          materialName,
          categoryId: input.categoryId,
          materialTypeId: input.materialTypeId,
          categoryTypeProfileId: profile.id,
          manufacturerId: resolvedMfrId!,
          attributeHash,
          purchaseUom: row.purchase_uom.trim(),
          consumptionUom: row.consumption_uom.trim(),
          uomConversionFactor: row.conversion_factor ? parseFloat(row.conversion_factor) : 1,
          hasPendingImage,
          notes: row.notes?.trim() || null,
          attributeValues: {
            create: Array.from(inputMap.entries())
              .filter(([, v]) => v.attributeValueId || v.rawValue)
              .map(([attrId, v]) => ({
                attributeId: attrId,
                attributeValueId: v.attributeValueId ?? null,
                rawValue: v.rawValue ?? null,
              })),
          },
        },
      });
      successCount++;
    } catch (e) {
      errors.push({
        row: rowNum,
        message: `Creation failed: ${(e as Error).message}`,
        rowData: row,
      });
    }
  }

  // Persist errors
  if (errors.length > 0) {
    await prisma.materialImportError.createMany({
      data: errors.map((e) => ({
        batchId: batch.id,
        rowNumber: e.row,
        field: e.field ?? null,
        message: e.message,
        rowData: e.rowData as unknown as Prisma.InputJsonValue,
      })),
    });
  }

  const finalStatus = errors.length > 0
    ? (successCount > 0 ? 'completed_with_errors' : 'failed')
    : 'completed';

  await prisma.materialImportBatch.update({
    where: { id: batch.id },
    data: { successRows: successCount, failedRows: errors.length, status: finalStatus },
  });

  return {
    batchId: batch.id,
    totalRows: records.length,
    successCount,
    errorCount: errors.length,
    status: finalStatus,
  };
}

// ─── error resolution ──────────────────────────────────────────────────────────

export async function getBatchErrors(batchId: string, includeResolved = false) {
  const batch = await prisma.materialImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError('Import batch not found');

  const where: Prisma.MaterialImportErrorWhereInput = { batchId };
  if (!includeResolved) where.isResolved = false;

  const errors = await prisma.materialImportError.findMany({
    where,
    orderBy: { rowNumber: 'asc' },
  });

  return { batch, errors };
}

export async function updateImportError(errorId: string, correctedData: Record<string, string>) {
  const err = await prisma.materialImportError.findUnique({ where: { id: errorId } });
  if (!err) throw new NotFoundError('Import error not found');

  return prisma.materialImportError.update({
    where: { id: errorId },
    data: {
      correctedData: correctedData as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function retryBatchErrors(batchId: string) {
  const batch = await prisma.materialImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError('Import batch not found');
  if (!batch.categoryId || !batch.materialTypeId) {
    throw new ValidationError('Batch missing category or type info');
  }

  const unresolvedErrors = await prisma.materialImportError.findMany({
    where: { batchId, isResolved: false, correctedData: { not: Prisma.DbNull } },
    orderBy: { rowNumber: 'asc' },
  });

  if (unresolvedErrors.length === 0) {
    throw new ValidationError('No corrected errors to retry');
  }

  // Build CSV from corrected data
  const rows = unresolvedErrors.map((e) => e.correctedData as Record<string, string>);
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  for (const row of rows) {
    csvLines.push(headers.map((h) => row[h] ?? '').join(','));
  }

  const result = await importMaterials({
    categoryId: batch.categoryId,
    materialTypeId: batch.materialTypeId,
    csvBuffer: Buffer.from(csvLines.join('\n')),
    onDuplicate: (batch.onDuplicate as OnDuplicate) ?? 'skip',
    sourceFilename: `retry_${batch.sourceFilename}`,
    importedBy: batch.importedBy ?? undefined,
  });

  // Mark retried errors as resolved
  await prisma.materialImportError.updateMany({
    where: { id: { in: unresolvedErrors.map((e) => e.id) } },
    data: { isResolved: true },
  });

  return result;
}

export async function exportBatchErrorsCsv(batchId: string): Promise<string> {
  const batch = await prisma.materialImportBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new NotFoundError('Import batch not found');

  const errors = await prisma.materialImportError.findMany({
    where: { batchId, isResolved: false },
    orderBy: { rowNumber: 'asc' },
  });

  if (errors.length === 0) return '';

  const firstRowData = errors[0].rowData as Record<string, string> | null;
  if (!firstRowData) return '';

  const headers = [...Object.keys(firstRowData), '_error_message'];
  const lines = [headers.join(',')];

  for (const err of errors) {
    const rd = (err.rowData as Record<string, string>) ?? {};
    const vals = headers.map((h) => {
      if (h === '_error_message') return `"${err.message.replace(/"/g, '""')}"`;
      const v = rd[h] ?? '';
      return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    });
    lines.push(vals.join(','));
  }

  return lines.join('\n');
}

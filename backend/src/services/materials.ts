/**
 * Material Master service — P2-03.
 *
 * Implements: lookup queries, CRUD with auto-generated name/SKU,
 * attribute_hash duplicate detection, live preview, and duplicate-check helper.
 */
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';

// ─── lookup queries (used by creation form) ────────────────────────────────────

export async function listCategories() {
  return prisma.materialCategory.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, categoryCode: true, name: true, icon: true, displayOrder: true },
  });
}

export async function listMaterialTypes() {
  return prisma.materialType.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, typeCode: true, name: true, inventoryBehavior: true, displayOrder: true },
  });
}

export async function getProfile(filters: { categoryId?: string; materialTypeId?: string }) {
  const where: Prisma.MaterialCategoryTypeProfileWhereInput = { isActive: true };
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.materialTypeId) where.materialTypeId = filters.materialTypeId;
  return prisma.materialCategoryTypeProfile.findMany({
    where,
    select: { id: true, categoryId: true, materialTypeId: true, profileName: true },
  });
}

export async function listAttributes(profileId: string) {
  return prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: profileId, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true, attributeCode: true, label: true, fieldType: true,
      displayOrder: true, displayGroup: true,
      isRequired: true, isIdentity: true, feedsName: true, feedsSku: true,
      namePosition: true, skuPosition: true, isManufacturerScoped: true,
      defaultValue: true, placeholder: true, helpText: true,
    },
  });
}

export async function listAttributeValues(attributeId: string, manufacturerId?: string) {
  const where: Prisma.MaterialAttributeValueWhereInput = { attributeId, isActive: true };
  if (manufacturerId) {
    where.OR = [{ manufacturerId }, { manufacturerId: null }];
  }
  return prisma.materialAttributeValue.findMany({
    where,
    orderBy: { displayOrder: 'asc' },
    select: {
      id: true, valueLabel: true, valueShortCode: true, displayOrder: true,
      manufacturerId: true, swatchImagePath: true, hexColor: true,
    },
  });
}

export async function listVisibilityRules(profileId: string) {
  return prisma.materialAttributeVisibilityRule.findMany({
    where: { attribute: { categoryTypeProfileId: profileId } },
    select: {
      id: true, attributeId: true, dependsOnAttributeId: true,
      conditionOperator: true, conditionValues: true, action: true,
    },
  });
}

export async function listValueDependencies(profileId: string) {
  return prisma.materialAttributeValueDependency.findMany({
    where: { attribute: { categoryTypeProfileId: profileId } },
    select: {
      id: true, attributeId: true, dependsOnAttributeId: true, filterMap: true,
    },
  });
}

export async function listManufacturers(_categoryId?: string) {
  return prisma.materialManufacturer.findMany({
    where: { isActive: true, isDeleted: false },
    orderBy: { name: 'asc' },
    select: { id: true, manufacturerCode: true, name: true, website: true },
  });
}

export async function lookupCatalog(manufacturerId: string, catalogType: string, code: string) {
  return prisma.materialManufacturerCatalog.findFirst({
    where: { manufacturerId, catalogType, code, isActive: true },
    select: { id: true, code: true, name: true, additionalAttributes: true, referenceImagePath: true },
  });
}

// ─── attribute hash + naming ────────────────────────────────────────────────────

interface AttrInput {
  attributeId: string;
  attributeValueId?: string | null;
  rawValue?: string | null;
}

function normalizeValue(val: string): string {
  return val.trim().toUpperCase().replace(/\s+/g, ' ');
}

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

async function resolveAttrLabel(
  attrInput: AttrInput,
  _attrMeta: AttrMeta,
  valuesMap: Map<string, ValueMeta>,
): Promise<{ label: string; code: string }> {
  if (attrInput.attributeValueId) {
    const v = valuesMap.get(attrInput.attributeValueId);
    if (!v) return { label: '', code: '' };
    return { label: v.valueLabel, code: v.valueShortCode };
  }
  const raw = attrInput.rawValue ?? '';
  return { label: raw, code: normalizeValue(raw).replace(/[^A-Z0-9]/g, '') };
}

function computeAttributeHash(
  identityParts: Array<{ position: number; value: string }>,
): string {
  identityParts.sort((a, b) => a.position - b.position);
  const payload = identityParts.map((p) => p.value).join('|');
  return createHash('sha256').update(payload).digest('hex');
}

interface NamingPart {
  position: number;
  label: string;
  code: string;
}

function buildAutoName(parts: NamingPart[], _formatTemplate: unknown[] | null, _separator: string): string {
  const sorted = [...parts].sort((a, b) => a.position - b.position);
  return sorted.map((p) => p.label).filter(Boolean).join(' ');
}

function buildAutoSku(
  categoryPrefix: string,
  parts: NamingPart[],
  separator: string,
): string {
  const sorted = [...parts].sort((a, b) => a.position - b.position);
  const codes = sorted.map((p) => p.code).filter(Boolean);
  return [categoryPrefix, ...codes].join(separator);
}

// Category code → SKU prefix mapping
const CATEGORY_PREFIX: Record<string, string> = {
  BOARDS: 'BRD', LAMINATES: 'LAM', EDGE_BAND: 'EBT', HARDWARE: 'HDW',
  METAL_COMP: 'MET', SEATING: 'CHR', FABRIC: 'FAB', ADHESIVE: 'ADH',
  TOOLS: 'TUL', RAW_STEEL: 'STL', PACKING: 'PKG', GAS_SPRING: 'MCH',
};

// ─── visibility rule evaluation ─────────────────────────────────────────────────

interface VisRule {
  attributeId: string;
  dependsOnAttributeId: string;
  conditionOperator: string;
  conditionValues: unknown;
  action: string;
}

function isAttributeVisible(
  attrId: string,
  rules: VisRule[],
  inputMap: Map<string, AttrInput>,
  valuesById: Map<string, ValueMeta>,
): boolean {
  const attrRules = rules.filter((r) => r.attributeId === attrId);
  if (attrRules.length === 0) return true; // no rules = always visible

  for (const rule of attrRules) {
    const sourceInput = inputMap.get(rule.dependsOnAttributeId);
    if (!sourceInput) {
      // source attribute not provided: if action is 'show', field stays hidden
      return rule.action !== 'show';
    }

    const sourceLabel = sourceInput.attributeValueId
      ? valuesById.get(sourceInput.attributeValueId)?.valueLabel ?? ''
      : sourceInput.rawValue ?? '';

    const condVals = Array.isArray(rule.conditionValues)
      ? (rule.conditionValues as string[])
      : [];

    let condMet = false;
    switch (rule.conditionOperator) {
      case 'equals':
        condMet = condVals.includes(sourceLabel);
        break;
      case 'not_equals':
        condMet = !condVals.includes(sourceLabel);
        break;
      case 'in':
        condMet = condVals.includes(sourceLabel);
        break;
      case 'not_in':
        condMet = !condVals.includes(sourceLabel);
        break;
    }

    if (rule.action === 'show') return condMet;
    if (rule.action === 'hide') return !condMet;
  }
  return true;
}

// ─── material creation ──────────────────────────────────────────────────────────

export interface CreateMaterialInput {
  categoryId: string;
  materialTypeId: string;
  attributeValues: AttrInput[];
  purchaseUom: string;
  consumptionUom: string;
  conversionFactor?: number;
  minStockLevel?: number;
  reorderLevel?: number;
  maxStockLevel?: number;
  primaryImagePath?: string;
  notes?: string;
}

export async function createMaterial(input: CreateMaterialInput) {
  // a. Validate category + type → profile exists
  const profile = await prisma.materialCategoryTypeProfile.findUnique({
    where: {
      categoryId_materialTypeId: {
        categoryId: input.categoryId,
        materialTypeId: input.materialTypeId,
      },
    },
    include: { category: true },
  });
  if (!profile) {
    throw new ValidationError('No profile exists for this category + material type combination');
  }

  // Load profile attributes
  const attrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: profile.id, isActive: true },
    orderBy: { displayOrder: 'asc' },
  });
  const attrById = new Map(attrs.map((a) => [a.id, a as AttrMeta]));

  // Build input map keyed by attributeId
  const inputMap = new Map(input.attributeValues.map((av) => [av.attributeId, av]));

  // Load all values that might be referenced
  const valueIds = input.attributeValues
    .map((av) => av.attributeValueId)
    .filter((id): id is string => !!id);
  const allValues = valueIds.length > 0
    ? await prisma.materialAttributeValue.findMany({ where: { id: { in: valueIds } } })
    : [];
  const valuesById = new Map(allValues.map((v) => [v.id, v as ValueMeta]));

  // Load visibility rules for this profile
  const visRules = await prisma.materialAttributeVisibilityRule.findMany({
    where: { attribute: { categoryTypeProfileId: profile.id } },
  });

  // b. Validate all required attributes provided (respecting visibility rules)
  for (const attr of attrs) {
    if (!attr.isRequired) continue;
    if (attr.fieldType === 'image_single' || attr.fieldType === 'image_gallery') continue;
    if (attr.fieldType === 'auto_fill') continue;

    const visible = isAttributeVisible(attr.id, visRules, inputMap, valuesById);
    if (!visible) continue; // hidden by condition → not required

    const av = inputMap.get(attr.id);
    if (!av || (!av.attributeValueId && !av.rawValue)) {
      throw new ValidationError(`Missing required attribute: ${attr.label}`, {
        attributeId: attr.id,
        attributeCode: attr.attributeCode,
      });
    }
  }

  // c. Normalize typed fields
  for (const av of input.attributeValues) {
    if (av.rawValue) {
      av.rawValue = av.rawValue.trim();
      const attr = attrById.get(av.attributeId);
      if (attr && (attr.fieldType === 'text_autocomplete' || attr.fieldType === 'text_free')) {
        av.rawValue = av.rawValue.trim();
      }
    }
  }

  // d. Validate manufacturer-scoped values belong to the selected manufacturer
  const mfrAttrForValidation = attrs.find((a) => a.attributeCode === 'manufacturer');
  const selectedMfrInput = mfrAttrForValidation ? inputMap.get(mfrAttrForValidation.id) : undefined;
  const selectedMfrVal = selectedMfrInput?.attributeValueId
    ? valuesById.get(selectedMfrInput.attributeValueId)
    : undefined;

  if (selectedMfrVal) {
    const resolvedMfrId = await resolveManufacturerId(attrs, inputMap, valuesById);
    for (const av of input.attributeValues) {
      if (!av.attributeValueId) continue;
      const attr = attrById.get(av.attributeId);
      if (!attr?.isManufacturerScoped) continue;
      const val = valuesById.get(av.attributeValueId);
      if (val?.manufacturerId && val.manufacturerId !== resolvedMfrId) {
        throw new ValidationError(
          `Attribute value for "${attr.label}" belongs to a different manufacturer`,
          { attributeId: attr.id, attributeCode: attr.attributeCode },
        );
      }
    }
  }

  // g. Build attribute_hash from identity attributes
  const identityParts: Array<{ position: number; value: string }> = [];
  const nameParts: NamingPart[] = [];
  const skuParts: NamingPart[] = [];

  for (const attr of attrs) {
    const av = inputMap.get(attr.id);
    if (!av) continue;

    const visible = isAttributeVisible(attr.id, visRules, inputMap, valuesById);
    if (!visible) continue;

    const resolved = await resolveAttrLabel(av, attr as AttrMeta, valuesById);

    if (attr.isIdentity) {
      identityParts.push({
        position: attr.skuPosition ?? attr.displayOrder,
        value: normalizeValue(resolved.code || resolved.label),
      });
    }

    if (attr.feedsName && attr.namePosition != null) {
      nameParts.push({ position: attr.namePosition, label: resolved.label, code: resolved.code });
    }
    if (attr.feedsSku && attr.skuPosition != null) {
      skuParts.push({ position: attr.skuPosition, label: resolved.label, code: resolved.code });
    }
  }

  const attributeHash = computeAttributeHash(identityParts);

  // h. Check for duplicate
  const existingDup = await prisma.material.findUnique({ where: { attributeHash } });
  if (existingDup) {
    throw new ConflictError('Duplicate material found', {
      code: 'DUPLICATE_FOUND',
      existingMaterialId: existingDup.id,
      existingMaterialCode: existingDup.materialCode,
      existingMaterialName: existingDup.materialName,
    });
  }

  // i. Generate name and SKU
  const categoryPrefix = CATEGORY_PREFIX[profile.category.categoryCode] ?? 'MAT';

  // Load naming format for name
  const nameFormat = await prisma.materialNamingFormat.findUnique({
    where: { categoryTypeProfileId_formatType: { categoryTypeProfileId: profile.id, formatType: 'name' } },
  });
  const skuFormat = await prisma.materialNamingFormat.findUnique({
    where: { categoryTypeProfileId_formatType: { categoryTypeProfileId: profile.id, formatType: 'sku' } },
  });

  const materialName = buildAutoName(
    nameParts,
    nameFormat ? (nameFormat.formatTemplate as unknown[]) : null,
    nameFormat?.separator ?? ' ',
  );
  const materialCode = buildAutoSku(
    categoryPrefix,
    skuParts,
    skuFormat?.separator ?? '-',
  );

  // j. Sanity-check code uniqueness
  const codeExists = await prisma.material.findUnique({ where: { materialCode } });
  if (codeExists) {
    throw new ConflictError('Generated material code already exists — possible hash collision', {
      code: 'CODE_COLLISION',
      materialCode,
    });
  }

  // k. Check image requirement
  const imageRule = await prisma.materialCategoryImageRule.findFirst({
    where: { categoryId: input.categoryId },
  });
  const needsImage = imageRule?.imageRequirement === 'required';
  const hasPendingImage = needsImage && !input.primaryImagePath;

  // l. Create material + attribute values
  const material = await prisma.material.create({
    data: {
      materialCode,
      materialName,
      categoryId: input.categoryId,
      materialTypeId: input.materialTypeId,
      categoryTypeProfileId: profile.id,
      manufacturerId: await resolveManufacturerId(attrs, inputMap, valuesById),
      attributeHash,
      purchaseUom: input.purchaseUom,
      consumptionUom: input.consumptionUom,
      uomConversionFactor: input.conversionFactor ?? 1,
      minStockLevel: input.minStockLevel,
      reorderLevel: input.reorderLevel,
      maxStockLevel: input.maxStockLevel,
      primaryImagePath: input.primaryImagePath ?? null,
      hasPendingImage,
      notes: input.notes ?? null,
      attributeValues: {
        create: input.attributeValues
          .filter((av) => av.attributeValueId || av.rawValue)
          .map((av) => ({
            attributeId: av.attributeId,
            attributeValueId: av.attributeValueId ?? null,
            rawValue: av.rawValue ?? null,
          })),
      },
    },
    include: {
      category: { select: { categoryCode: true, name: true } },
      materialType: { select: { typeCode: true, name: true } },
      manufacturer: { select: { manufacturerCode: true, name: true } },
      attributeValues: {
        include: {
          attribute: { select: { attributeCode: true, label: true, fieldType: true } },
          attributeValue: { select: { valueLabel: true, valueShortCode: true } },
        },
      },
    },
  });

  return material;
}

const ATTR_CODE_TO_MFR: Record<string, string> = {
  HET: 'HETTICH', EBC: 'EBCO', HAF: 'HAFELE', AT: 'ACTION_TESA',
  GPL: 'GREENPLY', CEN: 'CENTURY', REG: 'REGULAR', MER: 'MERINO',
  GRL: 'GREENLAM', RT: 'ROYALE_TOUCHE', GOD: 'GODREJ', IPS: 'IPSA',
  SOL: 'SOLITAIRE', PID: 'REGULAR', BSH: 'REGULAR', REH: 'REGULAR',
};

async function resolveManufacturerId(
  attrs: AttrMeta[],
  inputMap: Map<string, AttrInput>,
  valuesById: Map<string, ValueMeta>,
): Promise<string> {
  const mfrAttr = attrs.find((a) => a.attributeCode === 'manufacturer');
  if (!mfrAttr) throw new ValidationError('Profile is missing a manufacturer attribute');

  const mfrInput = inputMap.get(mfrAttr.id);
  if (!mfrInput?.attributeValueId) {
    throw new ValidationError('Manufacturer is required');
  }

  const val = valuesById.get(mfrInput.attributeValueId);
  if (!val) throw new ValidationError('Invalid manufacturer value');

  const mfrCode = ATTR_CODE_TO_MFR[val.valueShortCode];
  if (mfrCode) {
    const mfr = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: mfrCode } });
    if (mfr) return mfr.id;
  }

  const direct = await prisma.materialManufacturer.findFirst({
    where: { OR: [{ manufacturerCode: val.valueShortCode }, { name: { contains: val.valueLabel, mode: 'insensitive' } }] },
  });
  if (direct) return direct.id;

  throw new ValidationError(`Cannot resolve manufacturer from value: ${val.valueLabel}`);
}

// ─── material update ────────────────────────────────────────────────────────────

export interface UpdateMaterialInput {
  notes?: string;
  minStockLevel?: number;
  reorderLevel?: number;
  maxStockLevel?: number;
  purchaseUom?: string;
  consumptionUom?: string;
  conversionFactor?: number;
  isActive?: boolean;
}

export async function updateMaterial(id: string, input: UpdateMaterialInput) {
  const existing = await prisma.material.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Material not found');

  return prisma.material.update({
    where: { id },
    data: {
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.minStockLevel !== undefined ? { minStockLevel: input.minStockLevel } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: input.reorderLevel } : {}),
      ...(input.maxStockLevel !== undefined ? { maxStockLevel: input.maxStockLevel } : {}),
      ...(input.purchaseUom !== undefined ? { purchaseUom: input.purchaseUom } : {}),
      ...(input.consumptionUom !== undefined ? { consumptionUom: input.consumptionUom } : {}),
      ...(input.conversionFactor !== undefined ? { uomConversionFactor: input.conversionFactor } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: {
      category: { select: { categoryCode: true, name: true } },
      materialType: { select: { typeCode: true, name: true } },
      manufacturer: { select: { manufacturerCode: true, name: true } },
    },
  });
}

// ─── material delete (soft) ─────────────────────────────────────────────────────

export async function deleteMaterial(id: string) {
  const existing = await prisma.material.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Material not found');

  // BOM usage check skipped for now — product_engineering schema not yet built
  // Will be added in P2-09+

  return prisma.material.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), isActive: false },
  });
}

// ─── material queries ───────────────────────────────────────────────────────────

export interface ListMaterialFilters {
  category?: string;
  materialType?: string;
  manufacturer?: string;
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listMaterials(filters: ListMaterialFilters) {
  const where: Prisma.MaterialWhereInput = { isDeleted: false };

  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.category) where.category = { categoryCode: filters.category };
  if (filters.materialType) where.materialType = { typeCode: filters.materialType };
  if (filters.manufacturer) where.manufacturer = { manufacturerCode: filters.manufacturer };
  if (filters.search) {
    where.OR = [
      { materialName: { contains: filters.search, mode: 'insensitive' } },
      { materialCode: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [total, materials] = await Promise.all([
    prisma.material.count({ where }),
    prisma.material.findMany({
      where,
      include: {
        category: { select: { categoryCode: true, name: true } },
        materialType: { select: { typeCode: true, name: true } },
        manufacturer: { select: { manufacturerCode: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return { total, page: filters.page, limit: filters.limit, materials };
}

export async function getMaterial(id: string) {
  const m = await prisma.material.findFirst({
    where: { id, isDeleted: false },
    include: {
      category: { select: { categoryCode: true, name: true } },
      materialType: { select: { typeCode: true, name: true } },
      profile: { select: { id: true, profileName: true } },
      manufacturer: { select: { manufacturerCode: true, name: true } },
      attributeValues: {
        include: {
          attribute: { select: { attributeCode: true, label: true, fieldType: true, isIdentity: true, feedsName: true, feedsSku: true } },
          attributeValue: { select: { valueLabel: true, valueShortCode: true } },
        },
      },
      images: { orderBy: { displayOrder: 'asc' } },
    },
  });
  if (!m) throw new NotFoundError('Material not found');
  return m;
}

export async function getMaterialWhereUsed(id: string) {
  // BOM usage — deferred until product_engineering schema built (P2-09+)
  const m = await prisma.material.findFirst({ where: { id, isDeleted: false } });
  if (!m) throw new NotFoundError('Material not found');
  return { materialId: id, boms: [] };
}

// ─── duplicate check helper ─────────────────────────────────────────────────────

export interface DuplicateCheckInput {
  categoryId: string;
  materialTypeId: string;
  attributeValues: AttrInput[];
}

export async function checkDuplicate(input: DuplicateCheckInput) {
  const profile = await prisma.materialCategoryTypeProfile.findUnique({
    where: {
      categoryId_materialTypeId: {
        categoryId: input.categoryId,
        materialTypeId: input.materialTypeId,
      },
    },
  });
  if (!profile) {
    return { duplicateFound: false, existingMaterial: null, similarMaterials: [] };
  }

  const attrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: profile.id, isActive: true },
  });

  const inputMap = new Map(input.attributeValues.map((av) => [av.attributeId, av]));

  const valueIds = input.attributeValues
    .map((av) => av.attributeValueId)
    .filter((id): id is string => !!id);
  const allValues = valueIds.length > 0
    ? await prisma.materialAttributeValue.findMany({ where: { id: { in: valueIds } } })
    : [];
  const valuesById = new Map(allValues.map((v) => [v.id, v as ValueMeta]));

  const visRules = await prisma.materialAttributeVisibilityRule.findMany({
    where: { attribute: { categoryTypeProfileId: profile.id } },
  });

  const identityParts: Array<{ position: number; value: string }> = [];
  for (const attr of attrs) {
    if (!attr.isIdentity) continue;
    const av = inputMap.get(attr.id);
    if (!av) continue;

    const visible = isAttributeVisible(attr.id, visRules, inputMap, valuesById);
    if (!visible) continue;

    const resolved = await resolveAttrLabel(av, attr as AttrMeta, valuesById);
    identityParts.push({
      position: attr.skuPosition ?? attr.displayOrder,
      value: normalizeValue(resolved.code || resolved.label),
    });
  }

  if (identityParts.length === 0) {
    return { duplicateFound: false, existingMaterial: null, similarMaterials: [] };
  }

  const attributeHash = computeAttributeHash(identityParts);
  const existing = await prisma.material.findUnique({
    where: { attributeHash },
    select: { id: true, materialCode: true, materialName: true, isActive: true },
  });

  // Similar materials: same category + type, partial match
  const similar = existing
    ? []
    : await prisma.material.findMany({
        where: {
          categoryId: input.categoryId,
          materialTypeId: input.materialTypeId,
          isDeleted: false,
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, materialCode: true, materialName: true },
      });

  return {
    duplicateFound: !!existing,
    existingMaterial: existing,
    similarMaterials: existing ? [] : similar,
  };
}

// ─── name/code preview ──────────────────────────────────────────────────────────

export async function previewNameAndCode(input: DuplicateCheckInput) {
  const profile = await prisma.materialCategoryTypeProfile.findUnique({
    where: {
      categoryId_materialTypeId: {
        categoryId: input.categoryId,
        materialTypeId: input.materialTypeId,
      },
    },
    include: { category: true },
  });
  if (!profile) {
    return { materialName: '', materialCode: '' };
  }

  const attrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: profile.id, isActive: true },
    orderBy: { displayOrder: 'asc' },
  });

  const inputMap = new Map(input.attributeValues.map((av) => [av.attributeId, av]));

  const valueIds = input.attributeValues
    .map((av) => av.attributeValueId)
    .filter((id): id is string => !!id);
  const allValues = valueIds.length > 0
    ? await prisma.materialAttributeValue.findMany({ where: { id: { in: valueIds } } })
    : [];
  const valuesById = new Map(allValues.map((v) => [v.id, v as ValueMeta]));

  const visRules = await prisma.materialAttributeVisibilityRule.findMany({
    where: { attribute: { categoryTypeProfileId: profile.id } },
  });

  const nameParts: NamingPart[] = [];
  const skuParts: NamingPart[] = [];

  for (const attr of attrs) {
    const av = inputMap.get(attr.id);
    if (!av) continue;

    const visible = isAttributeVisible(attr.id, visRules, inputMap, valuesById);
    if (!visible) continue;

    const resolved = await resolveAttrLabel(av, attr as AttrMeta, valuesById);

    if (attr.feedsName && attr.namePosition != null) {
      nameParts.push({ position: attr.namePosition, label: resolved.label, code: resolved.code });
    }
    if (attr.feedsSku && attr.skuPosition != null) {
      skuParts.push({ position: attr.skuPosition, label: resolved.label, code: resolved.code });
    }
  }

  const categoryPrefix = CATEGORY_PREFIX[profile.category.categoryCode] ?? 'MAT';

  const nameFormat = await prisma.materialNamingFormat.findUnique({
    where: { categoryTypeProfileId_formatType: { categoryTypeProfileId: profile.id, formatType: 'name' } },
  });
  const skuFormat = await prisma.materialNamingFormat.findUnique({
    where: { categoryTypeProfileId_formatType: { categoryTypeProfileId: profile.id, formatType: 'sku' } },
  });

  return {
    materialName: buildAutoName(nameParts, nameFormat?.formatTemplate as unknown[] | null, nameFormat?.separator ?? ' '),
    materialCode: buildAutoSku(categoryPrefix, skuParts, skuFormat?.separator ?? '-'),
  };
}

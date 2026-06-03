/**
 * P2-02 — Material Master Seed Data.
 *
 * Loads all OutDo seed data per MATERIAL_MASTER_DESIGN_LOCK.md Part 5.
 * Idempotent: safe to re-run. Uses upsert or findFirst+skip patterns.
 *
 * Called from seed.ts main().
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── helpers ──────────────────────────────────────────────────────────────────

async function upsertCategory(code: string, name: string, order: number, icon?: string) {
  return prisma.materialCategory.upsert({
    where: { categoryCode: code },
    update: { name, displayOrder: order, icon: icon ?? null },
    create: { categoryCode: code, name, displayOrder: order, icon: icon ?? null, isActive: true },
  });
}

async function upsertType(code: string, name: string, order: number, behavior?: Record<string, unknown>) {
  return prisma.materialType.upsert({
    where: { typeCode: code },
    update: { name, displayOrder: order, inventoryBehavior: behavior ?? null },
    create: { typeCode: code, name, displayOrder: order, inventoryBehavior: behavior ?? null, isActive: true },
  });
}

async function upsertManufacturer(code: string, name: string, website?: string) {
  return prisma.materialManufacturer.upsert({
    where: { manufacturerCode: code },
    update: { name, website: website ?? null },
    create: { manufacturerCode: code, name, website: website ?? null, isActive: true },
  });
}

async function getOrCreateProfile(categoryId: string, typeId: string, profileName: string) {
  const existing = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId, materialTypeId: typeId } },
  });
  if (existing) return existing;
  return prisma.materialCategoryTypeProfile.create({
    data: { categoryId, materialTypeId: typeId, profileName, isActive: true },
  });
}

async function getOrCreateAttribute(
  profileId: string,
  opts: {
    attributeCode: string;
    label: string;
    fieldType: string;
    displayOrder: number;
    displayGroup?: string;
    isRequired: boolean;
    isIdentity: boolean;
    feedsName: boolean;
    feedsSku: boolean;
    namePosition?: number;
    skuPosition?: number;
    isManufacturerScoped?: boolean;
    placeholder?: string;
    helpText?: string;
  },
) {
  const existing = await prisma.materialAttribute.findUnique({
    where: {
      categoryTypeProfileId_attributeCode: {
        categoryTypeProfileId: profileId,
        attributeCode: opts.attributeCode,
      },
    },
  });
  if (existing) return existing;
  return prisma.materialAttribute.create({
    data: {
      categoryTypeProfileId: profileId,
      attributeCode: opts.attributeCode,
      label: opts.label,
      fieldType: opts.fieldType,
      displayOrder: opts.displayOrder,
      displayGroup: opts.displayGroup ?? null,
      isRequired: opts.isRequired,
      isIdentity: opts.isIdentity,
      feedsName: opts.feedsName,
      feedsSku: opts.feedsSku,
      namePosition: opts.namePosition ?? null,
      skuPosition: opts.skuPosition ?? null,
      isManufacturerScoped: opts.isManufacturerScoped ?? false,
      placeholder: opts.placeholder ?? null,
      helpText: opts.helpText ?? null,
      isActive: true,
    },
  });
}

async function seedValues(
  attributeId: string,
  values: Array<{ label: string; code: string; order: number; manufacturerId?: string }>,
) {
  for (const v of values) {
    const existing = await prisma.materialAttributeValue.findFirst({
      where: { attributeId, valueShortCode: v.code, manufacturerId: v.manufacturerId ?? null },
    });
    if (existing) continue;
    await prisma.materialAttributeValue.create({
      data: {
        attributeId,
        valueLabel: v.label,
        valueShortCode: v.code,
        displayOrder: v.order,
        manufacturerId: v.manufacturerId ?? null,
        isActive: true,
      },
    });
  }
}

async function seedVisibilityRule(
  targetAttrId: string,
  sourceAttrId: string,
  operator: string,
  values: unknown[],
  action: string,
) {
  const existing = await prisma.materialAttributeVisibilityRule.findFirst({
    where: { attributeId: targetAttrId, dependsOnAttributeId: sourceAttrId },
  });
  if (existing) return;
  await prisma.materialAttributeVisibilityRule.create({
    data: {
      attributeId: targetAttrId,
      dependsOnAttributeId: sourceAttrId,
      conditionOperator: operator,
      conditionValues: values,
      action,
    },
  });
}

async function seedValueDependency(
  targetAttrId: string,
  sourceAttrId: string,
  filterMap: Record<string, string[]>,
) {
  const existing = await prisma.materialAttributeValueDependency.findFirst({
    where: { attributeId: targetAttrId, dependsOnAttributeId: sourceAttrId },
  });
  if (existing) return;
  await prisma.materialAttributeValueDependency.create({
    data: {
      attributeId: targetAttrId,
      dependsOnAttributeId: sourceAttrId,
      filterMap,
    },
  });
}

async function seedNamingFormat(
  profileId: string,
  formatType: string,
  template: unknown[],
  separator: string,
  preview: string,
) {
  const existing = await prisma.materialNamingFormat.findUnique({
    where: { categoryTypeProfileId_formatType: { categoryTypeProfileId: profileId, formatType } },
  });
  if (existing) return;
  await prisma.materialNamingFormat.create({
    data: {
      categoryTypeProfileId: profileId,
      formatType,
      formatTemplate: template,
      separator,
      previewExample: preview,
      isActive: true,
    },
  });
}

async function seedImageRule(categoryId: string, requirement: string) {
  const existing = await prisma.materialCategoryImageRule.findFirst({
    where: { categoryId },
  });
  if (existing) return;
  await prisma.materialCategoryImageRule.create({
    data: { categoryId, imageRequirement: requirement },
  });
}

// ─── seed functions ────────────────────────────────────────────────────────────

async function seedCategories() {
  const cats = [
    { code: 'BOARDS',      name: 'Boards & Panels',           order: 10,  icon: 'layers' },
    { code: 'LAMINATES',   name: 'Laminates',                 order: 20,  icon: 'palette' },
    { code: 'EDGE_BAND',   name: 'Edge Banding',              order: 30,  icon: 'ruler' },
    { code: 'HARDWARE',    name: 'Hardware & Fittings',        order: 40,  icon: 'wrench' },
    { code: 'METAL_COMP',  name: 'Metal Components',           order: 50,  icon: 'cog' },
    { code: 'SEATING',     name: 'Seating',                    order: 60,  icon: 'armchair' },
    { code: 'FABRIC',      name: 'Fabric & Upholstery',        order: 70,  icon: 'shirt' },
    { code: 'ADHESIVE',    name: 'Adhesives & Chemicals',      order: 80,  icon: 'flask' },
    { code: 'TOOLS',       name: 'Tools & Consumables',        order: 90,  icon: 'hammer' },
    { code: 'RAW_STEEL',   name: 'Raw Steel & Metal',          order: 100, icon: 'hard-hat' },
    { code: 'PACKING',     name: 'Packing Materials',          order: 110, icon: 'package' },
    { code: 'GAS_SPRING',  name: 'Gas Springs & Mechanisms',   order: 120, icon: 'activity' },
  ];

  const map: Record<string, string> = {};
  for (const c of cats) {
    const row = await upsertCategory(c.code, c.name, c.order, c.icon);
    map[c.code] = row.id;
  }
  console.log(`  categories       : ${Object.keys(map).length}`);
  return map;
}

async function seedMaterialTypes() {
  const types = [
    { code: 'RAW',            name: 'Raw',            order: 10, behavior: { track_stock: true, allow_purchase: true } },
    { code: 'SEMI_FINISHED',  name: 'Semi-Finished',  order: 20, behavior: { track_stock: true, allow_purchase: true } },
    { code: 'FINISHED',       name: 'Finished',       order: 30, behavior: { track_stock: true, allow_purchase: true } },
    { code: 'PACKAGING',      name: 'Packaging',      order: 40, behavior: { track_stock: true, allow_purchase: true } },
    { code: 'CONSUMABLES',    name: 'Consumables',    order: 50, behavior: { track_stock: true, allow_purchase: true } },
    { code: 'SPARE_PARTS',    name: 'Spare Parts',    order: 60, behavior: { track_stock: true, allow_purchase: true } },
    { code: 'MRO',            name: 'MRO',            order: 70, behavior: { track_stock: false, allow_purchase: true } },
  ];

  const map: Record<string, string> = {};
  for (const t of types) {
    const row = await upsertType(t.code, t.name, t.order, t.behavior);
    map[t.code] = row.id;
  }
  console.log(`  material types   : ${Object.keys(map).length}`);
  return map;
}

async function seedManufacturers() {
  const mfrs = [
    { code: 'HETTICH',       name: 'Hettich',         website: 'https://www.hettich.com' },
    { code: 'EBCO',          name: 'Ebco',            website: 'https://www.ebco.in' },
    { code: 'HAFELE',        name: 'Hafele',           website: 'https://www.hafele.co.in' },
    { code: 'ACTION_TESA',   name: 'Action Tesa',     website: 'https://www.actiontesa.com' },
    { code: 'GREENPLY',      name: 'Greenply',        website: 'https://www.greenply.com' },
    { code: 'CENTURY',       name: 'Century',         website: 'https://www.centuryply.com' },
    { code: 'MERINO',        name: 'Merino',          website: 'https://www.merinolaminates.com' },
    { code: 'GREENLAM',      name: 'Greenlam',        website: 'https://www.greenlam.com' },
    { code: 'ROYALE_TOUCHE', name: 'Royale Touche',   website: 'https://www.royaletouche.com' },
    { code: 'GODREJ',        name: 'Godrej',          website: 'https://www.godrej.com' },
    { code: 'IPSA',          name: 'Ipsa',            website: null },
    { code: 'SOLITAIRE',     name: 'Solitaire',       website: null },
    { code: 'REGULAR',       name: 'Regular Brand',   website: null },
  ];

  const map: Record<string, string> = {};
  for (const m of mfrs) {
    const row = await upsertManufacturer(m.code, m.name, m.website ?? undefined);
    map[m.code] = row.id;
  }
  console.log(`  manufacturers    : ${Object.keys(map).length}`);
  return map;
}

// ─── profiles + attributes + values per category ───────────────────────────────

async function seedBoardsAndPanels(
  catId: string,
  types: Record<string, string>,
  mfrs: Record<string, string>,
) {
  // ── Profile A: Boards RAW ─────────────────────────────────────────────
  const rawProfile = await getOrCreateProfile(catId, types.RAW, 'Boards & Panels — Raw');

  const rawBoardType = await getOrCreateAttribute(rawProfile.id, {
    attributeCode: 'board_type', label: 'Board Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 1,
  });
  await seedValues(rawBoardType.id, [
    { label: 'PLPB', code: 'PLPB', order: 10 },
    { label: 'MDF', code: 'MDF', order: 20 },
    { label: 'HDMR', code: 'HDMR', order: 30 },
    { label: 'Plywood', code: 'PLY', order: 40 },
    { label: 'Raw Particle Board', code: 'PB', order: 50 },
  ]);

  const rawMfr = await getOrCreateAttribute(rawProfile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 2,
  });
  await seedValues(rawMfr.id, [
    { label: 'Action Tesa', code: 'AT', order: 10 },
    { label: 'Greenply', code: 'GPL', order: 20 },
    { label: 'Century', code: 'CEN', order: 30 },
    { label: 'Regular Brand', code: 'REG', order: 40 },
  ]);

  const rawThick = await getOrCreateAttribute(rawProfile.id, {
    attributeCode: 'thickness_mm', label: 'Thickness (mm)', fieldType: 'single_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 3,
  });
  await seedValues(rawThick.id, [
    { label: '4 mm', code: '4', order: 10 },
    { label: '6 mm', code: '6', order: 20 },
    { label: '8 mm', code: '8', order: 30 },
    { label: '9 mm', code: '9', order: 40 },
    { label: '16 mm', code: '16', order: 50 },
    { label: '17 mm', code: '17', order: 60 },
    { label: '18 mm', code: '18', order: 70 },
    { label: '25 mm', code: '25', order: 80 },
  ]);

  const rawSize = await getOrCreateAttribute(rawProfile.id, {
    attributeCode: 'sheet_size', label: 'Sheet Size', fieldType: 'dimension',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 4,
  });
  await seedValues(rawSize.id, [
    { label: '8×4 (2440×1220)', code: '84', order: 10 },
    { label: '8×6 (2440×1830)', code: '86', order: 20 },
  ]);

  await getOrCreateAttribute(rawProfile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 50, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  // naming formats
  await seedNamingFormat(rawProfile.id, 'name', [
    { ref: 'thickness_mm' }, { literal: ' ' }, { ref: 'board_type' },
    { literal: ' ' }, { ref: 'manufacturer' }, { literal: ' ' }, { ref: 'sheet_size' },
  ], ' ', '18 PLPB Action Tesa 8×4');

  await seedNamingFormat(rawProfile.id, 'sku', [
    { literal: 'BRD' }, { ref: 'board_type' }, { ref: 'thickness_mm' }, { ref: 'sheet_size' },
  ], '-', 'BRD-PLPB-18-84');

  // ── Profile B: Boards SEMI_FINISHED ─────────────────────────────────
  const sfProfile = await getOrCreateProfile(catId, types.SEMI_FINISHED, 'Boards & Panels — Semi-Finished');

  const sfBoardType = await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'board_type', label: 'Board Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 1,
  });
  await seedValues(sfBoardType.id, [
    { label: 'PLPB', code: 'PLPB', order: 10 },
    { label: 'MDF', code: 'MDF', order: 20 },
    { label: 'HDMR', code: 'HDMR', order: 30 },
    { label: 'Plywood', code: 'PLY', order: 40 },
  ]);

  const sfMfr = await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 5, skuPosition: 2,
  });
  await seedValues(sfMfr.id, [
    { label: 'Action Tesa', code: 'AT', order: 10 },
    { label: 'Greenply', code: 'GPL', order: 20 },
    { label: 'Century', code: 'CEN', order: 30 },
  ]);

  const sfColorCode = await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'color_code', label: 'Color Code', fieldType: 'manufacturer_scoped_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 3,
    isManufacturerScoped: true,
    helpText: 'Select the manufacturer color code. Name auto-fills from catalog.',
  });

  const sfColorName = await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'color_name', label: 'Color Name', fieldType: 'auto_fill',
    displayOrder: 35, isRequired: true, isIdentity: false,
    feedsName: true, feedsSku: false, namePosition: 4,
    helpText: 'Auto-filled from manufacturer catalog based on Color Code.',
  });

  const sfThick = await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'thickness_mm', label: 'Thickness (mm)', fieldType: 'single_select',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 4,
  });
  await seedValues(sfThick.id, [
    { label: '4 mm', code: '4', order: 10 },
    { label: '6 mm', code: '6', order: 20 },
    { label: '7.30 mm', code: '730', order: 25 },
    { label: '8 mm', code: '8', order: 30 },
    { label: '9 mm', code: '9', order: 40 },
    { label: '16 mm', code: '16', order: 50 },
    { label: '17 mm', code: '17', order: 60 },
    { label: '18 mm', code: '18', order: 70 },
    { label: '25 mm', code: '25', order: 80 },
  ]);

  const sfSurface = await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'surface_finish', label: 'Surface Finish', fieldType: 'single_select',
    displayOrder: 50, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 5,
  });
  await seedValues(sfSurface.id, [
    { label: 'BSL (Both Side Laminated)', code: 'BSL', order: 10 },
    { label: 'DSL (Double Side Laminated)', code: 'DSL', order: 20 },
    { label: 'OSL (One Side Laminated)', code: 'OSL', order: 30 },
    { label: 'RAW', code: 'RAW', order: 40 },
    { label: 'Pre-Laminated', code: 'PRELAM', order: 50 },
  ]);

  const sfSize = await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'sheet_size', label: 'Sheet Size', fieldType: 'dimension',
    displayOrder: 60, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 6, skuPosition: 6,
  });
  await seedValues(sfSize.id, [
    { label: '8×4 (2440×1220)', code: '84', order: 10 },
    { label: '8×6 (2440×1830)', code: '86', order: 20 },
  ]);

  await getOrCreateAttribute(sfProfile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 70, isRequired: true, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(sfProfile.id, 'name', [
    { ref: 'thickness_mm' }, { literal: ' ' }, { ref: 'surface_finish' },
    { literal: ' ' }, { ref: 'board_type' }, { literal: ' ' }, { ref: 'color_name' },
    { literal: ' ' }, { ref: 'manufacturer' }, { literal: ' ' }, { ref: 'sheet_size' },
  ], ' ', '18 BSL PLPB Frosty White Action Tesa 8×6');

  await seedNamingFormat(sfProfile.id, 'sku', [
    { literal: 'BRD' }, { ref: 'board_type' }, { ref: 'manufacturer' },
    { ref: 'color_code' }, { ref: 'thickness_mm' }, { ref: 'surface_finish' }, { ref: 'sheet_size' },
  ], '-', 'BRD-PLPB-AT-1103-18-BSL-86');

  console.log('    → Boards & Panels (2 profiles)');
}

async function seedLaminates(
  catId: string,
  types: Record<string, string>,
  mfrs: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.RAW, 'Laminates — Raw');

  const lamMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(lamMfr.id, [
    { label: 'Merino', code: 'MER', order: 10 },
    { label: 'Greenlam', code: 'GRL', order: 20 },
    { label: 'Royale Touche', code: 'RT', order: 30 },
    { label: 'Century', code: 'CEN', order: 40 },
  ]);

  const lamDesignCode = await getOrCreateAttribute(profile.id, {
    attributeCode: 'design_code', label: 'Design Code', fieldType: 'text_autocomplete',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
    placeholder: 'e.g. 14177',
  });

  const lamDesignName = await getOrCreateAttribute(profile.id, {
    attributeCode: 'design_name', label: 'Design Name', fieldType: 'auto_fill',
    displayOrder: 25, isRequired: true, isIdentity: false,
    feedsName: true, feedsSku: false, namePosition: 3,
    helpText: 'Auto-filled from manufacturer catalog based on Design Code.',
  });

  const lamFinish = await getOrCreateAttribute(profile.id, {
    attributeCode: 'finish_type', label: 'Finish Type', fieldType: 'single_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 3,
  });
  await seedValues(lamFinish.id, [
    { label: 'SF (Suede Finish)', code: 'SF', order: 10 },
    { label: 'RH (Rough)', code: 'RH', order: 20 },
    { label: 'VR (Velvet)', code: 'VR', order: 30 },
    { label: 'FT (Flat)', code: 'FT', order: 40 },
    { label: 'MG (Matt Gloss)', code: 'MG', order: 50 },
    { label: 'HG (High Gloss)', code: 'HG', order: 60 },
    { label: 'Matte', code: 'MATT', order: 70 },
  ]);

  const lamThick = await getOrCreateAttribute(profile.id, {
    attributeCode: 'thickness_mm', label: 'Thickness (mm)', fieldType: 'single_select',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 5, skuPosition: 4,
  });
  await seedValues(lamThick.id, [
    { label: '0.8 mm', code: '08', order: 10 },
    { label: '1.0 mm', code: '10', order: 20 },
    { label: '1.5 mm', code: '15', order: 30 },
  ]);

  const lamSize = await getOrCreateAttribute(profile.id, {
    attributeCode: 'sheet_size', label: 'Sheet Size', fieldType: 'dimension',
    displayOrder: 50, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 6, skuPosition: 5,
  });
  await seedValues(lamSize.id, [
    { label: '8×4 (2440×1220)', code: '84', order: 10 },
    { label: '8×6 (2440×1830)', code: '86', order: 20 },
  ]);

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 60, isRequired: true, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'manufacturer' }, { literal: ' ' }, { ref: 'design_code' },
    { literal: ' ' }, { ref: 'design_name' }, { literal: ' ' },
    { ref: 'finish_type' }, { literal: ' ' }, { ref: 'thickness_mm' },
    { literal: ' ' }, { ref: 'sheet_size' },
  ], ' ', 'Merino 14177 Frosty White SF 0.8 8×4');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'LAM' }, { ref: 'manufacturer' }, { ref: 'design_code' },
    { ref: 'finish_type' }, { ref: 'thickness_mm' }, { ref: 'sheet_size' },
  ], '-', 'LAM-MER-14177-SF-08-84');

  console.log('    → Laminates (1 profile)');
}

async function seedEdgeBanding(
  catId: string,
  types: Record<string, string>,
  mfrs: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.RAW, 'Edge Banding — Raw');

  const ebMaterial = await getOrCreateAttribute(profile.id, {
    attributeCode: 'eb_material', label: 'Material', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(ebMaterial.id, [
    { label: 'PVC', code: 'PVC', order: 10 },
    { label: 'ABS', code: 'ABS', order: 20 },
  ]);

  const ebMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(ebMfr.id, [
    { label: 'Hettich', code: 'HET', order: 10 },
    { label: 'Rehau', code: 'REH', order: 20 },
    { label: 'Regular Brand', code: 'REG', order: 30 },
  ]);

  const ebColorCode = await getOrCreateAttribute(profile.id, {
    attributeCode: 'color_code', label: 'Color Code', fieldType: 'manufacturer_scoped_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
    isManufacturerScoped: true,
  });

  const ebColorName = await getOrCreateAttribute(profile.id, {
    attributeCode: 'color_name', label: 'Color Name', fieldType: 'auto_fill',
    displayOrder: 35, isRequired: true, isIdentity: false,
    feedsName: true, feedsSku: false, namePosition: 4,
  });

  const ebWidth = await getOrCreateAttribute(profile.id, {
    attributeCode: 'width_mm', label: 'Width (mm)', fieldType: 'single_select',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 5, skuPosition: 4,
  });
  await seedValues(ebWidth.id, [
    { label: '22 mm', code: '22', order: 10 },
    { label: '23 mm', code: '23', order: 20 },
    { label: '30 mm', code: '30', order: 30 },
    { label: '45 mm', code: '45', order: 40 },
  ]);

  const ebThick = await getOrCreateAttribute(profile.id, {
    attributeCode: 'thickness_mm', label: 'Thickness (mm)', fieldType: 'single_select',
    displayOrder: 50, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 6, skuPosition: 5,
  });
  await seedValues(ebThick.id, [
    { label: '0.40 mm', code: '040', order: 10 },
    { label: '0.80 mm', code: '080', order: 20 },
    { label: '1.00 mm', code: '100', order: 30 },
    { label: '1.30 mm', code: '130', order: 40 },
    { label: '1.50 mm', code: '150', order: 50 },
    { label: '2.00 mm', code: '200', order: 60 },
  ]);

  const ebFinish = await getOrCreateAttribute(profile.id, {
    attributeCode: 'finish', label: 'Finish', fieldType: 'single_select',
    displayOrder: 60, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 7, skuPosition: 6,
  });
  await seedValues(ebFinish.id, [
    { label: 'SHGL (Super High Gloss)', code: 'SHGL', order: 10 },
    { label: 'HGLL (High Gloss)', code: 'HGLL', order: 20 },
    { label: 'ML (Matt)', code: 'ML', order: 30 },
    { label: 'NL (Natural)', code: 'NL', order: 40 },
    { label: 'MATT', code: 'MATT', order: 50 },
    { label: 'TOL (Textured)', code: 'TOL', order: 60 },
  ]);

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 70, isRequired: true, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'eb_material' }, { literal: ' ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'color_name' }, { literal: ' ' },
    { ref: 'width_mm' }, { literal: 'mm × ' }, { ref: 'thickness_mm' },
    { literal: 'mm ' }, { ref: 'finish' },
  ], ' ', 'PVC Hettich Frosty White 22mm × 0.80mm SHGL');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'EBT' }, { ref: 'eb_material' }, { ref: 'manufacturer' },
    { ref: 'color_code' }, { ref: 'width_mm' }, { ref: 'thickness_mm' }, { ref: 'finish' },
  ], '-', 'EBT-PVC-HET-10107-22-080-SHGL');

  console.log('    → Edge Banding (1 profile)');
}

async function seedHardwareAndFittings(
  catId: string,
  types: Record<string, string>,
  mfrs: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.RAW, 'Hardware & Fittings — Raw');

  const hwType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'hardware_type', label: 'Hardware Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(hwType.id, [
    { label: 'Hinge', code: 'HNG', order: 10 },
    { label: 'Drawer Slide', code: 'DRS', order: 20 },
    { label: 'Telescopic Channel', code: 'TLC', order: 30 },
    { label: 'Lock', code: 'LCK', order: 40 },
    { label: 'Knob', code: 'KNB', order: 50 },
    { label: 'Screw', code: 'SCR', order: 60 },
    { label: 'Leveler', code: 'LVL', order: 70 },
    { label: 'Slim Box', code: 'SBX', order: 80 },
    { label: 'Sliding Door System', code: 'SDS', order: 90 },
    { label: 'D-Nut', code: 'DNT', order: 100 },
    { label: 'Drywall Screw', code: 'DWS', order: 110 },
  ]);

  const hwMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(hwMfr.id, [
    { label: 'Hettich', code: 'HET', order: 10 },
    { label: 'Ebco', code: 'EBC', order: 20 },
    { label: 'Hafele', code: 'HAF', order: 30 },
    { label: 'Godrej', code: 'GOD', order: 40 },
    { label: 'Ipsa', code: 'IPS', order: 50 },
    { label: 'Regular Brand', code: 'REG', order: 60 },
  ]);

  const hwVariant = await getOrCreateAttribute(profile.id, {
    attributeCode: 'quality_variant', label: 'Quality Variant', fieldType: 'manufacturer_scoped_select',
    displayOrder: 30, isRequired: false, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
    isManufacturerScoped: true,
    helpText: 'Manufacturer quality tier / series (e.g., Hettich Sensys, Onsys).',
  });
  // Hettich variants
  await seedValues(hwVariant.id, [
    { label: 'Onsys', code: 'ONS', order: 10, manufacturerId: mfrs.HETTICH },
    { label: 'Sensys', code: 'SEN', order: 20, manufacturerId: mfrs.HETTICH },
    { label: 'Veyosys', code: 'VEY', order: 30, manufacturerId: mfrs.HETTICH },
    { label: 'Obsidian', code: 'OBS', order: 40, manufacturerId: mfrs.HETTICH },
  ]);

  const hwSubType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'sub_type', label: 'Sub-Type', fieldType: 'dependent_select',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 4,
    helpText: 'Values filtered by Hardware Type.',
  });
  await seedValues(hwSubType.id, [
    // Hinge sub-types
    { label: 'Soft Close', code: 'SC', order: 10 },
    { label: 'Clip-On', code: 'CO', order: 20 },
    { label: 'Slide-On', code: 'SO', order: 30 },
    // Drawer Slide sub-types
    { label: 'Ball Bearing', code: 'BB', order: 40 },
    { label: 'Undermount', code: 'UM', order: 50 },
    { label: 'Premium', code: 'PRM', order: 60 },
    // Telescopic Channel sub-types
    { label: 'Standard', code: 'STD', order: 70 },
    { label: 'Heavy Duty', code: 'HD', order: 80 },
    { label: 'Full Extension', code: 'FE', order: 90 },
    // Lock sub-types
    { label: 'Cam Lock', code: 'CAM', order: 100 },
    { label: 'Pedestal Lock', code: 'PED', order: 110 },
    { label: 'Cupboard Lock', code: 'CUP', order: 120 },
    // General
    { label: 'Standard', code: 'STD2', order: 130 },
  ]);

  const hwSize = await getOrCreateAttribute(profile.id, {
    attributeCode: 'size_length', label: 'Size / Length', fieldType: 'dependent_select',
    displayOrder: 50, isRequired: false, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 5, skuPosition: 5,
    helpText: 'Depends on hardware type.',
  });
  await seedValues(hwSize.id, [
    // Drawer slide sizes
    { label: '250 mm', code: '250', order: 10 },
    { label: '300 mm', code: '300', order: 20 },
    { label: '350 mm', code: '350', order: 30 },
    { label: '400 mm', code: '400', order: 40 },
    { label: '450 mm', code: '450', order: 50 },
    { label: '500 mm', code: '500', order: 60 },
    { label: '550 mm', code: '550', order: 70 },
    // Screw sizes
    { label: '15 mm', code: '15', order: 80 },
    { label: '20 mm', code: '20', order: 90 },
    { label: '25 mm', code: '25', order: 100 },
    { label: '32 mm', code: '32', order: 110 },
    { label: '35 mm', code: '35', order: 120 },
  ]);

  const hwAngle = await getOrCreateAttribute(profile.id, {
    attributeCode: 'opening_angle', label: 'Opening Angle', fieldType: 'single_select',
    displayOrder: 60, isRequired: false, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 6, skuPosition: 6,
    helpText: 'Applies to hinges only.',
  });
  await seedValues(hwAngle.id, [
    { label: '110°', code: '110', order: 10 },
    { label: '155°', code: '155', order: 20 },
    { label: '170°', code: '170', order: 30 },
  ]);

  const hwCrank = await getOrCreateAttribute(profile.id, {
    attributeCode: 'crank_type', label: 'Crank Type', fieldType: 'single_select',
    displayOrder: 70, isRequired: false, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 7, skuPosition: 7,
    helpText: 'Applies to hinges only.',
  });
  await seedValues(hwCrank.id, [
    { label: '0-Crank', code: '0CR', order: 10 },
    { label: '8-Crank', code: '8CR', order: 20 },
    { label: '16-Crank', code: '16CR', order: 30 },
  ]);

  const hwMaterial = await getOrCreateAttribute(profile.id, {
    attributeCode: 'hw_material', label: 'Material', fieldType: 'single_select',
    displayOrder: 80, isRequired: true, isIdentity: false,
    feedsName: false, feedsSku: false,
  });
  await seedValues(hwMaterial.id, [
    { label: 'Steel', code: 'STL', order: 10 },
    { label: 'Zinc Alloy', code: 'ZNC', order: 20 },
    { label: 'Brass', code: 'BRS', order: 30 },
    { label: 'Stainless Steel', code: 'SS', order: 40 },
    { label: 'Plastic', code: 'PLS', order: 50 },
  ]);

  const hwFinish = await getOrCreateAttribute(profile.id, {
    attributeCode: 'hw_finish', label: 'Finish', fieldType: 'single_select',
    displayOrder: 90, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });
  await seedValues(hwFinish.id, [
    { label: 'Nickel Plated', code: 'NP', order: 10 },
    { label: 'Chrome', code: 'CHR', order: 20 },
    { label: 'Black', code: 'BLK', order: 30 },
    { label: 'White', code: 'WHT', order: 40 },
    { label: 'Satin', code: 'SAT', order: 50 },
  ]);

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 100, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  // ── Visibility rules: Crank Type and Opening Angle visible only for Hinges ──
  await seedVisibilityRule(hwCrank.id, hwType.id, 'equals', ['Hinge'], 'show');
  await seedVisibilityRule(hwAngle.id, hwType.id, 'equals', ['Hinge'], 'show');

  // ── Value dependencies: Sub-Type filtered by Hardware Type ──
  await seedValueDependency(hwSubType.id, hwType.id, {
    Hinge: ['SC', 'CO', 'SO'],
    'Drawer Slide': ['BB', 'UM', 'PRM'],
    'Telescopic Channel': ['STD', 'HD', 'FE'],
    Lock: ['CAM', 'PED', 'CUP'],
    Knob: ['STD2'],
    Screw: ['STD2'],
    Leveler: ['STD2'],
    'Slim Box': ['STD2'],
    'Sliding Door System': ['STD2'],
    'D-Nut': ['STD2'],
    'Drywall Screw': ['STD2'],
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'hardware_type' }, { literal: ' - ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'quality_variant' }, { literal: ' - ' },
    { ref: 'sub_type' }, { literal: ' - ' }, { ref: 'opening_angle' },
    { literal: '° - ' }, { ref: 'crank_type' },
  ], ' ', 'Hinge - Hettich Sensys - Soft Close - 110° - 0-Crank');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'HDW' }, { ref: 'hardware_type' }, { ref: 'manufacturer' },
    { ref: 'quality_variant' }, { ref: 'sub_type' }, { ref: 'opening_angle' }, { ref: 'crank_type' },
  ], '-', 'HDW-HNG-HET-SEN-SC-110-0CR');

  console.log('    → Hardware & Fittings (1 profile)');
}

async function seedMetalComponents(
  catId: string,
  types: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.SEMI_FINISHED, 'Metal Components — Semi-Finished');

  const mcType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'component_type', label: 'Component Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(mcType.id, [
    { label: 'MS Frame', code: 'FRM', order: 10 },
    { label: 'MS Bracket', code: 'BRK', order: 20 },
    { label: 'MS Channel', code: 'CHL', order: 30 },
    { label: 'MS Plate', code: 'PLT', order: 40 },
    { label: 'SS Component', code: 'SSC', order: 50 },
    { label: 'Aluminum Profile', code: 'ALU', order: 60 },
  ]);

  const mcMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(mcMfr.id, [
    { label: 'Regular Brand', code: 'REG', order: 10 },
  ]);

  const mcFinish = await getOrCreateAttribute(profile.id, {
    attributeCode: 'finish', label: 'Finish', fieldType: 'single_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
  });
  await seedValues(mcFinish.id, [
    { label: 'Powder Coated', code: 'PC', order: 10 },
    { label: 'Chrome Plated', code: 'CP', order: 20 },
    { label: 'Raw', code: 'RAW', order: 30 },
    { label: 'Galvanized', code: 'GAL', order: 40 },
  ]);

  const mcSize = await getOrCreateAttribute(profile.id, {
    attributeCode: 'dimensions', label: 'Dimensions', fieldType: 'text_autocomplete',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 4,
    placeholder: 'e.g. 600x400mm',
  });

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 50, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'component_type' }, { literal: ' ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'finish' }, { literal: ' ' }, { ref: 'dimensions' },
  ], ' ', 'MS Frame Regular Brand Powder Coated 600x400mm');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'MET' }, { ref: 'component_type' }, { ref: 'manufacturer' },
    { ref: 'finish' }, { ref: 'dimensions' },
  ], '-', 'MET-FRM-REG-PC-600X400');

  console.log('    → Metal Components (1 profile)');
}

async function seedSeating(
  catId: string,
  types: Record<string, string>,
  mfrs: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.FINISHED, 'Seating — Finished');

  const chairType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'chair_type', label: 'Chair Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(chairType.id, [
    { label: 'Executive', code: 'EXC', order: 10 },
    { label: 'Staff', code: 'STF', order: 20 },
    { label: 'Visitor', code: 'VIS', order: 30 },
    { label: 'Cafeteria', code: 'CAF', order: 40 },
    { label: 'Training', code: 'TRN', order: 50 },
  ]);

  const seatMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(seatMfr.id, [
    { label: 'Solitaire', code: 'SOL', order: 10 },
    { label: 'Regular Brand', code: 'REG', order: 20 },
  ]);

  const seatModel = await getOrCreateAttribute(profile.id, {
    attributeCode: 'model_series', label: 'Model / Series', fieldType: 'text_autocomplete',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
    placeholder: 'e.g. Ergo Pro',
  });

  const seatBack = await getOrCreateAttribute(profile.id, {
    attributeCode: 'back_type', label: 'Back Type', fieldType: 'single_select',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 4,
  });
  await seedValues(seatBack.id, [
    { label: 'High Back', code: 'HB', order: 10 },
    { label: 'Mid Back', code: 'MB', order: 20 },
    { label: 'Low Back', code: 'LB', order: 30 },
    { label: 'No Back', code: 'NB', order: 40 },
  ]);

  const seatArm = await getOrCreateAttribute(profile.id, {
    attributeCode: 'arm_type', label: 'Arm Type', fieldType: 'single_select',
    displayOrder: 50, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 5, skuPosition: 5,
  });
  await seedValues(seatArm.id, [
    { label: 'Fixed Arms', code: 'FA', order: 10 },
    { label: 'Adjustable Arms', code: 'AA', order: 20 },
    { label: 'No Arms', code: 'NA', order: 30 },
  ]);

  const seatBase = await getOrCreateAttribute(profile.id, {
    attributeCode: 'base_type', label: 'Base Type', fieldType: 'single_select',
    displayOrder: 60, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 6, skuPosition: 6,
  });
  await seedValues(seatBase.id, [
    { label: 'Chrome Base', code: 'CB', order: 10 },
    { label: 'Nylon Base', code: 'NB', order: 20 },
    { label: '4-Leg', code: '4L', order: 30 },
    { label: 'Cantilever', code: 'CT', order: 40 },
  ]);

  const seatColor = await getOrCreateAttribute(profile.id, {
    attributeCode: 'color', label: 'Color', fieldType: 'single_select',
    displayOrder: 70, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 7, skuPosition: 7,
  });
  await seedValues(seatColor.id, [
    { label: 'Black', code: 'BLK', order: 10 },
    { label: 'Grey', code: 'GRY', order: 20 },
    { label: 'Blue', code: 'BLU', order: 30 },
    { label: 'Red', code: 'RED', order: 40 },
    { label: 'Green', code: 'GRN', order: 50 },
  ]);

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 80, isRequired: true, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'chair_type' }, { literal: ' ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'model_series' }, { literal: ' ' },
    { ref: 'back_type' }, { literal: ' ' }, { ref: 'arm_type' },
    { literal: ' ' }, { ref: 'base_type' }, { literal: ' ' }, { ref: 'color' },
  ], ' ', 'Executive Solitaire Ergo Pro High Back Adjustable Arms Chrome Base Black');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'CHR' }, { ref: 'chair_type' }, { ref: 'manufacturer' },
    { ref: 'model_series' }, { ref: 'back_type' }, { ref: 'arm_type' },
    { ref: 'base_type' }, { ref: 'color' },
  ], '-', 'CHR-EXC-SOL-ERGOPRO-HB-AA-CB-BLK');

  console.log('    → Seating (1 profile)');
}

async function seedFabricAndUpholstery(
  catId: string,
  types: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.RAW, 'Fabric & Upholstery — Raw');

  const fabType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'fabric_type', label: 'Fabric Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(fabType.id, [
    { label: 'Mesh', code: 'MSH', order: 10 },
    { label: 'Leatherette', code: 'LTR', order: 20 },
    { label: 'Fabric', code: 'FAB', order: 30 },
    { label: 'Genuine Leather', code: 'GL', order: 40 },
    { label: 'Vinyl', code: 'VNL', order: 50 },
  ]);

  const fabMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(fabMfr.id, [
    { label: 'Regular Brand', code: 'REG', order: 10 },
  ]);

  const fabColor = await getOrCreateAttribute(profile.id, {
    attributeCode: 'color', label: 'Color', fieldType: 'single_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
  });
  await seedValues(fabColor.id, [
    { label: 'Black', code: 'BLK', order: 10 },
    { label: 'Grey', code: 'GRY', order: 20 },
    { label: 'Blue', code: 'BLU', order: 30 },
    { label: 'Brown', code: 'BRN', order: 40 },
    { label: 'White', code: 'WHT', order: 50 },
    { label: 'Red', code: 'RED', order: 60 },
  ]);

  const fabGrade = await getOrCreateAttribute(profile.id, {
    attributeCode: 'grade', label: 'Grade', fieldType: 'single_select',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 4,
  });
  await seedValues(fabGrade.id, [
    { label: 'Economy', code: 'ECO', order: 10 },
    { label: 'Standard', code: 'STD', order: 20 },
    { label: 'Premium', code: 'PRM', order: 30 },
  ]);

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 50, isRequired: true, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'fabric_type' }, { literal: ' ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'color' }, { literal: ' ' }, { ref: 'grade' },
  ], ' ', 'Mesh Regular Brand Black Standard');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'FAB' }, { ref: 'fabric_type' }, { ref: 'manufacturer' },
    { ref: 'color' }, { ref: 'grade' },
  ], '-', 'FAB-MSH-REG-BLK-STD');

  console.log('    → Fabric & Upholstery (1 profile)');
}

async function seedAdhesivesAndChemicals(
  catId: string,
  types: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.CONSUMABLES, 'Adhesives & Chemicals — Consumables');

  const adhType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'chemical_type', label: 'Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(adhType.id, [
    { label: 'Fevicol', code: 'FVC', order: 10 },
    { label: 'Edge Band Glue', code: 'EBG', order: 20 },
    { label: 'Contact Adhesive', code: 'CTA', order: 30 },
    { label: 'Wood Putty', code: 'WPT', order: 40 },
    { label: 'Thinner', code: 'THN', order: 50 },
    { label: 'Primer', code: 'PRM', order: 60 },
    { label: 'Lacquer', code: 'LAC', order: 70 },
    { label: 'Sealant', code: 'SLT', order: 80 },
  ]);

  const adhMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(adhMfr.id, [
    { label: 'Pidilite', code: 'PID', order: 10 },
    { label: 'Regular Brand', code: 'REG', order: 20 },
  ]);

  const adhPack = await getOrCreateAttribute(profile.id, {
    attributeCode: 'pack_size', label: 'Pack Size', fieldType: 'single_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
  });
  await seedValues(adhPack.id, [
    { label: '500 ml', code: '500ML', order: 10 },
    { label: '1 Ltr', code: '1L', order: 20 },
    { label: '5 Ltr', code: '5L', order: 30 },
    { label: '10 Kg', code: '10KG', order: 40 },
    { label: '25 Kg', code: '25KG', order: 50 },
    { label: '50 Kg', code: '50KG', order: 60 },
  ]);

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 40, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'chemical_type' }, { literal: ' ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'pack_size' },
  ], ' ', 'Fevicol Pidilite 5 Ltr');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'ADH' }, { ref: 'chemical_type' }, { ref: 'manufacturer' }, { ref: 'pack_size' },
  ], '-', 'ADH-FVC-PID-5L');

  console.log('    → Adhesives & Chemicals (1 profile)');
}

async function seedToolsAndConsumables(
  catId: string,
  types: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.CONSUMABLES, 'Tools & Consumables — Consumables');

  const toolType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'tool_type', label: 'Tool Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(toolType.id, [
    { label: 'Drill Bit', code: 'DRB', order: 10 },
    { label: 'Router Bit', code: 'RTB', order: 20 },
    { label: 'Saw Blade', code: 'SWB', order: 30 },
    { label: 'Sandpaper', code: 'SDP', order: 40 },
    { label: 'Sanding Disc', code: 'SDD', order: 50 },
    { label: 'Staple Pin', code: 'STP', order: 60 },
    { label: 'Brad Nail', code: 'BRN', order: 70 },
    { label: 'Cable Tie', code: 'CBT', order: 80 },
  ]);

  const toolMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(toolMfr.id, [
    { label: 'Regular Brand', code: 'REG', order: 10 },
    { label: 'Bosch', code: 'BSH', order: 20 },
  ]);

  const toolSpec = await getOrCreateAttribute(profile.id, {
    attributeCode: 'specification', label: 'Specification', fieldType: 'text_autocomplete',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
    placeholder: 'e.g. 8mm, P120, 14" etc.',
  });

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 40, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'tool_type' }, { literal: ' ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'specification' },
  ], ' ', 'Drill Bit Bosch 8mm');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'TUL' }, { ref: 'tool_type' }, { ref: 'manufacturer' }, { ref: 'specification' },
  ], '-', 'TUL-DRB-BSH-8MM');

  console.log('    → Tools & Consumables (1 profile)');
}

async function seedRawSteelAndMetal(
  catId: string,
  types: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.RAW, 'Raw Steel & Metal — Raw');

  const steelType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'steel_type', label: 'Steel Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(steelType.id, [
    { label: 'MS Pipe', code: 'MSP', order: 10 },
    { label: 'MS Sheet', code: 'MSS', order: 20 },
    { label: 'MS Angle', code: 'MSA', order: 30 },
    { label: 'MS Flat', code: 'MSF', order: 40 },
    { label: 'SS Pipe', code: 'SSP', order: 50 },
    { label: 'SS Sheet', code: 'SSS', order: 60 },
    { label: 'Aluminum Sheet', code: 'ALS', order: 70 },
    { label: 'Aluminum Pipe', code: 'ALP', order: 80 },
  ]);

  const steelMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(steelMfr.id, [
    { label: 'Regular Brand', code: 'REG', order: 10 },
  ]);

  const steelGrade = await getOrCreateAttribute(profile.id, {
    attributeCode: 'grade', label: 'Grade', fieldType: 'single_select',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
  });
  await seedValues(steelGrade.id, [
    { label: 'IS 2062', code: '2062', order: 10 },
    { label: 'IS 1079', code: '1079', order: 20 },
    { label: 'SS 304', code: 'SS304', order: 30 },
    { label: 'SS 202', code: 'SS202', order: 40 },
  ]);

  const steelDim = await getOrCreateAttribute(profile.id, {
    attributeCode: 'dimensions', label: 'Dimensions', fieldType: 'text_autocomplete',
    displayOrder: 40, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 4,
    placeholder: 'e.g. 25x25x1.6mm, 1.2mm thick',
  });

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 50, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'steel_type' }, { literal: ' ' }, { ref: 'grade' },
    { literal: ' ' }, { ref: 'dimensions' },
  ], ' ', 'MS Pipe IS 2062 25x25x1.6mm');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'STL' }, { ref: 'steel_type' }, { ref: 'grade' }, { ref: 'dimensions' },
  ], '-', 'STL-MSP-2062-25X25X16');

  console.log('    → Raw Steel & Metal (1 profile)');
}

async function seedPackingMaterials(
  catId: string,
  types: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.PACKAGING, 'Packing Materials — Packaging');

  const packType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'packing_type', label: 'Packing Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(packType.id, [
    { label: 'Corrugated Box', code: 'CBX', order: 10 },
    { label: 'Thermocol Sheet', code: 'TCS', order: 20 },
    { label: 'Bubble Wrap', code: 'BWR', order: 30 },
    { label: 'Stretch Film', code: 'SFM', order: 40 },
    { label: 'Packing Tape', code: 'TAP', order: 50 },
    { label: 'Foam Sheet', code: 'FSH', order: 60 },
    { label: 'Cardboard Corner', code: 'CCR', order: 70 },
    { label: 'Strap / Band', code: 'SBN', order: 80 },
  ]);

  const packMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(packMfr.id, [
    { label: 'Regular Brand', code: 'REG', order: 10 },
  ]);

  const packSpec = await getOrCreateAttribute(profile.id, {
    attributeCode: 'specification', label: 'Specification', fieldType: 'text_autocomplete',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
    placeholder: 'e.g. 5-ply 24x18x12, 50mm thick',
  });

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 40, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'packing_type' }, { literal: ' ' }, { ref: 'specification' },
  ], ' ', 'Corrugated Box 5-ply 24x18x12');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'PKG' }, { ref: 'packing_type' }, { ref: 'manufacturer' }, { ref: 'specification' },
  ], '-', 'PKG-CBX-REG-5PLY24X18X12');

  console.log('    → Packing Materials (1 profile)');
}

async function seedGasSpringsAndMechanisms(
  catId: string,
  types: Record<string, string>,
) {
  const profile = await getOrCreateProfile(catId, types.RAW, 'Gas Springs & Mechanisms — Raw');

  const mechType = await getOrCreateAttribute(profile.id, {
    attributeCode: 'mechanism_type', label: 'Mechanism Type', fieldType: 'single_select',
    displayOrder: 10, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 1, skuPosition: 1,
  });
  await seedValues(mechType.id, [
    { label: 'Gas Spring', code: 'GS', order: 10 },
    { label: 'Hydraulic Cylinder', code: 'HC', order: 20 },
    { label: 'Tilt Mechanism', code: 'TM', order: 30 },
    { label: 'Height Adjust Mechanism', code: 'HA', order: 40 },
    { label: 'Synchro Mechanism', code: 'SY', order: 50 },
  ]);

  const mechMfr = await getOrCreateAttribute(profile.id, {
    attributeCode: 'manufacturer', label: 'Manufacturer', fieldType: 'single_select',
    displayOrder: 20, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 2, skuPosition: 2,
  });
  await seedValues(mechMfr.id, [
    { label: 'Regular Brand', code: 'REG', order: 10 },
  ]);

  const mechForce = await getOrCreateAttribute(profile.id, {
    attributeCode: 'force_spec', label: 'Force / Spec', fieldType: 'text_autocomplete',
    displayOrder: 30, isRequired: true, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 3, skuPosition: 3,
    placeholder: 'e.g. 100N, Class 3',
  });

  const mechLength = await getOrCreateAttribute(profile.id, {
    attributeCode: 'stroke_length', label: 'Stroke Length', fieldType: 'text_autocomplete',
    displayOrder: 40, isRequired: false, isIdentity: true,
    feedsName: true, feedsSku: true, namePosition: 4, skuPosition: 4,
    placeholder: 'e.g. 120mm',
  });

  await getOrCreateAttribute(profile.id, {
    attributeCode: 'image', label: 'Image', fieldType: 'image_single',
    displayOrder: 50, isRequired: false, isIdentity: false,
    feedsName: false, feedsSku: false,
  });

  await seedNamingFormat(profile.id, 'name', [
    { ref: 'mechanism_type' }, { literal: ' ' }, { ref: 'manufacturer' },
    { literal: ' ' }, { ref: 'force_spec' }, { literal: ' ' }, { ref: 'stroke_length' },
  ], ' ', 'Gas Spring Regular Brand 100N 120mm');

  await seedNamingFormat(profile.id, 'sku', [
    { literal: 'MCH' }, { ref: 'mechanism_type' }, { ref: 'manufacturer' },
    { ref: 'force_spec' }, { ref: 'stroke_length' },
  ], '-', 'MCH-GS-REG-100N-120');

  console.log('    → Gas Springs & Mechanisms (1 profile)');
}

async function seedCategoryImageRules(cats: Record<string, string>) {
  const rules: Array<{ code: string; req: string }> = [
    { code: 'BOARDS', req: 'required' },
    { code: 'LAMINATES', req: 'required' },
    { code: 'EDGE_BAND', req: 'required' },
    { code: 'HARDWARE', req: 'optional' },
    { code: 'METAL_COMP', req: 'optional' },
    { code: 'SEATING', req: 'required' },
    { code: 'FABRIC', req: 'required' },
    { code: 'ADHESIVE', req: 'optional' },
    { code: 'TOOLS', req: 'optional' },
    { code: 'RAW_STEEL', req: 'optional' },
    { code: 'PACKING', req: 'optional' },
    { code: 'GAS_SPRING', req: 'optional' },
  ];

  for (const r of rules) {
    await seedImageRule(cats[r.code], r.req);
  }
  console.log(`  image rules      : ${rules.length}`);
}

// ─── main export ───────────────────────────────────────────────────────────────

export async function seedMaterialMaster(): Promise<void> {
  console.log('--- material master seed (P2-02) ---');

  const cats = await seedCategories();
  const types = await seedMaterialTypes();
  const mfrs = await seedManufacturers();

  console.log('  seeding profiles + attributes + values:');
  await seedBoardsAndPanels(cats.BOARDS, types, mfrs);
  await seedLaminates(cats.LAMINATES, types, mfrs);
  await seedEdgeBanding(cats.EDGE_BAND, types, mfrs);
  await seedHardwareAndFittings(cats.HARDWARE, types, mfrs);
  await seedMetalComponents(cats.METAL_COMP, types);
  await seedSeating(cats.SEATING, types, mfrs);
  await seedFabricAndUpholstery(cats.FABRIC, types);
  await seedAdhesivesAndChemicals(cats.ADHESIVE, types);
  await seedToolsAndConsumables(cats.TOOLS, types);
  await seedRawSteelAndMetal(cats.RAW_STEEL, types);
  await seedPackingMaterials(cats.PACKING, types);
  await seedGasSpringsAndMechanisms(cats.GAS_SPRING, types);

  await seedCategoryImageRules(cats);

  // counts
  const profileCount = await prisma.materialCategoryTypeProfile.count();
  const attrCount = await prisma.materialAttribute.count();
  const valCount = await prisma.materialAttributeValue.count();
  const visCount = await prisma.materialAttributeVisibilityRule.count();
  const depCount = await prisma.materialAttributeValueDependency.count();
  const fmtCount = await prisma.materialNamingFormat.count();

  console.log(`  profiles         : ${profileCount}`);
  console.log(`  attributes       : ${attrCount}`);
  console.log(`  attribute values : ${valCount}`);
  console.log(`  visibility rules : ${visCount}`);
  console.log(`  value deps       : ${depCount}`);
  console.log(`  naming formats   : ${fmtCount}`);
  console.log('--- material master seed complete ---');
}

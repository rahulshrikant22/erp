/**
 * P2-08 — Material Master End-to-End Integration Tests.
 *
 * Validates the full material master before moving to BOM.
 * Scenarios A–J per PROMPTS_P2.md P2-08 spec.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';
import sharp from 'sharp';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let app: Application;
let adminToken: string;

// Resolved seed IDs
let boardsCatId: string;
let hardwareCatId: string;
let laminatesCatId: string;
let rawTypeId: string;
let sfTypeId: string;
let sfProfileId: string;
let rawProfileId: string;
let hwProfileId: string;
let lamProfileId: string;

// SF Board attributes
let sfAttrs: Array<{ id: string; attributeCode: string; fieldType: string; isRequired: boolean; isManufacturerScoped: boolean }>;
// Hardware attributes
let hwAttrs: Array<{ id: string; attributeCode: string; fieldType: string; isRequired: boolean }>;
// Laminate attributes
let lamAttrs: Array<{ id: string; attributeCode: string; fieldType: string; isRequired: boolean }>;

// Manufacturer IDs
let actionTesaMfrId: string;
let hettichMfrId: string;
let greenplyMfrId: string;

// Test image
let pngBuffer: Buffer;

// Helpers
function sfAttr(code: string) {
  return sfAttrs.find((a) => a.attributeCode === code)!;
}
function hwAttr(code: string) {
  return hwAttrs.find((a) => a.attributeCode === code)!;
}
function lamAttr(code: string) {
  return lamAttrs.find((a) => a.attributeCode === code)!;
}

async function findVal(attributeId: string, code: string, manufacturerId?: string) {
  const where: Record<string, unknown> = { attributeId, valueShortCode: code };
  if (manufacturerId) where.manufacturerId = manufacturerId;
  const v = await prisma.materialAttributeValue.findFirst({ where });
  if (!v) throw new Error(`Value not found: attr=${attributeId} code=${code} mfr=${manufacturerId}`);
  return v;
}

const E2E_TAG = 'E2E_P208_TEST';

beforeAll(async () => {
  app = createApp();

  const admin = await createInternalUser({ roleCode: 'admin' });
  const tokens = await loginInternal(app, admin.email, admin.password);
  adminToken = tokens.accessToken;

  // Resolve seed IDs
  const boards = await prisma.materialCategory.findUnique({ where: { categoryCode: 'BOARDS' } });
  boardsCatId = boards!.id;
  const hw = await prisma.materialCategory.findUnique({ where: { categoryCode: 'HARDWARE' } });
  hardwareCatId = hw!.id;
  const lam = await prisma.materialCategory.findUnique({ where: { categoryCode: 'LAMINATES' } });
  laminatesCatId = lam!.id;

  const raw = await prisma.materialType.findUnique({ where: { typeCode: 'RAW' } });
  rawTypeId = raw!.id;
  const sf = await prisma.materialType.findUnique({ where: { typeCode: 'SEMI_FINISHED' } });
  sfTypeId = sf!.id;

  const rawP = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId: boardsCatId, materialTypeId: rawTypeId } },
  });
  rawProfileId = rawP!.id;

  const sfP = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId: boardsCatId, materialTypeId: sfTypeId } },
  });
  sfProfileId = sfP!.id;

  const hwP = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId: hardwareCatId, materialTypeId: rawTypeId } },
  });
  hwProfileId = hwP!.id;

  const lamP = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId: laminatesCatId, materialTypeId: rawTypeId } },
  });
  lamProfileId = lamP!.id;

  sfAttrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: sfProfileId, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, attributeCode: true, fieldType: true, isRequired: true, isManufacturerScoped: true },
  });

  hwAttrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: hwProfileId, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, attributeCode: true, fieldType: true, isRequired: true, isManufacturerScoped: false },
  });

  lamAttrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: lamProfileId, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, attributeCode: true, fieldType: true, isRequired: true, isManufacturerScoped: false },
  });

  // Manufacturers
  const at = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: 'ACTION_TESA' } });
  actionTesaMfrId = at!.id;
  const het = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: 'HETTICH' } });
  hettichMfrId = het!.id;
  const gpl = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: 'GREENPLY' } });
  greenplyMfrId = gpl!.id;

  pngBuffer = await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).png().toBuffer();
}, 30_000);

afterAll(async () => {
  // Clean test materials
  const testMats = await prisma.material.findMany({
    where: { notes: E2E_TAG },
    select: { id: true },
  });
  const ids = testMats.map((m) => m.id);
  if (ids.length > 0) {
    await prisma.materialMaterialAttributeValue.deleteMany({ where: { materialId: { in: ids } } });
    await prisma.materialImage.deleteMany({ where: { materialId: { in: ids } } });
    await prisma.material.deleteMany({ where: { id: { in: ids } } });
  }
  // Clean test catalog entries (prefixed with E2E codes)
  await prisma.materialManufacturerCatalog.deleteMany({
    where: { code: { startsWith: 'HET-E2E' } },
  });
  await prisma.materialManufacturerCatalog.deleteMany({
    where: { code: { startsWith: 'AT-E2E' } },
  });
  // Clean import batches
  await prisma.materialImportError.deleteMany({
    where: { batch: { sourceFilename: { startsWith: 'e2e-p208' } } },
  });
  await prisma.materialImportBatch.deleteMany({
    where: { sourceFilename: { startsWith: 'e2e-p208' } },
  });
  await prisma.$disconnect();
}, 10_000);

// ─── SCENARIO A: Manufacturer Catalog Setup ──────────────────────────────────

describe('Scenario A — Manufacturer catalog setup', () => {
  it('creates Hettich catalog entries and verifies accessibility', async () => {
    const entries = [
      { code: 'HET-E2E-001', name: 'Sensys 8631i' },
      { code: 'HET-E2E-002', name: 'Onsys 4477i' },
    ];

    for (const entry of entries) {
      const res = await request(app)
        .post('/api/material/manufacturer-catalogs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          manufacturer_id: hettichMfrId,
          catalog_type: 'hardware',
          code: entry.code,
          name: entry.name,
        });
      expect(res.status).toBe(201);
    }

    // Verify lookup
    const lookupRes = await request(app)
      .get(`/api/material/manufacturer-catalogs?manufacturer_id=${hettichMfrId}&search=E2E`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(lookupRes.status).toBe(200);
    expect(lookupRes.body.data.entries.length).toBeGreaterThanOrEqual(2);
  });

  it('creates Action Tesa catalog entries via CSV import', async () => {
    // Build CSV matching expected headers: code,name,additional_attributes
    const csv = [
      'code,name',
      'AT-E2E-1103,Frosty White',
      'AT-E2E-1104,Marble Grey',
      'AT-E2E-1105,Golden Oak',
    ].join('\n');

    const tmpFile = path.join(os.tmpdir(), 'at-catalog-e2e.csv');
    fs.writeFileSync(tmpFile, csv);

    const importRes = await request(app)
      .post(`/api/material/manufacturer-catalogs/import?manufacturer_id=${actionTesaMfrId}&catalog_type=color_code`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', tmpFile);
    expect(importRes.status).toBe(201);

    fs.unlinkSync(tmpFile);

    // Verify entries exist
    const listRes = await request(app)
      .get(`/api/material/manufacturer-catalogs?manufacturer_id=${actionTesaMfrId}&search=E2E`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.entries.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── SCENARIO B: Material creation, full happy path (Semi-Finished Board) ────

describe('Scenario B — Semi-finished board creation happy path', () => {
  let materialId: string;

  it('resolves profile attributes for BOARDS + SEMI_FINISHED', async () => {
    const res = await request(app)
      .get(`/api/material/attributes?profile_id=${sfProfileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const attrs = res.body.data.attributes;
    const codes = attrs.map((a: any) => a.attributeCode);
    expect(codes).toContain('board_type');
    expect(codes).toContain('manufacturer');
    expect(codes).toContain('color_code');
    expect(codes).toContain('thickness_mm');
    expect(codes).toContain('surface_finish');
    expect(codes).toContain('sheet_size');
  });

  it('previews name and code before creation', async () => {
    const boardTypeVal = await findVal(sfAttr('board_type').id, 'PLPB');
    const mfrVal = await findVal(sfAttr('manufacturer').id, 'AT');
    const thickVal = await findVal(sfAttr('thickness_mm').id, '18');
    const surfaceVal = await findVal(sfAttr('surface_finish').id, 'BSL');
    const sizeVal = await findVal(sfAttr('sheet_size').id, '84');

    const attrValues = [
      { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
      { attribute_id: sfAttr('manufacturer').id, attribute_value_id: mfrVal.id },
      { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
      { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
      { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
      { attribute_id: sfAttr('color_code').id, raw_value: '1103' },
      { attribute_id: sfAttr('color_name').id, raw_value: 'Frosty White' },
    ];

    const res = await request(app)
      .post('/api/material/materials/preview-name-and-code')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: attrValues,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.materialName).toContain('18');
    expect(res.body.data.materialName).toContain('BSL');
    expect(res.body.data.materialName).toContain('PLPB');
    expect(res.body.data.materialCode).toMatch(/^BRD-/);
    expect(res.body.data.materialCode).toContain('AT');
    expect(res.body.data.materialCode).toContain('18');
  });

  it('creates the material successfully', async () => {
    const boardTypeVal = await findVal(sfAttr('board_type').id, 'PLPB');
    const mfrVal = await findVal(sfAttr('manufacturer').id, 'AT');
    const thickVal = await findVal(sfAttr('thickness_mm').id, '18');
    const surfaceVal = await findVal(sfAttr('surface_finish').id, 'BSL');
    const sizeVal = await findVal(sfAttr('sheet_size').id, '84');

    const res = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: mfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '1103' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Frosty White' },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        conversion_factor: 32,
        notes: E2E_TAG,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.material.materialCode).toMatch(/^BRD-/);
    expect(res.body.data.material.materialName).toBeTruthy();
    materialId = res.body.data.material.id;
  });

  it('retrieves full material detail', async () => {
    const res = await request(app)
      .get(`/api/material/materials/${materialId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const mat = res.body.data.material;
    expect(mat.materialCode).toMatch(/^BRD-/);
    expect(mat.attributeValues).toBeDefined();
    expect(mat.attributeValues.length).toBeGreaterThanOrEqual(5);
    expect(mat.purchaseUom).toBe('SHT');
    expect(mat.consumptionUom).toBe('SQFT');
  });
});

// ─── SCENARIO C: Duplicate prevention ────────────────────────────────────────

describe('Scenario C — Duplicate prevention via attribute_hash', () => {
  it('detects duplicate when creating same material again', async () => {
    const boardTypeVal = await findVal(sfAttr('board_type').id, 'PLPB');
    const mfrVal = await findVal(sfAttr('manufacturer').id, 'AT');
    const thickVal = await findVal(sfAttr('thickness_mm').id, '18');
    const surfaceVal = await findVal(sfAttr('surface_finish').id, 'BSL');
    const sizeVal = await findVal(sfAttr('sheet_size').id, '84');

    const res = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: mfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '1103' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Frosty White' },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        notes: E2E_TAG,
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.code).toBe('DUPLICATE_FOUND');
    expect(res.body.error.details.existingMaterialId).toBeTruthy();
    expect(res.body.error.details.existingMaterialCode).toMatch(/^BRD-/);
  });

  it('check-duplicate endpoint returns duplicate info', async () => {
    const boardTypeVal = await findVal(sfAttr('board_type').id, 'PLPB');
    const mfrVal = await findVal(sfAttr('manufacturer').id, 'AT');
    const thickVal = await findVal(sfAttr('thickness_mm').id, '18');
    const surfaceVal = await findVal(sfAttr('surface_finish').id, 'BSL');
    const sizeVal = await findVal(sfAttr('sheet_size').id, '84');

    const res = await request(app)
      .post('/api/material/materials/check-duplicate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: mfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '1103' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Frosty White' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.duplicateFound).toBe(true);
    expect(res.body.data.existingMaterial).toBeTruthy();
  });
});

// ─── SCENARIO D: Conditional attributes (Hardware Hinge) ─────────────────────

describe('Scenario D — Conditional attributes (hinge with crank and angle)', () => {
  let hingeMaterialId: string;

  it('visibility rules exist for hardware profile', async () => {
    const res = await request(app)
      .get(`/api/material/visibility-rules?profile_id=${hwProfileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const rules = res.body.data.rules;
    expect(rules.length).toBeGreaterThanOrEqual(2);
    const crankRule = rules.find((r: any) => {
      const targetAttr = hwAttrs.find((a) => a.id === r.attributeId);
      return targetAttr?.attributeCode === 'crank_type';
    });
    expect(crankRule).toBeTruthy();
    expect(crankRule.conditionOperator).toBe('equals');
  });

  it('value dependencies filter sub_type by hardware_type', async () => {
    const res = await request(app)
      .get(`/api/material/value-dependencies?profile_id=${hwProfileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const deps = res.body.data.dependencies;
    const subTypeDep = deps.find((d: any) => {
      const targetAttr = hwAttrs.find((a) => a.id === d.attributeId);
      return targetAttr?.attributeCode === 'sub_type';
    });
    expect(subTypeDep).toBeTruthy();
    const filterMap = subTypeDep.filterMap;
    expect(filterMap.Hinge).toContain('SC');
    expect(filterMap.Hinge).toContain('CO');
    expect(filterMap['Drawer Slide']).toContain('BB');
  });

  it('creates a Hettich Sensys soft-close hinge with crank and angle', async () => {
    const hwTypeVal = await findVal(hwAttr('hardware_type').id, 'HNG');
    const mfrVal = await findVal(hwAttr('manufacturer').id, 'HET');
    const variantVal = await findVal(hwAttr('quality_variant').id, 'SEN', hettichMfrId);
    const subTypeVal = await findVal(hwAttr('sub_type').id, 'SC');
    const angleVal = await findVal(hwAttr('opening_angle').id, '110');
    const crankVal = await findVal(hwAttr('crank_type').id, '0CR');
    const hwMatVal = await findVal(hwAttr('hw_material').id, 'STL');

    const res = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: hardwareCatId,
        material_type_id: rawTypeId,
        attribute_values: [
          { attribute_id: hwAttr('hardware_type').id, attribute_value_id: hwTypeVal.id },
          { attribute_id: hwAttr('manufacturer').id, attribute_value_id: mfrVal.id },
          { attribute_id: hwAttr('quality_variant').id, attribute_value_id: variantVal.id },
          { attribute_id: hwAttr('sub_type').id, attribute_value_id: subTypeVal.id },
          { attribute_id: hwAttr('opening_angle').id, attribute_value_id: angleVal.id },
          { attribute_id: hwAttr('crank_type').id, attribute_value_id: crankVal.id },
          { attribute_id: hwAttr('hw_material').id, attribute_value_id: hwMatVal.id },
        ],
        purchase_uom: 'NOS',
        consumption_uom: 'NOS',
        notes: E2E_TAG,
      });
    expect(res.status).toBe(201);
    const mat = res.body.data.material;
    expect(mat.materialCode).toMatch(/^HDW-/);
    expect(mat.materialCode).toContain('HNG');
    expect(mat.materialCode).toContain('HET');
    expect(mat.materialCode).toContain('SEN');
    expect(mat.materialCode).toContain('SC');
    expect(mat.materialCode).toContain('110');
    expect(mat.materialCode).toContain('0CR');
    hingeMaterialId = mat.id;
  });

  it('hinge material has all expected attribute values', async () => {
    const res = await request(app)
      .get(`/api/material/materials/${hingeMaterialId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const avs = res.body.data.material.attributeValues;
    const codes = avs.map((av: any) => av.attribute.attributeCode);
    expect(codes).toContain('hardware_type');
    expect(codes).toContain('quality_variant');
    expect(codes).toContain('sub_type');
    expect(codes).toContain('opening_angle');
    expect(codes).toContain('crank_type');
  });
});

// ─── SCENARIO E: Cross-manufacturer code reuse ──────────────────────────────

describe('Scenario E — Cross-manufacturer code reuse', () => {
  it('creates two materials with same raw_value color_code but different manufacturers', async () => {
    const boardTypeVal = await findVal(sfAttr('board_type').id, 'MDF');
    const sizeVal = await findVal(sfAttr('sheet_size').id, '86');
    const thickVal = await findVal(sfAttr('thickness_mm').id, '18');
    const surfaceVal = await findVal(sfAttr('surface_finish').id, 'BSL');

    // Material X: Action Tesa + color_code 2001
    const atMfrVal = await findVal(sfAttr('manufacturer').id, 'AT');
    const resX = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: atMfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '2001' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Walnut Brown AT' },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        notes: E2E_TAG,
      });
    expect(resX.status).toBe(201);
    const codeX = resX.body.data.material.materialCode;

    // Material Y: Greenply + color_code 2001
    const gplMfrVal = await findVal(sfAttr('manufacturer').id, 'GPL');
    const resY = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: gplMfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '2001' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Walnut Brown GPL' },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        notes: E2E_TAG,
      });
    expect(resY.status).toBe(201);
    const codeY = resY.body.data.material.materialCode;

    // Different codes because manufacturer differs
    expect(codeX).not.toBe(codeY);
    expect(codeX).toContain('AT');
    expect(codeY).toContain('GPL');
  });
});

// ─── SCENARIO F: Image deferral and pending-image queue ──────────────────────

describe('Scenario F — Image deferral and pending-image queue', () => {
  let deferredMatId: string;

  it('creates material in category with required image → hasPendingImage=true', async () => {
    // BOARDS has image_requirement=required, so material without image gets pending flag
    const boardTypeVal = await findVal(sfAttr('board_type').id, 'HDMR');
    const atMfrVal = await findVal(sfAttr('manufacturer').id, 'CEN');
    const thickVal = await findVal(sfAttr('thickness_mm').id, '25');
    const surfaceVal = await findVal(sfAttr('surface_finish').id, 'RAW');
    const sizeVal = await findVal(sfAttr('sheet_size').id, '84');

    const res = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: atMfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '9999' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Test Deferred' },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        notes: E2E_TAG,
      });
    expect(res.status).toBe(201);
    deferredMatId = res.body.data.material.id;
    expect(res.body.data.material.hasPendingImage).toBe(true);
  });

  it('material appears in pending-image filter', async () => {
    const res = await request(app)
      .get('/api/material/materials?has_pending_image=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.materials.map((m: any) => m.id);
    expect(ids).toContain(deferredMatId);
  });

  it('uploading image auto-clears the pending flag', async () => {
    const uploadRes = await request(app)
      .post(`/api/material/materials/${deferredMatId}/images?image_type=full&is_primary=true`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('files', pngBuffer, 'test-image.png');
    expect(uploadRes.status).toBe(201);

    // Upload itself clears hasPendingImage on first upload
    const detailRes = await request(app)
      .get(`/api/material/materials/${deferredMatId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detailRes.body.data.material.hasPendingImage).toBe(false);
  });
});

// ─── SCENARIO G: CSV Import with errors ──────────────────────────────────────

describe('Scenario G — CSV import with validation errors', () => {
  let batchId: string;

  it('downloads import template for Boards RAW', async () => {
    const res = await request(app)
      .get(`/api/material/materials/import-template?category_id=${boardsCatId}&material_type_id=${rawTypeId}&format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const csv = res.text || res.body;
    expect(csv).toBeTruthy();
  });

  it('imports CSV with valid and invalid rows', async () => {
    // Build CSV: 3 valid, 2 invalid
    const csv = [
      'board_type,manufacturer,thickness_mm,sheet_size',
      'PLPB,GPL,18,84',
      'MDF,CEN,16,86',
      'HDMR,REG,9,84',
      'PLPB,GPL,INVALID_THICKNESS,84',
      'UNKNOWN_TYPE,AT,18,84',
    ].join('\n');

    const tmpFile = path.join(os.tmpdir(), 'e2e-p208-import.csv');
    fs.writeFileSync(tmpFile, csv);

    const res = await request(app)
      .post(`/api/material/materials/import?category_id=${boardsCatId}&material_type_id=${rawTypeId}&on_duplicate=skip`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', tmpFile);

    expect(res.status).toBe(201);
    batchId = res.body.data.batchId;
    expect(res.body.data.totalRows).toBe(5);
    expect(res.body.data.errorCount).toBeGreaterThanOrEqual(2);

    fs.unlinkSync(tmpFile);
  });

  it('retrieves and views errors from the batch', async () => {
    if (!batchId) return;
    const res = await request(app)
      .get(`/api/material/import-batches/${batchId}/errors`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('exports errors as CSV', async () => {
    if (!batchId) return;
    const res = await request(app)
      .get(`/api/material/import-batches/${batchId}/export-errors`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── SCENARIO I: Normalization of typed fields (raw boards) ──────────────────

describe('Scenario I — Field normalization prevents whitespace duplicates', () => {
  it('spaces in raw values are trimmed and normalized in attribute_hash', async () => {
    const boardTypeVal = await findVal(sfAttr('board_type').id, 'PLY');
    const mfrVal = await findVal(sfAttr('manufacturer').id, 'AT');
    const thickVal = await findVal(sfAttr('thickness_mm').id, '9');
    const surfaceVal = await findVal(sfAttr('surface_finish').id, 'OSL');
    const sizeVal = await findVal(sfAttr('sheet_size').id, '86');

    // Create first material with clean color_code
    const res1 = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: mfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '5001' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Test Norm' },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        notes: E2E_TAG,
      });
    expect(res1.status).toBe(201);

    // Try with padded spaces → should be duplicate after normalization
    const res2 = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: sfTypeId,
        attribute_values: [
          { attribute_id: sfAttr('board_type').id, attribute_value_id: boardTypeVal.id },
          { attribute_id: sfAttr('manufacturer').id, attribute_value_id: mfrVal.id },
          { attribute_id: sfAttr('thickness_mm').id, attribute_value_id: thickVal.id },
          { attribute_id: sfAttr('surface_finish').id, attribute_value_id: surfaceVal.id },
          { attribute_id: sfAttr('sheet_size').id, attribute_value_id: sizeVal.id },
          { attribute_id: sfAttr('color_code').id, raw_value: '  5001  ' },
          { attribute_id: sfAttr('color_name').id, raw_value: 'Test Norm' },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        notes: E2E_TAG,
      });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe('CONFLICT');
    expect(res2.body.error.details.code).toBe('DUPLICATE_FOUND');
  });
});

// ─── SCENARIO J: Where-used (empty before BOM) ──────────────────────────────

describe('Scenario J — Where-used returns empty (no BOM yet)', () => {
  it('where-used returns empty array for a material', async () => {
    const mat = await prisma.material.findFirst({ where: { notes: E2E_TAG } });
    expect(mat).toBeTruthy();

    const res = await request(app)
      .get(`/api/material/materials/${mat!.id}/where-used`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.boms).toEqual([]);
  });
});

// ─── VALIDATION CHECKLIST ────────────────────────────────────────────────────

describe('Validation checklist', () => {
  it('all 12 categories seeded', async () => {
    const res = await request(app)
      .get('/api/material/categories')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.categories.length).toBe(12);
  });

  it('all 7 material types seeded', async () => {
    const res = await request(app)
      .get('/api/material/material-types')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.materialTypes.length).toBe(7);
  });

  it('manufacturers seeded', async () => {
    const res = await request(app)
      .get('/api/material/manufacturers')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.manufacturers.length).toBeGreaterThanOrEqual(13);
  });

  it('profiles exist for multiple categories', async () => {
    const res = await request(app)
      .get('/api/material/category-type-profiles')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const profiles = res.body.data.profiles;
    expect(profiles.length).toBeGreaterThanOrEqual(5);
  });

  it('category image rules configured for all 12 categories', async () => {
    const res = await request(app)
      .get('/api/admin/material/category-image-rules')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rules.length).toBe(12);
    const req = res.body.data.rules.find((r: any) => r.category.categoryCode === 'BOARDS');
    expect(req.imageRequirement).toBe('required');
    const opt = res.body.data.rules.find((r: any) => r.category.categoryCode === 'HARDWARE');
    expect(opt.imageRequirement).toBe('optional');
  });

  it('raw boards profile has correct attributes', async () => {
    const res = await request(app)
      .get(`/api/material/attributes?profile_id=${rawProfileId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const attrs = res.body.data.attributes;
    const codes = attrs.map((a: any) => a.attributeCode);
    expect(codes).toContain('board_type');
    expect(codes).toContain('manufacturer');
    expect(codes).toContain('thickness_mm');
    expect(codes).toContain('sheet_size');
  });

  it('hardware profile has visibility rules and value dependencies', async () => {
    const [visRes, depRes] = await Promise.all([
      request(app).get(`/api/material/visibility-rules?profile_id=${hwProfileId}`).set('Authorization', `Bearer ${adminToken}`),
      request(app).get(`/api/material/value-dependencies?profile_id=${hwProfileId}`).set('Authorization', `Bearer ${adminToken}`),
    ]);
    expect(visRes.body.data.rules.length).toBeGreaterThanOrEqual(2);
    expect(depRes.body.data.dependencies.length).toBeGreaterThanOrEqual(1);
  });

  it('material list supports filtering by category, type, status', async () => {
    const res = await request(app)
      .get(`/api/material/materials?category_id=${boardsCatId}&is_active=true&page=1&limit=10`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.materials).toBeDefined();
    expect(res.body.data.total).toBeGreaterThanOrEqual(0);
  });

  it('material update works for non-identity fields', async () => {
    const mat = await prisma.material.findFirst({ where: { notes: E2E_TAG, isActive: true } });
    if (!mat) return;

    const res = await request(app)
      .put(`/api/material/materials/${mat.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: E2E_TAG + ' updated' });
    expect(res.status).toBe(200);

    // Restore
    await request(app)
      .put(`/api/material/materials/${mat.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: E2E_TAG });
  });

  it('material soft-delete works', async () => {
    // Use raw profile (PB exists only there)
    const rawAttrsLocal = await prisma.materialAttribute.findMany({
      where: { categoryTypeProfileId: rawProfileId, isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    const rawAttr = (code: string) => rawAttrsLocal.find((a) => a.attributeCode === code)!;

    const btVal = await findVal(rawAttr('board_type').id, 'PB');
    const mVal = await findVal(rawAttr('manufacturer').id, 'REG');
    const tVal = await findVal(rawAttr('thickness_mm').id, '4');
    const sVal = await findVal(rawAttr('sheet_size').id, '84');

    const createRes = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: rawTypeId,
        attribute_values: [
          { attribute_id: rawAttr('board_type').id, attribute_value_id: btVal.id },
          { attribute_id: rawAttr('manufacturer').id, attribute_value_id: mVal.id },
          { attribute_id: rawAttr('thickness_mm').id, attribute_value_id: tVal.id },
          { attribute_id: rawAttr('sheet_size').id, attribute_value_id: sVal.id },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQFT',
        notes: E2E_TAG,
      });
    expect(createRes.status).toBe(201);
    const delId = createRes.body.data.material.id;

    const delRes = await request(app)
      .delete(`/api/material/materials/${delId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/material/materials/${delId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });
});

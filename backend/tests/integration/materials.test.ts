/**
 * P2-03 integration tests — Material Master CRUD.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminTokens: { accessToken: string };
let employeeTokens: { accessToken: string };

// Seed-derived IDs resolved once
let boardsCatId: string;
let rawTypeId: string;
let sfTypeId: string;
let rawProfileId: string;
let sfProfileId: string;
let rawAttrs: Array<{ id: string; attributeCode: string; label: string; isRequired: boolean }>;
let sfAttrs: Array<{ id: string; attributeCode: string; label: string; isRequired: boolean }>;

beforeAll(async () => {
  // Clean up materials from prior test runs
  await prisma.materialMaterialAttributeValue.deleteMany({});
  await prisma.materialImage.deleteMany({});
  await prisma.material.deleteMany({});

  app = createApp();

  const admin = await createInternalUser({ roleCode: 'admin' });
  adminTokens = await loginInternal(app, admin.email, admin.password);

  const emp = await createInternalUser({ roleCode: 'employee' });
  employeeTokens = await loginInternal(app, emp.email, emp.password);

  // Resolve seed IDs
  const boardsCat = await prisma.materialCategory.findUnique({ where: { categoryCode: 'BOARDS' } });
  boardsCatId = boardsCat!.id;

  const rawType = await prisma.materialType.findUnique({ where: { typeCode: 'RAW' } });
  rawTypeId = rawType!.id;

  const sfType = await prisma.materialType.findUnique({ where: { typeCode: 'SEMI_FINISHED' } });
  sfTypeId = sfType!.id;

  const rawP = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId: boardsCatId, materialTypeId: rawTypeId } },
  });
  rawProfileId = rawP!.id;

  const sfP = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId: boardsCatId, materialTypeId: sfTypeId } },
  });
  sfProfileId = sfP!.id;

  rawAttrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: rawProfileId, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, attributeCode: true, label: true, isRequired: true },
  });

  sfAttrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: sfProfileId, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, attributeCode: true, label: true, isRequired: true },
  });
});

afterAll(async () => {
  // Clean up test-created materials (those not created by seed)
  await prisma.materialMaterialAttributeValue.deleteMany({
    where: { material: { createdById: null } },
  });
  await prisma.materialImage.deleteMany({
    where: { material: { createdById: null } },
  });
  await prisma.material.deleteMany({
    where: { createdById: null },
  });
  await prisma.$disconnect();
});

function findAttr(attrs: typeof rawAttrs, code: string) {
  return attrs.find((a) => a.attributeCode === code)!;
}

async function findVal(attributeId: string, code: string) {
  const v = await prisma.materialAttributeValue.findFirst({
    where: { attributeId, valueShortCode: code },
  });
  return v!;
}

// ─── lookup endpoints ───────────────────────────────────────────────────────────

describe('Material lookup APIs', () => {
  it('GET /api/material/categories returns 12 seeded categories', async () => {
    const res = await request(app)
      .get('/api/material/categories')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.categories.length).toBe(12);
    expect(res.body.data.categories[0]).toHaveProperty('categoryCode');
  });

  it('GET /api/material/material-types returns 7 seeded types', async () => {
    const res = await request(app)
      .get('/api/material/material-types')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.materialTypes.length).toBe(7);
  });

  it('GET /api/material/category-type-profiles returns profiles for Boards', async () => {
    const res = await request(app)
      .get('/api/material/category-type-profiles')
      .query({ category_id: boardsCatId })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.profiles.length).toBe(2); // RAW + SEMI_FINISHED
  });

  it('GET /api/material/attributes returns attributes for raw boards profile', async () => {
    const res = await request(app)
      .get('/api/material/attributes')
      .query({ profile_id: rawProfileId })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.attributes.length).toBeGreaterThanOrEqual(4);
    expect(res.body.data.attributes[0]).toHaveProperty('fieldType');
  });

  it('GET /api/material/attribute-values returns values for board_type', async () => {
    const boardTypeAttr = findAttr(rawAttrs, 'board_type');
    const res = await request(app)
      .get('/api/material/attribute-values')
      .query({ attribute_id: boardTypeAttr.id })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.values.length).toBeGreaterThanOrEqual(5);
    expect(res.body.data.values.some((v: { valueShortCode: string }) => v.valueShortCode === 'PLPB')).toBe(true);
  });

  it('GET /api/material/manufacturers returns 13 seeded manufacturers', async () => {
    const res = await request(app)
      .get('/api/material/manufacturers')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.manufacturers.length).toBe(13);
  });

  it('GET /api/material/visibility-rules returns rules for hardware profile', async () => {
    const hwCat = await prisma.materialCategory.findUnique({ where: { categoryCode: 'HARDWARE' } });
    const hwProfile = await prisma.materialCategoryTypeProfile.findFirst({
      where: { categoryId: hwCat!.id },
    });
    const res = await request(app)
      .get('/api/material/visibility-rules')
      .query({ profile_id: hwProfile!.id })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rules.length).toBe(2); // crank_type + opening_angle
  });

  it('GET /api/material/value-dependencies returns deps for hardware profile', async () => {
    const hwCat = await prisma.materialCategory.findUnique({ where: { categoryCode: 'HARDWARE' } });
    const hwProfile = await prisma.materialCategoryTypeProfile.findFirst({
      where: { categoryId: hwCat!.id },
    });
    const res = await request(app)
      .get('/api/material/value-dependencies')
      .query({ profile_id: hwProfile!.id })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dependencies.length).toBe(1);
  });
});

// ─── material creation ──────────────────────────────────────────────────────────

describe('Material CRUD', () => {
  let createdMaterialId: string;

  async function buildRawBoardBody() {
    const boardType = findAttr(rawAttrs, 'board_type');
    const mfr = findAttr(rawAttrs, 'manufacturer');
    const thickness = findAttr(rawAttrs, 'thickness_mm');
    const sheetSize = findAttr(rawAttrs, 'sheet_size');

    const btVal = await findVal(boardType.id, 'PLPB');
    const mfrVal = await findVal(mfr.id, 'AT');
    const thickVal = await findVal(thickness.id, '18');
    const sizeVal = await findVal(sheetSize.id, '84');

    return {
      category_id: boardsCatId,
      material_type_id: rawTypeId,
      attribute_values: [
        { attribute_id: boardType.id, attribute_value_id: btVal.id },
        { attribute_id: mfr.id, attribute_value_id: mfrVal.id },
        { attribute_id: thickness.id, attribute_value_id: thickVal.id },
        { attribute_id: sheetSize.id, attribute_value_id: sizeVal.id },
      ],
      purchase_uom: 'SHT',
      consumption_uom: 'SQF',
      conversion_factor: 32,
    };
  }

  it('POST /api/material/materials creates a raw board with auto-generated name/code', async () => {
    const body = await buildRawBoardBody();
    const res = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.data.material).toBeDefined();
    expect(res.body.data.material.materialName).toBeTruthy();
    expect(res.body.data.material.materialCode).toMatch(/^BRD-/);
    expect(res.body.data.material.attributeHash).toBeTruthy();
    createdMaterialId = res.body.data.material.id;
  });

  it('POST /api/material/materials with same attributes returns DUPLICATE', async () => {
    const body = await buildRawBoardBody();
    const res = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('POST /api/material/materials missing required attribute returns 400', async () => {
    const boardType = findAttr(rawAttrs, 'board_type');
    const btVal = await findVal(boardType.id, 'PLPB');

    const res = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: rawTypeId,
        attribute_values: [
          { attribute_id: boardType.id, attribute_value_id: btVal.id },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQF',
      });

    expect(res.status).toBe(400);
  });

  it('GET /api/material/materials/:id returns full detail', async () => {
    const res = await request(app)
      .get(`/api/material/materials/${createdMaterialId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.material.id).toBe(createdMaterialId);
    expect(res.body.data.material.attributeValues).toBeDefined();
    expect(res.body.data.material.category.categoryCode).toBe('BOARDS');
  });

  it('PUT /api/material/materials/:id updates non-identity fields', async () => {
    const res = await request(app)
      .put(`/api/material/materials/${createdMaterialId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ notes: 'Updated notes', min_stock_level: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.material.notes).toBe('Updated notes');
  });

  it('GET /api/material/materials lists with pagination', async () => {
    const res = await request(app)
      .get('/api/material/materials')
      .query({ category: 'BOARDS', page: 1, limit: 10 })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.materials.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/material/materials with search finds by code', async () => {
    const material = await prisma.material.findUnique({ where: { id: createdMaterialId } });
    const res = await request(app)
      .get('/api/material/materials')
      .query({ search: material!.materialCode })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });

  it('DELETE /api/material/materials/:id soft-deletes', async () => {
    const res = await request(app)
      .delete(`/api/material/materials/${createdMaterialId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const check = await prisma.material.findUnique({ where: { id: createdMaterialId } });
    expect(check!.isDeleted).toBe(true);
  });

  it('GET /api/material/materials/:id returns 404 for deleted material', async () => {
    const res = await request(app)
      .get(`/api/material/materials/${createdMaterialId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(404);
  });
});

// ─── duplicate check + preview ──────────────────────────────────────────────────

describe('Duplicate check and name preview', () => {
  it('POST check-duplicate returns duplicateFound=false for new material', async () => {
    const boardType = findAttr(rawAttrs, 'board_type');
    const mfr = findAttr(rawAttrs, 'manufacturer');
    const thickness = findAttr(rawAttrs, 'thickness_mm');
    const sheetSize = findAttr(rawAttrs, 'sheet_size');

    const btVal = await findVal(boardType.id, 'MDF');
    const mfrVal = await findVal(mfr.id, 'GPL');
    const thickVal = await findVal(thickness.id, '9');
    const sizeVal = await findVal(sheetSize.id, '86');

    const res = await request(app)
      .post('/api/material/materials/check-duplicate')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: rawTypeId,
        attribute_values: [
          { attribute_id: boardType.id, attribute_value_id: btVal.id },
          { attribute_id: mfr.id, attribute_value_id: mfrVal.id },
          { attribute_id: thickness.id, attribute_value_id: thickVal.id },
          { attribute_id: sheetSize.id, attribute_value_id: sizeVal.id },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.duplicateFound).toBe(false);
  });

  it('POST preview-name-and-code returns auto-generated name and code', async () => {
    const boardType = findAttr(rawAttrs, 'board_type');
    const mfr = findAttr(rawAttrs, 'manufacturer');
    const thickness = findAttr(rawAttrs, 'thickness_mm');
    const sheetSize = findAttr(rawAttrs, 'sheet_size');

    const btVal = await findVal(boardType.id, 'HDMR');
    const mfrVal = await findVal(mfr.id, 'CEN');
    const thickVal = await findVal(thickness.id, '16');
    const sizeVal = await findVal(sheetSize.id, '84');

    const res = await request(app)
      .post('/api/material/materials/preview-name-and-code')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: rawTypeId,
        attribute_values: [
          { attribute_id: boardType.id, attribute_value_id: btVal.id },
          { attribute_id: mfr.id, attribute_value_id: mfrVal.id },
          { attribute_id: thickness.id, attribute_value_id: thickVal.id },
          { attribute_id: sheetSize.id, attribute_value_id: sizeVal.id },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.materialName).toBeTruthy();
    expect(res.body.data.materialCode).toMatch(/^BRD-/);
  });
});

// ─── where-used ─────────────────────────────────────────────────────────────────

describe('Where-used', () => {
  it('GET /api/material/materials/:id/where-used returns empty boms (no PE schema yet)', async () => {
    // Create a fresh material for this test
    const boardType = findAttr(rawAttrs, 'board_type');
    const mfr = findAttr(rawAttrs, 'manufacturer');
    const thickness = findAttr(rawAttrs, 'thickness_mm');
    const sheetSize = findAttr(rawAttrs, 'sheet_size');

    const btVal = await findVal(boardType.id, 'PLY');
    const mfrVal = await findVal(mfr.id, 'GPL');
    const thickVal = await findVal(thickness.id, '6');
    const sizeVal = await findVal(sheetSize.id, '84');

    const createRes = await request(app)
      .post('/api/material/materials')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        category_id: boardsCatId,
        material_type_id: rawTypeId,
        attribute_values: [
          { attribute_id: boardType.id, attribute_value_id: btVal.id },
          { attribute_id: mfr.id, attribute_value_id: mfrVal.id },
          { attribute_id: thickness.id, attribute_value_id: thickVal.id },
          { attribute_id: sheetSize.id, attribute_value_id: sizeVal.id },
        ],
        purchase_uom: 'SHT',
        consumption_uom: 'SQF',
      });

    const res = await request(app)
      .get(`/api/material/materials/${createRes.body.data.material.id}/where-used`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.boms).toEqual([]);
  });
});

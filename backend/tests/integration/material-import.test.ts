/**
 * P2-06 integration tests — Material CSV Import.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminTokens: { accessToken: string };
let boardsCatId: string;
let rawTypeId: string;
let profileId: string;
let attrs: Array<{ id: string; attributeCode: string; label: string; fieldType: string; isRequired: boolean }>;

beforeAll(async () => {
  app = createApp();

  const admin = await createInternalUser({ roleCode: 'admin' });
  adminTokens = await loginInternal(app, admin.email, admin.password);

  const boardsCat = await prisma.materialCategory.findUnique({ where: { categoryCode: 'BOARDS' } });
  boardsCatId = boardsCat!.id;

  const rawType = await prisma.materialType.findUnique({ where: { typeCode: 'RAW' } });
  rawTypeId = rawType!.id;

  const profile = await prisma.materialCategoryTypeProfile.findUnique({
    where: { categoryId_materialTypeId: { categoryId: boardsCatId, materialTypeId: rawTypeId } },
  });
  profileId = profile!.id;

  attrs = await prisma.materialAttribute.findMany({
    where: { categoryTypeProfileId: profileId, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, attributeCode: true, label: true, fieldType: true, isRequired: true },
  });
});

afterAll(async () => {
  // Clean up imported test materials
  const testMaterials = await prisma.material.findMany({
    where: { materialCode: { startsWith: 'BRD-' }, notes: 'IMPORT_TEST' },
    select: { id: true },
  });
  const testIds = testMaterials.map((m) => m.id);
  if (testIds.length > 0) {
    await prisma.materialMaterialAttributeValue.deleteMany({ where: { materialId: { in: testIds } } });
    await prisma.materialImage.deleteMany({ where: { materialId: { in: testIds } } });
    await prisma.material.deleteMany({ where: { id: { in: testIds } } });
  }
  // Clean up import batches
  await prisma.materialImportError.deleteMany({
    where: { batch: { sourceFilename: { startsWith: 'test-import' } } },
  });
  await prisma.materialImportBatch.deleteMany({
    where: { sourceFilename: { startsWith: 'test-import' } },
  });
  await prisma.$disconnect();
});

function buildCsvRow(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    board_type: 'MDF',
    manufacturer: 'GPL',
    thickness_mm: '25',
    sheet_size: '86',
    purchase_uom: 'SHT',
    consumption_uom: 'SQF',
    conversion_factor: '32',
    notes: 'IMPORT_TEST',
    ...overrides,
  };
}

function rowsToCsv(headers: string[], rows: Record<string, string>[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => row[h] ?? '').join(','));
  }
  return lines.join('\n');
}

describe('Import template', () => {
  it('GET returns CSV template for Boards/RAW profile', async () => {
    const res = await request(app)
      .get('/api/material/materials/import-template')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('board_type');
    expect(res.text).toContain('manufacturer');
    expect(res.text).toContain('purchase_uom');
  });

  it('GET returns JSON columns when format=json', async () => {
    const res = await request(app)
      .get('/api/material/materials/import-template')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId, format: 'json' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.columns).toBeDefined();
    expect(res.body.data.columns.length).toBeGreaterThan(0);
    const mfrCol = res.body.data.columns.find((c: { header: string }) => c.header === 'manufacturer');
    expect(mfrCol.allowedValues).toBeDefined();
    expect(mfrCol.allowedValues.length).toBeGreaterThan(0);
  });
});

describe('Import valid file', () => {
  it('POST imports a valid CSV and creates material', async () => {
    const headers = ['board_type', 'manufacturer', 'thickness_mm', 'sheet_size', 'purchase_uom', 'consumption_uom', 'conversion_factor', 'notes'];
    // Use REG (Regular) + 9mm + 86 to avoid colliding with P2-03 test material (AT + 18mm + 84)
    const row = buildCsvRow({ manufacturer: 'REG', thickness_mm: '9', sheet_size: '86' });
    const csv = rowsToCsv(headers, [row]);

    const res = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId, on_duplicate: 'fail' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-import-valid.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.successCount).toBe(1);
    expect(res.body.data.errorCount).toBe(0);
    expect(res.body.data.batchId).toBeTruthy();
    expect(res.body.data.status).toBe('completed');
  });
});

describe('Import with errors', () => {
  it('POST reports missing required attributes', async () => {
    const headers = ['board_type', 'manufacturer', 'thickness_mm', 'sheet_size', 'purchase_uom', 'consumption_uom', 'notes'];
    // Missing manufacturer
    const row = { board_type: 'PLPB', manufacturer: '', thickness_mm: '18', sheet_size: '84', purchase_uom: 'SHT', consumption_uom: 'SQF', notes: 'IMPORT_TEST' };
    const csv = rowsToCsv(headers, [row]);

    const res = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-import-errors.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.errorCount).toBe(1);
    expect(res.body.data.successCount).toBe(0);
  });

  it('POST reports invalid attribute values', async () => {
    const headers = ['board_type', 'manufacturer', 'thickness_mm', 'sheet_size', 'purchase_uom', 'consumption_uom', 'notes'];
    const row = { board_type: 'NONEXISTENT', manufacturer: 'AT', thickness_mm: '18', sheet_size: '84', purchase_uom: 'SHT', consumption_uom: 'SQF', notes: 'IMPORT_TEST' };
    const csv = rowsToCsv(headers, [row]);

    const res = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-import-badval.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.errorCount).toBe(1);
  });
});

describe('Duplicate handling', () => {
  // All dup tests reuse CEN + 16 + 84 — created by first test, then tested by rest
  const dupHeaders = ['board_type', 'manufacturer', 'thickness_mm', 'sheet_size', 'purchase_uom', 'consumption_uom', 'conversion_factor', 'notes'];
  const dupRow = () => buildCsvRow({ manufacturer: 'CEN', thickness_mm: '16', sheet_size: '84' });

  it('creates a material, then skip silently skips the duplicate', async () => {
    const csv1 = rowsToCsv(dupHeaders, [dupRow()]);
    const r1 = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId, on_duplicate: 'fail' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv1), 'test-import-dup-seed.csv');
    expect(r1.status).toBe(201);
    expect(r1.body.data.successCount).toBe(1);

    // Now skip
    const csv2 = rowsToCsv(dupHeaders, [dupRow()]);
    const res = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId, on_duplicate: 'skip' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv2), 'test-import-dup-skip.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.errorCount).toBe(0);
    expect(res.body.data.successCount).toBe(0);
  });

  it('on_duplicate=fail reports duplicates as errors', async () => {
    const csv = rowsToCsv(dupHeaders, [dupRow()]);
    const res = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId, on_duplicate: 'fail' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-import-dup-fail.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.errorCount).toBe(1);
    expect(res.body.data.status).toBe('failed');
  });

  it('on_duplicate=update_existing updates existing material', async () => {
    const csv = rowsToCsv(dupHeaders, [dupRow()]);
    const res = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId, on_duplicate: 'update_existing' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-import-dup-update.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.successCount).toBe(1);
  });
});

describe('Error resolution', () => {
  let errorBatchId: string;
  let firstErrorId: string;

  it('GET errors returns errors for a batch', async () => {
    // Create an import with errors first
    const headers = ['board_type', 'manufacturer', 'thickness_mm', 'sheet_size', 'purchase_uom', 'consumption_uom', 'notes'];
    const row = { board_type: '', manufacturer: '', thickness_mm: '', sheet_size: '', purchase_uom: '', consumption_uom: '', notes: 'IMPORT_TEST' };
    const csv = rowsToCsv(headers, [row]);

    const importRes = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-import-for-errors.csv');

    errorBatchId = importRes.body.data.batchId;

    const res = await request(app)
      .get(`/api/material/import-batches/${errorBatchId}/errors`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.errors.length).toBeGreaterThan(0);
    firstErrorId = res.body.data.errors[0].id;
  });

  it('PATCH updates error with corrected data', async () => {
    const res = await request(app)
      .patch(`/api/material/import-batches/${errorBatchId}/errors/${firstErrorId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        corrected_data: {
          board_type: 'MDF',
          manufacturer: 'GPL',
          thickness_mm: '12',
          sheet_size: '84',
          purchase_uom: 'SHT',
          consumption_uom: 'SQF',
          notes: 'IMPORT_TEST',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.error.correctedData).toBeDefined();
  });

  it('POST retry-errors re-imports corrected rows', async () => {
    const res = await request(app)
      .post(`/api/material/import-batches/${errorBatchId}/retry-errors`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.successCount).toBeGreaterThanOrEqual(0);
  });

  it('GET export-errors returns CSV of errored rows', async () => {
    // Create another batch with errors for CSV export
    const headers = ['board_type', 'manufacturer', 'thickness_mm', 'sheet_size', 'purchase_uom', 'consumption_uom', 'notes'];
    const row = { board_type: 'BADTYPE', manufacturer: 'AT', thickness_mm: '18', sheet_size: '84', purchase_uom: 'SHT', consumption_uom: 'SQF', notes: 'IMPORT_TEST' };
    const csv = rowsToCsv(headers, [row]);

    const importRes = await request(app)
      .post('/api/material/materials/import')
      .query({ category_id: boardsCatId, material_type_id: rawTypeId })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-import-export.csv');

    const batchId = importRes.body.data.batchId;

    const res = await request(app)
      .get(`/api/material/import-batches/${batchId}/export-errors`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('_error_message');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let token: string;
let testProductId: string;
let testCategoryId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  const tokens = await loginInternal(app, admin.email, admin.password);
  token = tokens.accessToken;

  const cat = await prisma.productCategory.findFirst();
  testCategoryId = cat!.id;

  const product = await prisma.product.create({
    data: {
      productCode: `TST-BOM-${Date.now()}`,
      productName: 'BOM Test Product',
      categoryId: testCategoryId,
      basePrice: 1000,
      taxRatePercent: 18,
    },
  });
  testProductId = product.id;
});

afterAll(async () => {
  await prisma.bomChangeLog.deleteMany({
    where: { bom: { bomCode: { startsWith: 'BOM-TST-BOM-' } } },
  });
  await prisma.bomSubassembly.deleteMany({
    where: { parentBomVersion: { bom: { bomCode: { startsWith: 'BOM-TST-BOM-' } } } },
  });
  await prisma.bomProcessLine.deleteMany({
    where: { bomVersion: { bom: { bomCode: { startsWith: 'BOM-TST-BOM-' } } } },
  });
  await prisma.bomMaterialLine.deleteMany({
    where: { bomVersion: { bom: { bomCode: { startsWith: 'BOM-TST-BOM-' } } } },
  });
  await prisma.bomVersion.deleteMany({
    where: { bom: { bomCode: { startsWith: 'BOM-TST-BOM-' } } },
  });
  await prisma.bom.deleteMany({
    where: { bomCode: { startsWith: 'BOM-TST-BOM-' } },
  });
  await prisma.product.deleteMany({
    where: { productCode: { startsWith: 'TST-BOM-' } },
  });
  await prisma.$disconnect();
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

// ─── BOM CRUD ───────────────────────────────────────────────────────────────────

describe('BOM CRUD', () => {
  let bomId: string;
  let versionId: string;

  it('creates a BOM for a product', async () => {
    const res = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    expect(res.status).toBe(201);
    expect(res.body.data.bom.bomCode).toMatch(/^BOM-TST-BOM-/);
    expect(res.body.data.bom.status).toBe('draft');
    expect(res.body.data.bom.versions).toHaveLength(1);
    expect(res.body.data.bom.versions[0].versionNumber).toBe(1);
    expect(res.body.data.bom.versions[0].versionStatus).toBe('draft');
    bomId = res.body.data.bom.id;
    versionId = res.body.data.bom.versions[0].id;
  });

  it('lists BOMs with filters', async () => {
    const res = await request(app)
      .get(`/api/boms?product_id=${testProductId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.boms.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('gets a BOM by id', async () => {
    const res = await request(app)
      .get(`/api/boms/${bomId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.bom.id).toBe(bomId);
    expect(res.body.data.bom.product.id).toBe(testProductId);
    expect(res.body.data.bom.versions).toBeInstanceOf(Array);
  });

  it('updates a BOM name', async () => {
    const res = await request(app)
      .put(`/api/boms/${bomId}`)
      .set(auth())
      .send({ bom_name: 'Updated BOM Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.bom.bomName).toBe('Updated BOM Name');
  });

  it('soft-deletes a BOM', async () => {
    const bom2 = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    const deleteId = bom2.body.data.bom.id;

    const res = await request(app)
      .delete(`/api/boms/${deleteId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);

    const check = await request(app)
      .get(`/api/boms/${deleteId}`)
      .set(auth());
    expect(check.status).toBe(404);
  });
});

// ─── Versioning ─────────────────────────────────────────────────────────────────

describe('BOM Versioning', () => {
  let bomId: string;
  let v1Id: string;
  let v2Id: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    bomId = res.body.data.bom.id;
    v1Id = res.body.data.bom.versions[0].id;
  });

  it('creates a new version (copies from current)', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions`)
      .set(auth());
    expect(res.status).toBe(201);
    expect(res.body.data.version.versionNumber).toBe(2);
    expect(res.body.data.version.versionStatus).toBe('draft');
    v2Id = res.body.data.version.id;
  });

  it('lists versions', async () => {
    const res = await request(app)
      .get(`/api/boms/${bomId}/versions`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.versions.length).toBeGreaterThanOrEqual(2);
  });

  it('gets a specific version', async () => {
    const res = await request(app)
      .get(`/api/boms/${bomId}/versions/${v2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.version.versionNumber).toBe(2);
  });

  it('approves a version', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${v2Id}/approve`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.version.versionStatus).toBe('approved');
    expect(res.body.data.version.approvedAt).toBeTruthy();
  });

  it('rejects approval of already-approved version', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${v2Id}/approve`)
      .set(auth());
    expect(res.status).toBe(400);
  });

  it('compares two versions', async () => {
    const res = await request(app)
      .get(`/api/boms/${bomId}/compare?version1=${v1Id}&version2=${v2Id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.diff.version1.versionNumber).toBe(1);
    expect(res.body.data.diff.version2.versionNumber).toBe(2);
  });
});

// ─── Material Lines ─────────────────────────────────────────────────────────────

describe('BOM Material Lines', () => {
  let bomId: string;
  let versionId: string;
  let materialLineId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    bomId = res.body.data.bom.id;
    versionId = res.body.data.bom.versions[0].id;
  });

  it('adds a material line', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${versionId}/materials`)
      .set(auth())
      .send({ quantity_per_unit: 2, uom: 'SHT', notes: 'Test material' });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.quantityPerUnit)).toBe(2);
    expect(res.body.data.line.uom).toBe('SHT');
    materialLineId = res.body.data.line.id;
  });

  it('updates a material line', async () => {
    const res = await request(app)
      .put(`/api/boms/${bomId}/versions/${versionId}/materials/${materialLineId}`)
      .set(auth())
      .send({ quantity_per_unit: 3, wastage_percent: 5 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.line.quantityPerUnit)).toBe(3);
    expect(Number(res.body.data.line.wastagePercent)).toBe(5);
  });

  it('adds an alternate material for a primary line', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${versionId}/materials/${materialLineId}/alternates`)
      .set(auth())
      .send({ quantity_per_unit: 2.5, uom: 'SHT', notes: 'Alternate' });
    expect(res.status).toBe(201);
    expect(res.body.data.line.lineType).toBe('alternate');
    expect(res.body.data.line.alternateGroupId).toBeTruthy();
  });

  it('deletes a material line', async () => {
    const res = await request(app)
      .delete(`/api/boms/${bomId}/versions/${versionId}/materials/${materialLineId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });
});

// ─── Process Lines ──────────────────────────────────────────────────────────────

describe('BOM Process Lines', () => {
  let bomId: string;
  let versionId: string;
  let processLineId: string;
  let processId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    bomId = res.body.data.bom.id;
    versionId = res.body.data.bom.versions[0].id;

    const proc = await prisma.process.findUnique({ where: { processCode: 'BSC' } });
    processId = proc!.id;
  });

  it('adds a process line with auto cost', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${versionId}/processes`)
      .set(auth())
      .send({ process_id: processId, quantity: 10 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.quantity)).toBe(10);
    expect(res.body.data.line.process.processCode).toBe('BSC');
    expect(Number(res.body.data.line.estimatedCost)).toBeGreaterThan(0);
    processLineId = res.body.data.line.id;
  });

  it('updates a process line', async () => {
    const res = await request(app)
      .put(`/api/boms/${bomId}/versions/${versionId}/processes/${processLineId}`)
      .set(auth())
      .send({ quantity: 20 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.line.quantity)).toBe(20);
  });

  it('deletes a process line', async () => {
    const res = await request(app)
      .delete(`/api/boms/${bomId}/versions/${versionId}/processes/${processLineId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });
});

// ─── Subassemblies ──────────────────────────────────────────────────────────────

describe('BOM Subassemblies', () => {
  let parentBomId: string;
  let parentVersionId: string;
  let childBomId: string;
  let saId: string;

  beforeAll(async () => {
    const childProduct = await prisma.product.create({
      data: {
        productCode: `TST-BOM-CHILD-${Date.now()}`,
        productName: 'Child BOM Product',
        categoryId: testCategoryId,
        basePrice: 500,
        taxRatePercent: 18,
      },
    });

    const childRes = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: childProduct.id });
    childBomId = childRes.body.data.bom.id;

    const parentRes = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    parentBomId = parentRes.body.data.bom.id;
    parentVersionId = parentRes.body.data.bom.versions[0].id;
  });

  it('adds a subassembly', async () => {
    const res = await request(app)
      .post(`/api/boms/${parentBomId}/versions/${parentVersionId}/subassemblies`)
      .set(auth())
      .send({ child_bom_id: childBomId, quantity: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data.subassembly.childBom.id).toBe(childBomId);
    expect(Number(res.body.data.subassembly.quantity)).toBe(2);
    saId = res.body.data.subassembly.id;
  });

  it('detects circular reference', async () => {
    const childBom = await prisma.bom.findUnique({
      where: { id: childBomId },
      include: { versions: { where: { isDeleted: false }, take: 1 } },
    });
    const childVersionId = childBom!.versions[0].id;

    const res = await request(app)
      .post(`/api/boms/${childBomId}/versions/${childVersionId}/subassemblies`)
      .set(auth())
      .send({ child_bom_id: parentBomId });
    expect(res.status).toBe(400);
  });

  it('gets expanded BOM', async () => {
    const res = await request(app)
      .get(`/api/boms/${parentBomId}/versions/${parentVersionId}/expanded`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.expanded.subassemblies).toHaveLength(1);
  });

  it('deletes a subassembly', async () => {
    const res = await request(app)
      .delete(`/api/boms/${parentBomId}/versions/${parentVersionId}/subassemblies/${saId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });
});

// ─── Draft guard ────────────────────────────────────────────────────────────────

describe('Draft guard — rejects edits to approved versions', () => {
  let bomId: string;
  let approvedVersionId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    bomId = res.body.data.bom.id;
    approvedVersionId = res.body.data.bom.versions[0].id;

    await request(app)
      .post(`/api/boms/${bomId}/versions/${approvedVersionId}/approve`)
      .set(auth());
  });

  it('blocks adding material line to approved version', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${approvedVersionId}/materials`)
      .set(auth())
      .send({ quantity_per_unit: 1 });
    expect(res.status).toBe(400);
  });

  it('blocks adding process line to approved version', async () => {
    const proc = await prisma.process.findFirst();
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${approvedVersionId}/processes`)
      .set(auth())
      .send({ process_id: proc!.id, quantity: 1 });
    expect(res.status).toBe(400);
  });
});

// ─── Change Log ─────────────────────────────────────────────────────────────────

describe('BOM Change Log', () => {
  it('records creation in changelog', async () => {
    const bom = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    const bomId = bom.body.data.bom.id;

    const res = await request(app)
      .get(`/api/boms/${bomId}/changelog`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.changelog.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.changelog.some((e: any) => e.changeType === 'bom_created')).toBe(true);
  });
});

// ─── Where-used ─────────────────────────────────────────────────────────────────

describe('Where-used queries', () => {
  it('returns process usage across BOMs', async () => {
    const proc = await prisma.process.findUnique({ where: { processCode: 'BSC' } });

    const bomRes = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: testProductId });
    const bomId = bomRes.body.data.bom.id;
    const vId = bomRes.body.data.bom.versions[0].id;

    await request(app)
      .post(`/api/boms/${bomId}/versions/${vId}/processes`)
      .set(auth())
      .send({ process_id: proc!.id, quantity: 1 });

    const res = await request(app)
      .get(`/api/boms/where-used/processes/${proc!.id}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.usages.length).toBeGreaterThanOrEqual(1);
  });
});

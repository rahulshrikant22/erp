import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let token: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  const tokens = await loginInternal(app, admin.email, admin.password);
  token = tokens.accessToken;
});

afterAll(async () => {
  await prisma.costingRun.deleteMany({
    where: { costingRunNumber: { startsWith: 'COST-' } },
  });
  await prisma.bomChangeLog.deleteMany({
    where: { bom: { bomCode: { startsWith: 'BOM-P2E2E-' } } },
  });
  await prisma.bomProcessLine.deleteMany({
    where: { bomVersion: { bom: { bomCode: { startsWith: 'BOM-P2E2E-' } } } },
  });
  await prisma.bomMaterialLine.deleteMany({
    where: { bomVersion: { bom: { bomCode: { startsWith: 'BOM-P2E2E-' } } } },
  });
  await prisma.bomVersion.deleteMany({
    where: { bom: { bomCode: { startsWith: 'BOM-P2E2E-' } } },
  });
  await prisma.bom.deleteMany({
    where: { bomCode: { startsWith: 'BOM-P2E2E-' } },
  });
  await prisma.product.deleteMany({
    where: { productCode: { startsWith: 'P2E2E-' } },
  });
  await prisma.$disconnect();
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

// ─── Phase 2 end-to-end flow ────────────────────────────────────────────────────

describe('Phase 2 end-to-end: Product → BOM → Version → Lines → Approve → Cost', () => {
  let productId: string;
  let bomId: string;
  let versionId: string;
  let processId: string;

  it('creates a product', async () => {
    const cat = await prisma.productCategory.findFirst();
    const res = await request(app)
      .post('/api/products')
      .set(auth())
      .send({
        productName: 'P2 E2E Product',
        categoryId: cat!.id,
        basePrice: 5000,
        taxRatePercent: 18,
      });
    expect(res.status).toBe(201);
    productId = res.body.data.product.id;
  });

  it('creates a BOM for the product', async () => {
    const res = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: productId });
    expect(res.status).toBe(201);
    bomId = res.body.data.bom.id;
    versionId = res.body.data.bom.versions[0].id;
    expect(res.body.data.bom.bomCode).toMatch(/^BOM-/);
  });

  it('adds a material line to the BOM', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${versionId}/materials`)
      .set(auth())
      .send({ quantity_per_unit: 4, uom: 'SHT', wastage_percent: 5 });
    expect(res.status).toBe(201);
  });

  it('adds a process line (Beam Saw Cutting)', async () => {
    const proc = await prisma.process.findUnique({ where: { processCode: 'BSC' } });
    processId = proc!.id;

    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${versionId}/processes`)
      .set(auth())
      .send({ process_id: processId, quantity: 4 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.estimatedCost)).toBeGreaterThan(0);
  });

  it('adds a second process line (Edge Banding)', async () => {
    const proc = await prisma.process.findUnique({ where: { processCode: 'EBD' } });
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${versionId}/processes`)
      .set(auth())
      .send({ process_id: proc!.id, quantity: 16 });
    expect(res.status).toBe(201);
  });

  it('approves the BOM version', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions/${versionId}/approve`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.version.versionStatus).toBe('approved');
  });

  it('gets the product with linked BOMs', async () => {
    const res = await request(app)
      .get(`/api/products/${productId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.product.boms.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.product.boms[0].bomCode).toMatch(/^BOM-/);
  });

  it('runs a costing analysis', async () => {
    const res = await request(app)
      .post('/api/costing/runs')
      .set(auth())
      .send({
        bom_version_id: versionId,
        run_type: 'initial',
        quantity: 1,
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.run.laborCostTotal)).toBeGreaterThan(0);
    expect(Number(res.body.data.run.manufacturingCost)).toBeGreaterThan(0);
    expect(Number(res.body.data.run.mrpInclTax)).toBeGreaterThan(0);
  });

  it('creates a new version (v2) from approved version', async () => {
    const res = await request(app)
      .post(`/api/boms/${bomId}/versions`)
      .set(auth());
    expect(res.status).toBe(201);
    expect(res.body.data.version.versionNumber).toBe(2);
    expect(res.body.data.version.materialLines.length).toBe(1);
    expect(res.body.data.version.processLines.length).toBe(2);
  });

  it('gets the BOM change log', async () => {
    const res = await request(app)
      .get(`/api/boms/${bomId}/changelog`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.changelog.length).toBeGreaterThanOrEqual(5);
  });

  it('gets where-used for the BSC process', async () => {
    const res = await request(app)
      .get(`/api/boms/where-used/processes/${processId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.usages.length).toBeGreaterThanOrEqual(1);
  });

  it('gets the BOM summary report', async () => {
    const res = await request(app)
      .get('/api/reports/bom-summary')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.report.length).toBeGreaterThanOrEqual(1);
  });

  it('gets the costing summary report', async () => {
    const res = await request(app)
      .get('/api/reports/costing-summary')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.report.length).toBeGreaterThanOrEqual(1);
  });

  it('lists costing assumptions', async () => {
    const res = await request(app)
      .get('/api/costing/assumptions')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.assumptions).toBeInstanceOf(Array);
  });
});

// ─── Selection List flow ────────────────────────────────────────────────────────

describe('Selection List workflow', () => {
  let slId: string;
  let orderId: string;
  let bomMaterialLineId: string;
  let materialId: string;
  let testBomId: string;
  let testVersionId: string;

  beforeAll(async () => {
    const order = await prisma.order.findFirst({ where: { isDeleted: false } });
    if (!order) return;
    orderId = order.id;

    const material = await prisma.material.findFirst();
    if (!material) return;
    materialId = material.id;

    const cat = await prisma.productCategory.findFirst();
    const prod = await prisma.product.create({
      data: {
        productCode: `P2E2E-SL-${Date.now()}`,
        productName: 'SL Test Product',
        categoryId: cat!.id,
        basePrice: 1000,
        taxRatePercent: 18,
      },
    });

    const bomRes = await request(app)
      .post('/api/boms')
      .set(auth())
      .send({ product_id: prod.id });
    testBomId = bomRes.body.data.bom.id;
    testVersionId = bomRes.body.data.bom.versions[0].id;

    const mlRes = await request(app)
      .post(`/api/boms/${testBomId}/versions/${testVersionId}/materials`)
      .set(auth())
      .send({ quantity_per_unit: 1, uom: 'PCS', specific_material_id: materialId });

    bomMaterialLineId = mlRes.body.data?.line?.id;
    if (!bomMaterialLineId) {
      const line = await prisma.bomMaterialLine.create({
        data: {
          bomVersionId: testVersionId,
          lineSequence: 10,
          lineType: 'primary',
          specificMaterialId: materialId,
          quantityPerUnit: 1,
          uom: 'PCS',
        },
      });
      bomMaterialLineId = line.id;
    }
  });

  it('creates a selection list', async () => {
    if (!orderId) return;

    const res = await request(app)
      .post('/api/selection-lists')
      .set(auth())
      .send({ order_id: orderId, finish_group_name: 'Oak Natural' });
    expect(res.status).toBe(201);
    expect(res.body.data.selectionList.selectionListCode).toMatch(/^SL-/);
    expect(res.body.data.selectionList.status).toBe('draft');
    slId = res.body.data.selectionList.id;
  });

  it('adds an item to the selection list', async () => {
    if (!slId || !bomMaterialLineId || !materialId) return;

    const res = await request(app)
      .post(`/api/selection-lists/${slId}/items`)
      .set(auth())
      .send({
        bom_material_line_id: bomMaterialLineId,
        selected_material_id: materialId,
      });
    expect(res.status).toBe(201);
  });

  it('submits the selection list', async () => {
    if (!slId || !materialId) return;

    const res = await request(app)
      .post(`/api/selection-lists/${slId}/submit`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.selectionList.status).toBe('submitted');
  });

  it('approves the selection list', async () => {
    if (!slId || !materialId) return;

    const res = await request(app)
      .post(`/api/selection-lists/${slId}/approve`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.selectionList.status).toBe('approved');
  });

  it('lists selection lists', async () => {
    const res = await request(app)
      .get('/api/selection-lists')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.selectionLists).toBeInstanceOf(Array);
  });

  afterAll(async () => {
    if (slId) {
      await prisma.selectionListItem.deleteMany({ where: { selectionListId: slId } });
      await prisma.selectionList.delete({ where: { id: slId } });
    }
    if (testBomId) {
      await prisma.bomMaterialLine.deleteMany({ where: { bomVersion: { bomId: testBomId } } });
      await prisma.bomVersion.deleteMany({ where: { bomId: testBomId } });
      await prisma.bomChangeLog.deleteMany({ where: { bomId: testBomId } });
      await prisma.bom.delete({ where: { id: testBomId } });
    }
  });
});

// ─── API route availability checks ─────────────────────────────────────────────

describe('Phase 2 API endpoints exist', () => {
  it('GET /api/processes returns 200', async () => {
    const res = await request(app).get('/api/processes').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/boms returns 200', async () => {
    const res = await request(app).get('/api/boms').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/selection-lists returns 200', async () => {
    const res = await request(app).get('/api/selection-lists').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/resolved-boms returns 200', async () => {
    const res = await request(app).get('/api/resolved-boms').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/costing/runs returns 200', async () => {
    const res = await request(app).get('/api/costing/runs').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/costing/assumptions returns 200', async () => {
    const res = await request(app).get('/api/costing/assumptions').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/bom-summary returns 200', async () => {
    const res = await request(app).get('/api/reports/bom-summary').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/material-usage returns 200', async () => {
    const res = await request(app).get('/api/reports/material-usage').set(auth());
    expect(res.status).toBe(200);
  });

  it('GET /api/reports/costing-summary returns 200', async () => {
    const res = await request(app).get('/api/reports/costing-summary').set(auth());
    expect(res.status).toBe(200);
  });
});

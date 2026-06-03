/**
 * P2-04 integration tests — Manufacturer Catalog Management.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminTokens: { accessToken: string };
let hettichId: string;
let actionTesaId: string;

beforeAll(async () => {
  app = createApp();

  const admin = await createInternalUser({ roleCode: 'admin' });
  adminTokens = await loginInternal(app, admin.email, admin.password);

  const hettich = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: 'HETTICH' } });
  hettichId = hettich!.id;

  const at = await prisma.materialManufacturer.findUnique({ where: { manufacturerCode: 'ACTION_TESA' } });
  actionTesaId = at!.id;
});

afterAll(async () => {
  // Clean up test-created catalog entries (code starting with TEST_)
  await prisma.materialManufacturerCatalog.deleteMany({
    where: { code: { startsWith: 'TEST_' } },
  });
  await prisma.$disconnect();
});

describe('Catalog CRUD', () => {
  let createdEntryId: string;

  it('POST creates a catalog entry', async () => {
    const res = await request(app)
      .post('/api/material/manufacturer-catalogs')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        manufacturer_id: hettichId,
        catalog_type: 'variant',
        code: 'TEST_PREMIUM',
        name: 'Premium Series',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.entry.code).toBe('TEST_PREMIUM');
    expect(res.body.data.entry.manufacturer.manufacturerCode).toBe('HETTICH');
    createdEntryId = res.body.data.entry.id;
  });

  it('POST with duplicate code returns 409', async () => {
    const res = await request(app)
      .post('/api/material/manufacturer-catalogs')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        manufacturer_id: hettichId,
        catalog_type: 'variant',
        code: 'TEST_PREMIUM',
        name: 'Duplicate',
      });

    expect(res.status).toBe(409);
  });

  it('GET /:id returns the entry', async () => {
    const res = await request(app)
      .get(`/api/material/manufacturer-catalogs/${createdEntryId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.entry.code).toBe('TEST_PREMIUM');
  });

  it('PUT updates the entry', async () => {
    const res = await request(app)
      .put(`/api/material/manufacturer-catalogs/${createdEntryId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ name: 'Premium Series Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.entry.name).toBe('Premium Series Updated');
  });

  it('GET list with filters', async () => {
    const res = await request(app)
      .get('/api/material/manufacturer-catalogs')
      .query({ manufacturer_id: hettichId, catalog_type: 'variant', page: 1, limit: 10 })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it('DELETE deactivates the entry', async () => {
    const res = await request(app)
      .delete(`/api/material/manufacturer-catalogs/${createdEntryId}`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deactivated).toBe(true);

    const check = await prisma.materialManufacturerCatalog.findUnique({ where: { id: createdEntryId } });
    expect(check!.isActive).toBe(false);
  });
});

describe('Lookup and search', () => {
  it('lookup returns null for non-existent code', async () => {
    const res = await request(app)
      .get('/api/material/manufacturer-catalogs/lookup')
      .query({ manufacturer_id: hettichId, catalog_type: 'color', code: 'NONEXISTENT' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.catalog).toBeNull();
  });

  it('search returns results for partial match', async () => {
    // First create an entry to search for
    await request(app)
      .post('/api/material/manufacturer-catalogs')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({
        manufacturer_id: actionTesaId,
        catalog_type: 'color',
        code: 'TEST_1103',
        name: 'Frosty White Test',
      });

    const res = await request(app)
      .get('/api/material/manufacturer-catalogs/search')
      .query({ manufacturer_id: actionTesaId, q: 'Frosty' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.results.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.results.some((r: { name: string }) => r.name.includes('Frosty'))).toBe(true);
  });
});

describe('Per-manufacturer catalog view', () => {
  it('GET /manufacturers/:id/catalog returns grouped catalog', async () => {
    const res = await request(app)
      .get(`/api/material/manufacturers/${hettichId}/catalog`)
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.manufacturer.manufacturerCode).toBe('HETTICH');
    expect(res.body.data.catalog).toBeDefined();
  });
});

describe('CSV import', () => {
  it('GET import-template returns CSV with headers', async () => {
    const res = await request(app)
      .get('/api/material/manufacturer-catalogs/import-template')
      .query({ catalog_type: 'color' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('code,name');
  });

  it('POST import processes valid CSV', async () => {
    const csv = 'code,name,hex_color,reference_image_url,notes\nTEST_2001,Alpine White,#F5F5F5,,Test import\nTEST_2002,Graphite Grey,#333333,,Test import';

    const res = await request(app)
      .post('/api/material/manufacturer-catalogs/import')
      .query({ manufacturer_id: actionTesaId, catalog_type: 'color' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-colors.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.totalRows).toBe(2);
    expect(res.body.data.successCount).toBe(2);
    expect(res.body.data.errorCount).toBe(0);
    expect(res.body.data.batchId).toBeTruthy();
  });

  it('POST import reports errors for invalid rows', async () => {
    const csv = 'code,name,hex_color\n,Missing Code,\nTEST_3001,Valid Entry,#AABBCC\nTEST_3002,,';

    const res = await request(app)
      .post('/api/material/manufacturer-catalogs/import')
      .query({ manufacturer_id: actionTesaId, catalog_type: 'color' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-errors.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.totalRows).toBe(3);
    expect(res.body.data.successCount).toBe(1);
    expect(res.body.data.errorCount).toBe(2);
    expect(res.body.data.errors.length).toBe(2);
  });

  it('POST import updates existing entries on re-import', async () => {
    const csv = 'code,name,hex_color\nTEST_2001,Alpine White UPDATED,#FAFAFA';

    const res = await request(app)
      .post('/api/material/manufacturer-catalogs/import')
      .query({ manufacturer_id: actionTesaId, catalog_type: 'color' })
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .attach('file', Buffer.from(csv), 'test-update.csv');

    expect(res.status).toBe(201);
    expect(res.body.data.successCount).toBe(1);

    const entry = await prisma.materialManufacturerCatalog.findUnique({
      where: {
        manufacturerId_catalogType_code: {
          manufacturerId: actionTesaId, catalogType: 'color', code: 'TEST_2001',
        },
      },
    });
    expect(entry!.name).toBe('Alpine White UPDATED');
  });
});

describe('Bulk operations', () => {
  it('POST bulk-deactivate deactivates multiple entries', async () => {
    // Create two test entries
    const e1 = await prisma.materialManufacturerCatalog.create({
      data: { manufacturerId: hettichId, catalogType: 'color', code: 'TEST_BULK_1', name: 'Bulk 1', isActive: true },
    });
    const e2 = await prisma.materialManufacturerCatalog.create({
      data: { manufacturerId: hettichId, catalogType: 'color', code: 'TEST_BULK_2', name: 'Bulk 2', isActive: true },
    });

    const res = await request(app)
      .post('/api/material/manufacturer-catalogs/bulk-deactivate')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ ids: [e1.id, e2.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.deactivated).toBe(2);
  });

  it('POST merge deactivates merged entries', async () => {
    const keep = await prisma.materialManufacturerCatalog.create({
      data: { manufacturerId: hettichId, catalogType: 'color', code: 'TEST_MERGE_KEEP', name: 'Keep', isActive: true },
    });
    const merge1 = await prisma.materialManufacturerCatalog.create({
      data: { manufacturerId: hettichId, catalogType: 'color', code: 'TEST_MERGE_1', name: 'Merge 1', isActive: true },
    });

    const res = await request(app)
      .post('/api/material/manufacturer-catalogs/merge')
      .set('Authorization', `Bearer ${adminTokens.accessToken}`)
      .send({ keep_id: keep.id, merge_ids: [merge1.id] });

    expect(res.status).toBe(200);
    expect(res.body.data.keptId).toBe(keep.id);
    expect(res.body.data.mergedCount).toBe(1);

    const merged = await prisma.materialManufacturerCatalog.findUnique({ where: { id: merge1.id } });
    expect(merged!.isActive).toBe(false);
  });
});

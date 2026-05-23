/**
 * P0-12 integration tests — generic document management.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let token: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  token = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });

// Minimal valid PDF — `%PDF-1.4` magic + EOF. Tiny but mime-correct.
const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<<>>\n%%EOF\n',
);
// 1×1 PNG.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
  'base64',
);

describe('Document upload + retrieve', () => {
  it('uploads a PDF, can fetch it back, and exposes a /uploads/... URL', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set(auth())
      .field('documentType', 'general')
      .field('relatedEntityType', 'TestEntity')
      .field('relatedEntityId', randomUUID())
      .attach('file', TINY_PDF, { filename: 'tiny.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body.data.mimeType).toBe('application/pdf');
    expect(res.body.data.url.startsWith('/uploads/')).toBe(true);
    expect(res.body.data.version).toBe(1);

    const get = await request(app).get(`/api/documents/${res.body.data.id}`).set(auth());
    expect(get.status).toBe(200);
    expect(get.body.data.id).toBe(res.body.data.id);

    // File actually written:
    const stat = await fs.stat(res.body.data.filePath);
    expect(stat.size).toBe(TINY_PDF.byteLength);
  });

  it('rejects disallowed mime types', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set(auth())
      .field('documentType', 'general')
      .attach('file', Buffer.from('MZ\x00\x00'), {
        filename: 'evil.exe',
        contentType: 'application/x-msdownload',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not allowed/i);
  });

  it('rejects when no file is supplied', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set(auth())
      .field('documentType', 'general');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/no file uploaded/i);
  });

  it('lists by relatedEntity and excludes soft-deleted by default', async () => {
    const entityId = randomUUID();
    await request(app)
      .post('/api/documents')
      .set(auth())
      .field('documentType', 'general')
      .field('relatedEntityType', 'ListTest')
      .field('relatedEntityId', entityId)
      .attach('file', TINY_PDF, { filename: 'a.pdf', contentType: 'application/pdf' });
    const upload2 = await request(app)
      .post('/api/documents')
      .set(auth())
      .field('documentType', 'general')
      .field('relatedEntityType', 'ListTest')
      .field('relatedEntityId', entityId)
      .attach('file', TINY_PNG, { filename: 'b.png', contentType: 'image/png' });

    const list = await request(app)
      .get(`/api/documents?relatedEntityType=ListTest&relatedEntityId=${entityId}`)
      .set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(2);

    // Soft-delete the second one.
    await request(app).delete(`/api/documents/${upload2.body.data.id}`).set(auth());

    const after = await request(app)
      .get(`/api/documents?relatedEntityType=ListTest&relatedEntityId=${entityId}`)
      .set(auth());
    expect(after.body.data.total).toBe(1);

    const withDeleted = await request(app)
      .get(`/api/documents?relatedEntityType=ListTest&relatedEntityId=${entityId}&includeDeleted=true`)
      .set(auth());
    expect(withDeleted.body.data.total).toBe(2);

    // Soft-deleted doc isn't returned by GET /:id either.
    const deletedGet = await request(app).get(`/api/documents/${upload2.body.data.id}`).set(auth());
    expect(deletedGet.status).toBe(404);

    // …but the file still exists on disk (audit retention).
    await expect(fs.stat(upload2.body.data.filePath)).resolves.toBeTruthy();
  });
});

describe('Versioning chain', () => {
  it('uploads v1, then a new version, then walks the chain', async () => {
    const v1 = (await request(app)
      .post('/api/documents')
      .set(auth())
      .field('documentType', 'spec')
      .attach('file', TINY_PDF, { filename: 'spec.pdf', contentType: 'application/pdf' })).body.data;
    expect(v1.version).toBe(1);
    expect(v1.parentDocumentId).toBeNull();

    const v2 = (await request(app)
      .post(`/api/documents/${v1.id}/version`)
      .set(auth())
      .attach('file', TINY_PDF, { filename: 'spec-v2.pdf', contentType: 'application/pdf' })).body.data;
    expect(v2.version).toBe(2);
    expect(v2.parentDocumentId).toBe(v1.id);

    // A 2nd new version off v1 should chain on the most recent (v2),
    // bumping to v3 and pointing parent at v2.
    const v3 = (await request(app)
      .post(`/api/documents/${v1.id}/version`)
      .set(auth())
      .attach('file', TINY_PDF, { filename: 'spec-v3.pdf', contentType: 'application/pdf' })).body.data;
    expect(v3.version).toBe(3);
    expect(v3.parentDocumentId).toBe(v2.id);

    const chain = await request(app).get(`/api/documents/${v2.id}/chain`).set(auth());
    expect(chain.status).toBe(200);
    const versions = chain.body.data.chain.map((d: { version: number }) => d.version);
    expect(versions).toEqual([1, 2, 3]);
  });
});

describe('Permission gating', () => {
  it('FORBIDDEN for users without DOC_MGMT:doc_mgmt:create on upload', async () => {
    const customer = await createInternalUser({ roleCode: 'customer' });
    const t = (await loginInternal(app, customer.email, customer.password)).accessToken;
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${t}`)
      .field('documentType', 'general')
      .attach('file', TINY_PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(403);
  });
});

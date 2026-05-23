/**
 * P0-11 integration tests — organization, branches, departments, designations,
 * locations. Bundled into one file to keep DB seed state cheap to set up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let token: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  const t = await loginInternal(app, admin.email, admin.password);
  token = t.accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (): { Authorization: string } => ({ Authorization: `Bearer ${token}` });
const uniq = (prefix: string): string =>
  `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;

// 1×1 PNG, base64-decoded — small, valid, no decoder libs needed.
const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=',
  'base64',
);

describe('Organization (singleton)', () => {
  it('GET /api/organization returns the seeded org', async () => {
    const res = await request(app).get('/api/organization').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBeTruthy();
    expect(typeof res.body.data.name).toBe('string');
    expect(res.body.data.financialYearStartMonth).toBeGreaterThanOrEqual(1);
  });

  it('PUT /api/organization updates fields and rejects bad month', async () => {
    const before = await request(app).get('/api/organization').set(auth());
    const newName = `Org ${randomUUID().slice(0, 6)}`;
    const ok = await request(app)
      .put('/api/organization')
      .set(auth())
      .send({ name: newName, gstin: '27AABCU9603R1ZX' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.name).toBe(newName);
    expect(ok.body.data.gstin).toBe('27AABCU9603R1ZX');

    const bad = await request(app)
      .put('/api/organization')
      .set(auth())
      .send({ financialYearStartMonth: 13 });
    expect(bad.status).toBe(400);

    // Restore name to the prior value (best-effort cleanup; test isolation
    // is handled by the next test using its own fields).
    await request(app)
      .put('/api/organization')
      .set(auth())
      .send({ name: before.body.data.name });
  });

  it('POST /api/organization/logo accepts a PNG and rejects non-image', async () => {
    const ok = await request(app)
      .post('/api/organization/logo')
      .set(auth())
      .attach('file', ONE_BY_ONE_PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.data.logoUrl).toBe('string');
    expect(ok.body.data.logoUrl.startsWith('/uploads/logos/')).toBe(true);

    const bad = await request(app)
      .post('/api/organization/logo')
      .set(auth())
      .attach('file', Buffer.from('not an image'), {
        filename: 'evil.txt',
        contentType: 'text/plain',
      });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toMatch(/image/i);
  });
});

describe('Branches', () => {
  it('full CRUD with multi-state GSTIN', async () => {
    const code = uniq('BR');
    const create = await request(app)
      .post('/api/branches')
      .set(auth())
      .send({
        branchCode: code,
        name: 'Mumbai Factory',
        branchType: 'factory',
        gstin: '27AAAAA0000A1Z5',
        state: 'Maharashtra',
      });
    expect(create.status).toBe(200);
    const id = create.body.data.id;

    const dup = await request(app)
      .post('/api/branches')
      .set(auth())
      .send({ branchCode: code, name: 'Conflict', branchType: 'warehouse' });
    expect(dup.status).toBe(409);

    const bad = await request(app)
      .post('/api/branches')
      .set(auth())
      .send({ branchCode: uniq('BR'), name: 'X', branchType: 'spaceship' });
    expect(bad.status).toBe(400);

    const upd = await request(app)
      .put(`/api/branches/${id}`)
      .set(auth())
      .send({ name: 'Mumbai Factory v2' });
    expect(upd.body.data.name).toBe('Mumbai Factory v2');

    const list = await request(app)
      .get('/api/branches?branchType=factory&limit=10')
      .set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.branches.some((b: { id: string }) => b.id === id)).toBe(true);

    const del = await request(app).delete(`/api/branches/${id}`).set(auth());
    expect(del.status).toBe(200);

    // Re-listing without isActive filter should not include it (soft-deleted hidden).
    const after = await request(app)
      .get(`/api/branches/${id}`)
      .set(auth());
    expect(after.status).toBe(404);
  });

  it('rejects deleting a branch that has active users', async () => {
    const code = uniq('BR');
    const create = await request(app)
      .post('/api/branches')
      .set(auth())
      .send({ branchCode: code, name: 'X', branchType: 'showroom' });
    const branchId = create.body.data.id;

    // Create a user assigned to this branch.
    await request(app)
      .post('/api/users')
      .set(auth())
      .send({
        email: `br-user-${randomUUID().slice(0, 8)}@example.com`,
        firstName: 'B',
        lastName: 'U',
        branchId,
      });

    const del = await request(app).delete(`/api/branches/${branchId}`).set(auth());
    expect(del.status).toBe(409);
    expect(del.body.error.details.activeUsers).toBeGreaterThanOrEqual(1);
  });
});

describe('Departments (hierarchical)', () => {
  it('creates root + child + grandchild and refuses cycle', async () => {
    const root = await request(app)
      .post('/api/departments')
      .set(auth())
      .send({ code: uniq('DEPT'), name: 'Engineering' });
    const child = await request(app)
      .post('/api/departments')
      .set(auth())
      .send({ code: uniq('DEPT'), name: 'Mechanical', parentId: root.body.data.id });
    const grandchild = await request(app)
      .post('/api/departments')
      .set(auth())
      .send({ code: uniq('DEPT'), name: 'CNC', parentId: child.body.data.id });
    expect(root.status).toBe(200);
    expect(child.status).toBe(200);
    expect(grandchild.status).toBe(200);

    // Cycle attempt: make root a child of grandchild.
    const cycle = await request(app)
      .put(`/api/departments/${root.body.data.id}`)
      .set(auth())
      .send({ parentId: grandchild.body.data.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.error.message).toMatch(/cycle/i);

    // Self-parent attempt.
    const selfParent = await request(app)
      .put(`/api/departments/${root.body.data.id}`)
      .set(auth())
      .send({ parentId: root.body.data.id });
    expect(selfParent.status).toBe(400);

    // ?parentId=root filter returns top-level only.
    const top = await request(app).get('/api/departments?parentId=root&limit=200').set(auth());
    expect(top.body.data.departments.some((d: { id: string }) => d.id === root.body.data.id)).toBe(true);
    expect(top.body.data.departments.every((d: { parentId: string | null }) => d.parentId === null)).toBe(true);

    // Cleanup: delete leaf, then deletion of parents that still have children fails.
    const failParent = await request(app).delete(`/api/departments/${root.body.data.id}`).set(auth());
    expect(failParent.status).toBe(409);
    await request(app).delete(`/api/departments/${grandchild.body.data.id}`).set(auth());
    await request(app).delete(`/api/departments/${child.body.data.id}`).set(auth());
    const okDelete = await request(app).delete(`/api/departments/${root.body.data.id}`).set(auth());
    expect(okDelete.status).toBe(200);
  });
});

describe('Designations + Locations (lighter coverage)', () => {
  it('designation create/update/delete', async () => {
    const code = uniq('DES');
    const create = await request(app)
      .post('/api/designations')
      .set(auth())
      .send({ code, name: 'CFO', level: 1 });
    expect(create.status).toBe(200);
    const upd = await request(app)
      .put(`/api/designations/${create.body.data.id}`)
      .set(auth())
      .send({ name: 'Chief Financial Officer' });
    expect(upd.body.data.name).toBe('Chief Financial Officer');
    const del = await request(app)
      .delete(`/api/designations/${create.body.data.id}`)
      .set(auth());
    expect(del.status).toBe(200);
  });

  it('location create + list filter', async () => {
    const code = uniq('LOC');
    await request(app)
      .post('/api/locations')
      .set(auth())
      .send({ code, name: 'Bangalore Warehouse', locationType: 'warehouse' });

    const list = await request(app)
      .get('/api/locations?locationType=warehouse&limit=200')
      .set(auth());
    expect(list.status).toBe(200);
    expect(list.body.data.locations.some((l: { code: string }) => l.code === code)).toBe(true);
  });
});

describe('Permission gating', () => {
  it('employee cannot create or delete', async () => {
    const employee = await createInternalUser({ roleCode: 'employee' });
    const t = await loginInternal(app, employee.email, employee.password);

    const denyCreate = await request(app)
      .post('/api/branches')
      .set('Authorization', `Bearer ${t.accessToken}`)
      .send({ branchCode: uniq('NO'), name: 'X', branchType: 'factory' });
    expect(denyCreate.status).toBe(403);

    const list = await request(app)
      .get('/api/branches')
      .set('Authorization', `Bearer ${t.accessToken}`);
    // employee has MASTER_DATA:master_data:view → list should succeed.
    expect(list.status).toBe(200);
  });
});

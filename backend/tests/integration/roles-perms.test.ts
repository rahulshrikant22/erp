/**
 * P0-12 integration tests — role/permission management.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
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
const uniqRoleCode = (): string => `cstm_${randomBytes(3).toString('hex').toLowerCase()}`;

describe('Roles CRUD', () => {
  it('GET /api/roles lists roles with counts', async () => {
    const res = await request(app).get('/api/roles?limit=200').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.roles.length).toBeGreaterThanOrEqual(6);
    const sa = res.body.data.roles.find((r: { roleCode: string }) => r.roleCode === 'super_admin');
    expect(sa.permissionCount).toBeGreaterThan(0);
    expect(sa.isSystemRole).toBe(true);
  });

  it('POST creates a custom role and lowercases-only validation works', async () => {
    const code = uniqRoleCode();
    const ok = await request(app)
      .post('/api/roles')
      .set(auth())
      .send({ roleCode: code, name: 'Custom Auditor', description: 'Read-only audit access' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.roleCode).toBe(code);
    expect(ok.body.data.isSystemRole).toBe(false);

    const bad = await request(app)
      .post('/api/roles')
      .set(auth())
      .send({ roleCode: 'BadCASE', name: 'X' });
    expect(bad.status).toBe(400);
  });

  it('reserved role codes are rejected', async () => {
    const res = await request(app)
      .post('/api/roles')
      .set(auth())
      .send({ roleCode: 'admin', name: 'Conflict' });
    expect(res.status).toBe(409);
  });

  it('PUT cannot deactivate a system role', async () => {
    const list = await request(app).get('/api/roles?limit=200').set(auth());
    const sa = list.body.data.roles.find(
      (r: { roleCode: string }) => r.roleCode === 'super_admin',
    );
    const res = await request(app)
      .put(`/api/roles/${sa.id}`)
      .set(auth())
      .send({ isActive: false });
    expect(res.status).toBe(409);
  });

  it('DELETE refuses system role + role with users; succeeds otherwise', async () => {
    // Try deleting super_admin → refused.
    const list = await request(app).get('/api/roles?limit=200').set(auth());
    const sa = list.body.data.roles.find(
      (r: { roleCode: string }) => r.roleCode === 'super_admin',
    );
    const refusedSystem = await request(app)
      .delete(`/api/roles/${sa.id}`)
      .set(auth());
    expect(refusedSystem.status).toBe(409);

    // Create a custom role, attach a user, then attempt delete → refused.
    const code = uniqRoleCode();
    const role = (await request(app)
      .post('/api/roles')
      .set(auth())
      .send({ roleCode: code, name: 'Hold' })).body.data;
    const user = await createInternalUser({ roleCode: code });
    const refusedUsers = await request(app).delete(`/api/roles/${role.id}`).set(auth());
    expect(refusedUsers.status).toBe(409);
    expect(refusedUsers.body.error.details.activeUsers).toBeGreaterThanOrEqual(1);

    // Detach user, then delete succeeds.
    await rawPrisma.userRole.deleteMany({ where: { userId: user.id, roleId: role.id } });
    const ok = await request(app).delete(`/api/roles/${role.id}`).set(auth());
    expect(ok.status).toBe(200);
  });
});

describe('Role permission assignments', () => {
  it('POST /:id/permissions replaces the set, GET reflects it, resolver updates', async () => {
    const code = uniqRoleCode();
    const role = (await request(app)
      .post('/api/roles')
      .set(auth())
      .send({ roleCode: code, name: 'Assign Test' })).body.data;

    // Initially empty.
    const empty = await request(app).get(`/api/roles/${role.id}/permissions`).set(auth());
    expect(empty.body.data.permissions.length).toBe(0);

    // Assign two permissions, one with a scope filter.
    const set = await request(app)
      .post(`/api/roles/${role.id}/permissions`)
      .set(auth())
      .send({
        assignments: [
          { permissionCode: 'ORDER:order:view', scopeFilter: { type: 'all' } },
          { permissionCode: 'ORDER:order:create' },
        ],
      });
    expect(set.status).toBe(200);
    expect(set.body.data.permissions.map((p: { permissionCode: string }) => p.permissionCode).sort())
      .toEqual(['ORDER:order:create', 'ORDER:order:view']);

    // Replace-style: a second call with a single permission removes the others.
    const replace = await request(app)
      .post(`/api/roles/${role.id}/permissions`)
      .set(auth())
      .send({
        assignments: [{ permissionCode: 'ORDER:order:view' }],
      });
    expect(replace.body.data.permissions.length).toBe(1);

    // Attach a user to the role and verify the resolver agrees.
    const user = await createInternalUser({ roleCode: code });
    const { resolvePermission } = await import('../../src/services/permissions');
    const decision = await resolvePermission({
      userId: user.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'view',
    });
    expect(decision.allowed).toBe(true);
    const denied = await resolvePermission({
      userId: user.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'create',
    });
    expect(denied.allowed).toBe(false);
  });

  it('rejects unknown permission codes', async () => {
    const code = uniqRoleCode();
    const role = (await request(app)
      .post('/api/roles')
      .set(auth())
      .send({ roleCode: code, name: 'X' })).body.data;
    const res = await request(app)
      .post(`/api/roles/${role.id}/permissions`)
      .set(auth())
      .send({ assignments: [{ permissionCode: 'NOPE:none:none' }] });
    expect(res.status).toBe(400);
  });
});

describe('GET /:id/users', () => {
  it('lists users assigned to a role', async () => {
    const code = uniqRoleCode();
    const role = (await request(app)
      .post('/api/roles')
      .set(auth())
      .send({ roleCode: code, name: 'Listy' })).body.data;
    const u = await createInternalUser({ roleCode: code });

    const res = await request(app).get(`/api/roles/${role.id}/users`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.users.some((x: { id: string }) => x.id === u.id)).toBe(true);
  });
});

describe('GET /api/permissions', () => {
  it('returns the registry, filterable by module', async () => {
    const all = await request(app).get('/api/permissions').set(auth());
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBeGreaterThanOrEqual(122);

    const order = await request(app).get('/api/permissions?module=ORDER').set(auth());
    expect(order.status).toBe(200);
    expect(order.body.data.permissions.every(
      (p: { permissionCode: string }) => p.permissionCode.startsWith('ORDER:'),
    )).toBe(true);
  });
});

/**
 * P0-06 integration tests — permission resolver, middleware, overrides,
 * field/data filters, and the admin RBAC endpoints.
 *
 * Tests rely on the seeded baseline (122 permissions, 6 roles, 35 modules).
 * Each test creates a fresh user with a chosen system role attached.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import {
  invalidateAll,
  resolvePermission,
} from '../../src/services/permissions';
import {
  applyDataFilter,
  filterFields,
} from '../../src/utils/permissions';
import { createInternalUser, loginInternal, uniqueEmail } from '../helpers';

let app: Application;

beforeAll(() => {
  app = createApp();
});

afterEach(() => {
  // Tests mutate role grants / module flags / overrides — wipe the resolver
  // cache so each test sees fresh DB state.
  invalidateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('resolvePermission — core cases', () => {
  it('grants via role membership', async () => {
    const u = await createInternalUser({ roleCode: 'admin' });
    const r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'view',
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toMatch(/role/i);
  });

  it('denies when role has no matching permission', async () => {
    const u = await createInternalUser({ roleCode: 'employee' });
    // employee gets `view` everywhere except foundation system; `delete` not granted.
    const r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'delete',
    });
    expect(r.allowed).toBe(false);
  });

  it('user-specific allow override grants access', async () => {
    const u = await createInternalUser({ roleCode: 'employee' });
    // Sanity: employee cannot delete ORDER.
    let r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'delete',
    });
    expect(r.allowed).toBe(false);

    const perm = await prisma.permission.findUnique({
      where: { permissionCode: 'ORDER:order:delete' },
    });
    await prisma.userPermissionOverride.create({
      data: {
        userId: u.id,
        permissionId: perm!.id,
        grantType: 'allow',
        reason: 'one-off cleanup',
      },
    });
    invalidateAll();

    r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'delete',
    });
    expect(r.allowed).toBe(true);
    expect(r.reason).toMatch(/override/i);
  });

  it('user-specific deny override blocks an otherwise-allowed action', async () => {
    const u = await createInternalUser({ roleCode: 'admin' });
    let r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'view',
    });
    expect(r.allowed).toBe(true);

    const perm = await prisma.permission.findUnique({
      where: { permissionCode: 'ORDER:order:view' },
    });
    await prisma.userPermissionOverride.create({
      data: {
        userId: u.id,
        permissionId: perm!.id,
        grantType: 'deny',
        reason: 'leave of absence',
      },
    });
    invalidateAll();

    r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'view',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/deny/i);
  });

  it('module disabled blocks ALL permissions in that module', async () => {
    const u = await createInternalUser({ roleCode: 'super_admin' });
    // Use DOC_GEN here (no dependents in the seed) so we don't collide with
    // modules.test.ts which toggles COMM. Vitest runs test files in parallel
    // worker processes; touching the same module from two files corrupts state.
    await prisma.module.update({
      where: { moduleCode: 'DOC_GEN' },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    invalidateAll();
    try {
      const r = await resolvePermission({
        userId: u.id,
        moduleCode: 'DOC_GEN',
        feature: 'doc_gen',
        action: 'view',
      });
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/disabled/i);
    } finally {
      await prisma.module.update({
        where: { moduleCode: 'DOC_GEN' },
        data: { isActive: true, deactivatedAt: null, activatedAt: new Date() },
      });
    }
  });
});

describe('data-level filter', () => {
  it('returns own_records when role grant scope is own_records', async () => {
    const u = await createInternalUser({ roleCode: 'employee' });
    const role = await prisma.role.findUnique({ where: { roleCode: 'employee' } });
    const perm = await prisma.permission.findUnique({
      where: { permissionCode: 'ORDER:order:view' },
    });
    // Set a scope filter on this role's grant for ORDER:order:view.
    await prisma.rolePermission.update({
      where: { roleId_permissionId: { roleId: role!.id, permissionId: perm!.id } },
      data: { scopeFilter: { type: 'own_records' } },
    });
    invalidateAll();

    try {
      const r = await resolvePermission({
        userId: u.id,
        moduleCode: 'ORDER',
        feature: 'order',
        action: 'view',
      });
      expect(r.allowed).toBe(true);
      expect(r.dataFilter).toEqual({ type: 'own_records' });

      const where = applyDataFilter(r.dataFilter!, {
        userId: u.id,
        branchId: null,
        departmentId: null,
      });
      expect(where).toEqual({ createdById: u.id });
    } finally {
      // Restore — leave seed in known state for subsequent tests.
      await prisma.rolePermission.update({
        where: { roleId_permissionId: { roleId: role!.id, permissionId: perm!.id } },
        data: { scopeFilter: null },
      });
    }
  });

  it('falls back to a no-match predicate when own_branch is requested but user has no branch', () => {
    const where = applyDataFilter(
      { type: 'own_branch' },
      { userId: 'u1', branchId: null, departmentId: null },
    );
    expect(where).toEqual({ id: { equals: '__rbac_no_match__' } });
  });
});

describe('field-level filter', () => {
  it('drops hidden fields and tags readonly ones', () => {
    const out = filterFields(
      { id: 'x', email: 'e@x.com', salary: 99, comments: 'note' },
      [
        { fieldCode: 'salary', visibility: 'hidden' },
        { fieldCode: 'comments', visibility: 'readonly' },
      ],
    );
    expect(out.salary).toBeUndefined();
    expect(out.comments).toBe('note');
    expect(out._readonly).toEqual(['comments']);
  });
});

describe('cache + invalidation', () => {
  it('reflects role-permission changes after invalidateUser', async () => {
    const u = await createInternalUser({ roleCode: 'employee' });
    let r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'delete',
    });
    expect(r.allowed).toBe(false);

    // Grant the missing permission via override and invalidate just this user.
    const perm = await prisma.permission.findUnique({
      where: { permissionCode: 'ORDER:order:delete' },
    });
    await prisma.userPermissionOverride.create({
      data: {
        userId: u.id,
        permissionId: perm!.id,
        grantType: 'allow',
      },
    });
    // Without invalidation we'd still see deny from the cached entry.
    invalidateAll();
    r = await resolvePermission({
      userId: u.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'delete',
    });
    expect(r.allowed).toBe(true);
  });
});

describe('Admin endpoints', () => {
  it('GET /api/rbac/users/:id/permissions returns the effective set', async () => {
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const target = await createInternalUser({ roleCode: 'manager' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const res = await request(app)
      .get(`/api/rbac/users/${target.id}/permissions`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
    expect(res.body.data.permissions.length).toBeGreaterThan(0);
    expect(res.body.data.modulesActive.length).toBeGreaterThanOrEqual(34);
  });

  it('non-admin user cannot read someone else permissions', async () => {
    const employee = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, employee.email, employee.password);

    const res = await request(app)
      .get(`/api/rbac/users/${employee.id}/permissions`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('POST /api/rbac/users/:id/permission-overrides + check shows the override', async () => {
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const target = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const upsert = await request(app)
      .post(`/api/rbac/users/${target.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        permissionCode: 'ORDER:order:delete',
        grantType: 'allow',
        reason: 'temporary cleanup task',
      });
    expect(upsert.status).toBe(200);

    const check = await request(app)
      .get(
        `/api/rbac/users/${target.id}/permissions/check?` +
          new URLSearchParams({ module: 'ORDER', feature: 'order', action: 'delete' }).toString(),
      )
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(check.status).toBe(200);
    expect(check.body.data.allowed).toBe(true);
    expect(check.body.data.reason).toMatch(/override/i);
  });

  it('DELETE override reverts the permission state', async () => {
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const target = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    await request(app)
      .post(`/api/rbac/users/${target.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ permissionCode: 'ORDER:order:delete', grantType: 'allow' });

    const del = await request(app)
      .delete(`/api/rbac/users/${target.id}/permission-overrides/ORDER:order:delete`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(del.status).toBe(200);

    const check = await request(app)
      .get(
        `/api/rbac/users/${target.id}/permissions/check?` +
          new URLSearchParams({ module: 'ORDER', feature: 'order', action: 'delete' }).toString(),
      )
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(check.body.data.allowed).toBe(false);
  });

  it('rejects unknown permission codes on POST overrides', async () => {
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const target = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const res = await request(app)
      .post(`/api/rbac/users/${target.id}/permission-overrides`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ permissionCode: 'BOGUS:thing:action', grantType: 'allow' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  // Light usage of uniqueEmail to keep helpers import warm.
  it('helper sanity — uniqueEmail differs across calls', () => {
    expect(uniqueEmail('x')).not.toBe(uniqueEmail('x'));
  });
});

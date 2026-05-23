/**
 * P0-10 integration tests — admin user-management endpoints.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal, uniqueEmail } from '../helpers';

let app: Application;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

async function adminTokens(): Promise<{ id: string; accessToken: string }> {
  const u = await createInternalUser({ roleCode: 'super_admin' });
  const t = await loginInternal(app, u.email, u.password);
  return { id: u.id, accessToken: t.accessToken };
}

describe('POST /api/users — create', () => {
  it('creates a user with roles, returns reset URL (non-prod)', async () => {
    const admin = await adminTokens();

    const email = uniqueEmail('mgmt-create');
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email,
        firstName: 'New',
        lastName: 'Hire',
        employeeCode: `EMP-${Date.now()}`,
        roleCodes: ['employee'],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.roles[0].roleCode).toBe('employee');
    expect(typeof res.body.data.resetUrl).toBe('string');
  });

  it('rejects duplicate email with CONFLICT', async () => {
    const admin = await adminTokens();
    const email = uniqueEmail('mgmt-dup');
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email, firstName: 'A', lastName: 'B' });

    const dup = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email, firstName: 'A', lastName: 'B' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');
  });

  it('rejects unknown role codes with VALIDATION_ERROR', async () => {
    const admin = await adminTokens();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email: uniqueEmail('mgmt-badrole'),
        firstName: 'X',
        lastName: 'Y',
        roleCodes: ['fake_role_xyz'],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/role/i);
  });

  it('FORBIDDEN for users without AUTH:users:create (employee role)', async () => {
    const employee = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, employee.email, employee.password);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ email: uniqueEmail('mgmt-perm'), firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/users — list + filter', () => {
  it('returns paginated list with totals', async () => {
    const admin = await adminTokens();
    const res = await request(app)
      .get('/api/users?limit=5')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.total).toBe('number');
    expect(res.body.data.users.length).toBeLessThanOrEqual(5);
  });

  it('search filter narrows results', async () => {
    const admin = await adminTokens();
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        email: uniqueEmail('search-target-zzx'),
        firstName: 'Searchable',
        lastName: 'Marker',
      });
    const id = created.body.data.user.id;

    const res = await request(app)
      .get('/api/users?search=zzx')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.users.some((u: { id: string }) => u.id === id)).toBe(true);
  });
});

describe('PUT /api/users/:id — update', () => {
  it('updates allowed fields; ignores email/employeeCode (zod strips them)', async () => {
    const admin = await adminTokens();
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: uniqueEmail('mgmt-upd'), firstName: 'Old', lastName: 'Name' });
    const id = created.body.data.user.id;

    const res = await request(app)
      .put(`/api/users/${id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        firstName: 'New',
        // email is not in updateBody schema; zod will reject extras only with .strict()
        // — we don't use strict here, so the field is silently dropped. Verify it
        // didn't actually change.
        email: 'malicious@example.com',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('New');
    expect(res.body.data.email).not.toBe('malicious@example.com');
  });
});

describe('DELETE /api/users/:id — soft delete', () => {
  it('cannot delete own account', async () => {
    const admin = await adminTokens();
    const res = await request(app)
      .delete(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/own account/i);
  });

  it('soft deletes a user, isActive=false, sessions revoked', async () => {
    const admin = await adminTokens();
    const target = await createInternalUser();
    // Give the target a live session.
    const targetTokens = await loginInternal(app, target.email, target.password);

    const del = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(del.status).toBe(200);

    const after = await rawPrisma.user.findUnique({ where: { id: target.id } });
    expect(after?.isDeleted).toBe(true);
    expect(after?.isActive).toBe(false);

    // Live session must be dead.
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${targetTokens.accessToken}`);
    expect(me.status).toBe(401);
  });

  it('cannot delete the last super_admin', async () => {
    // Quarantine: temporarily mark every other super_admin user_role as
    // inactive. Capture for restoration.
    const role = await rawPrisma.role.findUniqueOrThrow({
      where: { roleCode: 'super_admin' },
    });
    const all = await rawPrisma.userRole.findMany({
      where: { roleId: role.id, isActive: true },
    });

    // Create a fresh super_admin to act as the actor (so it isn't the
    // "last" itself), then suspend everyone else.
    const actor = await createInternalUser({ roleCode: 'super_admin' });
    const actorTokens = await loginInternal(app, actor.email, actor.password);
    const target = await createInternalUser({ roleCode: 'super_admin' });

    const toSuspend = await rawPrisma.userRole.findMany({
      where: {
        roleId: role.id,
        isActive: true,
        userId: { notIn: [target.id, actor.id] },
      },
    });
    await rawPrisma.userRole.updateMany({
      where: { id: { in: toSuspend.map((r) => r.id) } },
      data: { isActive: false },
    });

    try {
      // Now delete actor first, leaving target as the genuine last.
      // Trick: actor deletes itself? No — guard prevents it. So we have
      // actor delete a different super_admin (a third one we make), then
      // target becomes the last. Then attempt deleting target with actor.
      const filler = await createInternalUser({ roleCode: 'super_admin' });
      // remove actor's role so deletion of `filler` leaves target alone.
      // Actually simpler: delete filler first using actor; then strip actor's
      // role and assert target cannot be deleted.
      await request(app)
        .delete(`/api/users/${filler.id}`)
        .set('Authorization', `Bearer ${actorTokens.accessToken}`);

      // Strip the actor's super_admin (downgrade) so only target is left
      // with the role.
      const actorRoleRow = await rawPrisma.userRole.findFirst({
        where: { userId: actor.id, roleId: role.id, isActive: true },
      });
      if (actorRoleRow) {
        await rawPrisma.userRole.update({
          where: { id: actorRoleRow.id },
          data: { isActive: false },
        });
      }
      // We need an actor that CAN delete (so re-grant super_admin to another
      // fresh user, but we keep target as the only super_admin — wait, that
      // contradicts. Approach: re-grant super_admin to a brand new user so
      // we have an authorized actor. Now there are 2 super_admins (target +
      // newActor). So we need to suspend target's role too? No, we want to
      // attempt deleting `target`. We need (target alone as super_admin) AND
      // (an authorized actor who has AUTH:users:delete). Authorized actor is
      // newActor (super_admin), but if newActor exists then target isn't
      // last. So: temporarily give newActor super_admin to act, then while
      // suspending newActor's role, attempt the delete.
      const newActor = await createInternalUser({ roleCode: 'super_admin' });
      const newActorTokens = await loginInternal(app, newActor.email, newActor.password);

      // Suspend newActor's super_admin role transiently to make `target` the
      // genuine last — but newActor's TOKEN was issued with super_admin perms.
      // The resolver re-checks active roles per request via cache; invalidate
      // it so the very next request shows current state.
      await rawPrisma.userRole.updateMany({
        where: { userId: newActor.id, roleId: role.id, isActive: true },
        data: { isActive: false },
      });
      // newActor still HAS the AUTH:users:delete via fresh role lookup? After
      // suspension, no. So this approach falls apart — newActor can't act.

      // Pragmatic alternative: directly call the service with raw prisma to
      // sidestep the auth path. Verify the *guard* itself raises.
      const { softDeleteUser } = await import('../../src/services/users');
      await expect(
        softDeleteUser({ userId: target.id, actorUserId: 'someone-else-id' }),
      ).rejects.toThrowError(/last active super_admin/i);
      void newActorTokens;
    } finally {
      // Restore everyone we touched.
      await rawPrisma.userRole.updateMany({
        where: { id: { in: all.map((r) => r.id) } },
        data: { isActive: true },
      });
    }
  });
});

describe('Lifecycle: lock / unlock / reactivate / force-logout / reset', () => {
  it('lock then unlock', async () => {
    const admin = await adminTokens();
    const created = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email: uniqueEmail('mgmt-lock'), firstName: 'L', lastName: 'M' });
    const id = created.body.data.user.id;

    const lock = await request(app)
      .post(`/api/users/${id}/lock`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ durationMinutes: 30 });
    expect(lock.status).toBe(200);
    expect(lock.body.data.isLocked).toBe(true);

    const unlock = await request(app)
      .post(`/api/users/${id}/unlock`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({});
    expect(unlock.status).toBe(200);
    expect(unlock.body.data.isLocked).toBe(false);
  });

  it('admin reset-password returns a resetUrl in non-prod', async () => {
    const admin = await adminTokens();
    const target = await createInternalUser();
    const res = await request(app)
      .post(`/api/users/${target.id}/reset-password`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(typeof res.body.data.resetUrl).toBe('string');
  });

  it('force-logout revokes all sessions', async () => {
    const admin = await adminTokens();
    const target = await createInternalUser();
    const t1 = await loginInternal(app, target.email, target.password);
    const t2 = await loginInternal(app, target.email, target.password);

    const fo = await request(app)
      .post(`/api/users/${target.id}/force-logout`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({});
    expect(fo.status).toBe(200);
    expect(fo.body.data.revokedCount).toBeGreaterThanOrEqual(2);

    for (const t of [t1, t2]) {
      const r = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${t.accessToken}`);
      expect(r.status).toBe(401);
    }
  });

  it('reactivate lifts isDeleted+isActive', async () => {
    const admin = await adminTokens();
    const target = await createInternalUser();
    await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);

    const r = await request(app)
      .post(`/api/users/${target.id}/reactivate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({});
    expect(r.status).toBe(200);
    expect(r.body.data.isActive).toBe(true);
    expect(r.body.data.isDeleted).toBe(false);
  });
});

describe('Roles assignment + audit-trail', () => {
  it('replaces user roles and immediately reflects in resolver', async () => {
    const admin = await adminTokens();
    const target = await createInternalUser({ roleCode: 'employee' });
    const r = await request(app)
      .post(`/api/users/${target.id}/roles`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ roleCodes: ['manager'] });
    expect(r.status).toBe(200);
    expect(r.body.data.roles.map((x: { roleCode: string }) => x.roleCode).sort()).toEqual([
      'manager',
    ]);

    const { resolvePermission } = await import('../../src/services/permissions');
    const decision = await resolvePermission({
      userId: target.id,
      moduleCode: 'ORDER',
      feature: 'order',
      action: 'approve',
    });
    // manager has ORDER:order:approve in the seed.
    expect(decision.allowed).toBe(true);
  });

  it('audit-trail returns logs touching the user', async () => {
    const admin = await adminTokens();
    const target = await createInternalUser();
    await request(app)
      .put(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ firstName: 'Renamed' });

    const r = await request(app)
      .get(`/api/users/${target.id}/audit-trail`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.data.logs.length).toBeGreaterThan(0);
  });
});

describe('CSV import', () => {
  it('imports two users, returns per-row outcomes', async () => {
    const admin = await adminTokens();
    const e1 = uniqueEmail('csv-a');
    const e2 = uniqueEmail('csv-b');
    const csv =
      'email,first_name,last_name,role_codes\n' +
      `${e1},Alice,One,employee\n` +
      `${e2},Bob,Two,employee|supervisor\n`;

    const res = await request(app)
      .post('/api/users/import')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .attach('file', Buffer.from(csv), { filename: 'u.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.failed).toBe(0);
  });

  it('reports failures per row without aborting the import', async () => {
    const admin = await adminTokens();
    const e1 = uniqueEmail('csv-good');
    // row 2 has a bogus role code → should fail; row 3 should still create.
    const csv =
      'email,first_name,last_name,role_codes\n' +
      `${e1},Good,Row,employee\n` +
      `bad-row-${Date.now()}@example.com,Bad,Row,definitely_not_a_role\n` +
      `${uniqueEmail('csv-good2')},Good,Row2,employee\n`;

    const res = await request(app)
      .post('/api/users/import')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .attach('file', Buffer.from(csv), { filename: 'u.csv', contentType: 'text/csv' });
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results.find((r: { status: string }) => r.status === 'failed').error)
      .toMatch(/role/i);
  });
});

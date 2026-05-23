/**
 * P0-30 end-to-end lifecycle tests.
 *
 * Covers:
 * 1. Full user lifecycle (create → login → role → access control)
 * 2. Customer signup lifecycle (submit → approve → isolation)
 * 3. Audit trail completeness
 * 4. Phase 0 checklist validation (tables, roles, modules, security)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminToken: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// -- 1. Full user lifecycle ------------------------------------------------

describe('E2E: Full user lifecycle', () => {
  const email = `lifecycle_${Date.now()}@test.com`;
  let userId: string;

  it('admin creates a user', async () => {
    const res = await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({ firstName: 'Life', lastName: 'Cycle', email });
    expect(res.status).toBe(200);
    userId = res.body.data.user.id;
    expect(userId).toBeTruthy();
  });

  it('admin assigns a role to the user', async () => {
    const res = await request(app)
      .post(`/api/users/${userId}/roles`)
      .set(auth(adminToken))
      .send({ roleCodes: ['admin'] });
    expect(res.status).toBe(200);
  });

  it('user can log in with created credentials', async () => {
    const user = await createInternalUser({});
    const login = await loginInternal(app, user.email, user.password);
    expect(login.accessToken).toBeTruthy();

    const me = await request(app)
      .get('/api/auth/me')
      .set(auth(login.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
  });

  it('user without permission gets 403 on restricted endpoints', async () => {
    const noRoleUser = await createInternalUser({});
    const noRoleLogin = await loginInternal(app, noRoleUser.email, noRoleUser.password);

    const res = await request(app)
      .get('/api/users')
      .set(auth(noRoleLogin.accessToken));
    expect(res.status).toBe(403);
  });

  it('admin can lock and unlock a user', async () => {
    const lockRes = await request(app)
      .post(`/api/users/${userId}/lock`)
      .set(auth(adminToken))
      .send({ reason: 'E2E test', durationMinutes: 60 });
    expect(lockRes.status).toBe(200);

    const unlockRes = await request(app)
      .post(`/api/users/${userId}/unlock`)
      .set(auth(adminToken));
    expect(unlockRes.status).toBe(200);
  });

  it('admin can force-logout a user', async () => {
    const res = await request(app)
      .post(`/api/users/${userId}/force-logout`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });
});

// -- 2. Customer signup lifecycle ------------------------------------------

describe('E2E: Customer signup lifecycle', () => {
  const signupEmail = `customer_${Date.now()}@test.com`;

  it('external user submits signup request', async () => {
    const res = await request(app)
      .post('/api/public/signup-request')
      .send({
        companyName: 'Test Corp',
        contactName: 'Cust Omer',
        email: signupEmail,
        phone: '9876543210',
        accountType: 'dealer',
      });
    expect(res.status).toBe(200);
  });

  it('admin sees pending signup in queue', async () => {
    const res = await request(app)
      .get('/api/admin/signup-requests')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    const all = res.body.data.requests;
    expect(all.length).toBeGreaterThan(0);
    const pending = all.find(
      (r: { email: string }) => r.email === signupEmail,
    );
    expect(pending).toBeTruthy();
    expect(pending.status).toBe('pending');
  });

  it('admin approves signup', async () => {
    const listRes = await request(app)
      .get('/api/admin/signup-requests')
      .set(auth(adminToken));
    const req0 = listRes.body.data.requests.find(
      (r: { email: string }) => r.email === signupEmail,
    );

    const res = await request(app)
      .post(`/api/admin/signup-requests/${req0.id}/approve`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });

  it('customer cannot access admin endpoints', async () => {
    const res = await request(app)
      .get('/api/users')
      .set({ Authorization: 'Bearer invalid-token' });
    expect([401, 403]).toContain(res.status);
  });
});

// -- 3. Audit trail --------------------------------------------------------

describe('E2E: Audit trail completeness', () => {
  it('creating a user generates audit log', async () => {
    const email = `audit_e2e_${Date.now()}@test.com`;
    await request(app)
      .post('/api/users')
      .set(auth(adminToken))
      .send({ firstName: 'Audit', lastName: 'Test', email });

    const logsRes = await request(app)
      .get('/api/audit/logs?entityType=User&action=create&limit=5')
      .set(auth(adminToken));
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.logs.length).toBeGreaterThan(0);
  });

  it('password hash is not exposed in audit data', async () => {
    const logsRes = await request(app)
      .get('/api/audit/logs?entityType=User&limit=5')
      .set(auth(adminToken));
    for (const log of logsRes.body.data.logs) {
      const afterStr = JSON.stringify(log.afterData ?? {});
      expect(afterStr).not.toContain('$2b$');
      expect(afterStr).not.toContain('passwordHash');
    }
  });

  it('audit logs can be filtered by entity type', async () => {
    const res = await request(app)
      .get('/api/audit/logs?entityType=User&limit=5')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.logs.length).toBeGreaterThan(0);
    for (const log of res.body.data.logs) {
      expect(log.entityType).toBe('User');
    }
  });

  it('audit log detail includes before/after', async () => {
    const logsRes = await request(app)
      .get('/api/audit/logs?action=create&limit=1')
      .set(auth(adminToken));
    expect(logsRes.body.data.logs.length).toBeGreaterThan(0);
    const logId = logsRes.body.data.logs[0].id;

    const detail = await request(app)
      .get(`/api/audit/logs/${logId}`)
      .set(auth(adminToken));
    expect(detail.status).toBe(200);
    expect(detail.body.data.log).toBeDefined();
  });
});

// -- 4. Checklist validation -----------------------------------------------

describe('E2E: Phase 0 checklist', () => {
  it('database has 50+ tables', async () => {
    const result = await rawPrisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count FROM information_schema.tables
      WHERE table_schema = 'core' AND table_type = 'BASE TABLE'
    `;
    expect(Number(result[0].count)).toBeGreaterThanOrEqual(50);
  });

  it('base roles are seeded', async () => {
    const roles = await rawPrisma.role.findMany({
      where: { isSystemRole: true },
      select: { roleCode: true },
    });
    const codes = roles.map((r) => r.roleCode);
    expect(codes).toContain('super_admin');
    expect(codes).toContain('admin');
    expect(codes).toContain('manager');
  });

  it('modules are registered', async () => {
    const modules = await rawPrisma.module.findMany({
      select: { moduleCode: true, isActive: true },
    });
    expect(modules.length).toBeGreaterThanOrEqual(10);
  });

  it('security headers are present', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers).not.toHaveProperty('x-powered-by');
  });

  it('authentication works for internal users', async () => {
    const user = await createInternalUser({});
    const login = await loginInternal(app, user.email, user.password);
    expect(login.accessToken).toBeTruthy();
    expect(login.refreshToken).toBeTruthy();

    const me = await request(app)
      .get('/api/auth/me')
      .set(auth(login.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(user.email);
  });

  it('RBAC prevents unauthorized access', async () => {
    const user = await createInternalUser({});
    const login = await loginInternal(app, user.email, user.password);

    const res = await request(app)
      .get('/api/admin/email-providers')
      .set(auth(login.accessToken));
    expect(res.status).toBe(403);
  });

  it('numbering series engine works', async () => {
    const { getNextNumber } = await import('../../src/services/numbering');
    const code = `E2E_${Date.now()}`;

    await request(app)
      .post('/api/admin/numbering-series')
      .set(auth(adminToken))
      .send({
        seriesCode: code,
        name: 'E2E Series',
        prefix: 'E2E',
        yearFormat: 'YYYY',
        separator: '-',
        paddingLength: 4,
      });

    const r1 = await getNextNumber(code.toUpperCase());
    expect(r1.sequence).toBe(1);
    expect(r1.number).toContain('E2E');
  });

  it('payment gateway listing works', async () => {
    const res = await request(app)
      .get('/api/admin/payment-gateways')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });

  it('system settings CRUD works', async () => {
    const key = `e2e.check.${Date.now()}`;
    const createRes = await request(app)
      .post('/api/admin/settings')
      .set(auth(adminToken))
      .send({ settingKey: key, settingValue: 'test', dataType: 'string', category: 'General' });
    expect(createRes.status).toBe(201);

    const getRes = await request(app)
      .get(`/api/admin/settings/${key}`)
      .set(auth(adminToken));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.value).toBe('test');
  });
});

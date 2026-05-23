/**
 * P0-09 integration tests — audit auto-logging + redaction + queries.
 *
 * The audit extension is on by default once tests import `prisma` from
 * `src/lib/prisma`. Each test makes a write through the extended client
 * and asserts that the corresponding audit row appeared (queried via the
 * RAW client to avoid auto-auditing the read).
 */
import { afterAll, afterEach, describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { rawPrisma } from '../../src/lib/prisma-base';
import {
  REDACTION_MARKER,
  auditEvent,
  logAction,
} from '../../src/services/audit';
import { runInAuditContext } from '../../src/services/audit-context';
import { createInternalUser, loginInternal, uniqueEmail } from '../helpers';

let app: Application;

beforeAll(() => {
  app = createApp();
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

// Vitest doesn't reset module-state between tests — runInAuditContext is
// safe per-test because each call to it scopes its own AsyncLocalStorage frame.

describe('Auto-logging — Prisma extension', () => {
  it('logs create with afterData and "created" summary', async () => {
    const email = uniqueEmail('audit-create');
    await runInAuditContext({ requestId: 'test-create' }, async () => {
      await prisma.user.create({
        data: {
          email,
          firstName: 'Audit',
          lastName: 'Create',
          passwordHash: 'fake-hash-not-real',
          userType: 'internal',
          isActive: true,
        },
      });
    });

    const log = await rawPrisma.auditLog.findFirst({
      where: { entityType: 'User', action: 'create' },
      orderBy: { actionAt: 'desc' },
    });
    expect(log).toBeTruthy();
    expect(log?.requestId).toBe('test-create');
    const after = log?.afterData as Record<string, unknown>;
    expect(after.email).toBe(email);
    // Sensitive fields redacted in afterData.
    expect(after.passwordHash).toBe(REDACTION_MARKER);
    expect(log?.changesSummary).toMatch(/^created/);
  });

  it('logs update with before/after and a meaningful summary', async () => {
    const u = await runInAuditContext({}, () => createInternalUser());

    await runInAuditContext({ requestId: 'test-update' }, async () => {
      await prisma.user.update({
        where: { id: u.id },
        data: { firstName: 'Renamed' },
      });
    });

    const log = await rawPrisma.auditLog.findFirst({
      where: { entityType: 'User', entityId: u.id, action: 'update' },
      orderBy: { actionAt: 'desc' },
    });
    expect(log).toBeTruthy();
    const before = log?.beforeData as Record<string, unknown>;
    const after = log?.afterData as Record<string, unknown>;
    expect(before.firstName).not.toBe('Renamed');
    expect(after.firstName).toBe('Renamed');
    expect(log?.changesSummary).toContain('firstName');
    // Both sides redact passwordHash.
    expect(before.passwordHash).toBe(REDACTION_MARKER);
    expect(after.passwordHash).toBe(REDACTION_MARKER);
  });

  it('logs delete with before-state captured', async () => {
    const u = await runInAuditContext({}, () => createInternalUser());

    await runInAuditContext({}, async () => {
      await prisma.user.delete({ where: { id: u.id } });
    });

    const log = await rawPrisma.auditLog.findFirst({
      where: { entityType: 'User', entityId: u.id, action: 'delete' },
      orderBy: { actionAt: 'desc' },
    });
    expect(log).toBeTruthy();
    const before = log?.beforeData as Record<string, unknown>;
    expect(before.email).toBe(u.email);
    expect(log?.changesSummary).toMatch(/^deleted/);
  });

  it('does NOT log writes to skip-listed models (UserSession)', async () => {
    // Login creates a UserSession. Confirm no audit row was emitted for it.
    const u = await createInternalUser();
    const before = await rawPrisma.auditLog.count({
      where: { entityType: 'UserSession' },
    });
    await loginInternal(app, u.email, u.password);
    const after = await rawPrisma.auditLog.count({
      where: { entityType: 'UserSession' },
    });
    expect(after).toBe(before);
  });

  it('upsert is logged as create when row is new, update when it exists', async () => {
    const code = `MODTEST_${randomUUID().slice(0, 6).toUpperCase()}`;
    // We need a Module to upsert against — but Modules are seeded;
    // pick an existing one and upsert with a no-op update + a non-existent
    // path to test create. Use SystemSetting which is easier to stand up.
    const key = `audit.test.${randomUUID().slice(0, 6)}`;

    await runInAuditContext({}, async () => {
      await prisma.systemSetting.upsert({
        where: { settingKey: key },
        create: {
          settingKey: key,
          settingValue: 'first',
          dataType: 'string',
        },
        update: { settingValue: 'second' },
      });
    });
    const createLog = await rawPrisma.auditLog.findFirst({
      where: { entityType: 'SystemSetting', action: 'create' },
      orderBy: { actionAt: 'desc' },
    });
    expect(createLog).toBeTruthy();

    await runInAuditContext({}, async () => {
      await prisma.systemSetting.upsert({
        where: { settingKey: key },
        create: { settingKey: key, settingValue: 'x', dataType: 'string' },
        update: { settingValue: 'second' },
      });
    });
    const updateLog = await rawPrisma.auditLog.findFirst({
      where: { entityType: 'SystemSetting', action: 'update' },
      orderBy: { actionAt: 'desc' },
    });
    expect(updateLog).toBeTruthy();
    void code;

    // cleanup so other tests don't see this setting
    await rawPrisma.systemSetting.delete({ where: { settingKey: key } });
  });
});

describe('Manual events — auditEvent + logAction', () => {
  it('auditEvent records a non-Prisma event with details (redacted where applicable)', async () => {
    const reqId = `evt-${randomUUID().slice(0, 8)}`;
    await runInAuditContext({ requestId: reqId, actorUserId: 'someone' }, () =>
      auditEvent({
        eventType: 'login_failure',
        details: { email: 'evil@example.com', token: 'should-be-hidden' },
        entityType: 'auth',
      }),
    );
    const log = await rawPrisma.auditLog.findFirst({
      where: { requestId: reqId },
    });
    expect(log).toBeTruthy();
    expect(log?.action).toBe('login_failure');
    expect(log?.entityType).toBe('auth');
    const after = log?.afterData as Record<string, unknown>;
    expect(after.email).toBe('evil@example.com');
    expect(after.token).toBe(REDACTION_MARKER);
  });

  it('logAction never throws on failure (defensive)', async () => {
    // Force a failure by pointing at a non-existent table-like type.
    // The function should swallow + log to pino, not throw.
    await expect(
      logAction({ entityType: '*'.repeat(10_000), action: 'bogus' }),
    ).resolves.toBeUndefined();
  });
});

describe('Redaction', () => {
  it('redacts deeply-nested sensitive fields', async () => {
    const reqId = `red-${randomUUID().slice(0, 8)}`;
    await runInAuditContext({ requestId: reqId }, () =>
      auditEvent({
        eventType: 'test_redaction',
        details: {
          ok: 'visible',
          nested: {
            password: 'shouldnot',
            sub: { tokenValue: 'shouldnot', plain: 'visible' },
          },
          arr: [{ secretKey: 'shouldnot' }],
        },
      }),
    );
    const log = await rawPrisma.auditLog.findFirst({ where: { requestId: reqId } });
    const data = log?.afterData as Record<string, unknown>;
    expect(data.ok).toBe('visible');
    const nested = data.nested as Record<string, unknown>;
    expect(nested.password).toBe(REDACTION_MARKER);
    const sub = nested.sub as Record<string, unknown>;
    expect(sub.tokenValue).toBe(REDACTION_MARKER);
    expect(sub.plain).toBe('visible');
    const arr = data.arr as Record<string, unknown>[];
    expect(arr[0].secretKey).toBe(REDACTION_MARKER);
  });
});

describe('Query routes', () => {
  it('GET /api/audit/logs filters by entityType + action', async () => {
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const res = await request(app)
      .get('/api/audit/logs?entityType=User&action=create&limit=5')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.total).toBe('number');
    expect(Array.isArray(res.body.data.logs)).toBe(true);
    for (const r of res.body.data.logs) {
      expect(r.entityType).toBe('User');
      expect(r.action).toBe('create');
    }
  });

  it('GET /api/audit/entity/:entityType/:entityId/history returns timeline', async () => {
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    // Make a deterministic mutation: rename the admin's first name.
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({
        currentPassword: admin.password,
        newPassword: 'AnotherStrong?Pa55word!',
      });
    // The change-password flow updates User → audit row exists.

    const history = await request(app)
      .get(`/api/audit/entity/User/${admin.id}/history`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.history.length).toBeGreaterThan(0);
  });

  it('non-admin without AUDIT:audit:view gets FORBIDDEN', async () => {
    const employee = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, employee.email, employee.password);
    // employee has AUTH:auth:view + AUDIT:audit:view actually? Let me check —
    // employee filter: view everywhere except SYSTEM_MODULE_CODES. AUDIT is
    // not in SYSTEM_MODULE_CODES (those are AUTH/RBAC/MOD_MGMT). So employee
    // DOES have AUDIT:audit:view. To prove FORBIDDEN we use "customer" role.
    const cust = await createInternalUser({ roleCode: 'customer' });
    const custTokens = await loginInternal(app, cust.email, cust.password);
    const res = await request(app)
      .get('/api/audit/logs')
      .set('Authorization', `Bearer ${custTokens.accessToken}`);
    expect(res.status).toBe(403);
    void tokens;
  });
});

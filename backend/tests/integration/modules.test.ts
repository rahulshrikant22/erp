/**
 * P0-07 integration tests — module registry lifecycle.
 *
 * IMPORTANT: tests in this file mutate `core.modules.is_active`. Each test
 * that toggles MUST restore the module to its prior state in `afterEach`
 * so subsequent tests see a known baseline. The seed leaves all 35 modules
 * active by default.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import {
  activateModule,
  deactivateModule,
  getDependents,
  getGrowthPath,
  getModule,
  isModuleActive,
  listModules,
} from '../../src/services/modules';
import { invalidateAll as invalidatePermissions, resolvePermission } from '../../src/services/permissions';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
const dirtied = new Set<string>(); // module codes that need restoring

beforeAll(() => {
  app = createApp();
});

afterEach(async () => {
  if (dirtied.size > 0) {
    await prisma.module.updateMany({
      where: { moduleCode: { in: [...dirtied] } },
      data: { isActive: true, deactivatedAt: null },
    });
    dirtied.clear();
  }
  invalidatePermissions();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function dirty(...codes: string[]): void {
  for (const c of codes) dirtied.add(c);
}

describe('Module service — queries', () => {
  it('listModules returns all 35 with correct shape', async () => {
    const list = await listModules();
    expect(list.length).toBe(35);
    expect(list.find((m) => m.moduleCode === 'AUTH')?.isCore).toBe(true);
    expect(list.find((m) => m.moduleCode === 'QC')?.isBypassable).toBe(true);
  });

  it('getModule returns dependsOn + dependents edges', async () => {
    const order = await getModule('ORDER');
    const codes = order.dependsOn.map((d) => d.moduleCode).sort();
    expect(codes).toEqual(['CUSTOMER', 'PRODUCT']);

    const customer = await getModule('CUSTOMER');
    expect(customer.dependents.some((d) => d.moduleCode === 'ORDER')).toBe(true);
  });

  it('getDependents lists hard + soft dependents', async () => {
    const deps = await getDependents('PRODUCTION');
    const codes = deps.map((d) => d.moduleCode).sort();
    expect(codes).toContain('PANEL_QR');   // hard
    expect(codes).toContain('NESTING');    // soft
    expect(codes).toContain('JOB_WORK');   // soft
  });

  it('isModuleActive cache reflects toggle invalidation', async () => {
    expect(await isModuleActive('COMM')).toBe(true);
    dirty('COMM');
    await deactivateModule({ moduleCode: 'COMM', reason: 'test' });
    expect(await isModuleActive('COMM')).toBe(false);
    await activateModule({ moduleCode: 'COMM', reason: 'test restore' });
    expect(await isModuleActive('COMM')).toBe(true);
  });

  it('getGrowthPath surfaces stage labels with isActive flags', async () => {
    const stages = await getGrowthPath();
    expect(stages.length).toBe(6);
    const sellingStage = stages.find((s) => s.stage.startsWith('2.'))!;
    expect(sellingStage.modules.some((m) => m.moduleCode === 'ORDER')).toBe(true);
  });
});

describe('Module service — mutations', () => {
  it('deactivate non-core succeeds and writes history', async () => {
    dirty('COMM');
    const before = await prisma.moduleActivationHistory.count({
      where: { module: { moduleCode: 'COMM' }, action: 'deactivated' },
    });
    const result = await deactivateModule({ moduleCode: 'COMM', reason: 'maintenance' });
    expect(result.previousState).toBe('active');
    expect(result.newState).toBe('inactive');

    const after = await prisma.moduleActivationHistory.count({
      where: { module: { moduleCode: 'COMM' }, action: 'deactivated' },
    });
    expect(after).toBe(before + 1);
  });

  it('deactivate core module is rejected', async () => {
    await expect(deactivateModule({ moduleCode: 'AUTH' })).rejects.toThrowError(
      /core modules cannot be disabled/i,
    );
  });

  it('deactivate with active hard dependents is rejected with the dependent list', async () => {
    // PRODUCT has ORDER and BOM as hard dependents (both seeded active).
    let err: unknown;
    try {
      await deactivateModule({ moduleCode: 'PRODUCT' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    const e = err as { httpStatus: number; details: { activeDependents: string[] } };
    expect(e.httpStatus).toBe(409);
    expect(e.details.activeDependents).toEqual(expect.arrayContaining(['ORDER', 'BOM']));
  });

  it('activate is idempotent (already active is a no-op)', async () => {
    const result = await activateModule({ moduleCode: 'COMM' });
    expect(result.noop).toBe(true);
    expect(result.newState).toBe('active');
  });

  it('activate fails if hard dependencies are inactive', async () => {
    // Walk down the dep chain so PRODUCT has no active dependents:
    //   ORDER and BOM both depend on PRODUCT. BOM also has dependents (COSTING, PRODUCTION),
    //   PRODUCTION has dependents (PANEL_QR hard; NESTING/JOB_WORK soft).
    // Order matters: bring leaves down first.
    const path = ['PANEL_QR', 'PRODUCTION', 'COSTING', 'BOM', 'ORDER', 'PRODUCT'];
    dirty(...path);
    for (const code of path) {
      await deactivateModule({ moduleCode: code, reason: 'cascade for test' });
    }

    let err: unknown;
    try {
      await activateModule({ moduleCode: 'BOM' });
    } catch (e) {
      err = e;
    }
    const e = err as { httpStatus: number; details: { missing: string[] } };
    expect(e.httpStatus).toBe(409);
    expect(e.details.missing).toEqual(expect.arrayContaining(['PRODUCT']));
  });
});

describe('Module deactivation propagates to permission resolver', () => {
  it('a previously-allowed permission is denied immediately after deactivate', async () => {
    const u = await createInternalUser({ roleCode: 'super_admin' });
    let r = await resolvePermission({
      userId: u.id,
      moduleCode: 'COMM',
      feature: 'comm',
      action: 'view',
    });
    expect(r.allowed).toBe(true);

    dirty('COMM');
    await deactivateModule({ moduleCode: 'COMM', reason: 'lockdown drill' });

    r = await resolvePermission({
      userId: u.id,
      moduleCode: 'COMM',
      feature: 'comm',
      action: 'view',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/disabled/i);
  });
});

describe('HTTP routes', () => {
  it('GET /api/modules returns the list (admin)', async () => {
    const admin = await createInternalUser({ roleCode: 'admin' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const res = await request(app)
      .get('/api/modules')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.modules.length).toBe(35);
  });

  it('GET /api/modules/growth-path returns stages', async () => {
    const admin = await createInternalUser({ roleCode: 'admin' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const res = await request(app)
      .get('/api/modules/growth-path')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stages.length).toBe(6);
  });

  it('non-admin cannot list modules', async () => {
    const employee = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, employee.email, employee.password);
    // employee has no MOD_MGMT permissions in the seed.
    const res = await request(app)
      .get('/api/modules')
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('POST /api/modules/:code/deactivate then /activate cycle works', async () => {
    const admin = await createInternalUser({ roleCode: 'admin' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    dirty('COMM');
    const off = await request(app)
      .post('/api/modules/COMM/deactivate')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ reason: 'live test off' });
    expect(off.status).toBe(200);
    expect(off.body.data.newState).toBe('inactive');

    const on = await request(app)
      .post('/api/modules/COMM/activate')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ reason: 'live test on' });
    expect(on.status).toBe(200);
    expect(on.body.data.newState).toBe('active');
  });

  it('POST /api/modules/AUTH/deactivate is rejected as a core module', async () => {
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const res = await request(app)
      .post('/api/modules/AUTH/deactivate')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

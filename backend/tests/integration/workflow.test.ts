/**
 * P0-08 integration tests — workflow engine.
 *
 * Each test creates its own ephemeral workflow with a unique code so suites
 * stay isolated. The tests work directly against the engine service for
 * speed, with a smaller HTTP-route subset at the bottom.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import {
  approveStep,
  cancelInstance,
  createInstance,
  getInstanceStatus,
  processTimeouts,
  rejectStep,
} from '../../src/services/workflow';
import { registerWorkflowAction } from '../../src/services/workflow-actions';
import { activateModule, deactivateModule } from '../../src/services/modules';
import { createInternalUser, createTestWorkflow, loginInternal } from '../helpers';

let app: Application;
const dirtyModules = new Set<string>();
const testActionCalls = new Map<string, number>();

beforeAll(() => {
  app = createApp();

  // Test-only handlers; safe to call registerWorkflowAction multiple times,
  // but the registry warns on overwrite — register once for the whole suite.
  registerWorkflowAction('test:counter', async (ctx) => {
    const key = ctx.workflowCode;
    testActionCalls.set(key, (testActionCalls.get(key) ?? 0) + 1);
    return { count: testActionCalls.get(key) };
  });
  registerWorkflowAction('test:throw', async () => {
    throw new Error('boom');
  });
});

beforeEach(() => {
  testActionCalls.clear();
});

afterEach(async () => {
  if (dirtyModules.size > 0) {
    for (const c of dirtyModules) {
      // Idempotent — module may already be active.
      await activateModule({ moduleCode: c, reason: 'test cleanup' }).catch(() => undefined);
    }
    dirtyModules.clear();
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

function uniqWorkflowCode(prefix: string): string {
  return `${prefix.toUpperCase()}_${randomUUID().slice(0, 8).toUpperCase()}`;
}

describe('engine — linear flow', () => {
  it('runs notification → action → notification to completion', async () => {
    const code = uniqWorkflowCode('LIN');
    await createTestWorkflow(code, [
      { stepName: 'notify_started', stepType: 'notification', assigneeValue: 'role:admin' },
      { stepName: 'do_thing',       stepType: 'action',       assigneeType: 'action', assigneeValue: 'test:counter' },
      { stepName: 'notify_done',    stepType: 'notification', assigneeValue: 'role:admin' },
    ]);

    const result = await createInstance({
      workflowCode: code,
      targetEntityId: randomUUID(),
    });
    expect(result.status).toBe('completed');
    expect(testActionCalls.get(code)).toBe(1);

    const status = await getInstanceStatus(result.instanceId);
    const taken = status.history.map((h) => h.actionTaken);
    expect(taken).toContain('started');
    expect(taken).toContain('notification_sent');
    expect(taken).toContain('action_executed');
    expect(taken).toContain('completed');
  });
});

describe('engine — approval flow', () => {
  it('pauses on approval, advances on approve, completes', async () => {
    const code = uniqWorkflowCode('APP');
    await createTestWorkflow(code, [
      { stepName: 'manager_review', stepType: 'approval', assigneeType: 'role', assigneeValue: 'manager' },
      { stepName: 'mark_done',      stepType: 'action',   assigneeType: 'action', assigneeValue: 'test:counter' },
    ]);
    const initiator = await createInternalUser();

    const r1 = await createInstance({
      workflowCode: code,
      targetEntityId: randomUUID(),
      initiatedById: initiator.id,
    });
    expect(r1.status).toBe('active');
    expect(r1.pendingApprovalStepId).toBeTruthy();

    const r2 = await approveStep({
      instanceId: r1.instanceId,
      actorUserId: initiator.id,
      notes: 'looks good',
    });
    expect(r2.status).toBe('completed');
    expect(testActionCalls.get(code)).toBe(1);
  });

  it('reject cancels the instance', async () => {
    const code = uniqWorkflowCode('REJ');
    await createTestWorkflow(code, [
      { stepName: 'gate', stepType: 'approval', assigneeType: 'role', assigneeValue: 'manager' },
    ]);
    const initiator = await createInternalUser();
    const r1 = await createInstance({ workflowCode: code, targetEntityId: randomUUID(), initiatedById: initiator.id });

    const r2 = await rejectStep({
      instanceId: r1.instanceId,
      actorUserId: initiator.id,
      reason: 'budget exceeded',
    });
    expect(r2.status).toBe('cancelled');

    const status = await getInstanceStatus(r1.instanceId);
    expect(status.status).toBe('cancelled');
    expect(status.history.some((h) => h.actionTaken === 'rejected')).toBe(true);
  });
});

describe('engine — condition step', () => {
  it('passes through when condition is true', async () => {
    const code = uniqWorkflowCode('CONDT');
    await createTestWorkflow(code, [
      {
        stepName: 'amount_check',
        stepType: 'condition',
        conditionJson: { op: '>', field: 'amount', value: 500 },
      },
      { stepName: 'do_thing', stepType: 'action', assigneeType: 'action', assigneeValue: 'test:counter' },
    ]);
    const r = await createInstance({
      workflowCode: code,
      targetEntityId: randomUUID(),
      context: { amount: 1000 },
    });
    expect(r.status).toBe('completed');
    expect(testActionCalls.get(code)).toBe(1);
  });

  it('cancels when condition is false', async () => {
    const code = uniqWorkflowCode('CONDF');
    await createTestWorkflow(code, [
      {
        stepName: 'amount_check',
        stepType: 'condition',
        conditionJson: { op: '>', field: 'amount', value: 500 },
      },
      { stepName: 'do_thing', stepType: 'action', assigneeType: 'action', assigneeValue: 'test:counter' },
    ]);
    const r = await createInstance({
      workflowCode: code,
      targetEntityId: randomUUID(),
      context: { amount: 100 },
    });
    expect(r.status).toBe('cancelled');
    expect(testActionCalls.get(code)).toBeUndefined();

    const status = await getInstanceStatus(r.instanceId);
    expect(status.history.some((h) => h.actionTaken === 'condition_failed')).toBe(true);
  });

  it('handles AND/OR/IN/NOT', async () => {
    const code = uniqWorkflowCode('CONDX');
    await createTestWorkflow(code, [
      {
        stepName: 'complex',
        stepType: 'condition',
        conditionJson: {
          op: 'AND',
          args: [
            { op: '>=', field: 'amount', value: 100 },
            { op: 'OR', args: [
              { op: 'IN', field: 'branch', values: ['BLR', 'DEL'] },
              { op: 'NOT', arg: { op: '==', field: 'status', value: 'draft' } },
            ] },
          ],
        },
      },
    ]);
    const r = await createInstance({
      workflowCode: code,
      targetEntityId: randomUUID(),
      context: { amount: 500, branch: 'BLR', status: 'draft' },
    });
    expect(r.status).toBe('completed');
  });
});

describe('engine — module bypass (the headline feature)', () => {
  it('auto-skips a step whose target module is inactive', async () => {
    const code = uniqWorkflowCode('BYP');
    await createTestWorkflow(code, [
      { stepName: 'notify_a',    stepType: 'notification', assigneeValue: 'role:manager' },
      {
        stepName: 'qc_step',
        stepType: 'approval',
        assigneeType: 'role',
        assigneeValue: 'manager',
        skipIfModuleInactive: true,
        targetModuleCode: 'QC',
      },
      { stepName: 'notify_b',    stepType: 'notification', assigneeValue: 'role:manager' },
    ]);

    // Take QC offline for this test.
    dirtyModules.add('QC');
    await deactivateModule({ moduleCode: 'QC', reason: 'workflow bypass test' });

    const r = await createInstance({ workflowCode: code, targetEntityId: randomUUID() });
    expect(r.status).toBe('completed');

    const status = await getInstanceStatus(r.instanceId);
    expect(status.history.some((h) => h.actionTaken === 'auto_skipped_module_inactive')).toBe(true);
    // Should NOT be paused on approval — QC was the only approval, and it skipped.
    expect(status.pendingStep).toBeNull();
  });

  it('does NOT skip when target module is active (normal approval pause)', async () => {
    const code = uniqWorkflowCode('NOBYP');
    await createTestWorkflow(code, [
      {
        stepName: 'qc_step',
        stepType: 'approval',
        assigneeType: 'role',
        assigneeValue: 'manager',
        skipIfModuleInactive: true,
        targetModuleCode: 'QC', // QC is active by default
      },
    ]);
    const r = await createInstance({ workflowCode: code, targetEntityId: randomUUID() });
    expect(r.status).toBe('active');
    expect(r.pendingApprovalStepId).toBeTruthy();
  });
});

describe('engine — failure modes', () => {
  it('action_failed cancels the instance with reason in log', async () => {
    const code = uniqWorkflowCode('THROW');
    await createTestWorkflow(code, [
      { stepName: 'will_throw', stepType: 'action', assigneeType: 'action', assigneeValue: 'test:throw' },
    ]);
    const r = await createInstance({ workflowCode: code, targetEntityId: randomUUID() });
    expect(r.status).toBe('cancelled');
    const status = await getInstanceStatus(r.instanceId);
    const failed = status.history.find((h) => h.actionTaken === 'action_failed');
    expect(failed?.notes).toContain('boom');
  });

  it('unknown action handler cancels with explanatory log', async () => {
    const code = uniqWorkflowCode('UNK');
    await createTestWorkflow(code, [
      { stepName: 'mystery', stepType: 'action', assigneeType: 'action', assigneeValue: 'test:does_not_exist' },
    ]);
    const r = await createInstance({ workflowCode: code, targetEntityId: randomUUID() });
    expect(r.status).toBe('cancelled');
    const status = await getInstanceStatus(r.instanceId);
    expect(status.history.some((h) => h.notes?.includes('Unknown handler'))).toBe(true);
  });

  it('cancel from outside ends an active instance', async () => {
    const code = uniqWorkflowCode('CXL');
    await createTestWorkflow(code, [
      { stepName: 'wait', stepType: 'approval', assigneeType: 'role', assigneeValue: 'manager' },
    ]);
    const initiator = await createInternalUser();
    const r = await createInstance({
      workflowCode: code,
      targetEntityId: randomUUID(),
      initiatedById: initiator.id,
    });
    await cancelInstance({
      instanceId: r.instanceId,
      actorUserId: initiator.id,
      reason: 'no longer needed',
    });
    const s = await getInstanceStatus(r.instanceId);
    expect(s.status).toBe('cancelled');
  });
});

describe('engine — timeout processor', () => {
  it('logs approval_timeout when an approval has exceeded its window', async () => {
    const code = uniqWorkflowCode('TO');
    await createTestWorkflow(code, [
      {
        stepName: 'urgent',
        stepType: 'approval',
        assigneeType: 'role',
        assigneeValue: 'manager',
        timeoutMinutes: 1, // 1-minute timeout
      },
    ]);
    const r = await createInstance({ workflowCode: code, targetEntityId: randomUUID() });
    expect(r.status).toBe('active');

    // Fast-forward by manually rewriting the approval_requested log to be older.
    const log = await prisma.workflowActionLog.findFirst({
      where: { instanceId: r.instanceId, actionTaken: 'approval_requested' },
    });
    expect(log).toBeTruthy();
    await prisma.workflowActionLog.update({
      where: { id: log!.id },
      data: { actionAt: new Date(Date.now() - 5 * 60 * 1000) }, // 5 min ago
    });

    const out = await processTimeouts();
    expect(out.escalated).toBeGreaterThanOrEqual(1);

    const status = await getInstanceStatus(r.instanceId);
    expect(status.history.some((h) => h.actionTaken === 'approval_timeout')).toBe(true);

    // Idempotent: re-running shouldn't double-log.
    const out2 = await processTimeouts();
    const escalatedThisCall = out2.escalated;
    expect(escalatedThisCall).toBe(0);
  });
});

describe('HTTP routes', () => {
  it('full lifecycle via API: start → approve → status', async () => {
    const code = uniqWorkflowCode('HTTP');
    await createTestWorkflow(code, [
      { stepName: 'gate', stepType: 'approval', assigneeType: 'role', assigneeValue: 'manager' },
    ]);
    const admin = await createInternalUser({ roleCode: 'super_admin' });
    const tokens = await loginInternal(app, admin.email, admin.password);

    const start = await request(app)
      .post('/api/workflows/instances')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ workflowCode: code, targetEntityId: randomUUID() });
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe('active');
    const id = start.body.data.instanceId;

    const approve = await request(app)
      .post(`/api/workflows/instances/${id}/approve`)
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ notes: 'ok' });
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('completed');

    const status = await request(app)
      .get(`/api/workflows/instances/${id}`)
      .set('Authorization', `Bearer ${tokens.accessToken}`);
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe('completed');
    expect(Array.isArray(status.body.data.history)).toBe(true);
  });

  it('non-permission user cannot start an instance', async () => {
    const employee = await createInternalUser({ roleCode: 'employee' });
    const tokens = await loginInternal(app, employee.email, employee.password);
    // employee has no WORKFLOW:workflow:create in the seed.
    const res = await request(app)
      .post('/api/workflows/instances')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ workflowCode: 'BOGUS', targetEntityId: randomUUID() });
    expect(res.status).toBe(403);
  });
});

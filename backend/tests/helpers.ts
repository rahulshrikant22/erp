/**
 * Shared test helpers — keep tiny and side-effect-free.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/services/password';

/** Unique email per test to avoid cross-test contamination on shared DB. */
export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}-${randomUUID()}@example.com`;
}

export interface CreatedUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export async function createInternalUser(overrides: Partial<{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Optional system role to attach (e.g. 'super_admin', 'employee'). */
  roleCode: string;
}> = {}): Promise<CreatedUser> {
  const email = overrides.email ?? uniqueEmail('internal');
  const password = overrides.password ?? 'CorrectHorse!Battery9?Staple';
  const firstName = overrides.firstName ?? 'Test';
  const lastName = overrides.lastName ?? 'User';
  const passwordHash = await hashPassword(password);

  const u = await prisma.user.create({
    data: {
      email,
      firstName,
      lastName,
      passwordHash,
      passwordChangedAt: new Date(),
      userType: 'internal',
      isActive: true,
    },
  });
  await prisma.userPasswordHistory.create({
    data: { userId: u.id, passwordHash },
  });

  if (overrides.roleCode) {
    const role = await prisma.role.findUnique({ where: { roleCode: overrides.roleCode } });
    if (role) {
      await prisma.userRole.create({
        data: { userId: u.id, roleId: role.id, isActive: true },
      });
    }
  }

  return { id: u.id, email, password, firstName, lastName };
}

/** Login an internal user via the API and return access + refresh tokens. */
export async function loginInternal(
  app: import('express').Application,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string; sessionId: string }> {
  const request = (await import('supertest')).default;
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    sessionId: res.body.data.sessionId,
  };
}

/**
 * Create a Workflow + ordered WorkflowStep rows for tests.
 * Returns the workflow code so callers can start instances against it.
 */
export interface TestStepInput {
  stepName: string;
  stepType: 'notification' | 'condition' | 'action' | 'approval';
  assigneeType?: string;
  assigneeValue?: string;
  conditionJson?: unknown;
  timeoutMinutes?: number;
  skipIfModuleInactive?: boolean;
  targetModuleCode?: string;
}

export async function createTestWorkflow(
  workflowCode: string,
  steps: TestStepInput[],
  opts: { targetEntity?: string; triggerEvent?: string } = {},
): Promise<{ workflowId: string; workflowCode: string }> {
  const wf = await prisma.workflow.create({
    data: {
      workflowCode,
      name: `Test ${workflowCode}`,
      targetEntity: opts.targetEntity ?? 'test_entity',
      triggerEvent: opts.triggerEvent ?? 'test_event',
      isActive: true,
    },
  });

  let i = 1;
  for (const s of steps) {
    let targetModuleId: string | null = null;
    if (s.targetModuleCode) {
      const m = await prisma.module.findUnique({
        where: { moduleCode: s.targetModuleCode },
        select: { id: true },
      });
      targetModuleId = m?.id ?? null;
    }
    await prisma.workflowStep.create({
      data: {
        workflowId: wf.id,
        stepSequence: i++,
        stepName: s.stepName,
        stepType: s.stepType,
        assigneeType: s.assigneeType ?? null,
        assigneeValue: s.assigneeValue ?? null,
        conditionJson: (s.conditionJson ?? null) as never,
        timeoutMinutes: s.timeoutMinutes ?? null,
        skipIfModuleInactive: s.skipIfModuleInactive ?? false,
        targetModuleId,
      },
    });
  }
  return { workflowId: wf.id, workflowCode };
}

export interface CreatedCustomerUser {
  id: string;
  accountId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export async function createCustomerUser(overrides: Partial<{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}> = {}): Promise<CreatedCustomerUser> {
  const email = overrides.email ?? uniqueEmail('cust');
  const password = overrides.password ?? 'CorrectHorse!Battery9?Staple';
  const firstName = overrides.firstName ?? 'Cust';
  const lastName = overrides.lastName ?? 'User';
  const passwordHash = await hashPassword(password);

  const account = await prisma.customerAccount.create({
    data: {
      accountCode: `CUST-${randomUUID().slice(0, 8)}`,
      companyName: 'Test Customer Co',
      primaryEmail: email,
      accountType: 'dealer',
      isActive: true,
    },
  });
  const user = await prisma.customerUser.create({
    data: {
      customerAccountId: account.id,
      email,
      passwordHash,
      firstName,
      lastName,
      role: 'admin',
      isActive: true,
    },
  });
  return { id: user.id, accountId: account.id, email, password, firstName, lastName };
}

/**
 * Workflow engine — drives `core.workflows`, `core.workflow_steps`,
 * `core.workflow_instances`, `core.workflow_action_logs`.
 *
 * Step types & how the engine handles them:
 *
 *   notification — log a "notification_sent" action and auto-advance.
 *                  Real channel dispatch lands in P0-15+ (this module already
 *                  records intent so later phases can hook in).
 *
 *   condition    — evaluate `condition_json` against the instance context.
 *                  On true → advance. On false → cancel the instance with
 *                  reason "condition_failed:<step_name>" (for now). This is
 *                  the simplest interpretation of "branches based on data";
 *                  richer branching (jump to step N) is a future enhancement.
 *
 *   action       — look up the handler named in `assignee_value`, invoke it
 *                  with an ActionContext, then auto-advance.
 *
 *   approval     — assign and pause. The engine stops; a separate API call
 *                  (approveStep / rejectStep) resumes it.
 *
 * Module bypass:
 *   When the next step has `skip_if_module_inactive=true` and its
 *   `target_module_id` resolves to an inactive module, the step is logged
 *   as `auto_skipped_module_inactive` and the engine skips through to the
 *   next non-skipped step (or completion). This is the whole point of the
 *   bypass mechanism — disabling a module gracefully removes its steps.
 *
 * Action log entries written:
 *   started | auto_skipped_module_inactive | notification_sent
 *   condition_passed | condition_failed | action_executed | action_failed
 *   approval_requested | approved | rejected | cancelled | completed
 *
 * Concurrency note: the engine is currently single-process. Two callers
 * advancing the same instance concurrently would race; in production we'd
 * lock the row. Acceptable for P0; revisit if we go multi-replica.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { evaluateCondition } from './workflow-condition';
import { getWorkflowAction, type ActionContext } from './workflow-actions';
import { isModuleActive } from './modules';

// -- types ---------------------------------------------------------------

export type StepType = 'notification' | 'condition' | 'action' | 'approval';

export interface CreateInstanceInput {
  workflowCode: string;
  targetEntityId: string;
  initiatedById?: string;
  /** Free-form data passed to condition steps and action handlers. */
  context?: Record<string, unknown>;
}

export interface StartResult {
  instanceId: string;
  status: 'active' | 'completed' | 'cancelled';
  currentStep: number;
  pendingApprovalStepId?: string;
}

export interface InstanceStatus {
  id: string;
  workflowCode: string;
  workflowName: string;
  targetEntity: string;
  targetEntityId: string;
  currentStep: number;
  status: string;
  initiatedById: string | null;
  initiatedAt: Date;
  completedAt: Date | null;
  /** The step the instance is paused on, when status='active' and it's an approval step. */
  pendingStep: SerializableStep | null;
  history: ActionLogEntry[];
}

export interface SerializableStep {
  id: string;
  stepSequence: number;
  stepName: string;
  stepType: StepType;
  assigneeType: string | null;
  assigneeValue: string | null;
  targetModuleCode: string | null;
  skipIfModuleInactive: boolean;
}

export interface ActionLogEntry {
  id: string;
  stepName: string | null;
  actionTaken: string;
  actorUserId: string | null;
  notes: string | null;
  actionAt: Date;
}

// -- helpers -------------------------------------------------------------

interface LoadedStep {
  id: string;
  workflowId: string;
  stepSequence: number;
  stepName: string;
  stepType: StepType;
  assigneeType: string | null;
  assigneeValue: string | null;
  conditionJson: Prisma.JsonValue | null;
  timeoutMinutes: number | null;
  skipIfModuleInactive: boolean;
  targetModuleCode: string | null;
}

async function loadInstance(instanceId: string) {
  const inst = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    include: { workflow: true },
  });
  if (!inst) throw new NotFoundError('Workflow instance not found');
  return inst;
}

async function loadSteps(workflowId: string): Promise<LoadedStep[]> {
  const rows = await prisma.workflowStep.findMany({
    where: { workflowId },
    orderBy: { stepSequence: 'asc' },
    include: { targetModule: { select: { moduleCode: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    workflowId: r.workflowId,
    stepSequence: r.stepSequence,
    stepName: r.stepName,
    stepType: r.stepType as StepType,
    assigneeType: r.assigneeType,
    assigneeValue: r.assigneeValue,
    conditionJson: r.conditionJson,
    timeoutMinutes: r.timeoutMinutes,
    skipIfModuleInactive: r.skipIfModuleInactive,
    targetModuleCode: r.targetModule?.moduleCode ?? null,
  }));
}

async function logAction(args: {
  instanceId: string;
  stepId?: string;
  action: string;
  actorUserId?: string | null;
  notes?: string;
}): Promise<void> {
  await prisma.workflowActionLog.create({
    data: {
      instanceId: args.instanceId,
      stepId: args.stepId,
      actionTaken: args.action,
      actorUserId: args.actorUserId ?? null,
      notes: args.notes,
    },
  });
}

function serializeStep(step: LoadedStep): SerializableStep {
  return {
    id: step.id,
    stepSequence: step.stepSequence,
    stepName: step.stepName,
    stepType: step.stepType,
    assigneeType: step.assigneeType,
    assigneeValue: step.assigneeValue,
    targetModuleCode: step.targetModuleCode,
    skipIfModuleInactive: step.skipIfModuleInactive,
  };
}

// -- public API: creation + advancement ----------------------------------

export async function createInstance(input: CreateInstanceInput): Promise<StartResult> {
  const wf = await prisma.workflow.findUnique({
    where: { workflowCode: input.workflowCode },
  });
  if (!wf) throw new NotFoundError(`Workflow ${input.workflowCode} not found`);
  if (!wf.isActive) {
    throw new ValidationError('Workflow is not active', { workflowCode: input.workflowCode });
  }

  const inst = await prisma.workflowInstance.create({
    data: {
      workflowId: wf.id,
      targetEntityId: input.targetEntityId,
      initiatedById: input.initiatedById,
      currentStep: 0,
      status: 'active',
    },
  });
  await logAction({
    instanceId: inst.id,
    action: 'started',
    actorUserId: input.initiatedById ?? null,
    notes: input.context ? `context=${JSON.stringify(input.context)}` : undefined,
  });

  // Run the engine forward until it completes or hits an approval gate.
  return runForward(inst.id, input.context ?? {});
}

/**
 * Drive the instance forward until either:
 *   - it completes (no more steps),
 *   - it cancels (rejection / condition false),
 *   - it hits an approval step (pause and return).
 *
 * Returns the resulting state.
 */
async function runForward(
  instanceId: string,
  context: Record<string, unknown>,
): Promise<StartResult> {
  const inst = await loadInstance(instanceId);
  if (inst.status !== 'active') {
    return {
      instanceId: inst.id,
      status: inst.status as StartResult['status'],
      currentStep: inst.currentStep,
    };
  }

  const steps = await loadSteps(inst.workflowId);
  let currentStep = inst.currentStep;

  while (currentStep < steps.length) {
    const step = steps[currentStep];

    // 1. Module bypass — skip whole step if the target module is inactive.
    if (step.skipIfModuleInactive && step.targetModuleCode) {
      const active = await isModuleActive(step.targetModuleCode);
      if (!active) {
        await logAction({
          instanceId: inst.id,
          stepId: step.id,
          action: 'auto_skipped_module_inactive',
          notes: `Module ${step.targetModuleCode} is inactive`,
        });
        currentStep++;
        continue;
      }
    }

    // 2. Dispatch by step type.
    if (step.stepType === 'notification') {
      await logAction({
        instanceId: inst.id,
        stepId: step.id,
        action: 'notification_sent',
        notes: step.assigneeValue ?? undefined,
      });
      currentStep++;
      continue;
    }

    if (step.stepType === 'condition') {
      let passed: boolean;
      try {
        passed = evaluateCondition(step.conditionJson, context);
      } catch (err) {
        await logAction({
          instanceId: inst.id,
          stepId: step.id,
          action: 'condition_failed',
          notes: `evaluation error: ${(err as Error).message}`,
        });
        await prisma.workflowInstance.update({
          where: { id: inst.id },
          data: { status: 'cancelled', completedAt: new Date(), currentStep },
        });
        return { instanceId: inst.id, status: 'cancelled', currentStep };
      }
      await logAction({
        instanceId: inst.id,
        stepId: step.id,
        action: passed ? 'condition_passed' : 'condition_failed',
      });
      if (!passed) {
        await prisma.workflowInstance.update({
          where: { id: inst.id },
          data: { status: 'cancelled', completedAt: new Date(), currentStep },
        });
        return { instanceId: inst.id, status: 'cancelled', currentStep };
      }
      currentStep++;
      continue;
    }

    if (step.stepType === 'action') {
      const handlerName = step.assigneeValue ?? '';
      const handler = getWorkflowAction(handlerName);
      if (!handler) {
        await logAction({
          instanceId: inst.id,
          stepId: step.id,
          action: 'action_failed',
          notes: `Unknown handler: ${handlerName}`,
        });
        await prisma.workflowInstance.update({
          where: { id: inst.id },
          data: { status: 'cancelled', completedAt: new Date(), currentStep },
        });
        return { instanceId: inst.id, status: 'cancelled', currentStep };
      }
      const ctx: ActionContext = {
        instanceId: inst.id,
        workflowCode: inst.workflow.workflowCode,
        targetEntity: inst.workflow.targetEntity,
        targetEntityId: inst.targetEntityId,
        stepName: step.stepName,
        payload: context,
      };
      try {
        await handler(ctx);
        await logAction({
          instanceId: inst.id,
          stepId: step.id,
          action: 'action_executed',
          notes: handlerName,
        });
        currentStep++;
        continue;
      } catch (err) {
        logger.error({ err, instanceId: inst.id, handler: handlerName }, 'workflow action handler threw');
        await logAction({
          instanceId: inst.id,
          stepId: step.id,
          action: 'action_failed',
          notes: `${handlerName}: ${(err as Error).message}`,
        });
        await prisma.workflowInstance.update({
          where: { id: inst.id },
          data: { status: 'cancelled', completedAt: new Date(), currentStep },
        });
        return { instanceId: inst.id, status: 'cancelled', currentStep };
      }
    }

    if (step.stepType === 'approval') {
      // Pause — record the assignment and exit. Caller resumes via approveStep().
      await prisma.workflowInstance.update({
        where: { id: inst.id },
        data: { currentStep },
      });
      await logAction({
        instanceId: inst.id,
        stepId: step.id,
        action: 'approval_requested',
        notes: step.assigneeType && step.assigneeValue
          ? `${step.assigneeType}:${step.assigneeValue}`
          : undefined,
      });
      return {
        instanceId: inst.id,
        status: 'active',
        currentStep,
        pendingApprovalStepId: step.id,
      };
    }

    // Unknown step type — fail loudly.
    throw new ValidationError(`Unknown step type: ${step.stepType}`, {
      stepName: step.stepName,
    });
  }

  // No more steps — complete.
  await prisma.workflowInstance.update({
    where: { id: inst.id },
    data: { status: 'completed', completedAt: new Date(), currentStep },
  });
  await logAction({ instanceId: inst.id, action: 'completed' });
  return { instanceId: inst.id, status: 'completed', currentStep };
}

export interface ApproveInput {
  instanceId: string;
  actorUserId: string;
  notes?: string;
  context?: Record<string, unknown>;
}

export async function approveStep(input: ApproveInput): Promise<StartResult> {
  const inst = await loadInstance(input.instanceId);
  if (inst.status !== 'active') {
    throw new ConflictError(`Instance is not active (status=${inst.status})`);
  }
  const steps = await loadSteps(inst.workflowId);
  const step = steps[inst.currentStep];
  if (!step || step.stepType !== 'approval') {
    throw new ConflictError('Current step is not an approval step');
  }

  await logAction({
    instanceId: inst.id,
    stepId: step.id,
    action: 'approved',
    actorUserId: input.actorUserId,
    notes: input.notes,
  });
  await prisma.workflowInstance.update({
    where: { id: inst.id },
    data: { currentStep: inst.currentStep + 1 },
  });

  return runForward(inst.id, input.context ?? {});
}

export interface RejectInput {
  instanceId: string;
  actorUserId: string;
  reason: string;
}

export async function rejectStep(input: RejectInput): Promise<StartResult> {
  const inst = await loadInstance(input.instanceId);
  if (inst.status !== 'active') {
    throw new ConflictError(`Instance is not active (status=${inst.status})`);
  }
  const steps = await loadSteps(inst.workflowId);
  const step = steps[inst.currentStep];
  if (!step || step.stepType !== 'approval') {
    throw new ConflictError('Current step is not an approval step');
  }

  await logAction({
    instanceId: inst.id,
    stepId: step.id,
    action: 'rejected',
    actorUserId: input.actorUserId,
    notes: input.reason,
  });
  await prisma.workflowInstance.update({
    where: { id: inst.id },
    data: { status: 'cancelled', completedAt: new Date() },
  });
  return { instanceId: inst.id, status: 'cancelled', currentStep: inst.currentStep };
}

export async function cancelInstance(args: {
  instanceId: string;
  actorUserId: string;
  reason: string;
}): Promise<void> {
  const inst = await loadInstance(args.instanceId);
  if (inst.status !== 'active') {
    throw new ConflictError(`Instance is not active (status=${inst.status})`);
  }
  await logAction({
    instanceId: inst.id,
    action: 'cancelled',
    actorUserId: args.actorUserId,
    notes: args.reason,
  });
  await prisma.workflowInstance.update({
    where: { id: inst.id },
    data: { status: 'cancelled', completedAt: new Date() },
  });
}

// -- queries -------------------------------------------------------------

export async function getInstanceStatus(instanceId: string): Promise<InstanceStatus> {
  const inst = await loadInstance(instanceId);
  const steps = await loadSteps(inst.workflowId);

  const pendingStep = inst.status === 'active'
    ? steps[inst.currentStep] && steps[inst.currentStep].stepType === 'approval'
      ? serializeStep(steps[inst.currentStep])
      : null
    : null;

  const history = await prisma.workflowActionLog.findMany({
    where: { instanceId },
    orderBy: { actionAt: 'asc' },
    include: { step: { select: { stepName: true } } },
  });

  return {
    id: inst.id,
    workflowCode: inst.workflow.workflowCode,
    workflowName: inst.workflow.name,
    targetEntity: inst.workflow.targetEntity,
    targetEntityId: inst.targetEntityId,
    currentStep: inst.currentStep,
    status: inst.status,
    initiatedById: inst.initiatedById,
    initiatedAt: inst.initiatedAt,
    completedAt: inst.completedAt,
    pendingStep,
    history: history.map((h) => ({
      id: h.id,
      stepName: h.step?.stepName ?? null,
      actionTaken: h.actionTaken,
      actorUserId: h.actorUserId,
      notes: h.notes,
      actionAt: h.actionAt,
    })),
  };
}

export interface ListInstancesFilters {
  workflowCode?: string;
  targetEntity?: string;
  status?: 'active' | 'completed' | 'cancelled';
}

export async function listInstances(filters: ListInstancesFilters): Promise<{
  id: string;
  workflowCode: string;
  workflowName: string;
  targetEntity: string;
  targetEntityId: string;
  currentStep: number;
  status: string;
  initiatedAt: Date;
  completedAt: Date | null;
}[]> {
  const rows = await prisma.workflowInstance.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.workflowCode || filters.targetEntity
        ? {
            workflow: {
              ...(filters.workflowCode ? { workflowCode: filters.workflowCode } : {}),
              ...(filters.targetEntity ? { targetEntity: filters.targetEntity } : {}),
            },
          }
        : {}),
    },
    include: { workflow: true },
    orderBy: { initiatedAt: 'desc' },
    take: 100,
  });
  return rows.map((r) => ({
    id: r.id,
    workflowCode: r.workflow.workflowCode,
    workflowName: r.workflow.name,
    targetEntity: r.workflow.targetEntity,
    targetEntityId: r.targetEntityId,
    currentStep: r.currentStep,
    status: r.status,
    initiatedAt: r.initiatedAt,
    completedAt: r.completedAt,
  }));
}

// -- timeout / escalation -----------------------------------------------

/**
 * Scan active instances and mark approval steps that have exceeded their
 * timeout. Returns the number of instances escalated. Hook for a cron in
 * P0-19+; for now invoke manually via POST /api/workflows/process-timeouts.
 *
 * Behaviour: log "approval_timeout" on the instance. We do NOT auto-cancel
 * — the spec says "escalate or expire (configurable)" and we don't have the
 * configuration surface yet. Future work: per-step timeout policies.
 */
export async function processTimeouts(): Promise<{ checked: number; escalated: number }> {
  const active = await prisma.workflowInstance.findMany({
    where: { status: 'active' },
    include: { workflow: true },
  });

  let checked = 0;
  let escalated = 0;
  for (const inst of active) {
    checked++;
    const steps = await loadSteps(inst.workflowId);
    const step = steps[inst.currentStep];
    if (!step || step.stepType !== 'approval' || !step.timeoutMinutes) continue;

    // Find when this approval was requested — the latest approval_requested
    // log row for this step.
    const lastReq = await prisma.workflowActionLog.findFirst({
      where: {
        instanceId: inst.id,
        stepId: step.id,
        actionTaken: 'approval_requested',
      },
      orderBy: { actionAt: 'desc' },
    });
    if (!lastReq) continue;

    const deadline = new Date(lastReq.actionAt.getTime() + step.timeoutMinutes * 60 * 1000);
    if (deadline >= new Date()) continue;

    // Already escalated? (Idempotency.)
    const alreadyEscalated = await prisma.workflowActionLog.findFirst({
      where: {
        instanceId: inst.id,
        stepId: step.id,
        actionTaken: 'approval_timeout',
      },
    });
    if (alreadyEscalated) continue;

    await logAction({
      instanceId: inst.id,
      stepId: step.id,
      action: 'approval_timeout',
      notes: `deadline ${deadline.toISOString()} elapsed`,
    });
    escalated++;
  }
  return { checked, escalated };
}

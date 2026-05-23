/**
 * Registry of named handlers callable from workflow `action` steps.
 *
 * Steps reference handlers by name in `assignee_value`. The engine looks up
 * the handler at execution time and invokes it with the instance context.
 *
 * Adding new handlers:
 *   1. Define the function (signature: ActionHandler).
 *   2. registerWorkflowAction('your_handler_name', fn) at module-load time.
 *   3. Reference the name in workflow_steps.assignee_value with
 *      step_type='action' and assignee_type='action'.
 *
 * Note: handlers run on the same node process the engine runs in. Long /
 * heavy work belongs in a queue (out of scope for P0-08; P0-19+).
 */
import { logger } from '../utils/logger';

export interface ActionContext {
  instanceId: string;
  workflowCode: string;
  targetEntity: string;
  targetEntityId: string;
  stepName: string;
  /** Last action's payload (e.g. approval reason / condition result). */
  payload?: unknown;
}

export type ActionHandler = (ctx: ActionContext) => Promise<unknown>;

const REGISTRY = new Map<string, ActionHandler>();

export function registerWorkflowAction(name: string, fn: ActionHandler): void {
  if (REGISTRY.has(name)) {
    // Overwriting silently masks bugs; warn loudly.
    logger.warn({ name }, 'workflow action handler being replaced');
  }
  REGISTRY.set(name, fn);
}

export function getWorkflowAction(name: string): ActionHandler | undefined {
  return REGISTRY.get(name);
}

export function listWorkflowActions(): string[] {
  return [...REGISTRY.keys()].sort();
}

/** Test hook — clears the registry. Use only in test setup. */
export function _resetWorkflowActions(): void {
  REGISTRY.clear();
  registerBuiltins();
}

// -- built-in handlers ---------------------------------------------------

const noop: ActionHandler = async () => ({ ok: true });

const log: ActionHandler = async (ctx) => {
  logger.info(
    {
      workflow: ctx.workflowCode,
      step: ctx.stepName,
      target: `${ctx.targetEntity}:${ctx.targetEntityId}`,
    },
    'workflow log action',
  );
  return { logged: true };
};

function registerBuiltins(): void {
  REGISTRY.set('noop', noop);
  REGISTRY.set('log', log);
}

registerBuiltins();

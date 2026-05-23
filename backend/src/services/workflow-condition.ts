/**
 * Tiny safe expression evaluator for workflow condition steps.
 *
 * Accepted JSON shapes:
 *
 *   Comparison:
 *     { op: "==", field: "amount", value: 100 }
 *     { op: "!=", field: "status", value: "draft" }
 *     { op: "<" | "<=" | ">" | ">=", field: "amount", value: 500 }
 *
 *   Membership:
 *     { op: "IN", field: "branchCode", values: ["BLR","DEL"] }
 *
 *   Logical (n-ary):
 *     { op: "AND", args: [ <expr>, <expr>, ... ] }
 *     { op: "OR",  args: [ <expr>, <expr>, ... ] }
 *     { op: "NOT", arg:  <expr> }
 *
 * Strict-by-default — anything malformed throws ValidationError so the
 * workflow author finds out at instance-start time, not on the unhappy path.
 */
import { ValidationError } from '../errors';

const COMPARE_OPS = new Set(['==', '!=', '<', '<=', '>', '>=']);

export function evaluateCondition(expr: unknown, ctx: Record<string, unknown>): boolean {
  if (!expr || typeof expr !== 'object' || Array.isArray(expr)) {
    throw new ValidationError('condition_json must be an object', { expr });
  }
  const e = expr as Record<string, unknown>;
  const op = e.op;
  if (typeof op !== 'string') {
    throw new ValidationError('condition_json missing op', { expr });
  }

  if (COMPARE_OPS.has(op)) {
    const left = readField(ctx, e.field);
    const right = e.value;
    return compare(op, left, right);
  }

  if (op === 'IN') {
    const left = readField(ctx, e.field);
    if (!Array.isArray(e.values)) {
      throw new ValidationError('IN requires "values" array', { expr });
    }
    return (e.values as unknown[]).some((v) => deepEqual(left, v));
  }

  if (op === 'AND') {
    const args = asArgs(e.args, op);
    return args.every((a) => evaluateCondition(a, ctx));
  }

  if (op === 'OR') {
    const args = asArgs(e.args, op);
    return args.some((a) => evaluateCondition(a, ctx));
  }

  if (op === 'NOT') {
    if (!e.arg) throw new ValidationError('NOT requires "arg"', { expr });
    return !evaluateCondition(e.arg, ctx);
  }

  throw new ValidationError(`Unsupported condition op: ${op}`, { expr });
}

function asArgs(v: unknown, op: string): unknown[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new ValidationError(`${op} requires non-empty "args" array`);
  }
  return v;
}

function readField(ctx: Record<string, unknown>, field: unknown): unknown {
  if (typeof field !== 'string') {
    throw new ValidationError('condition_json comparison missing "field"');
  }
  // Dotted path support: "a.b.c". Keep this minimal — no array indexing for now.
  const parts = field.split('.');
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case '==': return deepEqual(left, right);
    case '!=': return !deepEqual(left, right);
    case '<':  return numericCompare(left, right) < 0;
    case '<=': return numericCompare(left, right) <= 0;
    case '>':  return numericCompare(left, right) > 0;
    case '>=': return numericCompare(left, right) >= 0;
    default: throw new ValidationError(`Unsupported compare op: ${op}`);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return false;
  if (typeof a === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

function numericCompare(a: unknown, b: unknown): number {
  // Reject non-numeric comparisons so workflow authors don't get silent NaN
  // surprises when comparing strings.
  const ax = typeof a === 'string' ? Number(a) : a;
  const bx = typeof b === 'string' ? Number(b) : b;
  if (typeof ax !== 'number' || Number.isNaN(ax) || typeof bx !== 'number' || Number.isNaN(bx)) {
    throw new ValidationError('Numeric comparison requires numbers on both sides', {
      left: a,
      right: b,
    });
  }
  return ax - bx;
}

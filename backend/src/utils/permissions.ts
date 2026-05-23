/**
 * Field- and data-filter helpers used by routes that have run requirePermission.
 *
 * filterFields:  applies the per-field visibility rules to a response object
 *                or array. Hidden fields are deleted; readonly fields are
 *                preserved as-is and reported via the `_readonly` array (the
 *                client renders disabled inputs against that list).
 *
 * applyDataFilter: extends a Prisma where clause with the row-level scope
 *                that the resolver returned. Each filter type is a one-liner
 *                — the heavy lifting was decided in the resolver.
 */
import type { DataFilter, FieldRestriction } from '../services/permissions';

interface FilteredRow {
  _readonly?: string[];
  [k: string]: unknown;
}

/**
 * Drop hidden fields and tag readonly ones. Mutation-safe: returns a fresh
 * shallow copy; nested objects are NOT recursively walked (callers handle
 * nested permission shaping themselves where needed).
 */
export function filterFields<T extends Record<string, unknown>>(
  row: T,
  restrictions: FieldRestriction[],
): FilteredRow {
  if (restrictions.length === 0) return { ...row };
  const out: FilteredRow = { ...row };
  const readonly: string[] = [];

  for (const r of restrictions) {
    if (r.visibility === 'hidden') {
      delete out[r.fieldCode];
    } else if (r.visibility === 'readonly') {
      readonly.push(r.fieldCode);
    }
  }
  if (readonly.length > 0) out._readonly = readonly;
  return out;
}

export function filterFieldsList<T extends Record<string, unknown>>(
  rows: T[],
  restrictions: FieldRestriction[],
): FilteredRow[] {
  return rows.map((r) => filterFields(r, restrictions));
}

/**
 * Returns a Prisma where fragment to merge with whatever the route already
 * has. Caller is responsible for AND-ing it: `where: { AND: [base, scope] }`.
 *
 * Columns referenced:
 *   own_records      → createdById
 *   own_branch       → branchId
 *   own_department   → departmentId
 *
 * If the user's principal lacks the field that a filter needs (e.g.
 * own_branch but no branchId on the user), we fall back to "deny everything"
 * by using an impossible predicate (`id: { equals: '__no_match__' }`) — this
 * is safer than silently widening to all rows.
 */
export interface ScopePrincipal {
  userId: string;
  branchId: string | null;
  departmentId: string | null;
}

export function applyDataFilter(
  filter: DataFilter,
  principal: ScopePrincipal,
): Record<string, unknown> {
  switch (filter.type) {
    case 'all':
      return {};
    case 'own_records':
      return { createdById: principal.userId };
    case 'own_branch':
      return principal.branchId
        ? { branchId: principal.branchId }
        : denyAll();
    case 'own_department':
      return principal.departmentId
        ? { departmentId: principal.departmentId }
        : denyAll();
    case 'custom':
      return filter.where;
    default:
      return denyAll();
  }
}

function denyAll(): Record<string, unknown> {
  // Predicate that no row will match.
  return { id: { equals: '__rbac_no_match__' } };
}

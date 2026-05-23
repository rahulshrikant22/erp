/**
 * RBAC middleware — replaces the P0-03 stub now that the resolver is real.
 *
 *   requirePermission(moduleCode, feature, action, opts?)
 *
 * Wraps requireInternal under the hood, calls the resolver against
 * req.user.id, and on allow attaches:
 *   req.permissionContext = { dataFilter, fieldRestrictions }
 * On deny it throws ForbiddenError with the resolver's reason in details.
 *
 * Customer-portal routes use requireCustomer + a separate policy module
 * later; this middleware is for internal users only (the resolver itself
 * also assumes a User row, not a CustomerUser).
 */
import type { RequestHandler } from 'express';
import { ForbiddenError, AuthError } from '../errors';
import { resolvePermission, type DataFilter, type FieldRestriction } from '../services/permissions';

export interface PermissionRequestContext {
  dataFilter: DataFilter;
  fieldRestrictions: FieldRestriction[];
}

declare module 'express-serve-static-core' {
  interface Request {
    permissionContext?: PermissionRequestContext;
  }
}

export interface RequirePermissionOptions {
  /** When set, field restrictions for that targetEntity are computed and attached. */
  targetEntity?: string;
}

export function requirePermission(
  moduleCode: string,
  feature: string,
  action: string,
  opts: RequirePermissionOptions = {},
): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        throw new AuthError('Authentication required before permission check');
      }
      if (req.user.userType !== 'internal') {
        throw new ForbiddenError('Internal user required for this resource');
      }
      const result = await resolvePermission({
        userId: req.user.id,
        moduleCode,
        feature,
        action,
        targetEntity: opts.targetEntity,
      });
      if (!result.allowed) {
        throw new ForbiddenError('Permission denied', {
          required: `${moduleCode}:${feature}:${action}`,
          reason: result.reason,
        });
      }
      req.permissionContext = {
        dataFilter: result.dataFilter ?? { type: 'all' },
        fieldRestrictions: result.fieldRestrictions ?? [],
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

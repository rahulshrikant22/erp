/**
 * Admin-side user management — CRUD + lifecycle + role assignment + import.
 *
 * Login / password change for end-users themselves stays on the auth routes
 * (P0-05). This module is only for admins acting on other accounts.
 *
 * Conventions:
 *   - Created users get a strong random temp password and `mustChangePassword`
 *     flag set; a password reset email goes out so they set their own pw on
 *     first contact. The temp pw is never returned to the caller.
 *   - Soft delete only (P0-04 schema). Two guards: cannot delete your own
 *     account, cannot delete the last super_admin.
 *   - Every mutation runs under the audit context already established by
 *     the request middleware, so audit_logs gets the actor automatically.
 *   - Role changes invalidate the target user's RBAC cache.
 */
import { randomBytes } from 'node:crypto';
import { parse as parseCsv } from 'csv-parse/sync';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { rawPrisma } from '../lib/prisma-base';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { hashPassword } from './password';
import { forgotPassword } from './auth';
import { invalidateUser as invalidateUserPermissions } from './permissions';
import { sendTemplate } from './communication/email-service';
import { logger } from '../utils/logger';
import { config } from '../config';

// -- types ---------------------------------------------------------------

export interface UserSummary {
  id: string;
  email: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: { roleCode: string; name: string }[];
}

export interface UserDetail extends UserSummary {
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  activeSessionsCount: number;
}

interface ListFilters {
  search?: string;
  branchId?: string;
  departmentId?: string;
  roleId?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

// -- helpers -------------------------------------------------------------

function publicSummary(u: {
  id: string;
  email: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  isActive: boolean;
  isLocked: boolean;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  userRoles: { role: { roleCode: string; name: string } }[];
}): UserSummary {
  return {
    id: u.id,
    email: u.email,
    employeeCode: u.employeeCode,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    branchId: u.branchId,
    departmentId: u.departmentId,
    designationId: u.designationId,
    isActive: u.isActive,
    isLocked: u.isLocked,
    lockedUntil: u.lockedUntil,
    lastLoginAt: u.lastLoginAt,
    isDeleted: u.isDeleted,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    roles: u.userRoles.map((ur) => ({ roleCode: ur.role.roleCode, name: ur.role.name })),
  };
}

function generateTempPassword(): string {
  // 24 char password covering all four classes — passes the same policy as
  // user-set passwords, since admins may run with breach checks on.
  // Alphabet picked to skip ambiguous chars (O/0, I/l, 1).
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digit = '23456789';
  const symbol = '!#%*+-=?@';
  const all = upper + lower + digit + symbol;

  function pick(pool: string): string {
    const b = randomBytes(1)[0];
    return pool[b % pool.length];
  }

  // Guarantee one of each class, then fill to length 24.
  const out: string[] = [pick(upper), pick(upper), pick(lower), pick(lower), pick(digit), pick(symbol)];
  while (out.length < 24) out.push(pick(all));
  // Fisher-Yates shuffle
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

async function isLastSuperAdmin(userId: string): Promise<boolean> {
  const role = await rawPrisma.role.findUnique({
    where: { roleCode: 'super_admin' },
    select: { id: true },
  });
  if (!role) return false;
  const count = await rawPrisma.userRole.count({
    where: {
      roleId: role.id,
      isActive: true,
      user: { isActive: true, isDeleted: false },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (count > 1) return false;
  // count === 1 — check whether it's the user we want to remove.
  const onlyOne = await rawPrisma.userRole.findFirst({
    where: {
      roleId: role.id,
      isActive: true,
      user: { isActive: true, isDeleted: false },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { userId: true },
  });
  return onlyOne?.userId === userId;
}

// -- create -------------------------------------------------------------

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  phone?: string;
  branchId?: string;
  departmentId?: string;
  designationId?: string;
  roleCodes?: string[];
}

export interface CreateUserResult {
  user: UserSummary;
  /** Reset URL — only present in non-prod for ergonomics; use the email otherwise. */
  resetUrl: string | null;
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const email = input.email.toLowerCase().trim();

  // Conflict checks before we hash a temp pw.
  const existingByEmail = await prisma.user.findUnique({ where: { email } });
  if (existingByEmail) {
    throw new ConflictError('A user with this email already exists', { field: 'email' });
  }
  if (input.employeeCode) {
    const existingByCode = await prisma.user.findUnique({
      where: { employeeCode: input.employeeCode },
    });
    if (existingByCode) {
      throw new ConflictError('A user with this employee code already exists', {
        field: 'employeeCode',
      });
    }
  }

  // Resolve role codes → ids up front so we fail fast on a typo.
  let roleIds: string[] = [];
  if (input.roleCodes && input.roleCodes.length > 0) {
    const roles = await prisma.role.findMany({
      where: { roleCode: { in: input.roleCodes } },
      select: { id: true, roleCode: true },
    });
    const found = new Set(roles.map((r) => r.roleCode));
    const missing = input.roleCodes.filter((rc) => !found.has(rc));
    if (missing.length > 0) {
      throw new ValidationError('Unknown role codes', { missing });
    }
    roleIds = roles.map((r) => r.id);
  }

  const tempPw = generateTempPassword();
  const passwordHash = await hashPassword(tempPw);

  const user = await prisma.user.create({
    data: {
      email,
      employeeCode: input.employeeCode,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      branchId: input.branchId,
      departmentId: input.departmentId,
      designationId: input.designationId,
      passwordHash,
      passwordChangedAt: null,
      mustChangePassword: true,
      userType: 'internal',
      isActive: true,
    },
  });
  await prisma.userPasswordHistory.create({
    data: { userId: user.id, passwordHash },
  });

  for (const roleId of roleIds) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId, isActive: true },
    });
  }

  // Welcome flow: trigger the standard reset machinery so the user picks
  // their own password, then send a `welcome_user` template instead of the
  // generic reset email. forgotPassword has already enqueued its own
  // password_reset email — that's a known double-send for now; the next
  // refactor (P0-19 onboarding work) will let createUser opt out.
  const fp = await forgotPassword(email);

  if (fp.resetUrl) {
    await sendTemplate({
      to: email,
      templateCode: 'welcome_user',
      notificationType: 'welcome_user',
      recipientUserId: user.id,
      variables: {
        firstName: input.firstName,
        orgName: 'Modular Furniture ERP',
        resetUrl: fp.resetUrl,
        ttlMinutes: config.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES,
      },
    }).catch((err) => {
      logger.warn(
        { err, userId: user.id },
        'welcome_user template send failed; reset URL is still valid',
      );
    });
  }

  const refetched = await loadFull(user.id);
  return { user: publicSummary(refetched), resetUrl: fp.resetUrl };
}

// -- list / get ---------------------------------------------------------

async function loadFull(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true }, where: { isActive: true } } },
  });
  if (!u) throw new NotFoundError('User not found');
  return u;
}

export async function getUser(userId: string): Promise<UserDetail> {
  const u = await loadFull(userId);
  const sessions = await prisma.userSession.count({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  const summary = publicSummary(u);
  return {
    ...summary,
    mustChangePassword: u.mustChangePassword,
    twoFactorEnabled: u.twoFactorEnabled,
    activeSessionsCount: sessions,
  };
}

export async function listUsers(filters: ListFilters): Promise<{
  total: number;
  page: number;
  limit: number;
  users: UserSummary[];
}> {
  const where: Prisma.UserWhereInput = {
    isDeleted: false,
    ...(filters.search
      ? {
          OR: [
            { email: { contains: filters.search, mode: 'insensitive' } },
            { firstName: { contains: filters.search, mode: 'insensitive' } },
            { lastName: { contains: filters.search, mode: 'insensitive' } },
            { employeeCode: { contains: filters.search, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.roleId
      ? {
          userRoles: {
            some: { roleId: filters.roleId, isActive: true },
          },
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { userRoles: { include: { role: true }, where: { isActive: true } } },
      orderBy: [{ createdAt: 'desc' }],
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return {
    total,
    page: filters.page,
    limit: filters.limit,
    users: rows.map(publicSummary),
  };
}

// -- update / lifecycle -------------------------------------------------

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  designationId?: string | null;
  isActive?: boolean;
}

export async function updateUser(userId: string, input: UpdateUserInput): Promise<UserSummary> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError('User not found');
  if (u.isDeleted) {
    throw new ConflictError('Cannot update a deleted user; reactivate first');
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.designationId !== undefined ? { designationId: input.designationId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
  return publicSummary(await loadFull(userId));
}

export interface SoftDeleteArgs {
  userId: string;
  actorUserId: string;
}

export async function softDeleteUser(args: SoftDeleteArgs): Promise<void> {
  if (args.userId === args.actorUserId) {
    throw new ConflictError('You cannot delete your own account');
  }
  const u = await prisma.user.findUnique({ where: { id: args.userId } });
  if (!u) throw new NotFoundError('User not found');
  if (u.isDeleted) return; // idempotent

  if (await isLastSuperAdmin(args.userId)) {
    throw new ConflictError(
      'Cannot delete the last active super_admin; promote another user first',
    );
  }

  await prisma.user.update({
    where: { id: args.userId },
    data: {
      isDeleted: true,
      isActive: false,
      deletedAt: new Date(),
      deletedById: args.actorUserId,
    },
  });
  // Revoke all active sessions immediately.
  await rawPrisma.userSession.updateMany({
    where: { userId: args.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  invalidateUserPermissions(args.userId);
}

export async function reactivateUser(userId: string): Promise<UserSummary> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError('User not found');
  if (!u.isDeleted && u.isActive) return publicSummary(await loadFull(userId));
  await prisma.user.update({
    where: { id: userId },
    data: {
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      isActive: true,
    },
  });
  invalidateUserPermissions(userId);
  return publicSummary(await loadFull(userId));
}

export async function lockUser(args: {
  userId: string;
  durationMinutes?: number;
  reason?: string;
}): Promise<UserSummary> {
  const u = await prisma.user.findUnique({ where: { id: args.userId } });
  if (!u) throw new NotFoundError('User not found');
  const lockedUntil = args.durationMinutes
    ? new Date(Date.now() + args.durationMinutes * 60 * 1000)
    : null; // null = manual unlock
  await prisma.user.update({
    where: { id: args.userId },
    data: { isLocked: true, lockedUntil },
  });
  await rawPrisma.userSession.updateMany({
    where: { userId: args.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  invalidateUserPermissions(args.userId);
  void args.reason; // future: audit reason
  return publicSummary(await loadFull(args.userId));
}

export async function unlockUser(userId: string): Promise<UserSummary> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError('User not found');
  await prisma.user.update({
    where: { id: userId },
    data: { isLocked: false, lockedUntil: null },
  });
  invalidateUserPermissions(userId);
  return publicSummary(await loadFull(userId));
}

export async function adminResetPassword(userId: string): Promise<{ resetUrl: string | null }> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError('User not found');
  if (u.isDeleted) throw new ConflictError('Cannot reset password for a deleted user');
  const r = await forgotPassword(u.email);
  return { resetUrl: r.resetUrl };
}

export async function forceLogout(userId: string): Promise<{ revokedCount: number }> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError('User not found');
  const r = await rawPrisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  invalidateUserPermissions(userId);
  return { revokedCount: r.count };
}

export async function assignRoles(args: {
  userId: string;
  roleCodes: string[];
}): Promise<UserSummary> {
  const u = await prisma.user.findUnique({ where: { id: args.userId } });
  if (!u) throw new NotFoundError('User not found');

  const roles = await prisma.role.findMany({
    where: { roleCode: { in: args.roleCodes } },
    select: { id: true, roleCode: true },
  });
  const found = new Set(roles.map((r) => r.roleCode));
  const missing = args.roleCodes.filter((rc) => !found.has(rc));
  if (missing.length > 0) {
    throw new ValidationError('Unknown role codes', { missing });
  }

  const desiredRoleIds = new Set(roles.map((r) => r.id));
  const existing = await prisma.userRole.findMany({
    where: { userId: args.userId },
    select: { id: true, roleId: true },
  });

  const toRemove = existing.filter((e) => !desiredRoleIds.has(e.roleId)).map((e) => e.id);
  if (toRemove.length > 0) {
    await rawPrisma.userRole.deleteMany({ where: { id: { in: toRemove } } });
  }
  for (const r of roles) {
    if (!existing.some((e) => e.roleId === r.id)) {
      await prisma.userRole.create({
        data: { userId: args.userId, roleId: r.id, isActive: true },
      });
    }
  }
  invalidateUserPermissions(args.userId);
  return publicSummary(await loadFull(args.userId));
}

// -- audit trail accessor ----------------------------------------------

export async function getUserAuditTrail(userId: string, limit = 100): Promise<{
  logs: { id: string; action: string; entityType: string; entityId: string | null; changesSummary: string | null; actionAt: Date }[];
}> {
  // Two angles: actions performed BY this user (actorUserId), or actions
  // performed ON this user (entityType=User & entityId=userId).
  const rows = await rawPrisma.auditLog.findMany({
    where: {
      OR: [
        { actorUserId: userId },
        { entityType: 'User', entityId: userId },
      ],
    },
    orderBy: { actionAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      changesSummary: true,
      actionAt: true,
    },
  });
  return { logs: rows };
}

// -- CSV import --------------------------------------------------------

export interface CsvImportRowResult {
  row: number;
  email?: string;
  status: 'created' | 'failed';
  error?: string;
}

export async function importUsersCsv(csvBuffer: Buffer | string): Promise<{
  total: number;
  created: number;
  failed: number;
  results: CsvImportRowResult[];
}> {
  let records: Record<string, string>[];
  try {
    records = parseCsv(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new ValidationError('CSV parse failed', { error: (err as Error).message });
  }

  const results: CsvImportRowResult[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    try {
      if (!r.email) {
        results.push({ row: rowNumber, status: 'failed', error: 'email required' });
        continue;
      }
      const created = await createUser({
        email: r.email,
        firstName: r.first_name ?? r.firstName ?? '',
        lastName: r.last_name ?? r.lastName ?? '',
        employeeCode: r.employee_code ?? r.employeeCode ?? undefined,
        phone: r.phone ?? undefined,
        roleCodes: (r.role_codes ?? r.roleCodes ?? '')
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      results.push({ row: rowNumber, email: created.user.email, status: 'created' });
    } catch (err) {
      results.push({
        row: rowNumber,
        email: r.email,
        status: 'failed',
        error: (err as Error).message,
      });
    }
  }

  return {
    total: records.length,
    created: results.filter((r) => r.status === 'created').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
}

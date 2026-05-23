/**
 * Customer portal service — accounts, users, signup requests.
 *
 * Admin-facing operations (CRUD on accounts/users, signup approval)
 * and public operations (submit signup request).
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { hashPassword } from './password';
import { logger } from '../utils/logger';
import { sendTemplate } from './communication/email-service';

// -- Customer Account CRUD --------------------------------------------------

export interface CustomerAccountFilter {
  accountType?: string;
  isActive?: boolean;
  isVerified?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listCustomerAccounts(filter: CustomerAccountFilter) {
  const where: any = { isDeleted: false };
  if (filter.accountType) where.accountType = filter.accountType;
  if (filter.isActive !== undefined) where.isActive = filter.isActive;
  if (filter.isVerified !== undefined) where.isVerified = filter.isVerified;
  if (filter.search) {
    where.OR = [
      { companyName: { contains: filter.search, mode: 'insensitive' } },
      { primaryEmail: { contains: filter.search, mode: 'insensitive' } },
      { accountCode: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [accounts, total] = await Promise.all([
    prisma.customerAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: { _count: { select: { users: true } } },
    }),
    prisma.customerAccount.count({ where }),
  ]);

  return { accounts, total, page, limit };
}

export interface CreateAccountInput {
  companyName: string;
  primaryContactName?: string;
  primaryEmail: string;
  primaryPhone?: string;
  accountType: string;
  gstin?: string;
  pan?: string;
  createdById?: string;
}

export async function createCustomerAccount(input: CreateAccountInput) {
  const code = `CUST-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

  return prisma.customerAccount.create({
    data: {
      accountCode: code,
      companyName: input.companyName,
      primaryContactName: input.primaryContactName ?? null,
      primaryEmail: input.primaryEmail.toLowerCase().trim(),
      primaryPhone: input.primaryPhone ?? null,
      accountType: input.accountType,
      gstin: input.gstin ?? null,
      pan: input.pan ?? null,
      isActive: true,
      isVerified: true,
      verifiedAt: new Date(),
      createdById: input.createdById ?? null,
    },
  });
}

export async function updateCustomerAccount(
  id: string,
  data: Partial<{
    companyName: string;
    primaryContactName: string;
    primaryEmail: string;
    primaryPhone: string;
    accountType: string;
    gstin: string;
    pan: string;
    updatedById: string;
  }>,
) {
  const account = await prisma.customerAccount.findUnique({ where: { id } });
  if (!account || account.isDeleted) throw new NotFoundError('Customer account not found');

  return prisma.customerAccount.update({ where: { id }, data: data as any });
}

export async function deleteCustomerAccount(id: string, deletedById: string) {
  const account = await prisma.customerAccount.findUnique({ where: { id } });
  if (!account || account.isDeleted) throw new NotFoundError('Customer account not found');

  return prisma.customerAccount.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedById, isActive: false },
  });
}

export async function activateCustomerAccount(id: string) {
  const account = await prisma.customerAccount.findUnique({ where: { id } });
  if (!account || account.isDeleted) throw new NotFoundError('Customer account not found');
  if (account.isActive) throw new ValidationError('Account is already active');

  return prisma.customerAccount.update({
    where: { id },
    data: { isActive: true },
  });
}

export async function deactivateCustomerAccount(id: string) {
  const account = await prisma.customerAccount.findUnique({ where: { id } });
  if (!account || account.isDeleted) throw new NotFoundError('Customer account not found');
  if (!account.isActive) throw new ValidationError('Account is already inactive');

  return prisma.customerAccount.update({
    where: { id },
    data: { isActive: false },
  });
}

// -- Customer Users (within an account) ------------------------------------

export async function listAccountUsers(accountId: string) {
  const account = await prisma.customerAccount.findUnique({ where: { id: accountId } });
  if (!account || account.isDeleted) throw new NotFoundError('Customer account not found');

  return prisma.customerUser.findMany({
    where: { customerAccountId: accountId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export interface CreateAccountUserInput {
  accountId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: string;
  password: string;
  createdById?: string;
}

export async function createAccountUser(input: CreateAccountUserInput) {
  const account = await prisma.customerAccount.findUnique({ where: { id: input.accountId } });
  if (!account || account.isDeleted) throw new NotFoundError('Customer account not found');

  const email = input.email.toLowerCase().trim();
  const existing = await prisma.customerUser.findFirst({
    where: { customerAccountId: input.accountId, email },
  });
  if (existing) throw new ValidationError('A user with this email already exists in this account');

  const passwordHash = await hashPassword(input.password);

  return prisma.customerUser.create({
    data: {
      customerAccountId: input.accountId,
      email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      role: input.role ?? 'regular',
      isActive: true,
      createdById: input.createdById ?? null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function updateCustomerUser(
  userId: string,
  data: Partial<{
    firstName: string;
    lastName: string;
    phone: string;
    updatedById: string;
  }>,
) {
  const user = await prisma.customerUser.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Customer user not found');

  return prisma.customerUser.update({
    where: { id: userId },
    data: data as any,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      role: true,
      isActive: true,
    },
  });
}

// -- Signup requests --------------------------------------------------------

export interface SignupRequestInput {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  accountType: string;
  businessProofUrl?: string;
}

export async function submitSignupRequest(input: SignupRequestInput) {
  const email = input.email.toLowerCase().trim();

  const existing = await prisma.customerSignupRequest.findFirst({
    where: { email, status: 'pending' },
  });
  if (existing) {
    throw new ValidationError('A signup request with this email is already pending');
  }

  const request = await prisma.customerSignupRequest.create({
    data: {
      companyName: input.companyName,
      contactName: input.contactName,
      email,
      phone: input.phone ?? null,
      accountType: input.accountType,
      businessProofUrl: input.businessProofUrl ?? null,
      status: 'pending',
    },
  });

  logger.info({ requestId: request.id, email }, 'New customer signup request submitted');
  return request;
}

export interface SignupRequestFilter {
  status?: string;
  page?: number;
  limit?: number;
}

export async function listSignupRequests(filter: SignupRequestFilter) {
  const where: any = {};
  if (filter.status) where.status = filter.status;

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [requests, total] = await Promise.all([
    prisma.customerSignupRequest.findMany({
      where,
      orderBy: { submittedAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.customerSignupRequest.count({ where }),
  ]);

  return { requests, total, page, limit };
}

export async function approveSignupRequest(requestId: string, reviewedById: string) {
  const req = await prisma.customerSignupRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundError('Signup request not found');
  if (req.status !== 'pending') {
    throw new ValidationError(`Request is already ${req.status}`);
  }

  const accountCode = `CUST-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const tempPassword = randomUUID().slice(0, 12);
  const passwordHash = await hashPassword(tempPassword);

  const [account] = await prisma.$transaction([
    prisma.customerAccount.create({
      data: {
        accountCode,
        companyName: req.companyName,
        primaryContactName: req.contactName,
        primaryEmail: req.email,
        primaryPhone: req.phone,
        accountType: req.accountType,
        isActive: true,
        isVerified: true,
        verifiedAt: new Date(),
        signupRequestId: req.id,
        createdById: reviewedById,
      },
    }),
    prisma.customerSignupRequest.update({
      where: { id: requestId },
      data: { status: 'approved', reviewedById, reviewedAt: new Date() },
    }),
  ]);

  const nameParts = req.contactName.split(' ');
  const firstName = nameParts[0] ?? req.contactName;
  const lastName = nameParts.slice(1).join(' ') || 'User';

  const user = await prisma.customerUser.create({
    data: {
      customerAccountId: account.id,
      email: req.email,
      passwordHash,
      firstName,
      lastName,
      phone: req.phone,
      role: 'admin',
      isActive: true,
      createdById: reviewedById,
    },
  });

  // Send welcome email (best-effort)
  await sendTemplate({
    to: req.email,
    templateCode: 'customer_welcome',
    notificationType: 'customer_welcome',
    recipientUserId: user.id,
    variables: {
      firstName,
      companyName: req.companyName,
      email: req.email,
      tempPassword,
      loginUrl: `${(await import('../config')).config.env.FRONTEND_URL}/portal/login`,
    },
  }).catch((err) => {
    logger.warn({ err, email: req.email }, 'Welcome email send failed');
  });

  return {
    account,
    user: { id: user.id, email: user.email, firstName, lastName },
    tempPassword,
  };
}

export async function rejectSignupRequest(
  requestId: string,
  reviewedById: string,
  reviewNotes?: string,
) {
  const req = await prisma.customerSignupRequest.findUnique({ where: { id: requestId } });
  if (!req) throw new NotFoundError('Signup request not found');
  if (req.status !== 'pending') {
    throw new ValidationError(`Request is already ${req.status}`);
  }

  await prisma.customerSignupRequest.update({
    where: { id: requestId },
    data: {
      status: 'rejected',
      reviewedById,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes ?? null,
    },
  });

  // Send rejection email (best-effort)
  await sendTemplate({
    to: req.email,
    templateCode: 'signup_rejected',
    notificationType: 'signup_rejected',
    variables: {
      contactName: req.contactName,
      companyName: req.companyName,
      reason: reviewNotes ?? 'Your application did not meet our requirements at this time.',
    },
  }).catch((err) => {
    logger.warn({ err, email: req.email }, 'Rejection email send failed');
  });

  return { ok: true };
}

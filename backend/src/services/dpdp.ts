/**
 * DPDP (Digital Personal Data Protection) compliance service.
 *
 * Provides:
 *   - Consent capture and withdrawal
 *   - Data export requests
 *   - Data erasure requests (admin approval workflow)
 */
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { logger } from '../utils/logger';

export interface ConsentInput {
  userId?: string;
  customerUserId?: string;
  consentType: string;
  versionId?: string;
  consentMethod?: string;
  ipAddress?: string;
}

export async function captureConsent(input: ConsentInput) {
  if (!input.userId && !input.customerUserId) {
    throw new ValidationError('Either userId or customerUserId is required');
  }

  const consent = await prisma.dpdpConsent.create({
    data: {
      userId: input.userId ?? null,
      customerUserId: input.customerUserId ?? null,
      consentType: input.consentType,
      versionId: input.versionId ?? null,
      consentMethod: input.consentMethod ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });

  return consent;
}

export async function withdrawConsent(args: {
  userId?: string;
  customerUserId?: string;
  consentType: string;
  reason?: string;
}) {
  const where: any = {
    consentType: args.consentType,
    withdrawnAt: null,
  };
  if (args.userId) where.userId = args.userId;
  else if (args.customerUserId) where.customerUserId = args.customerUserId;
  else throw new ValidationError('Either userId or customerUserId is required');

  const consent = await prisma.dpdpConsent.findFirst({ where });
  if (!consent) {
    throw new NotFoundError('No active consent found for this type');
  }

  await prisma.dpdpConsent.update({
    where: { id: consent.id },
    data: {
      withdrawnAt: new Date(),
      withdrawalReason: args.reason ?? null,
    },
  });

  return { ok: true, consentId: consent.id };
}

export async function listConsents(args: {
  userId?: string;
  customerUserId?: string;
}) {
  const where: any = {};
  if (args.userId) where.userId = args.userId;
  else if (args.customerUserId) where.customerUserId = args.customerUserId;
  else throw new ValidationError('Either userId or customerUserId is required');

  return prisma.dpdpConsent.findMany({
    where,
    orderBy: { consentedAt: 'desc' },
  });
}

export async function requestDataExport(args: {
  requesterType: 'employee' | 'customer';
  requesterId: string;
}) {
  const existing = await prisma.dpdpDataRequest.findFirst({
    where: {
      requesterType: args.requesterType,
      requesterId: args.requesterId,
      requestType: 'export',
      status: { in: ['submitted', 'processing'] },
    },
  });
  if (existing) {
    throw new ValidationError('An export request is already in progress');
  }

  const request = await prisma.dpdpDataRequest.create({
    data: {
      requesterType: args.requesterType,
      requesterId: args.requesterId,
      requestType: 'export',
      status: 'submitted',
    },
  });

  logger.info(
    { requestId: request.id, requesterType: args.requesterType },
    'Data export request created',
  );

  return request;
}

export async function requestDataErasure(args: {
  requesterType: 'employee' | 'customer';
  requesterId: string;
}) {
  const existing = await prisma.dpdpDataRequest.findFirst({
    where: {
      requesterType: args.requesterType,
      requesterId: args.requesterId,
      requestType: 'erasure',
      status: { in: ['submitted', 'processing'] },
    },
  });
  if (existing) {
    throw new ValidationError('An erasure request is already in progress');
  }

  const request = await prisma.dpdpDataRequest.create({
    data: {
      requesterType: args.requesterType,
      requesterId: args.requesterId,
      requestType: 'erasure',
      status: 'submitted',
    },
  });

  logger.info(
    { requestId: request.id, requesterType: args.requesterType },
    'Data erasure request created — requires admin approval',
  );

  return request;
}

export async function listDataRequests(args: {
  requesterType?: string;
  requesterId?: string;
  status?: string;
  requestType?: string;
}) {
  const where: any = {};
  if (args.requesterType) where.requesterType = args.requesterType;
  if (args.requesterId) where.requesterId = args.requesterId;
  if (args.status) where.status = args.status;
  if (args.requestType) where.requestType = args.requestType;

  return prisma.dpdpDataRequest.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
  });
}

export async function processDataRequest(args: {
  requestId: string;
  processedById: string;
  action: 'approve' | 'reject';
  responseDataUrl?: string;
}) {
  const request = await prisma.dpdpDataRequest.findUnique({
    where: { id: args.requestId },
  });
  if (!request) throw new NotFoundError('Data request not found');
  if (request.status !== 'submitted') {
    throw new ValidationError(`Request is already ${request.status}`);
  }

  const status = args.action === 'approve' ? 'processing' : 'rejected';

  const updated = await prisma.dpdpDataRequest.update({
    where: { id: args.requestId },
    data: {
      status,
      processedAt: new Date(),
      processedById: args.processedById,
      responseDataUrl: args.responseDataUrl ?? null,
    },
  });

  return updated;
}

export async function completeDataRequest(args: {
  requestId: string;
  responseDataUrl?: string;
}) {
  const request = await prisma.dpdpDataRequest.findUnique({
    where: { id: args.requestId },
  });
  if (!request) throw new NotFoundError('Data request not found');
  if (request.status !== 'processing') {
    throw new ValidationError('Request must be in processing state');
  }

  return prisma.dpdpDataRequest.update({
    where: { id: args.requestId },
    data: {
      status: 'completed',
      processedAt: new Date(),
      responseDataUrl: args.responseDataUrl ?? request.responseDataUrl,
    },
  });
}

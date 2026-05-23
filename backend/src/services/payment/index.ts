/**
 * Payment service — orchestrates online/offline payments, verification, refunds.
 *
 * Uses the gateway abstraction (Razorpay primary, Log for tests) and persists
 * everything through PaymentTransaction / PaymentRefund models.
 */
import { randomUUID } from 'node:crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../lib/prisma';
import { AuthError, NotFoundError, ValidationError } from '../../errors';
import { logger } from '../../utils/logger';
import { createPaymentGateway } from './factory';
import type { IPaymentGateway } from './types';
import { verifyRazorpayWebhookSignature } from './razorpay';

function generateCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

async function getActiveGateway(): Promise<{ gateway: IPaymentGateway; gatewayId: string }> {
  const row = await prisma.paymentGateway.findFirst({
    where: { isActive: true, isPrimary: true },
  });
  if (!row) {
    // Fall back to any active gateway
    const fallback = await prisma.paymentGateway.findFirst({
      where: { isActive: true },
    });
    if (!fallback) throw new ValidationError('No active payment gateway configured');
    const gw = createPaymentGateway({
      gatewayCode: fallback.gatewayCode,
      configuration: fallback.configuration as Record<string, unknown>,
      isTestMode: fallback.isTestMode,
    });
    return { gateway: gw, gatewayId: fallback.id };
  }
  const gw = createPaymentGateway({
    gatewayCode: row.gatewayCode,
    configuration: row.configuration as Record<string, unknown>,
    isTestMode: row.isTestMode,
  });
  return { gateway: gw, gatewayId: row.id };
}

// -- Initiate online payment ------------------------------------------------

export interface InitiatePaymentInput {
  amount: number;
  currency?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdById?: string;
}

export interface InitiatePaymentResult {
  transactionId: string;
  transactionCode: string;
  gatewayOrderId: string;
  gatewayData?: Record<string, unknown>;
}

export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  if (input.amount <= 0) throw new ValidationError('Amount must be positive');

  const { gateway, gatewayId } = await getActiveGateway();
  const code = generateCode('TXN');

  const orderResult = await gateway.createOrder({
    amount: input.amount,
    currency: input.currency ?? 'INR',
    receipt: code,
    metadata: input.metadata,
  });

  const txn = await prisma.paymentTransaction.create({
    data: {
      transactionCode: code,
      gatewayId,
      paymentMode: 'online',
      amount: new Decimal(input.amount),
      currency: input.currency ?? 'INR',
      status: 'initiated',
      gatewayTransactionId: orderResult.gatewayOrderId,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
    },
  });

  return {
    transactionId: txn.id,
    transactionCode: txn.transactionCode,
    gatewayOrderId: orderResult.gatewayOrderId,
    gatewayData: orderResult.gatewayData,
  };
}

// -- Verify and capture (after frontend gateway success) --------------------

export interface VerifyPaymentInput {
  transactionId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

export async function verifyAndCapture(input: VerifyPaymentInput) {
  const txn = await prisma.paymentTransaction.findUnique({
    where: { id: input.transactionId },
    include: { gateway: true },
  });
  if (!txn) throw new NotFoundError('Transaction not found');
  if (txn.status !== 'initiated') {
    throw new ValidationError(`Transaction is already ${txn.status}`);
  }
  if (!txn.gateway) throw new ValidationError('Transaction has no gateway');

  const gw = createPaymentGateway({
    gatewayCode: txn.gateway.gatewayCode,
    configuration: txn.gateway.configuration as Record<string, unknown>,
    isTestMode: txn.gateway.isTestMode,
  });

  const result = await gw.verifyPayment({
    gatewayOrderId: txn.gatewayTransactionId!,
    gatewayPaymentId: input.gatewayPaymentId,
    gatewaySignature: input.gatewaySignature,
  });

  if (!result.verified) {
    await prisma.paymentTransaction.update({
      where: { id: txn.id },
      data: { status: 'failed' },
    });
    throw new AuthError('Payment verification failed');
  }

  const updated = await prisma.paymentTransaction.update({
    where: { id: txn.id },
    data: {
      status: 'success',
      gatewayPaymentId: input.gatewayPaymentId,
      completedAt: new Date(),
    },
  });

  return {
    transactionId: updated.id,
    transactionCode: updated.transactionCode,
    status: updated.status,
    amount: Number(updated.amount),
    completedAt: updated.completedAt?.toISOString(),
  };
}

// -- Offline payment recording ----------------------------------------------

export interface RecordOfflineInput {
  amount: number;
  currency?: string;
  paymentMode: 'bank_transfer' | 'cheque' | 'cash';
  utrNumber?: string;
  chequeNumber?: string;
  chequeDate?: string;
  payerName?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  notes?: string;
  createdById?: string;
}

export async function recordOfflinePayment(input: RecordOfflineInput) {
  if (input.amount <= 0) throw new ValidationError('Amount must be positive');
  if (input.paymentMode === 'bank_transfer' && !input.utrNumber) {
    throw new ValidationError('UTR number is required for bank transfers');
  }
  if (input.paymentMode === 'cheque' && !input.chequeNumber) {
    throw new ValidationError('Cheque number is required');
  }

  const code = generateCode('OFF');
  const txn = await prisma.paymentTransaction.create({
    data: {
      transactionCode: code,
      paymentMode: input.paymentMode,
      amount: new Decimal(input.amount),
      currency: input.currency ?? 'INR',
      status: 'pending',
      utrNumber: input.utrNumber ?? null,
      chequeNumber: input.chequeNumber ?? null,
      chequeDate: input.chequeDate ? new Date(input.chequeDate) : null,
      payerName: input.payerName ?? null,
      relatedEntityType: input.relatedEntityType ?? null,
      relatedEntityId: input.relatedEntityId ?? null,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
    },
  });

  return {
    transactionId: txn.id,
    transactionCode: txn.transactionCode,
    status: txn.status,
    paymentMode: txn.paymentMode,
    amount: Number(txn.amount),
  };
}

// -- Verify offline payment (admin confirms receipt) ------------------------

export async function verifyOfflinePayment(transactionId: string, verifiedById: string) {
  const txn = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!txn) throw new NotFoundError('Transaction not found');
  if (txn.paymentMode === 'online') {
    throw new ValidationError('Cannot manually verify an online payment');
  }
  if (txn.status !== 'pending') {
    throw new ValidationError(`Transaction is already ${txn.status}`);
  }

  const updated = await prisma.paymentTransaction.update({
    where: { id: transactionId },
    data: { status: 'success', completedAt: new Date(), updatedById: verifiedById },
  });

  return {
    transactionId: updated.id,
    transactionCode: updated.transactionCode,
    status: updated.status,
    completedAt: updated.completedAt?.toISOString(),
  };
}

// -- Reject offline payment -------------------------------------------------

export async function rejectPayment(transactionId: string, reason: string, rejectedById: string) {
  const txn = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
  if (!txn) throw new NotFoundError('Transaction not found');
  if (txn.status !== 'pending' && txn.status !== 'initiated') {
    throw new ValidationError(`Cannot reject a transaction with status "${txn.status}"`);
  }

  const updated = await prisma.paymentTransaction.update({
    where: { id: transactionId },
    data: { status: 'failed', notes: reason, updatedById: rejectedById },
  });

  return {
    transactionId: updated.id,
    transactionCode: updated.transactionCode,
    status: updated.status,
  };
}

// -- Refund -----------------------------------------------------------------

export interface RefundInput {
  transactionId: string;
  amount: number;
  reason?: string;
  createdById?: string;
}

export async function refundPayment(input: RefundInput) {
  const txn = await prisma.paymentTransaction.findUnique({
    where: { id: input.transactionId },
    include: { gateway: true, refunds: true },
  });
  if (!txn) throw new NotFoundError('Transaction not found');
  if (txn.status !== 'success') {
    throw new ValidationError('Can only refund successful transactions');
  }
  if (input.amount <= 0) throw new ValidationError('Refund amount must be positive');

  const totalRefunded = txn.refunds
    .filter((r) => r.status === 'success' || r.status === 'initiated')
    .reduce((sum, r) => sum + Number(r.amount), 0);

  if (totalRefunded + input.amount > Number(txn.amount)) {
    throw new ValidationError('Refund amount exceeds remaining refundable amount');
  }

  const refundCode = generateCode('RFD');
  let gatewayRefundId: string | null = null;
  let refundStatus = 'initiated';

  if (txn.paymentMode === 'online' && txn.gateway && txn.gatewayPaymentId) {
    const gw = createPaymentGateway({
      gatewayCode: txn.gateway.gatewayCode,
      configuration: txn.gateway.configuration as Record<string, unknown>,
      isTestMode: txn.gateway.isTestMode,
    });
    const result = await gw.refund({
      gatewayPaymentId: txn.gatewayPaymentId,
      amount: input.amount,
      reason: input.reason,
    });
    gatewayRefundId = result.refundId;
    refundStatus = result.status === 'processed' ? 'success' : 'initiated';
  } else {
    // Offline: mark as success immediately (manual reconciliation)
    refundStatus = 'success';
  }

  const refund = await prisma.paymentRefund.create({
    data: {
      refundCode,
      transactionId: txn.id,
      amount: new Decimal(input.amount),
      currency: txn.currency,
      reason: input.reason ?? null,
      status: refundStatus,
      gatewayRefundId,
      completedAt: refundStatus === 'success' ? new Date() : null,
      createdById: input.createdById ?? null,
    },
  });

  // If fully refunded, mark transaction as refunded
  const newTotal = totalRefunded + input.amount;
  if (newTotal >= Number(txn.amount)) {
    await prisma.paymentTransaction.update({
      where: { id: txn.id },
      data: { status: 'refunded' },
    });
  }

  return {
    refundId: refund.id,
    refundCode: refund.refundCode,
    status: refund.status,
    amount: Number(refund.amount),
    gatewayRefundId,
  };
}

// -- Razorpay webhook handler -----------------------------------------------

export async function handleRazorpayWebhook(rawBody: string, signature: string) {
  const gateway = await prisma.paymentGateway.findFirst({
    where: { gatewayCode: 'razorpay', isActive: true },
  });
  if (!gateway) {
    logger.warn('Razorpay webhook received but no active razorpay gateway');
    return { processed: false };
  }

  const cfg = gateway.configuration as Record<string, unknown>;
  const webhookSecret = cfg.webhookSecret as string | undefined;
  if (!webhookSecret) {
    logger.warn('Razorpay webhook received but no webhookSecret configured');
    return { processed: false };
  }

  const valid = verifyRazorpayWebhookSignature(rawBody, signature, webhookSecret);
  if (!valid) {
    logger.warn('Razorpay webhook signature verification failed');
    return { processed: false, reason: 'invalid_signature' };
  }

  const payload = JSON.parse(rawBody);
  const event = payload.event as string;

  if (event === 'payment.captured') {
    const payment = payload.payload?.payment?.entity;
    if (payment?.order_id) {
      const txn = await prisma.paymentTransaction.findFirst({
        where: { gatewayTransactionId: payment.order_id, status: 'initiated' },
      });
      if (txn) {
        await prisma.paymentTransaction.update({
          where: { id: txn.id },
          data: {
            status: 'success',
            gatewayPaymentId: payment.id,
            completedAt: new Date(),
          },
        });
        logger.info({ txnId: txn.id, event }, 'Razorpay webhook: payment captured');
      }
    }
  } else if (event === 'payment.failed') {
    const payment = payload.payload?.payment?.entity;
    if (payment?.order_id) {
      const txn = await prisma.paymentTransaction.findFirst({
        where: { gatewayTransactionId: payment.order_id, status: 'initiated' },
      });
      if (txn) {
        await prisma.paymentTransaction.update({
          where: { id: txn.id },
          data: { status: 'failed' },
        });
        logger.info({ txnId: txn.id, event }, 'Razorpay webhook: payment failed');
      }
    }
  } else if (event === 'refund.processed') {
    const refundEntity = payload.payload?.refund?.entity;
    if (refundEntity?.id) {
      const refund = await prisma.paymentRefund.findFirst({
        where: { gatewayRefundId: refundEntity.id, status: 'initiated' },
      });
      if (refund) {
        await prisma.paymentRefund.update({
          where: { id: refund.id },
          data: { status: 'success', completedAt: new Date() },
        });
      }
    }
  }

  return { processed: true, event };
}

// -- Admin: list transactions -----------------------------------------------

export interface TransactionFilter {
  status?: string;
  paymentMode?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  page?: number;
  limit?: number;
}

export async function listTransactions(filter: TransactionFilter) {
  const where: any = {};
  if (filter.status) where.status = filter.status;
  if (filter.paymentMode) where.paymentMode = filter.paymentMode;
  if (filter.relatedEntityType) where.relatedEntityType = filter.relatedEntityType;
  if (filter.relatedEntityId) where.relatedEntityId = filter.relatedEntityId;

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [transactions, total] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
      include: { gateway: { select: { gatewayCode: true, displayName: true } } },
    }),
    prisma.paymentTransaction.count({ where }),
  ]);

  return { transactions, total, page, limit };
}

export async function getTransaction(id: string) {
  const txn = await prisma.paymentTransaction.findUnique({
    where: { id },
    include: {
      gateway: { select: { gatewayCode: true, displayName: true } },
      refunds: true,
    },
  });
  if (!txn) throw new NotFoundError('Transaction not found');
  return txn;
}

// -- Admin: gateway CRUD ----------------------------------------------------

export async function listGateways() {
  return prisma.paymentGateway.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createGateway(data: {
  gatewayCode: string;
  displayName: string;
  configuration: Record<string, unknown>;
  isTestMode?: boolean;
  isPrimary?: boolean;
  createdById?: string;
}) {
  return prisma.paymentGateway.create({
    data: {
      gatewayCode: data.gatewayCode,
      displayName: data.displayName,
      configuration: data.configuration,
      isTestMode: data.isTestMode ?? true,
      isPrimary: data.isPrimary ?? false,
      createdById: data.createdById ?? null,
    },
  });
}

export async function updateGateway(
  id: string,
  data: Partial<{
    displayName: string;
    configuration: Record<string, unknown>;
    isTestMode: boolean;
    isPrimary: boolean;
    isActive: boolean;
    updatedById: string;
  }>,
) {
  const gw = await prisma.paymentGateway.findUnique({ where: { id } });
  if (!gw) throw new NotFoundError('Gateway not found');

  if (data.isPrimary) {
    await prisma.paymentGateway.updateMany({
      where: { isPrimary: true, id: { not: id } },
      data: { isPrimary: false },
    });
  }

  return prisma.paymentGateway.update({ where: { id }, data: data as any });
}

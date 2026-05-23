/**
 * Payment routes — online, offline, refund.
 *
 *   POST /api/payments/offline                  (auth)
 *   POST /api/payments/:id/verify-offline       (auth)
 *   POST /api/payments/:id/reject               (auth)
 *   POST /api/payments/online/initiate          (auth)
 *   POST /api/payments/online/verify            (auth)
 *   POST /api/payments/:id/refunds              (auth)
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  initiatePayment,
  recordOfflinePayment,
  refundPayment,
  rejectPayment,
  verifyAndCapture,
  verifyOfflinePayment,
} from '../services/payment';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireInternal } from '../middleware/auth';

const router = Router();

const offlineSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('INR'),
  paymentMode: z.enum(['bank_transfer', 'cheque', 'cash']),
  utrNumber: z.string().optional(),
  chequeNumber: z.string().optional(),
  chequeDate: z.string().optional(),
  payerName: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  notes: z.string().optional(),
});

const initiateSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().default('INR'),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const verifyOnlineSchema = z.object({
  transactionId: z.string().uuid(),
  gatewayPaymentId: z.string().min(1),
  gatewaySignature: z.string().min(1),
});

const refundSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1),
});

router.post('/offline', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, offlineSchema);
    const result = await recordOfflinePayment({
      ...input,
      createdById: req.user!.id,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/:id/verify-offline', requireInternal, async (req, res, next) => {
  try {
    const result = await verifyOfflinePayment(req.params.id, req.user!.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/:id/reject', requireInternal, async (req, res, next) => {
  try {
    const { reason } = parseBody(req, rejectSchema);
    const result = await rejectPayment(req.params.id, reason, req.user!.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/online/initiate', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, initiateSchema);
    const result = await initiatePayment({
      ...input,
      createdById: req.user!.id,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/online/verify', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, verifyOnlineSchema);
    const result = await verifyAndCapture(input);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/:id/refunds', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, refundSchema);
    const result = await refundPayment({
      transactionId: req.params.id,
      amount: input.amount,
      reason: input.reason,
      createdById: req.user!.id,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;

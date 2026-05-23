/**
 * Admin payment routes.
 *
 *   GET    /api/admin/payment-gateways
 *   POST   /api/admin/payment-gateways
 *   PUT    /api/admin/payment-gateways/:id
 *   GET    /api/admin/payment-transactions
 *   GET    /api/admin/payment-transactions/:id
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  createGateway,
  getTransaction,
  listGateways,
  listTransactions,
  updateGateway,
} from '../services/payment';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireInternal } from '../middleware/auth';

const router = Router();

const createGatewaySchema = z.object({
  gatewayCode: z.string().min(1),
  displayName: z.string().min(1),
  configuration: z.record(z.string(), z.unknown()),
  isTestMode: z.boolean().default(true),
  isPrimary: z.boolean().default(false),
});

const updateGatewaySchema = z.object({
  displayName: z.string().min(1).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  isTestMode: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

router.get('/payment-gateways', requireInternal, async (_req, res, next) => {
  try {
    const gateways = await listGateways();
    sendSuccess(res, { gateways });
  } catch (err) { next(err); }
});

router.post('/payment-gateways', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, createGatewaySchema);
    const gw = await createGateway({ ...input, createdById: req.user!.id });
    sendSuccess(res, gw, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/payment-gateways/:id', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, updateGatewaySchema);
    const gw = await updateGateway(req.params.id, { ...input, updatedById: req.user!.id });
    sendSuccess(res, gw);
  } catch (err) { next(err); }
});

router.get('/payment-transactions', requireInternal, async (req, res, next) => {
  try {
    const { status, paymentMode, relatedEntityType, relatedEntityId, page, limit } = req.query;
    const result = await listTransactions({
      status: status as string | undefined,
      paymentMode: paymentMode as string | undefined,
      relatedEntityType: relatedEntityType as string | undefined,
      relatedEntityId: relatedEntityId as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/payment-transactions/:id', requireInternal, async (req, res, next) => {
  try {
    const txn = await getTransaction(req.params.id);
    sendSuccess(res, txn);
  } catch (err) { next(err); }
});

export default router;

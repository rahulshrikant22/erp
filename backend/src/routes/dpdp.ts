/**
 * DPDP compliance routes.
 *
 *   POST /api/dpdp/consent              (auth required)
 *   GET  /api/dpdp/consents             (auth required)
 *   POST /api/dpdp/withdraw-consent     (auth required)
 *   POST /api/dpdp/export-request       (auth required)
 *   POST /api/dpdp/erasure-request      (auth required)
 *   GET  /api/dpdp/requests             (auth required)
 *   POST /api/dpdp/requests/:id/process (admin)
 *   POST /api/dpdp/requests/:id/complete (admin)
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  captureConsent,
  completeDataRequest,
  listConsents,
  listDataRequests,
  processDataRequest,
  requestDataErasure,
  requestDataExport,
  withdrawConsent,
} from '../services/dpdp';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireInternal } from '../middleware/auth';

const router = Router();

const consentSchema = z.object({
  consentType: z.string().min(1),
  versionId: z.string().optional(),
  consentMethod: z.string().optional(),
});

const withdrawSchema = z.object({
  consentType: z.string().min(1),
  reason: z.string().optional(),
});

const processSchema = z.object({
  action: z.enum(['approve', 'reject']),
  responseDataUrl: z.string().url().optional(),
});

const completeSchema = z.object({
  responseDataUrl: z.string().url().optional(),
});

router.post('/consent', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, consentSchema);
    const consent = await captureConsent({
      userId: req.user!.id,
      consentType: input.consentType,
      versionId: input.versionId,
      consentMethod: input.consentMethod ?? 'api',
      ipAddress: req.ip,
    });
    sendSuccess(res, consent);
  } catch (err) { next(err); }
});

router.get('/consents', requireInternal, async (req, res, next) => {
  try {
    const consents = await listConsents({ userId: req.user!.id });
    sendSuccess(res, { consents });
  } catch (err) { next(err); }
});

router.post('/withdraw-consent', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, withdrawSchema);
    const result = await withdrawConsent({
      userId: req.user!.id,
      consentType: input.consentType,
      reason: input.reason,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/export-request', requireInternal, async (req, res, next) => {
  try {
    const request = await requestDataExport({
      requesterType: 'employee',
      requesterId: req.user!.id,
    });
    sendSuccess(res, request);
  } catch (err) { next(err); }
});

router.post('/erasure-request', requireInternal, async (req, res, next) => {
  try {
    const request = await requestDataErasure({
      requesterType: 'employee',
      requesterId: req.user!.id,
    });
    sendSuccess(res, request);
  } catch (err) { next(err); }
});

router.get('/requests', requireInternal, async (req, res, next) => {
  try {
    const { status, requestType } = req.query;
    const requests = await listDataRequests({
      requesterType: 'employee',
      requesterId: req.user!.id,
      status: status as string | undefined,
      requestType: requestType as string | undefined,
    });
    sendSuccess(res, { requests });
  } catch (err) { next(err); }
});

router.post('/requests/:id/process', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, processSchema);
    const result = await processDataRequest({
      requestId: req.params.id,
      processedById: req.user!.id,
      action: input.action,
      responseDataUrl: input.responseDataUrl,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/requests/:id/complete', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, completeSchema);
    const result = await completeDataRequest({
      requestId: req.params.id,
      responseDataUrl: input.responseDataUrl,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;

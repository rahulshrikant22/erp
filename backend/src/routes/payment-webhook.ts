/**
 * Payment webhook route — Razorpay server-side notifications.
 *
 *   POST /api/webhooks/razorpay
 */
import { Router, type Request, type RequestHandler, type Response } from 'express';
import express from 'express';
import { handleRazorpayWebhook } from '../services/payment';

const router = Router();

// Razorpay sends JSON but we need the raw body for signature verification.
router.post(
  '/razorpay',
  express.raw({ type: 'application/json' }) as unknown as RequestHandler,
  async (req: Request, res: Response) => {
    try {
      const rawBody = typeof req.body === 'string'
        ? req.body
        : Buffer.isBuffer(req.body)
          ? req.body.toString('utf8')
          : JSON.stringify(req.body);

      const signature = req.headers['x-razorpay-signature'] as string ?? '';
      const result = await handleRazorpayWebhook(rawBody, signature);

      res.status(200).json({ success: true, data: result });
    } catch {
      res.status(200).json({ success: false, error: 'internal' });
    }
  },
);

export default router;

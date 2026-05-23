/**
 * Public signup request endpoint — no auth required.
 *
 *   POST /api/public/signup-request
 */
import { Router } from 'express';
import { z } from 'zod';
import { submitSignupRequest } from '../services/customer-portal';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { signupLimit } from '../middleware/rate-limit';

const router = Router();

const signupSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  accountType: z.enum(['architect', 'dealer', 'direct', 'corporate']),
  businessProofUrl: z.string().url().optional(),
});

router.post('/signup-request', signupLimit, async (req, res, next) => {
  try {
    const input = parseBody(req, signupSchema);
    await submitSignupRequest(input);
    sendSuccess(res, {
      message: 'Your signup request has been submitted. You will receive an email once reviewed.',
    });
  } catch (err) { next(err); }
});

export default router;

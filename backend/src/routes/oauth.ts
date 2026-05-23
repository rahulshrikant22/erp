/**
 * OAuth routes.
 *
 *   GET /api/auth/oauth/:provider/start     → returns redirect URL
 *   GET /api/auth/oauth/:provider/callback   → exchanges code, issues tokens
 */
import { Router } from 'express';
import { z } from 'zod';
import { handleOAuthCallback, isSupportedOAuthProvider, startOAuth } from '../services/oauth';
import { sendSuccess } from '../utils/response';
import { AuthError } from '../errors';

const router = Router();

const callbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

router.get('/:provider/start', async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!isSupportedOAuthProvider(provider)) {
      throw new AuthError(`Unsupported provider: ${provider}`);
    }
    const result = await startOAuth(provider);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

router.get('/:provider/callback', async (req, res, next) => {
  try {
    const { provider } = req.params;
    if (!isSupportedOAuthProvider(provider)) {
      throw new AuthError(`Unsupported provider: ${provider}`);
    }

    const query = callbackSchema.safeParse(req.query);
    if (!query.success) {
      throw new AuthError('Missing code or state parameter');
    }

    const result = await handleOAuthCallback(
      provider,
      query.data.code,
      req.ip,
      req.headers['user-agent'] ?? undefined,
    );

    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export default router;

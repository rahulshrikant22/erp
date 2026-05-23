/**
 * Rate limiting middleware — per-endpoint and global IP limits.
 *
 * Uses express-rate-limit with in-memory store. For multi-process
 * production deployments, swap to a Redis store (rate-limit-redis).
 *
 * Limits:
 *   - /api/auth/login:          5 per 15 min per IP
 *   - /api/auth/forgot-password: 3 per 15 min per IP
 *   - /api/portal/auth/signup:  3 per hour per IP
 *   - /api/* (general):         100 per minute per authenticated user (or IP)
 *   - Global:                   1000 per minute per IP
 */
import { type RequestHandler } from 'express';
import expressRateLimit from 'express-rate-limit';
import { config } from '../config';

const skip = config.isTest;

export const globalIpLimit = expressRateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skip,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: 'Too many requests from this IP' },
});

export const loginLimit = expressRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skip,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: 'Too many login attempts. Try again later.' },
});

export const forgotPasswordLimit = expressRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skip,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: 'Too many password reset requests. Try again later.' },
});

export const signupLimit = expressRateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skip,
  validate: { xForwardedForHeader: false },
  message: { success: false, error: 'Too many signup attempts. Try again later.' },
});

export const generalApiLimit = expressRateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skip,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? 'unknown',
  message: { success: false, error: 'Too many requests. Please slow down.' },
});

export const rateLimit: RequestHandler = globalIpLimit;

/**
 * Admin customer management routes.
 *
 *   GET    /api/admin/customer-accounts
 *   POST   /api/admin/customer-accounts
 *   PUT    /api/admin/customer-accounts/:id
 *   DELETE /api/admin/customer-accounts/:id
 *   POST   /api/admin/customer-accounts/:id/activate
 *   POST   /api/admin/customer-accounts/:id/deactivate
 *   GET    /api/admin/customer-accounts/:id/users
 *   POST   /api/admin/customer-accounts/:id/users
 *   GET    /api/admin/signup-requests
 *   POST   /api/admin/signup-requests/:id/approve
 *   POST   /api/admin/signup-requests/:id/reject
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  activateCustomerAccount,
  approveSignupRequest,
  createAccountUser,
  createCustomerAccount,
  deactivateCustomerAccount,
  deleteCustomerAccount,
  listAccountUsers,
  listCustomerAccounts,
  listSignupRequests,
  rejectSignupRequest,
  updateCustomerAccount,
} from '../services/customer-portal';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireInternal } from '../middleware/auth';

const router = Router();

const createAccountSchema = z.object({
  companyName: z.string().min(1),
  primaryContactName: z.string().optional(),
  primaryEmail: z.string().email(),
  primaryPhone: z.string().optional(),
  accountType: z.enum(['architect', 'dealer', 'direct', 'corporate']),
  gstin: z.string().optional(),
  pan: z.string().optional(),
});

const updateAccountSchema = z.object({
  companyName: z.string().min(1).optional(),
  primaryContactName: z.string().optional(),
  primaryEmail: z.string().email().optional(),
  primaryPhone: z.string().optional(),
  accountType: z.enum(['architect', 'dealer', 'direct', 'corporate']).optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
});

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['admin', 'regular']).default('regular'),
  password: z.string().min(8),
});

const rejectSchema = z.object({
  reviewNotes: z.string().optional(),
});

// -- Accounts ---------------------------------------------------------------

router.get('/customer-accounts', requireInternal, async (req, res, next) => {
  try {
    const { accountType, isActive, isVerified, search, page, limit } = req.query;
    const result = await listCustomerAccounts({
      accountType: accountType as string | undefined,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      isVerified: isVerified === 'true' ? true : isVerified === 'false' ? false : undefined,
      search: search as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/customer-accounts', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, createAccountSchema);
    const account = await createCustomerAccount({ ...input, createdById: req.user!.id });
    sendSuccess(res, account, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/customer-accounts/:id', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, updateAccountSchema);
    const account = await updateCustomerAccount(req.params.id, { ...input, updatedById: req.user!.id });
    sendSuccess(res, account);
  } catch (err) { next(err); }
});

router.delete('/customer-accounts/:id', requireInternal, async (req, res, next) => {
  try {
    await deleteCustomerAccount(req.params.id, req.user!.id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/customer-accounts/:id/activate', requireInternal, async (req, res, next) => {
  try {
    const account = await activateCustomerAccount(req.params.id);
    sendSuccess(res, account);
  } catch (err) { next(err); }
});

router.post('/customer-accounts/:id/deactivate', requireInternal, async (req, res, next) => {
  try {
    const account = await deactivateCustomerAccount(req.params.id);
    sendSuccess(res, account);
  } catch (err) { next(err); }
});

// -- Account Users ----------------------------------------------------------

router.get('/customer-accounts/:id/users', requireInternal, async (req, res, next) => {
  try {
    const users = await listAccountUsers(req.params.id);
    sendSuccess(res, { users });
  } catch (err) { next(err); }
});

router.post('/customer-accounts/:id/users', requireInternal, async (req, res, next) => {
  try {
    const input = parseBody(req, createUserSchema);
    const user = await createAccountUser({
      accountId: req.params.id,
      ...input,
      createdById: req.user!.id,
    });
    sendSuccess(res, user, { status: 201 });
  } catch (err) { next(err); }
});

// -- Signup Requests --------------------------------------------------------

router.get('/signup-requests', requireInternal, async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await listSignupRequests({
      status: status as string | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/signup-requests/:id/approve', requireInternal, async (req, res, next) => {
  try {
    const result = await approveSignupRequest(req.params.id, req.user!.id);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.post('/signup-requests/:id/reject', requireInternal, async (req, res, next) => {
  try {
    const { reviewNotes } = parseBody(req, rejectSchema);
    const result = await rejectSignupRequest(req.params.id, req.user!.id, reviewNotes);
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

export default router;

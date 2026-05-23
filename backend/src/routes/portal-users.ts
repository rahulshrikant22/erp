/**
 * Customer portal — user self-edit.
 *
 *   PUT /api/portal/customer-users/:id
 */
import { Router } from 'express';
import { z } from 'zod';
import { updateCustomerUser } from '../services/customer-portal';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import { requireCustomer } from '../middleware/auth';
import { AuthError } from '../errors';

const router = Router();

const updateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
});

router.put('/customer-users/:id', requireCustomer, async (req, res, next) => {
  try {
    if (req.params.id !== req.user!.id) {
      throw new AuthError('You can only edit your own profile');
    }
    const input = parseBody(req, updateSchema);
    const user = await updateCustomerUser(req.params.id, {
      ...input,
      updatedById: req.user!.id,
    });
    sendSuccess(res, user);
  } catch (err) { next(err); }
});

export default router;

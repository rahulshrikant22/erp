import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseParams } from '../utils/validate';
import {
  getOrderMaterialRequirements,
  getMaterialSupplyOverview,
  getVendorSupplyOverview,
  createSoftReservationsForOrder,
  releaseSoftReservationsForOrder,
} from '../services/phase3-integration';

const router = Router();

const ORDER_VIEW = requirePermission('ORDER', 'order', 'view');
const MAT_VIEW = requirePermission('MATERIAL', 'material', 'view');
const VENDOR_VIEW = requirePermission('VENDOR', 'vendor', 'view');
const INV_EDIT = requirePermission('INVENTORY', 'stock', 'edit');

const idParam = z.object({ id: z.string().uuid() });

router.get('/orders/:id/material-requirements', requireInternal, ORDER_VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const data = await getOrderMaterialRequirements(id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

router.get('/materials/:id/supply-overview', requireInternal, MAT_VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const data = await getMaterialSupplyOverview(id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

router.get('/vendors/:id/supply-overview', requireInternal, VENDOR_VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const data = await getVendorSupplyOverview(id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

router.post('/orders/:id/soft-reservations', requireInternal, INV_EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const data = await createSoftReservationsForOrder(id, req.user?.id);
    sendSuccess(res, data, { status: 201 });
  } catch (err) { next(err); }
});

router.post('/orders/:id/release-reservations', requireInternal, INV_EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const data = await releaseSoftReservationsForOrder(id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
});

export default router;

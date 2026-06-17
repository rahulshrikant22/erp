import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody } from '../utils/validate';
import {
  importVendorsFromCsv,
  importRateContractsFromCsv,
  importStockOpeningBalances,
} from '../services/vendor-import';

export const vendorImportRouter = Router();
export const stockImportRouter = Router();

const VENDOR_CREATE = requirePermission('VENDOR', 'vendor', 'create');
const INV_CREATE = requirePermission('INVENTORY', 'stock', 'create');

const vendorImportBody = z.object({
  rows: z.array(z.object({
    vendor_name: z.string().min(1),
    vendor_type: z.enum(['domestic', 'import']).optional(),
    gstin: z.string().optional(),
    primary_email: z.string().optional(),
    primary_phone: z.string().optional(),
    legal_name: z.string().optional(),
    pan: z.string().optional(),
    website: z.string().optional(),
    currency_code: z.string().optional(),
    credit_days: z.number().int().nonnegative().optional(),
  })),
});

vendorImportRouter.post('/import', requireInternal, VENDOR_CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, vendorImportBody);
    const result = await importVendorsFromCsv(body.rows, req.user?.id);
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

const rateContractImportBody = z.object({
  rows: z.array(z.object({
    vendor_code: z.string().min(1),
    material_code: z.string().min(1),
    manufacturer_code: z.string().optional(),
    unit_price: z.number().positive(),
    currency_code: z.string().optional(),
    uom: z.string().optional(),
    validity_from: z.string(),
    validity_until: z.string().optional(),
    is_preferred: z.boolean().optional(),
    notes: z.string().optional(),
  })),
});

vendorImportRouter.post('/rate-contracts/import', requireInternal, VENDOR_CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, rateContractImportBody);
    const result = await importRateContractsFromCsv(body.rows, req.user?.id);
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

const stockImportBody = z.object({
  rows: z.array(z.object({
    material_code: z.string().min(1),
    location_code: z.string().min(1),
    quantity: z.number().positive(),
    unit_cost: z.number().nonnegative(),
    batch_number: z.string().optional(),
  })),
});

stockImportRouter.post('/stock/import', requireInternal, INV_CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, stockImportBody);
    const result = await importStockOpeningBalances(body.rows, req.user?.id);
    sendSuccess(res, result, { status: 201 });
  } catch (err) { next(err); }
});

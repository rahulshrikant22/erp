import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createProduct,
  createVariant,
  createTierPricing,
  deleteVariant,
  deleteTierPricing,
  getProduct,
  importProductsCsv,
  listProducts,
  listTierPricing,
  listVariants,
  softDeleteProduct,
  updateProduct,
  updateProductImage,
  updateVariant,
} from '../services/products';

const router = Router();
const VIEW   = requirePermission('PRODUCT', 'product', 'view');
const CREATE = requirePermission('PRODUCT', 'product', 'create');
const EDIT   = requirePermission('PRODUCT', 'product', 'edit');
const DELETE = requirePermission('PRODUCT', 'product', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const variantIdParam = z.object({ variant_id: z.string().uuid() });
const tierIdParam = z.object({ tier_id: z.string().uuid() });

const listQ = z.object({
  category: z.string().uuid().optional(),
  search: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  is_custom: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createBody = z.object({
  productCode: z.string().max(50).optional(),
  productName: z.string().min(1).max(300),
  categoryId: z.string().uuid(),
  description: z.string().optional(),
  standardDimensions: z.record(z.string(), z.number()).optional(),
  hsnCode: z.string().max(8).optional(),
  basePrice: z.number().nonnegative(),
  uom: z.string().max(20).optional(),
  taxRatePercent: z.number().min(0).max(100),
  requiresInstallation: z.boolean().optional(),
  warrantyPeriodMonths: z.number().int().nonnegative().optional(),
  weightKg: z.number().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  isCustom: z.boolean().optional(),
});

const updateBody = z.object({
  productName: z.string().min(1).max(300).optional(),
  categoryId: z.string().uuid().optional(),
  description: z.string().nullable().optional(),
  standardDimensions: z.record(z.string(), z.number()).nullable().optional(),
  hsnCode: z.string().max(8).nullable().optional(),
  basePrice: z.number().nonnegative().optional(),
  uom: z.string().max(20).optional(),
  taxRatePercent: z.number().min(0).max(100).optional(),
  requiresInstallation: z.boolean().optional(),
  warrantyPeriodMonths: z.number().int().nonnegative().nullable().optional(),
  weightKg: z.number().nonnegative().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isCustom: z.boolean().optional(),
});

const variantBody = z.object({
  variantName: z.string().min(1).max(200),
  dimensions: z.record(z.string(), z.number()).optional(),
  variantSku: z.string().max(50).optional(),
  priceOverride: z.number().nonnegative().optional(),
  weightKg: z.number().nonnegative().optional(),
});

const tierBody = z.object({
  customerType: z.string().min(1),
  discountPercent: z.number().min(0).max(100).optional(),
  fixedPrice: z.number().nonnegative().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
});

// -- Product CRUD -------------------------------------------------------------

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, await listProducts({
      category: q.category,
      search: q.search,
      isActive: q.is_active === undefined ? undefined : q.is_active === 'true',
      isCustom: q.is_custom === undefined ? undefined : q.is_custom === 'true',
      page: q.page,
      limit: q.limit,
    }));
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createProduct(parseBody(req, createBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getProduct(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateProduct(parseParams(req, idParam).id, parseBody(req, updateBody)));
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await softDeleteProduct(parseParams(req, idParam).id, req.user!.id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

// -- Size Variants ------------------------------------------------------------

router.get('/:id/variants', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await listVariants(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.post('/:id/variants', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await createVariant(parseParams(req, idParam).id, parseBody(req, variantBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.put('/variants/:variant_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateVariant(parseParams(req, variantIdParam).variant_id, parseBody(req, variantBody.partial())));
  } catch (err) { next(err); }
});

router.delete('/variants/:variant_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    await deleteVariant(parseParams(req, variantIdParam).variant_id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

// -- Tier Pricing -------------------------------------------------------------

router.get('/:id/tier-pricing', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await listTierPricing(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.post('/:id/tier-pricing', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await createTierPricing(parseParams(req, idParam).id, parseBody(req, tierBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.delete('/tier-pricing/:tier_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    await deleteTierPricing(parseParams(req, tierIdParam).tier_id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

// -- Image Upload -------------------------------------------------------------

router.post('/:id/image', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { imageUrl } = parseBody(req, z.object({ imageUrl: z.string().min(1) }));
    sendSuccess(res, await updateProductImage(parseParams(req, idParam).id, imageUrl));
  } catch (err) { next(err); }
});

// -- CSV Import ---------------------------------------------------------------

router.post('/import', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { rows } = parseBody(req, z.object({ rows: z.array(z.object({
      product_code: z.string().optional(),
      product_name: z.string(),
      category_code: z.string(),
      description: z.string().optional(),
      hsn_code: z.string().optional(),
      base_price: z.string(),
      uom: z.string().optional(),
      tax_rate_percent: z.string(),
      requires_installation: z.string().optional(),
      warranty_period_months: z.string().optional(),
      weight_kg: z.string().optional(),
      is_custom: z.string().optional(),
    })) }));
    sendSuccess(res, await importProductsCsv(rows, req.user!.id));
  } catch (err) { next(err); }
});

router.get('/import/template', requireInternal, VIEW, async (_req, res) => {
  const headers = 'product_code,product_name,category_code,description,hsn_code,base_price,uom,tax_rate_percent,requires_installation,warranty_period_months,weight_kg,is_custom';
  const sample = ',Executive Desk,DESKS,Premium executive desk,94036090,45000,PCS,18,true,12,85.5,false';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="product_import_template.csv"');
  res.send(`${headers}\n${sample}\n`);
});

export default router;

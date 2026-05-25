import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  blacklistCustomer,
  createAddress,
  createContact,
  createCustomer,
  createTierPricing,
  deleteAddress,
  deleteContact,
  deleteTierPricing,
  getCustomer,
  importCustomersCsv,
  listCustomers,
  listTierPricing,
  reactivateCustomer,
  softDeleteCustomer,
  updateAddress,
  updateContact,
  updateCustomer,
} from '../services/customers';

const router = Router();
const VIEW   = requirePermission('CUSTOMER', 'customer', 'view');
const CREATE = requirePermission('CUSTOMER', 'customer', 'create');
const EDIT   = requirePermission('CUSTOMER', 'customer', 'edit');
const DELETE = requirePermission('CUSTOMER', 'customer', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const addressIdParam = z.object({ address_id: z.string().uuid() });
const contactIdParam = z.object({ contact_id: z.string().uuid() });
const tierIdParam = z.object({ tier_id: z.string().uuid() });

const listQ = z.object({
  type: z.string().optional(),
  search: z.string().optional(),
  is_active: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createBody = z.object({
  customerName: z.string().min(1).max(300),
  legalName: z.string().max(300).optional(),
  customerType: z.string().min(1),
  gstin: z.string().max(15).optional(),
  pan: z.string().max(10).optional(),
  primaryPhone: z.string().max(20).optional(),
  primaryEmail: z.string().email().optional(),
  creditLimit: z.number().nonnegative().optional(),
  creditDays: z.number().int().nonnegative().optional(),
  paymentTermsTemplateId: z.string().uuid().optional(),
  bankName: z.string().max(200).optional(),
  bankAccountNumber: z.string().max(30).optional(),
  bankIfsc: z.string().max(11).optional(),
  notes: z.string().optional(),
  source: z.enum(['manual', 'csv_import', 'portal']).optional(),
  linkedCustomerAccountId: z.string().uuid().optional(),
});

const updateBody = z.object({
  customerName: z.string().min(1).max(300).optional(),
  legalName: z.string().max(300).nullable().optional(),
  customerType: z.string().min(1).optional(),
  gstin: z.string().max(15).nullable().optional(),
  pan: z.string().max(10).nullable().optional(),
  primaryPhone: z.string().max(20).nullable().optional(),
  primaryEmail: z.string().email().nullable().optional(),
  creditLimit: z.number().nonnegative().nullable().optional(),
  creditDays: z.number().int().nonnegative().nullable().optional(),
  paymentTermsTemplateId: z.string().uuid().nullable().optional(),
  bankName: z.string().max(200).nullable().optional(),
  bankAccountNumber: z.string().max(30).nullable().optional(),
  bankIfsc: z.string().max(11).nullable().optional(),
  notes: z.string().nullable().optional(),
  linkedCustomerAccountId: z.string().uuid().nullable().optional(),
});

const addressBody = z.object({
  addressType: z.enum(['billing', 'shipping', 'site', 'registered']),
  contactPerson: z.string().max(200).optional(),
  contactPhone: z.string().max(20).optional(),
  addressLine1: z.string().min(1).max(500),
  addressLine2: z.string().max(500).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().min(1).max(10),
  country: z.string().max(100).optional(),
  isDefaultBilling: z.boolean().optional(),
  isDefaultShipping: z.boolean().optional(),
  notes: z.string().optional(),
});

const contactBody = z.object({
  contactName: z.string().min(1).max(200),
  designation: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  role: z.enum(['decision_maker', 'purchase', 'accounts', 'site_contact']).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional(),
});

const tierBody = z.object({
  productId: z.string().uuid().optional(),
  productCategoryId: z.string().uuid().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  specialPrice: z.number().nonnegative().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
});

// -- Customer CRUD ------------------------------------------------------------

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQ);
    sendSuccess(res, await listCustomers({
      type: q.type,
      search: q.search,
      isActive: q.is_active === undefined ? undefined : q.is_active === 'true',
      page: q.page,
      limit: q.limit,
    }));
  } catch (err) { next(err); }
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    sendSuccess(res, await createCustomer(parseBody(req, createBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    sendSuccess(res, await getCustomer(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateCustomer(parseParams(req, idParam).id, parseBody(req, updateBody)));
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    await softDeleteCustomer(parseParams(req, idParam).id, req.user!.id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

router.post('/:id/reactivate', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await reactivateCustomer(parseParams(req, idParam).id));
  } catch (err) { next(err); }
});

router.post('/:id/blacklist', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { reason } = parseBody(req, z.object({ reason: z.string().min(1) }));
    sendSuccess(res, await blacklistCustomer(parseParams(req, idParam).id, reason));
  } catch (err) { next(err); }
});

// -- Addresses ----------------------------------------------------------------

router.post('/:id/addresses', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await createAddress(parseParams(req, idParam).id, parseBody(req, addressBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.put('/addresses/:address_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateAddress(parseParams(req, addressIdParam).address_id, parseBody(req, addressBody.partial())));
  } catch (err) { next(err); }
});

router.delete('/addresses/:address_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    await deleteAddress(parseParams(req, addressIdParam).address_id);
    sendSuccess(res, { ok: true });
  } catch (err) { next(err); }
});

// -- Contacts -----------------------------------------------------------------

router.post('/:id/contacts', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await createContact(parseParams(req, idParam).id, parseBody(req, contactBody)), { status: 201 });
  } catch (err) { next(err); }
});

router.put('/contacts/:contact_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    sendSuccess(res, await updateContact(parseParams(req, contactIdParam).contact_id, parseBody(req, contactBody.partial())));
  } catch (err) { next(err); }
});

router.delete('/contacts/:contact_id', requireInternal, EDIT, async (req, res, next) => {
  try {
    await deleteContact(parseParams(req, contactIdParam).contact_id);
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

// -- CSV Import ---------------------------------------------------------------

router.post('/import', requireInternal, CREATE, async (req, res, next) => {
  try {
    const { rows } = parseBody(req, z.object({ rows: z.array(z.object({
      customer_name: z.string(),
      legal_name: z.string().optional(),
      customer_type: z.string(),
      gstin: z.string().optional(),
      pan: z.string().optional(),
      primary_phone: z.string().optional(),
      primary_email: z.string().optional(),
      credit_limit: z.string().optional(),
      credit_days: z.string().optional(),
      notes: z.string().optional(),
    })) }));
    sendSuccess(res, await importCustomersCsv(rows, req.user!.id));
  } catch (err) { next(err); }
});

router.get('/import/template', requireInternal, VIEW, async (_req, res) => {
  const headers = 'customer_name,legal_name,customer_type,gstin,pan,primary_phone,primary_email,credit_limit,credit_days,notes';
  const sample = 'Acme Corp,Acme Corporation Pvt Ltd,dealer,27AADCA1234F1ZM,,9876543210,acme@example.com,500000,30,VIP customer';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="customer_import_template.csv"');
  res.send(`${headers}\n${sample}\n`);
});

export default router;

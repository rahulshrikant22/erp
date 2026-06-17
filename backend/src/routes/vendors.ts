import { Router } from 'express';
import { z } from 'zod';
import { requireInternal } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { sendSuccess } from '../utils/response';
import { parseBody, parseParams, parseQuery } from '../utils/validate';
import {
  createVendor, listVendors, getVendor, updateVendor, deleteVendor,
  blacklistVendor, unblacklistVendor,
  createContact, listContacts, updateContact, deleteContact,
  createAddress, listAddresses, updateAddress, deleteAddress,
  createDocument, listDocuments, deleteDocument, getExpiringDocuments,
  createRateContract, updateRateContract, deleteRateContract, listRateContracts,
  bulkUpdateRateContracts, importRateContractsFromCsv,
  getPreferredVendorsForMaterial, getVendorPerformance,
} from '../services/vendors';

const router = Router();

const VIEW = requirePermission('VENDOR', 'vendor', 'view');
const CREATE = requirePermission('VENDOR', 'vendor', 'create');
const EDIT = requirePermission('VENDOR', 'vendor', 'edit');
const DELETE = requirePermission('VENDOR', 'vendor', 'delete');

const idParam = z.object({ id: z.string().uuid() });
const vendorChildParam = z.object({ id: z.string().uuid(), childId: z.string().uuid() });
const materialIdParam = z.object({ id: z.string().uuid() });

// ─── Vendor CRUD ────────────────────────────────────────────────────────────────

const createBody = z.object({
  vendor_name: z.string().min(1).max(300),
  legal_name: z.string().nullable().optional(),
  vendor_type: z.enum(['domestic', 'import']).optional(),
  gstin: z.string().nullable().optional(),
  pan: z.string().nullable().optional(),
  msme_registered: z.boolean().optional(),
  msme_number: z.string().nullable().optional(),
  primary_email: z.string().email().nullable().optional(),
  primary_phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  currency_code: z.string().optional(),
  payment_terms_template_id: z.string().uuid().nullable().optional(),
  credit_limit: z.number().nonnegative().nullable().optional(),
  credit_days: z.number().int().nonnegative().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account_number: z.string().nullable().optional(),
  bank_ifsc: z.string().nullable().optional(),
  bank_swift_code: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  iec_code: z.string().nullable().optional(),
  default_incoterms: z.string().nullable().optional(),
});

const listQuery = z.object({
  search: z.string().optional(),
  vendor_type: z.enum(['domestic', 'import']).optional(),
  is_active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  is_blacklisted: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

router.post('/', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, createBody);
    const vendor = await createVendor({
      vendorName: body.vendor_name,
      legalName: body.legal_name,
      vendorType: body.vendor_type,
      gstin: body.gstin,
      pan: body.pan,
      msmeRegistered: body.msme_registered,
      msmeNumber: body.msme_number,
      primaryEmail: body.primary_email,
      primaryPhone: body.primary_phone,
      website: body.website,
      currencyCode: body.currency_code,
      paymentTermsTemplateId: body.payment_terms_template_id,
      creditLimit: body.credit_limit,
      creditDays: body.credit_days,
      bankName: body.bank_name,
      bankAccountNumber: body.bank_account_number,
      bankIfsc: body.bank_ifsc,
      bankSwiftCode: body.bank_swift_code,
      rating: body.rating,
      iecCode: body.iec_code,
      defaultIncoterms: body.default_incoterms,
      createdById: req.user?.id,
    });
    sendSuccess(res, { vendor }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, listQuery);
    const result = await listVendors({
      search: q.search,
      vendorType: q.vendor_type,
      isActive: q.is_active,
      isBlacklisted: q.is_blacklisted,
      page: q.page,
      limit: q.limit,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
});

router.get('/documents/expiring', requireInternal, VIEW, async (req, res, next) => {
  try {
    const q = parseQuery(req, z.object({ days: z.coerce.number().int().positive().optional() }));
    const documents = await getExpiringDocuments(q.days ?? 30);
    sendSuccess(res, { documents });
  } catch (err) { next(err); }
});

router.get('/materials/:id/preferred-vendors', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, materialIdParam);
    const contracts = await getPreferredVendorsForMaterial(id);
    sendSuccess(res, { contracts });
  } catch (err) { next(err); }
});

router.get('/:id', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const vendor = await getVendor(id);
    sendSuccess(res, { vendor });
  } catch (err) { next(err); }
});

router.put('/:id', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, createBody.partial());
    const vendor = await updateVendor(id, {
      vendorName: body.vendor_name,
      legalName: body.legal_name,
      vendorType: body.vendor_type,
      gstin: body.gstin,
      pan: body.pan,
      msmeRegistered: body.msme_registered,
      msmeNumber: body.msme_number,
      primaryEmail: body.primary_email,
      primaryPhone: body.primary_phone,
      website: body.website,
      currencyCode: body.currency_code,
      paymentTermsTemplateId: body.payment_terms_template_id,
      creditLimit: body.credit_limit,
      creditDays: body.credit_days,
      bankName: body.bank_name,
      bankAccountNumber: body.bank_account_number,
      bankIfsc: body.bank_ifsc,
      bankSwiftCode: body.bank_swift_code,
      rating: body.rating,
      iecCode: body.iec_code,
      defaultIncoterms: body.default_incoterms,
      updatedById: req.user?.id,
    });
    sendSuccess(res, { vendor });
  } catch (err) { next(err); }
});

router.delete('/:id', requireInternal, DELETE, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    await deleteVendor(id);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Blacklist ──────────────────────────────────────────────────────────────────

router.post('/:id/blacklist', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ reason: z.string().min(1) }));
    const vendor = await blacklistVendor(id, body.reason, req.user?.id);
    sendSuccess(res, { vendor });
  } catch (err) { next(err); }
});

router.post('/:id/unblacklist', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const vendor = await unblacklistVendor(id, req.user?.id);
    sendSuccess(res, { vendor });
  } catch (err) { next(err); }
});

// ─── Performance ────────────────────────────────────────────────────────────────

router.get('/:id/performance', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const performance = await getVendorPerformance(id);
    sendSuccess(res, { performance });
  } catch (err) { next(err); }
});

// ─── Contacts ───────────────────────────────────────────────────────────────────

const contactBody = z.object({
  contact_name: z.string().min(1),
  designation: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  role: z.enum(['sales', 'accounts', 'dispatch', 'owner']).optional(),
  is_primary: z.boolean().optional(),
});

router.post('/:id/contacts', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, contactBody);
    const contact = await createContact(id, {
      contactName: body.contact_name,
      designation: body.designation,
      phone: body.phone,
      email: body.email,
      role: body.role,
      isPrimary: body.is_primary,
    });
    sendSuccess(res, { contact }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id/contacts', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const contacts = await listContacts(id);
    sendSuccess(res, { contacts });
  } catch (err) { next(err); }
});

router.put('/:id/contacts/:childId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, childId } = parseParams(req, vendorChildParam);
    const body = parseBody(req, contactBody.partial());
    const contact = await updateContact(id, childId, {
      contactName: body.contact_name,
      designation: body.designation,
      phone: body.phone,
      email: body.email,
      role: body.role,
      isPrimary: body.is_primary,
    });
    sendSuccess(res, { contact });
  } catch (err) { next(err); }
});

router.delete('/:id/contacts/:childId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, childId } = parseParams(req, vendorChildParam);
    await deleteContact(id, childId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Addresses ──────────────────────────────────────────────────────────────────

const addressBody = z.object({
  address_type: z.enum(['registered', 'factory', 'warehouse', 'billing']),
  address_line_1: z.string().min(1),
  address_line_2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().nullable().optional(),
  state_code: z.string().nullable().optional(),
  country: z.string().optional(),
  pincode: z.string().nullable().optional(),
  port_of_loading: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.post('/:id/addresses', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, addressBody);
    const address = await createAddress(id, {
      addressType: body.address_type,
      addressLine1: body.address_line_1,
      addressLine2: body.address_line_2,
      city: body.city,
      state: body.state,
      stateCode: body.state_code,
      country: body.country,
      pincode: body.pincode,
      portOfLoading: body.port_of_loading,
      notes: body.notes,
    });
    sendSuccess(res, { address }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id/addresses', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const addresses = await listAddresses(id);
    sendSuccess(res, { addresses });
  } catch (err) { next(err); }
});

router.put('/:id/addresses/:childId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, childId } = parseParams(req, vendorChildParam);
    const body = parseBody(req, addressBody.partial());
    const address = await updateAddress(id, childId, {
      addressType: body.address_type,
      addressLine1: body.address_line_1,
      addressLine2: body.address_line_2,
      city: body.city,
      state: body.state,
      stateCode: body.state_code,
      country: body.country,
      pincode: body.pincode,
      portOfLoading: body.port_of_loading,
      notes: body.notes,
    });
    sendSuccess(res, { address });
  } catch (err) { next(err); }
});

router.delete('/:id/addresses/:childId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, childId } = parseParams(req, vendorChildParam);
    await deleteAddress(id, childId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Documents ──────────────────────────────────────────────────────────────────

const documentBody = z.object({
  document_type: z.enum(['gst_cert', 'pan', 'iec', 'agreement', 'quality_cert', 'insurance']),
  document_path: z.string().min(1),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.post('/:id/documents', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, documentBody);
    const doc = await createDocument(id, {
      documentType: body.document_type,
      documentPath: body.document_path,
      validFrom: body.valid_from,
      validUntil: body.valid_until,
      notes: body.notes,
      uploadedBy: req.user?.id,
    });
    sendSuccess(res, { document: doc }, { status: 201 });
  } catch (err) { next(err); }
});

router.get('/:id/documents', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const documents = await listDocuments(id);
    sendSuccess(res, { documents });
  } catch (err) { next(err); }
});

router.delete('/:id/documents/:childId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id, childId } = parseParams(req, vendorChildParam);
    await deleteDocument(id, childId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Rate Contracts ─────────────────────────────────────────────────────────────

const rateContractBody = z.object({
  material_id: z.string().uuid(),
  manufacturer_id: z.string().uuid().nullable().optional(),
  is_authorized_dealer: z.boolean().optional(),
  unit_price: z.number().positive(),
  currency_code: z.string().optional(),
  uom: z.string().optional(),
  min_order_quantity: z.number().positive().nullable().optional(),
  lead_time_days: z.number().int().positive().nullable().optional(),
  validity_from: z.string(),
  validity_until: z.string().nullable().optional(),
  is_preferred: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const rateContractUpdateBody = z.object({
  unit_price: z.number().positive().optional(),
  currency_code: z.string().optional(),
  uom: z.string().optional(),
  min_order_quantity: z.number().positive().nullable().optional(),
  lead_time_days: z.number().int().positive().nullable().optional(),
  validity_until: z.string().nullable().optional(),
  is_preferred: z.boolean().optional(),
  is_authorized_dealer: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  change_reason: z.string().optional(),
});

router.get('/:id/rate-contracts', requireInternal, VIEW, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const contracts = await listRateContracts(id);
    sendSuccess(res, { contracts });
  } catch (err) { next(err); }
});

router.post('/:id/rate-contracts', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, rateContractBody);
    const contract = await createRateContract({
      vendorId: id,
      materialId: body.material_id,
      manufacturerId: body.manufacturer_id,
      isAuthorizedDealer: body.is_authorized_dealer,
      unitPrice: body.unit_price,
      currencyCode: body.currency_code,
      uom: body.uom,
      minOrderQuantity: body.min_order_quantity,
      leadTimeDays: body.lead_time_days,
      validityFrom: body.validity_from,
      validityUntil: body.validity_until,
      isPreferred: body.is_preferred,
      notes: body.notes,
      createdById: req.user?.id,
    });
    sendSuccess(res, { contract }, { status: 201 });
  } catch (err) { next(err); }
});

router.put('/:id/rate-contracts/:childId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id: _vendorId, childId } = parseParams(req, vendorChildParam);
    const body = parseBody(req, rateContractUpdateBody);
    const contract = await updateRateContract(childId, {
      unitPrice: body.unit_price,
      currencyCode: body.currency_code,
      uom: body.uom,
      minOrderQuantity: body.min_order_quantity,
      leadTimeDays: body.lead_time_days,
      validityUntil: body.validity_until,
      isPreferred: body.is_preferred,
      isAuthorizedDealer: body.is_authorized_dealer,
      notes: body.notes,
      changeReason: body.change_reason,
      updatedById: req.user?.id,
    });
    sendSuccess(res, { contract });
  } catch (err) { next(err); }
});

router.delete('/:id/rate-contracts/:childId', requireInternal, EDIT, async (req, res, next) => {
  try {
    const { id: _vendorId, childId } = parseParams(req, vendorChildParam);
    await deleteRateContract(childId);
    sendSuccess(res, { deleted: true });
  } catch (err) { next(err); }
});

// ─── Bulk Rate Contracts ────────────────────────────────────────────────────────

router.post('/rate-contracts/bulk-update', requireInternal, EDIT, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      updates: z.array(z.object({
        id: z.string().uuid(),
        unit_price: z.number().positive(),
        change_reason: z.string().optional(),
      })),
    }));
    const results = await bulkUpdateRateContracts(
      body.updates.map((u) => ({ id: u.id, unitPrice: u.unit_price, changeReason: u.change_reason })),
      req.user?.id,
    );
    sendSuccess(res, { results });
  } catch (err) { next(err); }
});

router.post('/rate-contracts/import-csv', requireInternal, CREATE, async (req, res, next) => {
  try {
    const body = parseBody(req, z.object({
      rows: z.array(z.object({
        vendor_code: z.string(),
        material_code: z.string(),
        unit_price: z.number().positive(),
        validity_from: z.string(),
        validity_until: z.string().optional(),
        is_preferred: z.boolean().optional(),
        notes: z.string().optional(),
      })),
    }));
    const results = await importRateContractsFromCsv(
      body.rows.map((r) => ({
        vendorCode: r.vendor_code,
        materialCode: r.material_code,
        unitPrice: r.unit_price,
        validityFrom: r.validity_from,
        validityUntil: r.validity_until,
        isPreferred: r.is_preferred,
        notes: r.notes,
      })),
      req.user?.id,
    );
    sendSuccess(res, { results });
  } catch (err) { next(err); }
});

export default router;

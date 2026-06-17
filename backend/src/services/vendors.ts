import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CreateVendorInput {
  vendorName: string;
  legalName?: string | null;
  vendorType?: string;
  gstin?: string | null;
  pan?: string | null;
  msmeRegistered?: boolean;
  msmeNumber?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  website?: string | null;
  currencyCode?: string;
  paymentTermsTemplateId?: string | null;
  creditLimit?: number | null;
  creditDays?: number | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankSwiftCode?: string | null;
  rating?: number | null;
  iecCode?: string | null;
  defaultIncoterms?: string | null;
  createdById?: string | null;
}

export interface UpdateVendorInput {
  vendorName?: string;
  legalName?: string | null;
  vendorType?: string;
  gstin?: string | null;
  pan?: string | null;
  msmeRegistered?: boolean;
  msmeNumber?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  website?: string | null;
  currencyCode?: string;
  paymentTermsTemplateId?: string | null;
  creditLimit?: number | null;
  creditDays?: number | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankSwiftCode?: string | null;
  rating?: number | null;
  iecCode?: string | null;
  defaultIncoterms?: string | null;
  updatedById?: string | null;
}

export interface ListVendorsFilter {
  search?: string;
  vendorType?: string;
  isActive?: boolean;
  isBlacklisted?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateContactInput {
  contactName: string;
  designation?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string;
  isPrimary?: boolean;
}

export interface CreateAddressInput {
  addressType: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  state?: string | null;
  stateCode?: string | null;
  country?: string;
  pincode?: string | null;
  portOfLoading?: string | null;
  notes?: string | null;
}

export interface CreateDocumentInput {
  documentType: string;
  documentPath: string;
  validFrom?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  uploadedBy?: string | null;
}

export interface CreateRateContractInput {
  vendorId: string;
  materialId: string;
  manufacturerId?: string | null;
  isAuthorizedDealer?: boolean;
  unitPrice: number;
  currencyCode?: string;
  uom?: string;
  minOrderQuantity?: number | null;
  leadTimeDays?: number | null;
  validityFrom: string;
  validityUntil?: string | null;
  isPreferred?: boolean;
  notes?: string | null;
  createdById?: string | null;
}

export interface UpdateRateContractInput {
  unitPrice?: number;
  currencyCode?: string;
  uom?: string;
  minOrderQuantity?: number | null;
  leadTimeDays?: number | null;
  validityUntil?: string | null;
  isPreferred?: boolean;
  isAuthorizedDealer?: boolean;
  notes?: string | null;
  changeReason?: string;
  updatedById?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function validateGstin(gstin: string | null | undefined, vendorType: string) {
  if (vendorType === 'domestic' && gstin) {
    if (gstin.length !== 15 || !GSTIN_REGEX.test(gstin)) {
      throw new ValidationError('Invalid GSTIN format for domestic vendor');
    }
  }
}

const VENDOR_LIST_INCLUDE = {
  contacts: { where: { isPrimary: true }, take: 1 },
  _count: { select: { purchaseOrders: true, rateContracts: true } },
};

const VENDOR_DETAIL_INCLUDE = {
  contacts: { orderBy: { isPrimary: 'desc' as const } },
  addresses: true,
  documents: { orderBy: { createdAt: 'desc' as const } },
  rateContracts: {
    where: { isDeleted: false },
    orderBy: { createdAt: 'desc' as const },
    include: { material: { select: { id: true, materialCode: true, materialName: true } }, manufacturer: { select: { id: true, name: true } } },
  },
  paymentTermsTemplate: true,
};

// ─── Vendor CRUD ────────────────────────────────────────────────────────────────

export async function createVendor(input: CreateVendorInput) {
  validateGstin(input.gstin, input.vendorType ?? 'domestic');

  const { number: vendorCode } = await getNextNumber('VEN');

  return prisma.vendor.create({
    data: {
      vendorCode,
      vendorName: input.vendorName,
      legalName: input.legalName ?? null,
      vendorType: input.vendorType ?? 'domestic',
      gstin: input.gstin ?? null,
      pan: input.pan ?? null,
      msmeRegistered: input.msmeRegistered ?? false,
      msmeNumber: input.msmeNumber ?? null,
      primaryEmail: input.primaryEmail ?? null,
      primaryPhone: input.primaryPhone ?? null,
      website: input.website ?? null,
      currencyCode: input.currencyCode ?? 'INR',
      paymentTermsTemplateId: input.paymentTermsTemplateId ?? null,
      creditLimit: input.creditLimit ?? null,
      creditDays: input.creditDays ?? null,
      bankName: input.bankName ?? null,
      bankAccountNumber: input.bankAccountNumber ?? null,
      bankIfsc: input.bankIfsc ?? null,
      bankSwiftCode: input.bankSwiftCode ?? null,
      rating: input.rating ?? null,
      iecCode: input.iecCode ?? null,
      defaultIncoterms: input.defaultIncoterms ?? null,
      createdById: input.createdById ?? null,
    },
    include: VENDOR_DETAIL_INCLUDE,
  });
}

export async function listVendors(filter: ListVendorsFilter) {
  const where: Prisma.VendorWhereInput = { isDeleted: false };

  if (filter.vendorType) where.vendorType = filter.vendorType;
  if (filter.isActive !== undefined) where.isActive = filter.isActive;
  if (filter.isBlacklisted !== undefined) where.isBlacklisted = filter.isBlacklisted;
  if (filter.search) {
    where.OR = [
      { vendorCode: { contains: filter.search, mode: 'insensitive' } },
      { vendorName: { contains: filter.search, mode: 'insensitive' } },
      { legalName: { contains: filter.search, mode: 'insensitive' } },
      { gstin: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const page = filter.page ?? 1;
  const limit = filter.limit ?? 50;

  const [total, vendors] = await Promise.all([
    prisma.vendor.count({ where }),
    prisma.vendor.findMany({
      where,
      include: VENDOR_LIST_INCLUDE,
      orderBy: { vendorName: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return { total, page, limit, vendors };
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: VENDOR_DETAIL_INCLUDE,
  });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');
  return vendor;
}

export async function updateVendor(id: string, input: UpdateVendorInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  const vendorType = input.vendorType ?? vendor.vendorType;
  validateGstin(input.gstin !== undefined ? input.gstin : vendor.gstin, vendorType);

  return prisma.vendor.update({
    where: { id },
    data: {
      ...(input.vendorName !== undefined && { vendorName: input.vendorName }),
      ...(input.legalName !== undefined && { legalName: input.legalName }),
      ...(input.vendorType !== undefined && { vendorType: input.vendorType }),
      ...(input.gstin !== undefined && { gstin: input.gstin }),
      ...(input.pan !== undefined && { pan: input.pan }),
      ...(input.msmeRegistered !== undefined && { msmeRegistered: input.msmeRegistered }),
      ...(input.msmeNumber !== undefined && { msmeNumber: input.msmeNumber }),
      ...(input.primaryEmail !== undefined && { primaryEmail: input.primaryEmail }),
      ...(input.primaryPhone !== undefined && { primaryPhone: input.primaryPhone }),
      ...(input.website !== undefined && { website: input.website }),
      ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
      ...(input.paymentTermsTemplateId !== undefined && { paymentTermsTemplateId: input.paymentTermsTemplateId }),
      ...(input.creditLimit !== undefined && { creditLimit: input.creditLimit }),
      ...(input.creditDays !== undefined && { creditDays: input.creditDays }),
      ...(input.bankName !== undefined && { bankName: input.bankName }),
      ...(input.bankAccountNumber !== undefined && { bankAccountNumber: input.bankAccountNumber }),
      ...(input.bankIfsc !== undefined && { bankIfsc: input.bankIfsc }),
      ...(input.bankSwiftCode !== undefined && { bankSwiftCode: input.bankSwiftCode }),
      ...(input.rating !== undefined && { rating: input.rating }),
      ...(input.iecCode !== undefined && { iecCode: input.iecCode }),
      ...(input.defaultIncoterms !== undefined && { defaultIncoterms: input.defaultIncoterms }),
      updatedById: input.updatedById ?? null,
    },
    include: VENDOR_DETAIL_INCLUDE,
  });
}

export async function deleteVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  const activePOs = await prisma.purchaseOrder.count({
    where: {
      vendorId: id,
      isDeleted: false,
      status: { notIn: ['closed', 'cancelled'] },
    },
  });
  if (activePOs > 0) {
    throw new ConflictError('Cannot delete vendor with active purchase orders', { activePOs });
  }

  await prisma.vendor.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), isActive: false },
  });
}

export async function blacklistVendor(id: string, reason: string, updatedById?: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  return prisma.vendor.update({
    where: { id },
    data: { isBlacklisted: true, blacklistReason: reason, updatedById: updatedById ?? null },
    include: VENDOR_DETAIL_INCLUDE,
  });
}

export async function unblacklistVendor(id: string, updatedById?: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  return prisma.vendor.update({
    where: { id },
    data: { isBlacklisted: false, blacklistReason: null, updatedById: updatedById ?? null },
    include: VENDOR_DETAIL_INCLUDE,
  });
}

// ─── Contacts ───────────────────────────────────────────────────────────────────

export async function createContact(vendorId: string, input: CreateContactInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  if (input.isPrimary) {
    await prisma.vendorContact.updateMany({
      where: { vendorId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  return prisma.vendorContact.create({
    data: {
      vendorId,
      contactName: input.contactName,
      designation: input.designation ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      role: input.role ?? 'sales',
      isPrimary: input.isPrimary ?? false,
    },
  });
}

export async function listContacts(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  return prisma.vendorContact.findMany({
    where: { vendorId },
    orderBy: [{ isPrimary: 'desc' }, { contactName: 'asc' }],
  });
}

export async function updateContact(vendorId: string, contactId: string, input: Partial<CreateContactInput>) {
  const contact = await prisma.vendorContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.vendorId !== vendorId) throw new NotFoundError('Contact not found');

  if (input.isPrimary) {
    await prisma.vendorContact.updateMany({
      where: { vendorId, isPrimary: true, id: { not: contactId } },
      data: { isPrimary: false },
    });
  }

  return prisma.vendorContact.update({
    where: { id: contactId },
    data: {
      ...(input.contactName !== undefined && { contactName: input.contactName }),
      ...(input.designation !== undefined && { designation: input.designation }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
    },
  });
}

export async function deleteContact(vendorId: string, contactId: string) {
  const contact = await prisma.vendorContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.vendorId !== vendorId) throw new NotFoundError('Contact not found');

  await prisma.vendorContact.delete({ where: { id: contactId } });
}

// ─── Addresses ──────────────────────────────────────────────────────────────────

export async function createAddress(vendorId: string, input: CreateAddressInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  return prisma.vendorAddress.create({
    data: {
      vendorId,
      addressType: input.addressType,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state ?? null,
      stateCode: input.stateCode ?? null,
      country: input.country ?? 'India',
      pincode: input.pincode ?? null,
      portOfLoading: input.portOfLoading ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function listAddresses(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  return prisma.vendorAddress.findMany({ where: { vendorId } });
}

export async function updateAddress(vendorId: string, addressId: string, input: Partial<CreateAddressInput>) {
  const addr = await prisma.vendorAddress.findUnique({ where: { id: addressId } });
  if (!addr || addr.vendorId !== vendorId) throw new NotFoundError('Address not found');

  return prisma.vendorAddress.update({
    where: { id: addressId },
    data: {
      ...(input.addressType !== undefined && { addressType: input.addressType }),
      ...(input.addressLine1 !== undefined && { addressLine1: input.addressLine1 }),
      ...(input.addressLine2 !== undefined && { addressLine2: input.addressLine2 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.stateCode !== undefined && { stateCode: input.stateCode }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.pincode !== undefined && { pincode: input.pincode }),
      ...(input.portOfLoading !== undefined && { portOfLoading: input.portOfLoading }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
}

export async function deleteAddress(vendorId: string, addressId: string) {
  const addr = await prisma.vendorAddress.findUnique({ where: { id: addressId } });
  if (!addr || addr.vendorId !== vendorId) throw new NotFoundError('Address not found');

  await prisma.vendorAddress.delete({ where: { id: addressId } });
}

// ─── Documents ──────────────────────────────────────────────────────────────────

export async function createDocument(vendorId: string, input: CreateDocumentInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  return prisma.vendorDocument.create({
    data: {
      vendorId,
      documentType: input.documentType,
      documentPath: input.documentPath,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      notes: input.notes ?? null,
      uploadedBy: input.uploadedBy ?? null,
    },
  });
}

export async function listDocuments(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  return prisma.vendorDocument.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function deleteDocument(vendorId: string, documentId: string) {
  const doc = await prisma.vendorDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.vendorId !== vendorId) throw new NotFoundError('Document not found');

  await prisma.vendorDocument.delete({ where: { id: documentId } });
}

export async function getExpiringDocuments(daysAhead: number = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);

  return prisma.vendorDocument.findMany({
    where: {
      validUntil: { lte: cutoff, gte: new Date() },
      vendor: { isDeleted: false, isActive: true },
    },
    include: { vendor: { select: { id: true, vendorCode: true, vendorName: true } } },
    orderBy: { validUntil: 'asc' },
  });
}

// ─── Rate Contracts ─────────────────────────────────────────────────────────────

export async function createRateContract(input: CreateRateContractInput) {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  const material = await prisma.material.findUnique({ where: { id: input.materialId } });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');

  if (input.manufacturerId) {
    if (input.manufacturerId !== material.manufacturerId) {
      throw new ValidationError('Manufacturer does not match the material\'s manufacturer');
    }
  }

  return prisma.rateContract.create({
    data: {
      vendorId: input.vendorId,
      materialId: input.materialId,
      manufacturerId: input.manufacturerId ?? material.manufacturerId,
      isAuthorizedDealer: input.isAuthorizedDealer ?? false,
      unitPrice: input.unitPrice,
      currencyCode: input.currencyCode ?? 'INR',
      uom: input.uom ?? material.purchaseUom,
      minOrderQuantity: input.minOrderQuantity ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      validityFrom: new Date(input.validityFrom),
      validityUntil: input.validityUntil ? new Date(input.validityUntil) : null,
      isPreferred: input.isPreferred ?? false,
      notes: input.notes ?? null,
      createdById: input.createdById ?? null,
    },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      manufacturer: { select: { id: true, name: true } },
      vendor: { select: { id: true, vendorCode: true, vendorName: true } },
    },
  });
}

export async function updateRateContract(id: string, input: UpdateRateContractInput) {
  const rc = await prisma.rateContract.findUnique({ where: { id } });
  if (!rc || rc.isDeleted) throw new NotFoundError('Rate contract not found');

  if (input.unitPrice !== undefined && input.unitPrice !== Number(rc.unitPrice)) {
    await prisma.rateContractHistory.create({
      data: {
        rateContractId: id,
        oldPrice: rc.unitPrice,
        newPrice: input.unitPrice,
        changeReason: input.changeReason ?? null,
        changedBy: input.updatedById ?? null,
      },
    });
  }

  return prisma.rateContract.update({
    where: { id },
    data: {
      ...(input.unitPrice !== undefined && { unitPrice: input.unitPrice }),
      ...(input.currencyCode !== undefined && { currencyCode: input.currencyCode }),
      ...(input.uom !== undefined && { uom: input.uom }),
      ...(input.minOrderQuantity !== undefined && { minOrderQuantity: input.minOrderQuantity }),
      ...(input.leadTimeDays !== undefined && { leadTimeDays: input.leadTimeDays }),
      ...(input.validityUntil !== undefined && { validityUntil: input.validityUntil ? new Date(input.validityUntil) : null }),
      ...(input.isPreferred !== undefined && { isPreferred: input.isPreferred }),
      ...(input.isAuthorizedDealer !== undefined && { isAuthorizedDealer: input.isAuthorizedDealer }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedById: input.updatedById ?? null,
    },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      manufacturer: { select: { id: true, name: true } },
      history: { orderBy: { changedAt: 'desc' }, take: 10 },
    },
  });
}

export async function deleteRateContract(id: string) {
  const rc = await prisma.rateContract.findUnique({ where: { id } });
  if (!rc || rc.isDeleted) throw new NotFoundError('Rate contract not found');

  await prisma.rateContract.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}

export async function listRateContracts(vendorId: string) {
  return prisma.rateContract.findMany({
    where: { vendorId, isDeleted: false },
    include: {
      material: { select: { id: true, materialCode: true, materialName: true } },
      manufacturer: { select: { id: true, name: true } },
      history: { orderBy: { changedAt: 'desc' }, take: 5 },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function bulkUpdateRateContracts(
  updates: Array<{ id: string; unitPrice: number; changeReason?: string }>,
  updatedById?: string,
) {
  const results = [];
  for (const u of updates) {
    const result = await updateRateContract(u.id, {
      unitPrice: u.unitPrice,
      changeReason: u.changeReason,
      updatedById,
    });
    results.push(result);
  }
  return results;
}

export async function importRateContractsFromCsv(
  rows: Array<{
    vendorCode: string;
    materialCode: string;
    unitPrice: number;
    validityFrom: string;
    validityUntil?: string;
    isPreferred?: boolean;
    notes?: string;
  }>,
  createdById?: string,
) {
  const results: Array<{ row: number; status: string; error?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const vendor = await prisma.vendor.findFirst({
        where: { vendorCode: row.vendorCode, isDeleted: false },
      });
      if (!vendor) throw new Error(`Vendor ${row.vendorCode} not found`);

      const material = await prisma.material.findFirst({
        where: { materialCode: row.materialCode, isDeleted: false },
      });
      if (!material) throw new Error(`Material ${row.materialCode} not found`);

      await createRateContract({
        vendorId: vendor.id,
        materialId: material.id,
        unitPrice: row.unitPrice,
        validityFrom: row.validityFrom,
        validityUntil: row.validityUntil,
        isPreferred: row.isPreferred,
        notes: row.notes,
        createdById,
      });
      results.push({ row: i + 1, status: 'success' });
    } catch (err: any) {
      results.push({ row: i + 1, status: 'error', error: err.message });
    }
  }

  return results;
}

// ─── Preferred Vendors ──────────────────────────────────────────────────────────

export async function getPreferredVendorsForMaterial(materialId: string) {
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material || material.isDeleted) throw new NotFoundError('Material not found');

  const now = new Date();
  const contracts = await prisma.rateContract.findMany({
    where: {
      materialId,
      isDeleted: false,
      validityFrom: { lte: now },
      OR: [{ validityUntil: null }, { validityUntil: { gte: now } }],
      vendor: { isDeleted: false, isActive: true, isBlacklisted: false },
    },
    include: {
      vendor: { select: { id: true, vendorCode: true, vendorName: true, vendorType: true, rating: true } },
      manufacturer: { select: { id: true, name: true } },
    },
    orderBy: [
      { isPreferred: 'desc' },
      { isAuthorizedDealer: 'desc' },
      { unitPrice: 'asc' },
    ],
  });

  return contracts;
}

// ─── Performance ────────────────────────────────────────────────────────────────

export async function getVendorPerformance(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor || vendor.isDeleted) throw new NotFoundError('Vendor not found');

  const [totalPOs, completedPOs, grnCount, avgDelivery] = await Promise.all([
    prisma.purchaseOrder.count({ where: { vendorId, isDeleted: false } }),
    prisma.purchaseOrder.count({ where: { vendorId, isDeleted: false, status: { in: ['fully_received', 'closed'] } } }),
    prisma.goodsReceiptNote.count({ where: { vendorId, isDeleted: false } }),
    prisma.goodsReceiptNote.findMany({
      where: { vendorId, isDeleted: false, status: 'accepted' },
      select: { receivedAt: true, po: { select: { expectedDeliveryDate: true } } },
    }),
  ]);

  let onTimeCount = 0;
  let lateCount = 0;
  for (const grn of avgDelivery) {
    if (grn.po.expectedDeliveryDate) {
      if (grn.receivedAt <= grn.po.expectedDeliveryDate) {
        onTimeCount++;
      } else {
        lateCount++;
      }
    }
  }

  const totalDeliveries = onTimeCount + lateCount;
  const onTimeRate = totalDeliveries > 0 ? Math.round((onTimeCount / totalDeliveries) * 100) : null;

  return {
    vendorId,
    totalPOs,
    completedPOs,
    grnCount,
    onTimeDeliveries: onTimeCount,
    lateDeliveries: lateCount,
    onTimeDeliveryRate: onTimeRate,
  };
}

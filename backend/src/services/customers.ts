import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';

// -- Indian GST state codes ---------------------------------------------------

const STATE_CODE_MAP: Record<string, string> = {
  'jammu and kashmir': '01', 'himachal pradesh': '02', 'punjab': '03',
  'chandigarh': '04', 'uttarakhand': '05', 'haryana': '06', 'delhi': '07',
  'rajasthan': '08', 'uttar pradesh': '09', 'bihar': '10', 'sikkim': '11',
  'arunachal pradesh': '12', 'nagaland': '13', 'manipur': '14', 'mizoram': '15',
  'tripura': '16', 'meghalaya': '17', 'assam': '18', 'west bengal': '19',
  'jharkhand': '20', 'odisha': '21', 'chhattisgarh': '22', 'madhya pradesh': '23',
  'gujarat': '24', 'dadra and nagar haveli and daman and diu': '26',
  'maharashtra': '27', 'andhra pradesh': '37', 'karnataka': '29',
  'goa': '30', 'lakshadweep': '31', 'kerala': '32', 'tamil nadu': '33',
  'puducherry': '34', 'andaman and nicobar islands': '35', 'telangana': '36',
  'ladakh': '38',
};

export function stateCodeFromName(state: string): string | null {
  return STATE_CODE_MAP[state.toLowerCase().trim()] ?? null;
}

// -- GST / PAN validation -----------------------------------------------------

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function validateGstin(gstin: string): { valid: boolean; stateCode?: string; error?: string } {
  const g = gstin.toUpperCase().trim();
  if (g.length !== 15) return { valid: false, error: 'GSTIN must be 15 characters' };
  if (!GSTIN_REGEX.test(g)) return { valid: false, error: 'Invalid GSTIN format' };
  return { valid: true, stateCode: g.substring(0, 2) };
}

export function validatePan(pan: string): { valid: boolean; error?: string } {
  const p = pan.toUpperCase().trim();
  if (p.length !== 10) return { valid: false, error: 'PAN must be 10 characters' };
  if (!PAN_REGEX.test(p)) return { valid: false, error: 'Invalid PAN format' };
  return { valid: true };
}

// -- Types --------------------------------------------------------------------

const CUSTOMER_TYPES = ['retail', 'dealer', 'architect', 'interior_designer', 'corporate'] as const;
type CustomerType = (typeof CUSTOMER_TYPES)[number];

export interface CreateCustomerInput {
  customerName: string;
  legalName?: string;
  customerType: string;
  gstin?: string;
  pan?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  creditLimit?: number;
  creditDays?: number;
  paymentTermsTemplateId?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  notes?: string;
  source?: string;
  linkedCustomerAccountId?: string;
}

export interface UpdateCustomerInput {
  customerName?: string;
  legalName?: string | null;
  customerType?: string;
  gstin?: string | null;
  pan?: string | null;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  creditLimit?: number | null;
  creditDays?: number | null;
  paymentTermsTemplateId?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  notes?: string | null;
  linkedCustomerAccountId?: string | null;
}

export interface ListCustomerFilters {
  type?: string;
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

// -- Service functions --------------------------------------------------------

export async function createCustomer(input: CreateCustomerInput) {
  if (!CUSTOMER_TYPES.includes(input.customerType as CustomerType)) {
    throw new ValidationError(`Invalid customer type. Allowed: ${CUSTOMER_TYPES.join(', ')}`, { field: 'customerType' });
  }

  if (input.gstin) {
    const gstResult = validateGstin(input.gstin);
    if (!gstResult.valid) throw new ValidationError(gstResult.error!, { field: 'gstin' });
    const existing = await prisma.customer.findFirst({ where: { gstin: input.gstin.toUpperCase(), isDeleted: false } });
    if (existing) throw new ConflictError('A customer with this GSTIN already exists');
  }

  if (input.pan) {
    const panResult = validatePan(input.pan);
    if (!panResult.valid) throw new ValidationError(panResult.error!, { field: 'pan' });
  }

  const { number: customerCode } = await getNextNumber('CUST');

  const customer = await prisma.customer.create({
    data: {
      customerCode,
      customerName: input.customerName,
      legalName: input.legalName,
      customerType: input.customerType,
      gstin: input.gstin?.toUpperCase() ?? null,
      pan: input.pan?.toUpperCase() ?? null,
      primaryPhone: input.primaryPhone,
      primaryEmail: input.primaryEmail,
      creditLimit: input.creditLimit,
      creditDays: input.creditDays,
      paymentTermsTemplateId: input.paymentTermsTemplateId,
      bankName: input.bankName,
      bankAccountNumber: input.bankAccountNumber,
      bankIfsc: input.bankIfsc,
      notes: input.notes,
      source: input.source ?? 'manual',
      linkedCustomerAccountId: input.linkedCustomerAccountId,
    },
  });

  return { customer };
}

export async function listCustomers(filters: ListCustomerFilters) {
  const where: Prisma.CustomerWhereInput = { isDeleted: false };
  if (filters.type) where.customerType = filters.type;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.search) {
    where.OR = [
      { customerName: { contains: filters.search, mode: 'insensitive' } },
      { customerCode: { contains: filters.search, mode: 'insensitive' } },
      { primaryEmail: { contains: filters.search, mode: 'insensitive' } },
      { primaryPhone: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return { total, page: filters.page, limit: filters.limit, customers };
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, isDeleted: false },
    include: {
      addresses: true,
      contacts: { orderBy: { isPrimary: 'desc' } },
      tierPricing: true,
      paymentTermsTemplate: { include: { milestones: { orderBy: { milestoneSequence: 'asc' } } } },
    },
  });
  if (!customer) throw new NotFoundError('Customer not found');
  return { customer };
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const existing = await prisma.customer.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Customer not found');

  if (input.gstin !== undefined && input.gstin !== null) {
    const gstResult = validateGstin(input.gstin);
    if (!gstResult.valid) throw new ValidationError(gstResult.error!, { field: 'gstin' });
    const dup = await prisma.customer.findFirst({ where: { gstin: input.gstin.toUpperCase(), isDeleted: false, NOT: { id } } });
    if (dup) throw new ConflictError('A customer with this GSTIN already exists');
  }

  if (input.pan !== undefined && input.pan !== null) {
    const panResult = validatePan(input.pan);
    if (!panResult.valid) throw new ValidationError(panResult.error!, { field: 'pan' });
  }

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(input.customerName !== undefined && { customerName: input.customerName }),
      ...(input.legalName !== undefined && { legalName: input.legalName }),
      ...(input.customerType !== undefined && { customerType: input.customerType }),
      ...(input.gstin !== undefined && { gstin: input.gstin?.toUpperCase() ?? null }),
      ...(input.pan !== undefined && { pan: input.pan?.toUpperCase() ?? null }),
      ...(input.primaryPhone !== undefined && { primaryPhone: input.primaryPhone }),
      ...(input.primaryEmail !== undefined && { primaryEmail: input.primaryEmail }),
      ...(input.creditLimit !== undefined && { creditLimit: input.creditLimit }),
      ...(input.creditDays !== undefined && { creditDays: input.creditDays }),
      ...(input.paymentTermsTemplateId !== undefined && { paymentTermsTemplateId: input.paymentTermsTemplateId }),
      ...(input.bankName !== undefined && { bankName: input.bankName }),
      ...(input.bankAccountNumber !== undefined && { bankAccountNumber: input.bankAccountNumber }),
      ...(input.bankIfsc !== undefined && { bankIfsc: input.bankIfsc }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.linkedCustomerAccountId !== undefined && { linkedCustomerAccountId: input.linkedCustomerAccountId }),
    },
  });

  return { customer };
}

export async function softDeleteCustomer(id: string, actorId: string) {
  const existing = await prisma.customer.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Customer not found');

  const activeOrders = await prisma.order.count({
    where: { customerId: id, isDeleted: false, status: { notIn: ['completed', 'cancelled'] } },
  });
  if (activeOrders > 0) {
    throw new ConflictError('Cannot delete customer with active orders');
  }

  await prisma.customer.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedById: actorId, isActive: false },
  });
}

export async function reactivateCustomer(id: string) {
  const existing = await prisma.customer.findFirst({ where: { id } });
  if (!existing) throw new NotFoundError('Customer not found');
  const customer = await prisma.customer.update({
    where: { id },
    data: { isActive: true, isDeleted: false, deletedAt: null, deletedById: null, isBlacklisted: false },
  });
  return { customer };
}

export async function blacklistCustomer(id: string, reason: string) {
  const existing = await prisma.customer.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Customer not found');
  const customer = await prisma.customer.update({
    where: { id },
    data: { isBlacklisted: true, isActive: false, notes: existing.notes ? `${existing.notes}\n[Blacklisted] ${reason}` : `[Blacklisted] ${reason}` },
  });
  return { customer };
}

// -- Addresses ----------------------------------------------------------------

export interface CreateAddressInput {
  addressType: string;
  contactPerson?: string;
  contactPhone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  isDefaultBilling?: boolean;
  isDefaultShipping?: boolean;
  notes?: string;
}

export async function createAddress(customerId: string, input: CreateAddressInput) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, isDeleted: false } });
  if (!customer) throw new NotFoundError('Customer not found');

  const stateCode = stateCodeFromName(input.state);

  if (input.isDefaultBilling) {
    await prisma.customerAddress.updateMany({ where: { customerId, isDefaultBilling: true }, data: { isDefaultBilling: false } });
  }
  if (input.isDefaultShipping) {
    await prisma.customerAddress.updateMany({ where: { customerId, isDefaultShipping: true }, data: { isDefaultShipping: false } });
  }

  const address = await prisma.customerAddress.create({
    data: {
      customerId,
      addressType: input.addressType,
      contactPerson: input.contactPerson,
      contactPhone: input.contactPhone,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      stateCode,
      pincode: input.pincode,
      country: input.country ?? 'India',
      isDefaultBilling: input.isDefaultBilling ?? false,
      isDefaultShipping: input.isDefaultShipping ?? false,
      notes: input.notes,
    },
  });

  if (input.isDefaultBilling) {
    await prisma.customer.update({ where: { id: customerId }, data: { defaultBillingAddressId: address.id } });
  }
  if (input.isDefaultShipping) {
    await prisma.customer.update({ where: { id: customerId }, data: { defaultShippingAddressId: address.id } });
  }

  return { address };
}

export async function updateAddress(addressId: string, input: Partial<CreateAddressInput>) {
  const existing = await prisma.customerAddress.findUnique({ where: { id: addressId } });
  if (!existing) throw new NotFoundError('Address not found');

  const stateCode = input.state ? stateCodeFromName(input.state) : undefined;

  if (input.isDefaultBilling) {
    await prisma.customerAddress.updateMany({ where: { customerId: existing.customerId, isDefaultBilling: true }, data: { isDefaultBilling: false } });
  }
  if (input.isDefaultShipping) {
    await prisma.customerAddress.updateMany({ where: { customerId: existing.customerId, isDefaultShipping: true }, data: { isDefaultShipping: false } });
  }

  const address = await prisma.customerAddress.update({
    where: { id: addressId },
    data: {
      ...(input.addressType !== undefined && { addressType: input.addressType }),
      ...(input.contactPerson !== undefined && { contactPerson: input.contactPerson }),
      ...(input.contactPhone !== undefined && { contactPhone: input.contactPhone }),
      ...(input.addressLine1 !== undefined && { addressLine1: input.addressLine1 }),
      ...(input.addressLine2 !== undefined && { addressLine2: input.addressLine2 }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state, stateCode: stateCode ?? null }),
      ...(input.pincode !== undefined && { pincode: input.pincode }),
      ...(input.country !== undefined && { country: input.country }),
      ...(input.isDefaultBilling !== undefined && { isDefaultBilling: input.isDefaultBilling }),
      ...(input.isDefaultShipping !== undefined && { isDefaultShipping: input.isDefaultShipping }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });

  if (input.isDefaultBilling) {
    await prisma.customer.update({ where: { id: existing.customerId }, data: { defaultBillingAddressId: address.id } });
  }
  if (input.isDefaultShipping) {
    await prisma.customer.update({ where: { id: existing.customerId }, data: { defaultShippingAddressId: address.id } });
  }

  return { address };
}

export async function deleteAddress(addressId: string) {
  const existing = await prisma.customerAddress.findUnique({ where: { id: addressId } });
  if (!existing) throw new NotFoundError('Address not found');

  const activeOrderUsage = await prisma.order.count({
    where: {
      isDeleted: false,
      status: { notIn: ['completed', 'cancelled'] },
      OR: [{ billingAddressId: addressId }, { defaultShippingAddressId: addressId }],
    },
  });
  if (activeOrderUsage > 0) throw new ConflictError('Cannot delete address used in active orders');

  await prisma.customerAddress.delete({ where: { id: addressId } });
}

// -- Contacts -----------------------------------------------------------------

export interface CreateContactInput {
  contactName: string;
  designation?: string;
  phone?: string;
  email?: string;
  role?: string;
  isPrimary?: boolean;
  notes?: string;
}

export async function createContact(customerId: string, input: CreateContactInput) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, isDeleted: false } });
  if (!customer) throw new NotFoundError('Customer not found');

  if (input.isPrimary) {
    await prisma.customerContact.updateMany({ where: { customerId, isPrimary: true }, data: { isPrimary: false } });
  }

  const contact = await prisma.customerContact.create({
    data: {
      customerId,
      contactName: input.contactName,
      designation: input.designation,
      phone: input.phone,
      email: input.email,
      role: input.role,
      isPrimary: input.isPrimary ?? false,
      notes: input.notes,
    },
  });

  return { contact };
}

export async function updateContact(contactId: string, input: Partial<CreateContactInput>) {
  const existing = await prisma.customerContact.findUnique({ where: { id: contactId } });
  if (!existing) throw new NotFoundError('Contact not found');

  if (input.isPrimary) {
    await prisma.customerContact.updateMany({ where: { customerId: existing.customerId, isPrimary: true }, data: { isPrimary: false } });
  }

  const contact = await prisma.customerContact.update({
    where: { id: contactId },
    data: {
      ...(input.contactName !== undefined && { contactName: input.contactName }),
      ...(input.designation !== undefined && { designation: input.designation }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });

  return { contact };
}

export async function deleteContact(contactId: string) {
  const existing = await prisma.customerContact.findUnique({ where: { id: contactId } });
  if (!existing) throw new NotFoundError('Contact not found');

  if (existing.isPrimary) {
    const otherContact = await prisma.customerContact.findFirst({
      where: { customerId: existing.customerId, id: { not: contactId } },
    });
    if (otherContact) {
      await prisma.customerContact.update({ where: { id: otherContact.id }, data: { isPrimary: true } });
    }
  }

  await prisma.customerContact.delete({ where: { id: contactId } });
}

// -- Tier Pricing -------------------------------------------------------------

export interface CreateTierPricingInput {
  productId?: string;
  productCategoryId?: string;
  discountPercent?: number;
  specialPrice?: number;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
}

export async function createTierPricing(customerId: string, input: CreateTierPricingInput) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, isDeleted: false } });
  if (!customer) throw new NotFoundError('Customer not found');

  const tier = await prisma.customerTierPricing.create({
    data: {
      customerId,
      productId: input.productId,
      productCategoryId: input.productCategoryId,
      discountPercent: input.discountPercent,
      specialPrice: input.specialPrice,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      notes: input.notes,
    },
  });

  return { tierPricing: tier };
}

export async function listTierPricing(customerId: string) {
  const customer = await prisma.customer.findFirst({ where: { id: customerId, isDeleted: false } });
  if (!customer) throw new NotFoundError('Customer not found');

  const tiers = await prisma.customerTierPricing.findMany({
    where: { customerId },
    include: { product: { select: { id: true, productCode: true, productName: true } }, productCategory: { select: { id: true, categoryCode: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return { tierPricing: tiers };
}

export async function deleteTierPricing(tierId: string) {
  const existing = await prisma.customerTierPricing.findUnique({ where: { id: tierId } });
  if (!existing) throw new NotFoundError('Tier pricing not found');
  await prisma.customerTierPricing.delete({ where: { id: tierId } });
}

// -- CSV Import ---------------------------------------------------------------

export interface CsvRow {
  customer_name: string;
  legal_name?: string;
  customer_type: string;
  gstin?: string;
  pan?: string;
  primary_phone?: string;
  primary_email?: string;
  credit_limit?: string;
  credit_days?: string;
  notes?: string;
}

export async function importCustomersCsv(rows: CsvRow[], importedBy?: string) {
  const batch = await prisma.orderImportBatch.create({
    data: {
      batchCode: `CUST-IMP-${Date.now()}`,
      fileName: 'customers.csv',
      totalRows: rows.length,
      status: 'processing',
      importedBy,
    },
  });

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (!row.customer_name?.trim()) throw new Error('customer_name is required');
      if (!row.customer_type?.trim()) throw new Error('customer_type is required');
      if (!CUSTOMER_TYPES.includes(row.customer_type.trim() as CustomerType)) {
        throw new Error(`Invalid customer_type. Allowed: ${CUSTOMER_TYPES.join(', ')}`);
      }

      if (row.gstin) {
        const gstResult = validateGstin(row.gstin);
        if (!gstResult.valid) throw new Error(gstResult.error);
        const dup = await prisma.customer.findFirst({ where: { gstin: row.gstin.toUpperCase(), isDeleted: false } });
        if (dup) throw new Error(`GSTIN ${row.gstin} already exists`);
      }

      if (row.pan) {
        const panResult = validatePan(row.pan);
        if (!panResult.valid) throw new Error(panResult.error);
      }

      const { number: customerCode } = await getNextNumber('CUST');
      await prisma.customer.create({
        data: {
          customerCode,
          customerName: row.customer_name.trim(),
          legalName: row.legal_name?.trim() || null,
          customerType: row.customer_type.trim(),
          gstin: row.gstin?.toUpperCase() || null,
          pan: row.pan?.toUpperCase() || null,
          primaryPhone: row.primary_phone || null,
          primaryEmail: row.primary_email || null,
          creditLimit: row.credit_limit ? parseFloat(row.credit_limit) : null,
          creditDays: row.credit_days ? parseInt(row.credit_days, 10) : null,
          notes: row.notes || null,
          source: 'csv_import',
        },
      });
      successCount++;
    } catch (err) {
      errorCount++;
      await prisma.orderImportError.create({
        data: {
          batchId: batch.id,
          rowNumber: i + 2, // 1-indexed + header row
          message: err instanceof Error ? err.message : 'Unknown error',
          rowData: row as unknown as Prisma.JsonObject,
        },
      });
    }
  }

  await prisma.orderImportBatch.update({
    where: { id: batch.id },
    data: { successCount, errorCount, status: errorCount === rows.length ? 'failed' : 'completed' },
  });

  return { batchId: batch.id, totalRows: rows.length, successCount, errorCount };
}

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getNextNumber } from './numbering';

const CUSTOMER_TYPES = ['retail', 'dealer', 'architect', 'interior_designer', 'corporate'] as const;

// -- Product Categories -------------------------------------------------------

export interface CreateCategoryInput {
  categoryCode: string;
  name: string;
  parentCategoryId?: string | null;
  description?: string | null;
  displayOrder?: number;
}

export async function createCategory(input: CreateCategoryInput) {
  const existing = await prisma.productCategory.findUnique({ where: { categoryCode: input.categoryCode } });
  if (existing) throw new ConflictError('Category code already exists');

  if (input.parentCategoryId) {
    const parent = await prisma.productCategory.findUnique({ where: { id: input.parentCategoryId } });
    if (!parent) throw new ValidationError('Parent category not found', { field: 'parentCategoryId' });
  }

  const category = await prisma.productCategory.create({
    data: {
      categoryCode: input.categoryCode,
      name: input.name,
      parentCategoryId: input.parentCategoryId ?? null,
      description: input.description,
      displayOrder: input.displayOrder ?? 0,
    },
  });
  return { category };
}

export async function listCategories() {
  const categories = await prisma.productCategory.findMany({
    where: { isActive: true },
    include: { children: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } } },
    orderBy: { displayOrder: 'asc' },
  });

  // Build tree: return only root-level items (parentCategoryId = null) with nested children
  const roots = categories.filter((c) => !c.parentCategoryId);
  return { categories: roots };
}

export async function getCategory(id: string) {
  const category = await prisma.productCategory.findUnique({
    where: { id },
    include: { children: { where: { isActive: true }, orderBy: { displayOrder: 'asc' } }, products: { where: { isDeleted: false }, take: 5 } },
  });
  if (!category) throw new NotFoundError('Category not found');
  return { category };
}

export async function updateCategory(id: string, input: Partial<CreateCategoryInput>) {
  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Category not found');

  if (input.parentCategoryId === id) throw new ValidationError('Category cannot be its own parent');

  const category = await prisma.productCategory.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.parentCategoryId !== undefined && { parentCategoryId: input.parentCategoryId }),
      ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
    },
  });
  return { category };
}

export async function deleteCategory(id: string) {
  const existing = await prisma.productCategory.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Category not found');

  const childCount = await prisma.productCategory.count({ where: { parentCategoryId: id, isActive: true } });
  if (childCount > 0) throw new ConflictError('Cannot delete category with active subcategories');

  const productCount = await prisma.product.count({ where: { categoryId: id, isDeleted: false } });
  if (productCount > 0) throw new ConflictError('Cannot delete category with active products');

  await prisma.productCategory.update({ where: { id }, data: { isActive: false } });
}

// -- Products -----------------------------------------------------------------

export interface CreateProductInput {
  productCode?: string;
  productName: string;
  categoryId: string;
  description?: string;
  standardDimensions?: Record<string, number>;
  hsnCode?: string;
  basePrice: number;
  uom?: string;
  taxRatePercent: number;
  requiresInstallation?: boolean;
  warrantyPeriodMonths?: number;
  weightKg?: number;
  imageUrl?: string;
  isCustom?: boolean;
}

export interface UpdateProductInput {
  productName?: string;
  categoryId?: string;
  description?: string | null;
  standardDimensions?: Record<string, number> | null;
  hsnCode?: string | null;
  basePrice?: number;
  uom?: string;
  taxRatePercent?: number;
  requiresInstallation?: boolean;
  warrantyPeriodMonths?: number | null;
  weightKg?: number | null;
  imageUrl?: string | null;
  isCustom?: boolean;
}

export interface ListProductFilters {
  category?: string;
  search?: string;
  isActive?: boolean;
  isCustom?: boolean;
  page: number;
  limit: number;
}

function validateHsn(code: string): boolean {
  return /^[0-9]{4,8}$/.test(code);
}

export async function createProduct(input: CreateProductInput) {
  const category = await prisma.productCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new ValidationError('Category not found', { field: 'categoryId' });

  if (input.hsnCode && !validateHsn(input.hsnCode)) {
    throw new ValidationError('HSN code must be 4-8 digits', { field: 'hsnCode' });
  }

  let productCode = input.productCode;
  if (!productCode) {
    const { number } = await getNextNumber('ORD'); // Using a generic series; we'll add PROD series
    productCode = number.replace('ORD', 'PROD');
  } else {
    const dup = await prisma.product.findUnique({ where: { productCode } });
    if (dup) throw new ConflictError('Product code already exists');
  }

  const product = await prisma.product.create({
    data: {
      productCode,
      productName: input.productName,
      categoryId: input.categoryId,
      description: input.description,
      standardDimensions: input.standardDimensions ?? Prisma.JsonNull,
      hsnCode: input.hsnCode,
      basePrice: input.basePrice,
      uom: input.uom ?? 'PCS',
      taxRatePercent: input.taxRatePercent,
      requiresInstallation: input.requiresInstallation ?? false,
      warrantyPeriodMonths: input.warrantyPeriodMonths,
      weightKg: input.weightKg,
      imageUrl: input.imageUrl,
      isCustom: input.isCustom ?? false,
    },
  });

  return { product };
}

export async function listProducts(filters: ListProductFilters) {
  const where: Prisma.ProductWhereInput = { isDeleted: false };
  if (filters.category) where.categoryId = filters.category;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.isCustom !== undefined) where.isCustom = filters.isCustom;
  if (filters.search) {
    where.OR = [
      { productName: { contains: filters.search, mode: 'insensitive' } },
      { productCode: { contains: filters.search, mode: 'insensitive' } },
      { hsnCode: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: { select: { id: true, categoryCode: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return { total, page: filters.page, limit: filters.limit, products };
}

export async function getProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: { id, isDeleted: false },
    include: {
      category: { select: { id: true, categoryCode: true, name: true } },
      sizeVariants: { where: { isActive: true }, orderBy: { variantName: 'asc' } },
      tierPricing: { orderBy: { customerType: 'asc' } },
    },
  });
  if (!product) throw new NotFoundError('Product not found');
  return { product };
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await prisma.product.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Product not found');

  if (input.categoryId) {
    const cat = await prisma.productCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw new ValidationError('Category not found', { field: 'categoryId' });
  }

  if (input.hsnCode && !validateHsn(input.hsnCode)) {
    throw new ValidationError('HSN code must be 4-8 digits', { field: 'hsnCode' });
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(input.productName !== undefined && { productName: input.productName }),
      ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.standardDimensions !== undefined && { standardDimensions: input.standardDimensions ?? Prisma.JsonNull }),
      ...(input.hsnCode !== undefined && { hsnCode: input.hsnCode }),
      ...(input.basePrice !== undefined && { basePrice: input.basePrice }),
      ...(input.uom !== undefined && { uom: input.uom }),
      ...(input.taxRatePercent !== undefined && { taxRatePercent: input.taxRatePercent }),
      ...(input.requiresInstallation !== undefined && { requiresInstallation: input.requiresInstallation }),
      ...(input.warrantyPeriodMonths !== undefined && { warrantyPeriodMonths: input.warrantyPeriodMonths }),
      ...(input.weightKg !== undefined && { weightKg: input.weightKg }),
      ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
      ...(input.isCustom !== undefined && { isCustom: input.isCustom }),
    },
  });

  return { product };
}

export async function softDeleteProduct(id: string, actorId: string) {
  const existing = await prisma.product.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw new NotFoundError('Product not found');

  const activeOrderLines = await prisma.orderLine.count({
    where: {
      productId: id,
      order: { isDeleted: false, status: { notIn: ['completed', 'cancelled'] } },
    },
  });
  if (activeOrderLines > 0) throw new ConflictError('Cannot delete product used in active orders');

  await prisma.product.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedById: actorId, isActive: false },
  });
}

// -- Size Variants ------------------------------------------------------------

export interface CreateVariantInput {
  variantName: string;
  dimensions?: Record<string, number>;
  variantSku?: string;
  priceOverride?: number;
  weightKg?: number;
}

export async function createVariant(productId: string, input: CreateVariantInput) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDeleted: false } });
  if (!product) throw new NotFoundError('Product not found');

  if (input.variantSku) {
    const dup = await prisma.productSizeVariant.findFirst({ where: { variantSku: input.variantSku } });
    if (dup) throw new ConflictError('Variant SKU already exists');
  }

  const variant = await prisma.productSizeVariant.create({
    data: {
      productId,
      variantName: input.variantName,
      dimensions: input.dimensions ?? Prisma.JsonNull,
      variantSku: input.variantSku,
      priceOverride: input.priceOverride,
      weightKg: input.weightKg,
    },
  });

  return { variant };
}

export async function listVariants(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDeleted: false } });
  if (!product) throw new NotFoundError('Product not found');

  const variants = await prisma.productSizeVariant.findMany({
    where: { productId, isActive: true },
    orderBy: { variantName: 'asc' },
  });
  return { variants };
}

export async function updateVariant(variantId: string, input: Partial<CreateVariantInput>) {
  const existing = await prisma.productSizeVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw new NotFoundError('Variant not found');

  const variant = await prisma.productSizeVariant.update({
    where: { id: variantId },
    data: {
      ...(input.variantName !== undefined && { variantName: input.variantName }),
      ...(input.dimensions !== undefined && { dimensions: input.dimensions ?? Prisma.JsonNull }),
      ...(input.variantSku !== undefined && { variantSku: input.variantSku }),
      ...(input.priceOverride !== undefined && { priceOverride: input.priceOverride }),
      ...(input.weightKg !== undefined && { weightKg: input.weightKg }),
    },
  });
  return { variant };
}

export async function deleteVariant(variantId: string) {
  const existing = await prisma.productSizeVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw new NotFoundError('Variant not found');

  await prisma.productSizeVariant.update({ where: { id: variantId }, data: { isActive: false } });
}

// -- Tier Pricing -------------------------------------------------------------

export interface CreateProductTierInput {
  customerType: string;
  discountPercent?: number;
  fixedPrice?: number;
  validFrom?: string;
  validUntil?: string;
}

export async function createTierPricing(productId: string, input: CreateProductTierInput) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDeleted: false } });
  if (!product) throw new NotFoundError('Product not found');

  if (!CUSTOMER_TYPES.includes(input.customerType as (typeof CUSTOMER_TYPES)[number])) {
    throw new ValidationError(`Invalid customer type. Allowed: ${CUSTOMER_TYPES.join(', ')}`, { field: 'customerType' });
  }

  if (!input.discountPercent && !input.fixedPrice) {
    throw new ValidationError('Either discountPercent or fixedPrice is required');
  }

  const tier = await prisma.productTierPricing.create({
    data: {
      productId,
      customerType: input.customerType,
      discountPercent: input.discountPercent,
      fixedPrice: input.fixedPrice,
      validFrom: input.validFrom ? new Date(input.validFrom) : null,
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
    },
  });

  return { tierPricing: tier };
}

export async function listTierPricing(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDeleted: false } });
  if (!product) throw new NotFoundError('Product not found');

  const tiers = await prisma.productTierPricing.findMany({
    where: { productId },
    orderBy: { customerType: 'asc' },
  });
  return { tierPricing: tiers };
}

export async function deleteTierPricing(tierId: string) {
  const existing = await prisma.productTierPricing.findUnique({ where: { id: tierId } });
  if (!existing) throw new NotFoundError('Tier pricing not found');
  await prisma.productTierPricing.delete({ where: { id: tierId } });
}

// -- Image Upload -------------------------------------------------------------

export async function updateProductImage(productId: string, imageUrl: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDeleted: false } });
  if (!product) throw new NotFoundError('Product not found');

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { imageUrl },
  });
  return { product: updated };
}

// -- CSV Import ---------------------------------------------------------------

export interface ProductCsvRow {
  product_code?: string;
  product_name: string;
  category_code: string;
  description?: string;
  hsn_code?: string;
  base_price: string;
  uom?: string;
  tax_rate_percent: string;
  requires_installation?: string;
  warranty_period_months?: string;
  weight_kg?: string;
  is_custom?: string;
}

export async function importProductsCsv(rows: ProductCsvRow[], importedBy?: string) {
  const batch = await prisma.orderImportBatch.create({
    data: {
      batchCode: `PROD-IMP-${Date.now()}`,
      fileName: 'products.csv',
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
      if (!row.product_name?.trim()) throw new Error('product_name is required');
      if (!row.category_code?.trim()) throw new Error('category_code is required');
      if (!row.base_price) throw new Error('base_price is required');
      if (!row.tax_rate_percent) throw new Error('tax_rate_percent is required');

      const category = await prisma.productCategory.findUnique({ where: { categoryCode: row.category_code.trim() } });
      if (!category) throw new Error(`Category "${row.category_code}" not found`);

      if (row.hsn_code && !validateHsn(row.hsn_code)) {
        throw new Error('HSN code must be 4-8 digits');
      }

      let productCode = row.product_code?.trim();
      if (!productCode) {
        const { number } = await getNextNumber('ORD');
        productCode = number.replace('ORD', 'PROD');
      } else {
        const dup = await prisma.product.findUnique({ where: { productCode } });
        if (dup) throw new Error(`Product code "${productCode}" already exists`);
      }

      await prisma.product.create({
        data: {
          productCode,
          productName: row.product_name.trim(),
          categoryId: category.id,
          description: row.description?.trim() || null,
          hsnCode: row.hsn_code?.trim() || null,
          basePrice: parseFloat(row.base_price),
          uom: row.uom?.trim() || 'PCS',
          taxRatePercent: parseFloat(row.tax_rate_percent),
          requiresInstallation: row.requires_installation === 'true',
          warrantyPeriodMonths: row.warranty_period_months ? parseInt(row.warranty_period_months, 10) : null,
          weightKg: row.weight_kg ? parseFloat(row.weight_kg) : null,
          isCustom: row.is_custom === 'true',
        },
      });
      successCount++;
    } catch (err) {
      errorCount++;
      await prisma.orderImportError.create({
        data: {
          batchId: batch.id,
          rowNumber: i + 2,
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

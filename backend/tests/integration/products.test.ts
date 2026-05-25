import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';

let app: Application;
let adminToken: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Product Categories', () => {
  let categoryId: string;
  const catCode = `CAT_${Date.now()}`;

  it('creates a category', async () => {
    const res = await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode: catCode, name: 'Office Desks', description: 'All desk types' });
    expect(res.status).toBe(201);
    categoryId = res.body.data.category.id;
  });

  it('rejects duplicate category code', async () => {
    const res = await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode: catCode, name: 'Duplicate' });
    expect(res.status).toBe(409);
  });

  it('creates a child category', async () => {
    const res = await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode: `${catCode}_CHILD`, name: 'Executive Desks', parentCategoryId: categoryId });
    expect(res.status).toBe(201);
    expect(res.body.data.category.parentCategoryId).toBe(categoryId);
  });

  it('lists categories as tree', async () => {
    const res = await request(app)
      .get('/api/product-categories')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.categories.length).toBeGreaterThan(0);
  });

  it('gets a category by ID', async () => {
    const res = await request(app)
      .get(`/api/product-categories/${categoryId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.category.children.length).toBeGreaterThan(0);
  });

  it('updates a category', async () => {
    const res = await request(app)
      .put(`/api/product-categories/${categoryId}`)
      .set(auth(adminToken))
      .send({ name: 'Office Desks Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.category.name).toBe('Office Desks Updated');
  });
});

describe('Products CRUD', () => {
  let categoryId: string;
  let productId: string;

  beforeAll(async () => {
    const catRes = await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode: `PCAT_${Date.now()}`, name: 'Test Products' });
    categoryId = catRes.body.data.category.id;
  });

  it('creates a product with auto-generated code', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        productName: 'Executive Desk Pro',
        categoryId,
        basePrice: 45000,
        taxRatePercent: 18,
        hsnCode: '94036090',
        uom: 'PCS',
        requiresInstallation: true,
        warrantyPeriodMonths: 12,
        weightKg: 85,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.product.productCode).toBeTruthy();
    productId = res.body.data.product.id;
  });

  it('creates a product with manual code', async () => {
    const code = `MANUAL_${Date.now()}`;
    const res = await request(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        productCode: code,
        productName: 'Storage Cabinet',
        categoryId,
        basePrice: 15000,
        taxRatePercent: 18,
        hsnCode: '94035000',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.product.productCode).toBe(code);
  });

  it('rejects invalid HSN code', async () => {
    const res = await request(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({
        productName: 'Bad HSN',
        categoryId,
        basePrice: 1000,
        taxRatePercent: 18,
        hsnCode: 'ABC',
      });
    expect(res.status).toBe(400);
  });

  it('lists products with search', async () => {
    const res = await request(app)
      .get('/api/products?search=Executive')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.products.length).toBeGreaterThan(0);
    expect(res.body.data.total).toBeGreaterThan(0);
  });

  it('lists products filtered by category', async () => {
    const res = await request(app)
      .get(`/api/products?category=${categoryId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    for (const p of res.body.data.products) {
      expect(p.categoryId).toBe(categoryId);
    }
  });

  it('gets a product with includes', async () => {
    const res = await request(app)
      .get(`/api/products/${productId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.product.category).toBeDefined();
    expect(res.body.data.product.sizeVariants).toBeDefined();
    expect(res.body.data.product.tierPricing).toBeDefined();
  });

  it('updates a product', async () => {
    const res = await request(app)
      .put(`/api/products/${productId}`)
      .set(auth(adminToken))
      .send({ basePrice: 48000, warrantyPeriodMonths: 24 });
    expect(res.status).toBe(200);
  });

  it('soft-deletes a product', async () => {
    const res = await request(app)
      .delete(`/api/products/${productId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);

    const get = await request(app)
      .get(`/api/products/${productId}`)
      .set(auth(adminToken));
    expect(get.status).toBe(404);
  });
});

describe('Size Variants', () => {
  let categoryId: string;
  let productId: string;
  let variantId: string;

  beforeAll(async () => {
    const catRes = await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode: `VCAT_${Date.now()}`, name: 'Variant Cat' });
    categoryId = catRes.body.data.category.id;

    const prodRes = await request(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ productName: 'Modular Desk', categoryId, basePrice: 30000, taxRatePercent: 18 });
    productId = prodRes.body.data.product.id;
  });

  it('creates a size variant', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/variants`)
      .set(auth(adminToken))
      .send({
        variantName: '1200x600',
        dimensions: { L: 1200, W: 600, H: 750 },
        variantSku: `SKU_${Date.now()}`,
        priceOverride: 32000,
      });
    expect(res.status).toBe(201);
    variantId = res.body.data.variant.id;
  });

  it('creates a variant without price override (uses base)', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/variants`)
      .set(auth(adminToken))
      .send({ variantName: '1500x750', dimensions: { L: 1500, W: 750, H: 750 } });
    expect(res.status).toBe(201);
    expect(res.body.data.variant.priceOverride).toBeNull();
  });

  it('lists variants', async () => {
    const res = await request(app)
      .get(`/api/products/${productId}/variants`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.variants.length).toBe(2);
  });

  it('updates a variant', async () => {
    const res = await request(app)
      .put(`/api/products/variants/${variantId}`)
      .set(auth(adminToken))
      .send({ priceOverride: 33000 });
    expect(res.status).toBe(200);
  });

  it('deletes a variant (soft)', async () => {
    const res = await request(app)
      .delete(`/api/products/variants/${variantId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });
});

describe('Product Tier Pricing', () => {
  let categoryId: string;
  let productId: string;
  let tierId: string;

  beforeAll(async () => {
    const catRes = await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode: `TCAT_${Date.now()}`, name: 'Tier Cat' });
    categoryId = catRes.body.data.category.id;

    const prodRes = await request(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ productName: 'Tier Test Product', categoryId, basePrice: 20000, taxRatePercent: 18 });
    productId = prodRes.body.data.product.id;
  });

  it('creates tier pricing with discount', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/tier-pricing`)
      .set(auth(adminToken))
      .send({ customerType: 'dealer', discountPercent: 20 });
    expect(res.status).toBe(201);
    tierId = res.body.data.tierPricing.id;
  });

  it('creates tier pricing with fixed price', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/tier-pricing`)
      .set(auth(adminToken))
      .send({ customerType: 'corporate', fixedPrice: 17000 });
    expect(res.status).toBe(201);
  });

  it('rejects tier without discount or price', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/tier-pricing`)
      .set(auth(adminToken))
      .send({ customerType: 'retail' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid customer type', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/tier-pricing`)
      .set(auth(adminToken))
      .send({ customerType: 'unknown', discountPercent: 5 });
    expect(res.status).toBe(400);
  });

  it('lists tier pricing', async () => {
    const res = await request(app)
      .get(`/api/products/${productId}/tier-pricing`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.tierPricing.length).toBe(2);
  });

  it('deletes tier pricing', async () => {
    const res = await request(app)
      .delete(`/api/products/tier-pricing/${tierId}`)
      .set(auth(adminToken));
    expect(res.status).toBe(200);
  });
});

describe('Product Image', () => {
  let productId: string;

  beforeAll(async () => {
    const catRes = await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode: `ICAT_${Date.now()}`, name: 'Image Cat' });
    const prodRes = await request(app)
      .post('/api/products')
      .set(auth(adminToken))
      .send({ productName: 'Image Product', categoryId: catRes.body.data.category.id, basePrice: 5000, taxRatePercent: 18 });
    productId = prodRes.body.data.product.id;
  });

  it('updates product image URL', async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/image`)
      .set(auth(adminToken))
      .send({ imageUrl: '/uploads/2026/05/test-image.jpg' });
    expect(res.status).toBe(200);
    expect(res.body.data.product.imageUrl).toBe('/uploads/2026/05/test-image.jpg');
  });
});

describe('Product CSV Import', () => {
  let categoryCode: string;

  beforeAll(async () => {
    categoryCode = `CSVCAT_${Date.now()}`;
    await request(app)
      .post('/api/product-categories')
      .set(auth(adminToken))
      .send({ categoryCode, name: 'CSV Import Cat' });
  });

  it('imports valid product rows', async () => {
    const res = await request(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .send({
        rows: [
          { product_name: 'CSV Desk', category_code: categoryCode, base_price: '25000', tax_rate_percent: '18', hsn_code: '94036090' },
          { product_name: 'CSV Chair', category_code: categoryCode, base_price: '8000', tax_rate_percent: '18' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.successCount).toBe(2);
    expect(res.body.data.errorCount).toBe(0);
  });

  it('reports errors on invalid rows', async () => {
    const res = await request(app)
      .post('/api/products/import')
      .set(auth(adminToken))
      .send({
        rows: [
          { product_name: '', category_code: categoryCode, base_price: '1000', tax_rate_percent: '18' },
          { product_name: 'Good', category_code: 'NONEXISTENT', base_price: '1000', tax_rate_percent: '18' },
          { product_name: 'Bad HSN', category_code: categoryCode, base_price: '1000', tax_rate_percent: '18', hsn_code: 'XX' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data.successCount).toBe(0);
    expect(res.body.data.errorCount).toBe(3);
  });

  it('downloads import template', async () => {
    const res = await request(app)
      .get('/api/products/import/template')
      .set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('product_name');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { createInternalUser, loginInternal } from '../helpers';
import { amountToWords, applyDiscount, calculateTax, roundToNearestRupee } from '../../src/services/pricing';

let app: Application;
let adminToken: string;
let customerId: string;
let addressId: string;
let productId: string;
let categoryId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminToken = (await loginInternal(app, admin.email, admin.password)).accessToken;

  // Create a dealer customer
  const custRes = await request(app)
    .post('/api/customers')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ customerName: 'Pricing Test Dealer', customerType: 'dealer' });
  customerId = custRes.body.data.customer.id;

  // Same-state address (Maharashtra = 27)
  const addrRes = await request(app)
    .post(`/api/customers/${customerId}/addresses`)
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ addressType: 'shipping', addressLine1: '1 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', stateCode: '27', isDefaultShipping: true });
  addressId = addrRes.body.data.address.id;

  // Category + product
  const catRes = await request(app)
    .post('/api/product-categories')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ categoryCode: `PRCAT_${Date.now()}`, name: 'Pricing Cat' });
  categoryId = catRes.body.data.category.id;

  const prodRes = await request(app)
    .post('/api/products')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ productName: 'Pricing Desk', categoryId, basePrice: 50000, taxRatePercent: 18, hsnCode: '94036090' });
  productId = prodRes.body.data.product.id;
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Unit: applyDiscount', () => {
  it('no discount', () => {
    const r = applyDiscount(1000, 'none', 0);
    expect(r.unitPriceFinal).toBe(1000);
    expect(r.discountAmount).toBe(0);
  });

  it('percent discount', () => {
    const r = applyDiscount(1000, 'percent', 10);
    expect(r.unitPriceFinal).toBe(900);
    expect(r.discountAmount).toBe(100);
  });

  it('amount discount', () => {
    const r = applyDiscount(1000, 'amount', 200);
    expect(r.unitPriceFinal).toBe(800);
    expect(r.discountAmount).toBe(200);
  });
});

describe('Unit: calculateTax', () => {
  it('intrastate splits CGST+SGST', () => {
    const r = calculateTax(100000, 18, false);
    expect(r.cgstRate).toBe(9);
    expect(r.cgstAmount).toBe(9000);
    expect(r.sgstRate).toBe(9);
    expect(r.sgstAmount).toBe(9000);
    expect(r.igstRate).toBe(0);
    expect(r.igstAmount).toBe(0);
    expect(r.totalTax).toBe(18000);
  });

  it('interstate uses full IGST', () => {
    const r = calculateTax(100000, 18, true);
    expect(r.cgstRate).toBe(0);
    expect(r.cgstAmount).toBe(0);
    expect(r.sgstRate).toBe(0);
    expect(r.sgstAmount).toBe(0);
    expect(r.igstRate).toBe(18);
    expect(r.igstAmount).toBe(18000);
    expect(r.totalTax).toBe(18000);
  });

  it('handles zero tax rate', () => {
    const r = calculateTax(50000, 0, false);
    expect(r.totalTax).toBe(0);
  });
});

describe('Unit: amountToWords', () => {
  it('zero', () => {
    expect(amountToWords(0)).toBe('Rupees Zero Only');
  });

  it('simple amount', () => {
    expect(amountToWords(500)).toBe('Rupees Five Hundred Only');
  });

  it('lakh format', () => {
    expect(amountToWords(245000)).toBe('Rupees Two Lakh Forty Five Thousand Only');
  });

  it('crore format', () => {
    expect(amountToWords(12500000)).toBe('Rupees One Crore Twenty Five Lakh Only');
  });

  it('with paise', () => {
    expect(amountToWords(1000.50)).toBe('Rupees One Thousand and Paise Fifty Only');
  });

  it('complex amount', () => {
    const words = amountToWords(354270);
    expect(words).toBe('Rupees Three Lakh Fifty Four Thousand Two Hundred Seventy Only');
  });
});

describe('Unit: roundToNearestRupee', () => {
  it('rounds up from 0.50', () => {
    const r = roundToNearestRupee(100.50);
    expect(r.roundedTotal).toBe(101);
    expect(r.roundOffAmount).toBe(0.50);
  });

  it('rounds down below 0.50', () => {
    const r = roundToNearestRupee(100.40);
    expect(r.roundedTotal).toBe(100);
    expect(r.roundOffAmount).toBe(-0.40);
  });

  it('no rounding needed', () => {
    const r = roundToNearestRupee(5000);
    expect(r.roundedTotal).toBe(5000);
    expect(r.roundOffAmount).toBe(0);
  });
});

describe('Pricing Resolution via Order Line', () => {
  let orderId: string;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId });
    orderId = res.body.data.order.id;
  });

  it('uses base_price when no tiers exist', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.unitPriceBeforeDiscount)).toBe(50000);
    expect(res.body.data.line.priceSource).toBe('base_price');
  });

  it('uses customer_type tier pricing (dealer)', async () => {
    // Create product tier pricing for dealers: 20% discount
    await request(app)
      .post(`/api/products/${productId}/tier-pricing`)
      .set(auth(adminToken))
      .send({ customerType: 'dealer', discountPercent: 20 });

    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.unitPriceBeforeDiscount)).toBe(40000);
    expect(res.body.data.line.priceSource).toBe('customer_type_tier');
  });

  it('uses customer-specific tier pricing over type tier', async () => {
    // Create customer-specific pricing: special price 38000
    await rawPrisma.customerTierPricing.create({
      data: { customerId, productId, specialPrice: 38000 },
    });

    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 1 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.unitPriceBeforeDiscount)).toBe(38000);
    expect(res.body.data.line.priceSource).toBe('customer_tier');
  });

  it('uses manual override when unitPrice is provided', async () => {
    const res = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'catalog_product', productId, quantity: 1, unitPrice: 35000 });
    expect(res.status).toBe(201);
    expect(Number(res.body.data.line.unitPriceBeforeDiscount)).toBe(35000);
    expect(res.body.data.line.priceSource).toBe('manual_override');
  });
});

describe('Intrastate vs Interstate tax on order', () => {
  it('intrastate order has CGST+SGST', async () => {
    // Address is state 27, org is 27 → intrastate
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId });
    const orderId = orderRes.body.data.order.id;

    const lineRes = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', description: 'Intra test', quantity: 1, unitPrice: 10000, taxRatePercent: 18, hsnCode: '94036090' });
    expect(lineRes.status).toBe(201);
    expect(Number(lineRes.body.data.line.cgstAmount)).toBe(900);
    expect(Number(lineRes.body.data.line.sgstAmount)).toBe(900);
    expect(Number(lineRes.body.data.line.igstAmount)).toBe(0);
  });

  it('interstate order has IGST', async () => {
    // Create address with different state code (e.g. Karnataka = 29)
    const intAddr = await request(app)
      .post(`/api/customers/${customerId}/addresses`)
      .set(auth(adminToken))
      .send({ addressType: 'shipping', addressLine1: '5th Cross', city: 'Bangalore', state: 'Karnataka', pincode: '560001', stateCode: '29', isDefaultShipping: false });
    const intAddrId = intAddr.body.data.address.id;

    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: intAddrId });
    const orderId = orderRes.body.data.order.id;
    expect(orderRes.body.data.order.isInterstate).toBe(true);

    const lineRes = await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', description: 'Inter test', quantity: 1, unitPrice: 10000, taxRatePercent: 18, hsnCode: '94036090' });
    expect(lineRes.status).toBe(201);
    expect(Number(lineRes.body.data.line.cgstAmount)).toBe(0);
    expect(Number(lineRes.body.data.line.sgstAmount)).toBe(0);
    expect(Number(lineRes.body.data.line.igstAmount)).toBe(1800);
  });
});

describe('HSN-wise tax breakup', () => {
  it('groups lines by HSN', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId });
    const orderId = orderRes.body.data.order.id;

    // Two lines with same HSN
    await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', description: 'Item A', quantity: 2, unitPrice: 5000, taxRatePercent: 18, hsnCode: '94036090' });
    await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', description: 'Item B', quantity: 1, unitPrice: 8000, taxRatePercent: 12, hsnCode: '94035000' });

    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));

    const breakup = getRes.body.data.order.taxBreakup;
    expect(breakup.length).toBe(2);

    const hsn1 = breakup.find((b: any) => b.hsnCode === '94036090');
    expect(hsn1).toBeDefined();
    expect(Number(hsn1.taxableValue)).toBe(10000);
    expect(Number(hsn1.cgstAmount)).toBe(900);
    expect(Number(hsn1.sgstAmount)).toBe(900);

    const hsn2 = breakup.find((b: any) => b.hsnCode === '94035000');
    expect(hsn2).toBeDefined();
    expect(Number(hsn2.taxableValue)).toBe(8000);
    expect(Number(hsn2.cgstAmount)).toBe(480);
    expect(Number(hsn2.sgstAmount)).toBe(480);
  });
});

describe('Rounding in order totals', () => {
  it('grand total is rounded to nearest rupee', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .set(auth(adminToken))
      .send({ customerId, defaultShippingAddressId: addressId });
    const orderId = orderRes.body.data.order.id;

    // 3 × 1234 = 3702, tax 18% = 666.36, total = 4368.36 → rounds to 4368
    await request(app)
      .post(`/api/orders/${orderId}/lines`)
      .set(auth(adminToken))
      .send({ lineType: 'custom_item', description: 'Round test', quantity: 3, unitPrice: 1234, taxRatePercent: 18, hsnCode: '94036090' });

    const getRes = await request(app)
      .get(`/api/orders/${orderId}`)
      .set(auth(adminToken));
    const order = getRes.body.data.order;
    expect(Number(order.grandTotal)).toBe(Math.round(3702 + 3702 * 0.18));
    expect(Number(order.roundOffAmount)).not.toBe(0);
  });
});

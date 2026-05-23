/**
 * P0-20 integration tests — Payment foundation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import type { Application } from 'express';
import { createApp } from '../../src/app';
import { rawPrisma } from '../../src/lib/prisma-base';
import { prisma } from '../../src/lib/prisma';
import { createInternalUser, loginInternal } from '../helpers';
import { LogPaymentGateway } from '../../src/services/payment/log';

let app: Application;
let token: string;
let adminUserId: string;
let logGatewayId: string;

beforeAll(async () => {
  app = createApp();
  const admin = await createInternalUser({ roleCode: 'super_admin' });
  adminUserId = admin.id;
  token = (await loginInternal(app, admin.email, admin.password)).accessToken;
});

beforeEach(async () => {
  LogPaymentGateway.reset();
  // Ensure a log gateway exists for tests
  const existing = await rawPrisma.paymentGateway.findFirst({
    where: { gatewayCode: 'log' },
  });
  if (existing) {
    logGatewayId = existing.id;
  } else {
    const gw = await rawPrisma.paymentGateway.create({
      data: {
        gatewayCode: 'log',
        displayName: 'Log Gateway (Test)',
        configuration: {},
        isTestMode: true,
        isPrimary: true,
        isActive: true,
      },
    });
    logGatewayId = gw.id;
  }
});

afterAll(async () => {
  await rawPrisma.$disconnect();
});

const auth = () => ({ Authorization: `Bearer ${token}` });

// -- Online payment flow ----------------------------------------------------

describe('Online payment flow', () => {
  it('initiates an online payment', async () => {
    const res = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 1500.50, currency: 'INR' });
    expect(res.status).toBe(200);
    expect(res.body.data.transactionId).toBeTruthy();
    expect(res.body.data.transactionCode).toMatch(/^TXN-/);
    expect(res.body.data.gatewayOrderId).toMatch(/^order_log_/);
  });

  it('verifies an online payment', async () => {
    const initRes = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 2000 });
    const txnId = initRes.body.data.transactionId;

    const res = await request(app)
      .post('/api/payments/online/verify')
      .set(auth())
      .send({
        transactionId: txnId,
        gatewayPaymentId: 'pay_test_123',
        gatewaySignature: 'sig_test_123',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('success');
    expect(res.body.data.completedAt).toBeTruthy();
  });

  it('rejects verification of already-verified payment', async () => {
    const initRes = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 500 });
    const txnId = initRes.body.data.transactionId;

    await request(app)
      .post('/api/payments/online/verify')
      .set(auth())
      .send({
        transactionId: txnId,
        gatewayPaymentId: 'pay_1',
        gatewaySignature: 'sig_1',
      });

    const res = await request(app)
      .post('/api/payments/online/verify')
      .set(auth())
      .send({
        transactionId: txnId,
        gatewayPaymentId: 'pay_2',
        gatewaySignature: 'sig_2',
      });
    expect(res.status).toBe(400);
  });
});

// -- Offline payment recording ----------------------------------------------

describe('Offline payment recording', () => {
  it('records a bank transfer with UTR', async () => {
    const res = await request(app)
      .post('/api/payments/offline')
      .set(auth())
      .send({
        amount: 50000,
        paymentMode: 'bank_transfer',
        utrNumber: 'UTR123456789012',
        payerName: 'Test Corp',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.transactionCode).toMatch(/^OFF-/);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.paymentMode).toBe('bank_transfer');
  });

  it('requires UTR for bank transfers', async () => {
    const res = await request(app)
      .post('/api/payments/offline')
      .set(auth())
      .send({ amount: 1000, paymentMode: 'bank_transfer' });
    expect(res.status).toBe(400);
  });

  it('requires cheque number for cheque payments', async () => {
    const res = await request(app)
      .post('/api/payments/offline')
      .set(auth())
      .send({ amount: 1000, paymentMode: 'cheque' });
    expect(res.status).toBe(400);
  });

  it('records a cash payment', async () => {
    const res = await request(app)
      .post('/api/payments/offline')
      .set(auth())
      .send({ amount: 5000, paymentMode: 'cash', payerName: 'Walk-in' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pending');
  });

  it('admin verifies offline payment', async () => {
    const createRes = await request(app)
      .post('/api/payments/offline')
      .set(auth())
      .send({ amount: 10000, paymentMode: 'bank_transfer', utrNumber: 'UTR999' });
    const txnId = createRes.body.data.transactionId;

    const res = await request(app)
      .post(`/api/payments/${txnId}/verify-offline`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('success');
    expect(res.body.data.completedAt).toBeTruthy();
  });

  it('admin rejects offline payment', async () => {
    const createRes = await request(app)
      .post('/api/payments/offline')
      .set(auth())
      .send({ amount: 25000, paymentMode: 'cheque', chequeNumber: 'CHQ001' });
    const txnId = createRes.body.data.transactionId;

    const res = await request(app)
      .post(`/api/payments/${txnId}/reject`)
      .set(auth())
      .send({ reason: 'Cheque bounced' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('failed');
  });
});

// -- Refund flow ------------------------------------------------------------

describe('Refund flow', () => {
  it('refunds a successful online payment', async () => {
    const initRes = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 3000 });
    const txnId = initRes.body.data.transactionId;

    await request(app)
      .post('/api/payments/online/verify')
      .set(auth())
      .send({
        transactionId: txnId,
        gatewayPaymentId: 'pay_refund_test',
        gatewaySignature: 'sig_refund_test',
      });

    const res = await request(app)
      .post(`/api/payments/${txnId}/refunds`)
      .set(auth())
      .send({ amount: 1000, reason: 'Partial refund' });
    expect(res.status).toBe(200);
    expect(res.body.data.refundCode).toMatch(/^RFD-/);
    expect(res.body.data.amount).toBe(1000);
  });

  it('prevents refund exceeding original amount', async () => {
    const initRes = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 1000 });
    const txnId = initRes.body.data.transactionId;

    await request(app)
      .post('/api/payments/online/verify')
      .set(auth())
      .send({
        transactionId: txnId,
        gatewayPaymentId: 'pay_over',
        gatewaySignature: 'sig_over',
      });

    const res = await request(app)
      .post(`/api/payments/${txnId}/refunds`)
      .set(auth())
      .send({ amount: 1500 });
    expect(res.status).toBe(400);
  });

  it('marks transaction as refunded when fully refunded', async () => {
    const initRes = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 500 });
    const txnId = initRes.body.data.transactionId;

    await request(app)
      .post('/api/payments/online/verify')
      .set(auth())
      .send({
        transactionId: txnId,
        gatewayPaymentId: 'pay_full',
        gatewaySignature: 'sig_full',
      });

    await request(app)
      .post(`/api/payments/${txnId}/refunds`)
      .set(auth())
      .send({ amount: 500 });

    const txn = await rawPrisma.paymentTransaction.findUnique({ where: { id: txnId } });
    expect(txn?.status).toBe('refunded');
  });

  it('cannot refund an un-verified payment', async () => {
    const initRes = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 1000 });
    const txnId = initRes.body.data.transactionId;

    const res = await request(app)
      .post(`/api/payments/${txnId}/refunds`)
      .set(auth())
      .send({ amount: 500 });
    expect(res.status).toBe(400);
  });
});

// -- Webhook signature verification -----------------------------------------

describe('Razorpay webhook', () => {
  it('processes payment.captured event with valid signature', async () => {
    const webhookSecret = 'test_webhook_secret';
    await rawPrisma.paymentGateway.update({
      where: { id: logGatewayId },
      data: { gatewayCode: 'razorpay', configuration: { keyId: 'k', keySecret: 's', webhookSecret } },
    });

    // Create a pending transaction
    const txn = await rawPrisma.paymentTransaction.create({
      data: {
        transactionCode: `TXN-WH-${Date.now()}`,
        gatewayId: logGatewayId,
        paymentMode: 'online',
        amount: 5000,
        currency: 'INR',
        status: 'initiated',
        gatewayTransactionId: 'order_webhook_test',
      },
    });

    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_webhook_123',
            order_id: 'order_webhook_test',
            amount: 500000,
          },
        },
      },
    });

    const signature = createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('x-razorpay-signature', signature)
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(true);

    const updated = await rawPrisma.paymentTransaction.findUnique({ where: { id: txn.id } });
    expect(updated?.status).toBe('success');
    expect(updated?.gatewayPaymentId).toBe('pay_webhook_123');

    // Restore gateway code for other tests
    await rawPrisma.paymentGateway.update({
      where: { id: logGatewayId },
      data: { gatewayCode: 'log', configuration: {} },
    });
  });

  it('rejects webhook with invalid signature', async () => {
    await rawPrisma.paymentGateway.update({
      where: { id: logGatewayId },
      data: { gatewayCode: 'razorpay', configuration: { keyId: 'k', keySecret: 's', webhookSecret: 'secret' } },
    });

    const res = await request(app)
      .post('/api/webhooks/razorpay')
      .set('x-razorpay-signature', 'invalid_signature')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'payment.captured', payload: {} }));
    expect(res.status).toBe(200); // Always 200 to Razorpay
    expect(res.body.data.processed).toBe(false);

    await rawPrisma.paymentGateway.update({
      where: { id: logGatewayId },
      data: { gatewayCode: 'log', configuration: {} },
    });
  });
});

// -- Admin endpoints --------------------------------------------------------

describe('Admin payment endpoints', () => {
  it('lists payment gateways', async () => {
    const res = await request(app)
      .get('/api/admin/payment-gateways')
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.gateways.length).toBeGreaterThan(0);
  });

  it('creates a payment gateway', async () => {
    const res = await request(app)
      .post('/api/admin/payment-gateways')
      .set(auth())
      .send({
        gatewayCode: `test_gw_${Date.now()}`,
        displayName: 'Test Gateway',
        configuration: { apiKey: 'test' },
        isTestMode: true,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.displayName).toBe('Test Gateway');
  });

  it('updates a payment gateway', async () => {
    const res = await request(app)
      .put(`/api/admin/payment-gateways/${logGatewayId}`)
      .set(auth())
      .send({ displayName: 'Updated Log Gateway' });
    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('Updated Log Gateway');
  });

  it('lists payment transactions', async () => {
    const res = await request(app)
      .get('/api/admin/payment-transactions')
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.transactions)).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
  });

  it('gets a single transaction by ID', async () => {
    const initRes = await request(app)
      .post('/api/payments/online/initiate')
      .set(auth())
      .send({ amount: 100 });
    const txnId = initRes.body.data.transactionId;

    const res = await request(app)
      .get(`/api/admin/payment-transactions/${txnId}`)
      .set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(txnId);
  });

  it('filters transactions by status', async () => {
    const res = await request(app)
      .get('/api/admin/payment-transactions?status=initiated')
      .set(auth());
    expect(res.status).toBe(200);
    for (const txn of res.body.data.transactions) {
      expect(txn.status).toBe('initiated');
    }
  });
});

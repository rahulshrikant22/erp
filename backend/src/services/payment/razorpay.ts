/**
 * Razorpay gateway implementation.
 */
import { createHmac } from 'node:crypto';
import Razorpay from 'razorpay';
import type {
  CreateOrderInput,
  CreateOrderResult,
  IPaymentGateway,
  PaymentGatewayContext,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from './types';

export class RazorpayGateway implements IPaymentGateway {
  readonly code = 'razorpay';
  private client: InstanceType<typeof Razorpay>;
  private keySecret: string;

  constructor(ctx: PaymentGatewayContext) {
    const cfg = ctx.configuration as { keyId: string; keySecret: string };
    this.keySecret = cfg.keySecret;
    this.client = new Razorpay({
      key_id: cfg.keyId,
      key_secret: cfg.keySecret,
    });
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const order = await this.client.orders.create({
      amount: Math.round(input.amount * 100), // Razorpay expects paise
      currency: input.currency,
      receipt: input.receipt,
      notes: input.metadata as Record<string, string> | undefined,
    });
    return {
      gatewayOrderId: order.id,
      gatewayData: { orderId: order.id, status: order.status },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const body = `${input.gatewayOrderId}|${input.gatewayPaymentId}`;
    const expectedSignature = createHmac('sha256', this.keySecret)
      .update(body)
      .digest('hex');

    const verified = expectedSignature === input.gatewaySignature;
    return {
      verified,
      paymentId: input.gatewayPaymentId,
      signature: input.gatewaySignature,
    };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await this.client.payments.refund(input.gatewayPaymentId, {
      amount: Math.round(input.amount * 100),
      notes: input.reason ? { reason: input.reason } : undefined,
    } as any);
    return {
      refundId: refund.id,
      status: refund.status,
    };
  }
}

/**
 * Verify Razorpay webhook signature.
 */
export function verifyRazorpayWebhookSignature(
  body: string,
  signature: string,
  webhookSecret: string,
): boolean {
  const expected = createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');
  return expected === signature;
}

/**
 * Stripe gateway — placeholder for international payments (future).
 * Implements the interface so it can be wired in when needed.
 */
import type {
  CreateOrderInput,
  CreateOrderResult,
  IPaymentGateway,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from './types';

export class StripeGateway implements IPaymentGateway {
  readonly code = 'stripe';

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new Error('Stripe gateway is not yet implemented');
  }

  async verifyPayment(_input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    throw new Error('Stripe gateway is not yet implemented');
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new Error('Stripe gateway is not yet implemented');
  }
}

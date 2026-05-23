/**
 * Log gateway — dev/test fallback. Captures all calls in memory.
 */
import { randomUUID } from 'node:crypto';
import type {
  CreateOrderInput,
  CreateOrderResult,
  IPaymentGateway,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
} from './types';

interface CapturedCall {
  method: string;
  input: unknown;
  result: unknown;
  ts: Date;
}

export class LogPaymentGateway implements IPaymentGateway {
  readonly code = 'log';
  private static captured: CapturedCall[] = [];

  static getCaptured(): CapturedCall[] {
    return LogPaymentGateway.captured;
  }

  static reset(): void {
    LogPaymentGateway.captured = [];
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const result: CreateOrderResult = {
      gatewayOrderId: `order_log_${randomUUID().slice(0, 8)}`,
      gatewayData: { mock: true },
    };
    LogPaymentGateway.captured.push({ method: 'createOrder', input, result, ts: new Date() });
    return result;
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const result: VerifyPaymentResult = {
      verified: true,
      paymentId: input.gatewayPaymentId,
      signature: input.gatewaySignature,
    };
    LogPaymentGateway.captured.push({ method: 'verifyPayment', input, result, ts: new Date() });
    return result;
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const result: RefundResult = {
      refundId: `refund_log_${randomUUID().slice(0, 8)}`,
      status: 'processed',
    };
    LogPaymentGateway.captured.push({ method: 'refund', input, result, ts: new Date() });
    return result;
  }
}

/**
 * Payment gateway abstraction — shared types and interface.
 */

export interface CreateOrderInput {
  amount: number;
  currency: string;
  receipt?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateOrderResult {
  gatewayOrderId: string;
  gatewayData?: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  gatewaySignature: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  paymentId: string;
  signature: string;
}

export interface RefundInput {
  gatewayPaymentId: string;
  amount: number;
  reason?: string;
}

export interface RefundResult {
  refundId: string;
  status: string;
}

export interface IPaymentGateway {
  readonly code: string;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
}

export interface PaymentGatewayContext {
  gatewayCode: string;
  configuration: Record<string, unknown>;
  isTestMode: boolean;
}

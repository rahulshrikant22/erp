/**
 * Payment gateway factory — maps gateway codes to implementations.
 */
import type { IPaymentGateway, PaymentGatewayContext } from './types';
import { RazorpayGateway } from './razorpay';
import { StripeGateway } from './stripe';
import { LogPaymentGateway } from './log';

const GATEWAY_MAP: Record<string, new (ctx: PaymentGatewayContext) => IPaymentGateway> = {
  razorpay: RazorpayGateway,
  stripe: StripeGateway,
  log: LogPaymentGateway as any,
};

export const SUPPORTED_PAYMENT_GATEWAYS = Object.keys(GATEWAY_MAP);

export function isSupportedPaymentGateway(code: string): boolean {
  return code in GATEWAY_MAP;
}

export function createPaymentGateway(ctx: PaymentGatewayContext): IPaymentGateway {
  const Ctor = GATEWAY_MAP[ctx.gatewayCode];
  if (!Ctor) {
    throw new Error(`Unsupported payment gateway: ${ctx.gatewayCode}`);
  }
  return new Ctor(ctx);
}

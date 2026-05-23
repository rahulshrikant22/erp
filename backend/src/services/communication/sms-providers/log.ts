/**
 * Log-only SMS provider — captures the last N sends in memory. Used as the
 * fallback when no real provider is configured and as a deterministic test
 * target. Mirror of the email LogProvider.
 */
import { logger } from '../../../utils/logger';
import type {
  ISmsProvider,
  SmsProviderContext,
  SmsSendInput,
  SmsSendResult,
} from './types';

export interface CapturedSms extends SmsSendInput {
  senderId: string;
  capturedAt: Date;
}

export class SmsLogProvider implements ISmsProvider {
  readonly providerCode = 'log';
  private static readonly capacity = 100;
  private static captured: CapturedSms[] = [];

  static getCaptured(): readonly CapturedSms[] {
    return SmsLogProvider.captured;
  }

  static reset(): void {
    SmsLogProvider.captured = [];
  }

  async send(input: SmsSendInput, ctx: SmsProviderContext): Promise<SmsSendResult> {
    SmsLogProvider.captured.push({
      ...input,
      senderId: ctx.senderId,
      capturedAt: new Date(),
    });
    if (SmsLogProvider.captured.length > SmsLogProvider.capacity) {
      SmsLogProvider.captured.shift();
    }
    logger.info(
      { to: input.to, senderId: ctx.senderId, dltTemplateId: input.dltTemplateId },
      `sms captured (log provider) → ${input.to}`,
    );
    return { ok: true, providerMessageId: `sms-log-${Date.now()}` };
  }

  async verify(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

/**
 * Log-only provider — used when no real provider is configured (e.g. local
 * dev) and as a deterministic test target. Captures the last N sends in
 * memory so tests can introspect; never raises.
 */
import { logger } from '../../../utils/logger';
import type {
  IEmailProvider,
  ProviderContext,
  SendInput,
  SendResult,
} from './types';

export interface CapturedEmail extends SendInput {
  fromEmail: string;
  fromName?: string;
  capturedAt: Date;
}

export class LogProvider implements IEmailProvider {
  readonly providerCode = 'log';
  private static readonly capacity = 100;
  private static captured: CapturedEmail[] = [];

  static getCaptured(): readonly CapturedEmail[] {
    return LogProvider.captured;
  }

  static reset(): void {
    LogProvider.captured = [];
  }

  async send(input: SendInput, ctx: ProviderContext): Promise<SendResult> {
    const entry: CapturedEmail = {
      ...input,
      fromEmail: ctx.fromEmail,
      fromName: ctx.fromName,
      capturedAt: new Date(),
    };
    LogProvider.captured.push(entry);
    if (LogProvider.captured.length > LogProvider.capacity) {
      LogProvider.captured.shift();
    }
    logger.info(
      { to: input.to, subject: input.subject },
      `email captured (log provider) → ${input.subject}`,
    );
    return { ok: true, providerMessageId: `log-${Date.now()}` };
  }

  async verify(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

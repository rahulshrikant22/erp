/**
 * Twilio provider via the official `twilio` SDK. Lazy-imported.
 *
 * Config keys:
 *   { accountSid, authToken, fromNumber? }   // fromNumber overrides senderId when set
 *
 * Twilio doesn't enforce DLT; ignores dltTemplateId.
 */
import { logger } from '../../../utils/logger';
import type {
  ISmsProvider,
  SmsProviderConfig,
  SmsProviderContext,
  SmsSendInput,
  SmsSendResult,
} from './types';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber?: string;
}

interface TwilioClientFactory {
  default: (sid: string, token: string) => {
    messages: {
      create: (opts: { to: string; from: string; body: string }) => Promise<{ sid: string }>;
    };
  };
}

export class TwilioProvider implements ISmsProvider {
  readonly providerCode = 'twilio';
  private client: ReturnType<TwilioClientFactory['default']> | null = null;

  constructor(private readonly config: TwilioConfig) {}

  private async getClient(): Promise<ReturnType<TwilioClientFactory['default']>> {
    if (this.client) return this.client;
    const mod = (await import('twilio')) as unknown as TwilioClientFactory;
    this.client = mod.default(this.config.accountSid, this.config.authToken);
    return this.client;
  }

  async send(input: SmsSendInput, ctx: SmsProviderContext): Promise<SmsSendResult> {
    if (!this.config.accountSid || !this.config.authToken) {
      return { ok: false, error: 'Twilio accountSid/authToken missing' };
    }
    try {
      const client = await this.getClient();
      const msg = await client.messages.create({
        to: input.to,
        from: this.config.fromNumber ?? ctx.senderId,
        body: input.body,
      });
      return { ok: true, providerMessageId: msg.sid };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'twilio send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.accountSid || !this.config.authToken) {
      return { ok: false, error: 'accountSid/authToken missing' };
    }
    try {
      await this.getClient();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  static fromConfig(config: SmsProviderConfig): TwilioProvider {
    return new TwilioProvider({
      accountSid: String(config.accountSid ?? ''),
      authToken: String(config.authToken ?? ''),
      fromNumber: config.fromNumber as string | undefined,
    });
  }
}

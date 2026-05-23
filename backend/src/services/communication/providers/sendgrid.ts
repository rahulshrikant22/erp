/**
 * SendGrid provider — wraps @sendgrid/mail.
 *
 * Config keys:
 *   { apiKey }   // SG.xxxx
 *
 * Lazy-imported so installs that never use SendGrid don't pull the SDK
 * into the module graph at startup.
 */
import { logger } from '../../../utils/logger';
import type {
  IEmailProvider,
  ProviderConfig,
  ProviderContext,
  SendInput,
  SendResult,
} from './types';

interface SendGridConfig {
  apiKey: string;
}

interface SendGridSdk {
  setApiKey: (key: string) => void;
  send: (msg: Record<string, unknown>) => Promise<[{ statusCode: number; headers: Record<string, string> }, unknown]>;
}

export class SendGridProvider implements IEmailProvider {
  readonly providerCode = 'sendgrid';
  private sdk: SendGridSdk | null = null;

  constructor(private readonly config: SendGridConfig) {}

  private async loadSdk(): Promise<SendGridSdk> {
    if (this.sdk) return this.sdk;
    const mod = (await import('@sendgrid/mail')) as unknown as { default: SendGridSdk };
    mod.default.setApiKey(this.config.apiKey);
    this.sdk = mod.default;
    return this.sdk;
  }

  async send(input: SendInput, ctx: ProviderContext): Promise<SendResult> {
    if (!this.config.apiKey) {
      return { ok: false, error: 'SendGrid apiKey missing' };
    }
    try {
      const sg = await this.loadSdk();
      const [response] = await sg.send({
        to: input.to,
        from: { email: ctx.fromEmail, name: ctx.fromName },
        subject: input.subject,
        text: input.text,
        html: input.html,
        cc: input.cc,
        bcc: input.bcc,
        replyTo: input.replyTo,
      });
      // SendGrid returns 202 on accept; the real id sits in the headers.
      const id = response?.headers?.['x-message-id'];
      return { ok: true, providerMessageId: typeof id === 'string' ? id : undefined };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'sendgrid send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.apiKey) return { ok: false, error: 'apiKey missing' };
    // SendGrid has no cheap verify endpoint — just confirm the SDK loads
    // and the key has the right shape.
    try {
      await this.loadSdk();
      return { ok: this.config.apiKey.startsWith('SG.') };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  static fromConfig(config: ProviderConfig): SendGridProvider {
    return new SendGridProvider({ apiKey: String(config.apiKey ?? '') });
  }
}

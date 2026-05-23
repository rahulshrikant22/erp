/**
 * Mailgun provider — wraps mailgun.js.
 *
 * Config keys:
 *   { apiKey, domain, region? = 'us' | 'eu' }
 */
import { logger } from '../../../utils/logger';
import type {
  IEmailProvider,
  ProviderConfig,
  ProviderContext,
  SendInput,
  SendResult,
} from './types';

interface MailgunConfig {
  apiKey: string;
  domain: string;
  region?: 'us' | 'eu';
}

interface MailgunClient {
  messages: {
    create: (
      domain: string,
      data: Record<string, unknown>,
    ) => Promise<{ id: string; message?: string }>;
  };
}

export class MailgunProvider implements IEmailProvider {
  readonly providerCode = 'mailgun';
  private client: MailgunClient | null = null;

  constructor(private readonly config: MailgunConfig) {}

  private async getClient(): Promise<MailgunClient> {
    if (this.client) return this.client;
    const formDataMod = (await import('form-data')) as unknown as { default: unknown };
    const mailgunMod = (await import('mailgun.js')) as unknown as {
      default: new (formData: unknown) => {
        client: (cfg: { username: string; key: string; url?: string }) => MailgunClient;
      };
    };
    const Mailgun = mailgunMod.default;
    const mg = new Mailgun(formDataMod.default);
    this.client = mg.client({
      username: 'api',
      key: this.config.apiKey,
      url: this.config.region === 'eu' ? 'https://api.eu.mailgun.net' : undefined,
    });
    return this.client;
  }

  async send(input: SendInput, ctx: ProviderContext): Promise<SendResult> {
    if (!this.config.apiKey || !this.config.domain) {
      return { ok: false, error: 'Mailgun apiKey or domain missing' };
    }
    try {
      const client = await this.getClient();
      const r = await client.messages.create(this.config.domain, {
        from: ctx.fromName ? `"${ctx.fromName}" <${ctx.fromEmail}>` : ctx.fromEmail,
        to: input.to,
        cc: input.cc?.join(','),
        bcc: input.bcc?.join(','),
        subject: input.subject,
        text: input.text,
        html: input.html,
        'h:Reply-To': input.replyTo,
      });
      return { ok: true, providerMessageId: r.id };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'mailgun send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.apiKey || !this.config.domain) {
      return { ok: false, error: 'apiKey or domain missing' };
    }
    try {
      await this.getClient();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  static fromConfig(config: ProviderConfig): MailgunProvider {
    const region = config.region === 'eu' ? 'eu' : 'us';
    return new MailgunProvider({
      apiKey: String(config.apiKey ?? ''),
      domain: String(config.domain ?? ''),
      region,
    });
  }
}

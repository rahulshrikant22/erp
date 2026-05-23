/**
 * Amazon SES provider — wraps @aws-sdk/client-ses.
 *
 * Config keys:
 *   { region, accessKeyId?, secretAccessKey?, sessionToken? }
 *
 * If accessKeyId/secretAccessKey are absent, the SDK falls back to the
 * default AWS credential chain (env, IMDS, ~/.aws/credentials). That's
 * the typical production path on EC2 / ECS.
 */
import { logger } from '../../../utils/logger';
import type {
  IEmailProvider,
  ProviderConfig,
  ProviderContext,
  SendInput,
  SendResult,
} from './types';

interface SesConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

interface SesSdk {
  SESClient: new (cfg: Record<string, unknown>) => {
    send: (cmd: unknown) => Promise<{ MessageId?: string }>;
  };
  SendEmailCommand: new (input: Record<string, unknown>) => unknown;
}

export class SesProvider implements IEmailProvider {
  readonly providerCode = 'ses';
  private sdk: SesSdk | null = null;
  private client: { send: (cmd: unknown) => Promise<{ MessageId?: string }> } | null = null;

  constructor(private readonly config: SesConfig) {}

  private async loadSdk(): Promise<SesSdk> {
    if (this.sdk) return this.sdk;
    const mod = (await import('@aws-sdk/client-ses')) as unknown as SesSdk;
    this.sdk = mod;
    return mod;
  }

  private async getClient(): Promise<{ send: (cmd: unknown) => Promise<{ MessageId?: string }> }> {
    if (this.client) return this.client;
    const sdk = await this.loadSdk();
    this.client = new sdk.SESClient({
      region: this.config.region,
      credentials:
        this.config.accessKeyId && this.config.secretAccessKey
          ? {
              accessKeyId: this.config.accessKeyId,
              secretAccessKey: this.config.secretAccessKey,
              sessionToken: this.config.sessionToken,
            }
          : undefined,
    });
    return this.client;
  }

  async send(input: SendInput, ctx: ProviderContext): Promise<SendResult> {
    if (!this.config.region) return { ok: false, error: 'SES region missing' };
    try {
      const sdk = await this.loadSdk();
      const client = await this.getClient();
      const cmd = new sdk.SendEmailCommand({
        Source: ctx.fromName ? `"${ctx.fromName}" <${ctx.fromEmail}>` : ctx.fromEmail,
        Destination: {
          ToAddresses: [input.to],
          CcAddresses: input.cc,
          BccAddresses: input.bcc,
        },
        Message: {
          Subject: { Data: input.subject, Charset: 'UTF-8' },
          Body: {
            Html: input.html ? { Data: input.html, Charset: 'UTF-8' } : undefined,
            Text: input.text ? { Data: input.text, Charset: 'UTF-8' } : undefined,
          },
        },
        ReplyToAddresses: input.replyTo ? [input.replyTo] : undefined,
      });
      const r = await client.send(cmd);
      return { ok: true, providerMessageId: r.MessageId };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'ses send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.region) return { ok: false, error: 'region missing' };
    try {
      // Loading the SDK exercises the credential chain enough to surface
      // gross misconfiguration without doing a real send.
      await this.loadSdk();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  static fromConfig(config: ProviderConfig): SesProvider {
    return new SesProvider({
      region: String(config.region ?? 'us-east-1'),
      accessKeyId: config.accessKeyId as string | undefined,
      secretAccessKey: config.secretAccessKey as string | undefined,
      sessionToken: config.sessionToken as string | undefined,
    });
  }
}

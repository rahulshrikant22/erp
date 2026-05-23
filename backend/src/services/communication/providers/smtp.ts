/**
 * SMTP provider — wraps nodemailer.
 *
 * Config keys:
 *   { host, port, secure?, user?, pass? }
 *
 * If `host` is empty/missing, falls back to nodemailer's `jsonTransport`
 * which captures the message in-memory instead of sending. That's the
 * "log-only" mode useful for dev and tests.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '../../../utils/logger';
import type {
  IEmailProvider,
  ProviderConfig,
  ProviderContext,
  SendInput,
  SendResult,
} from './types';

interface SmtpConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
}

export class SmtpProvider implements IEmailProvider {
  readonly providerCode = 'smtp';
  private transport: Transporter | null = null;

  constructor(private readonly config: SmtpConfig) {}

  private getTransport(): Transporter {
    if (this.transport) return this.transport;
    if (this.config.host) {
      this.transport = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port ?? 587,
        secure: this.config.secure ?? this.config.port === 465,
        auth:
          this.config.user && this.config.pass
            ? { user: this.config.user, pass: this.config.pass }
            : undefined,
      });
    } else {
      // log-only fallback
      this.transport = nodemailer.createTransport({ jsonTransport: true });
    }
    return this.transport;
  }

  async send(input: SendInput, ctx: ProviderContext): Promise<SendResult> {
    try {
      const t = this.getTransport();
      const info = await t.sendMail({
        from: ctx.fromName ? `"${ctx.fromName}" <${ctx.fromEmail}>` : ctx.fromEmail,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        replyTo: input.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return { ok: true, providerMessageId: info.messageId };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'smtp send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config.host) return { ok: true }; // jsonTransport always "ok"
    try {
      await this.getTransport().verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  static fromConfig(config: ProviderConfig): SmtpProvider {
    return new SmtpProvider({
      host: config.host as string | undefined,
      port: typeof config.port === 'number' ? config.port : undefined,
      secure: config.secure as boolean | undefined,
      user: config.user as string | undefined,
      pass: config.pass as string | undefined,
    });
  }
}

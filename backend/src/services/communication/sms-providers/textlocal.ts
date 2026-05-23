/**
 * Textlocal provider — direct REST.
 *
 * Config keys:
 *   { apiKey }
 *
 * Endpoint: https://api.textlocal.in/send/
 */
import { logger } from '../../../utils/logger';
import type {
  ISmsProvider,
  SmsProviderConfig,
  SmsProviderContext,
  SmsSendInput,
  SmsSendResult,
} from './types';

const TEXTLOCAL_URL = 'https://api.textlocal.in/send/';

interface TextlocalConfig {
  apiKey: string;
}

export class TextlocalProvider implements ISmsProvider {
  readonly providerCode = 'textlocal';

  constructor(private readonly config: TextlocalConfig) {}

  async send(input: SmsSendInput, ctx: SmsProviderContext): Promise<SmsSendResult> {
    if (!this.config.apiKey) return { ok: false, error: 'Textlocal apiKey missing' };
    try {
      const params = new URLSearchParams({
        apikey: this.config.apiKey,
        numbers: input.to.replace(/^\+/, ''),
        message: input.body,
        sender: ctx.senderId,
        ...(input.dltTemplateId ? { template_id: input.dltTemplateId } : {}),
      });
      const res = await fetch(TEXTLOCAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const text = await res.text();
      let body: { status?: string; messages?: { id: string }[]; errors?: { message: string }[] } = {};
      try { body = JSON.parse(text); } catch { /* ignore */ }
      if (!res.ok || body.status !== 'success') {
        return { ok: false, error: body.errors?.[0]?.message ?? text.slice(0, 200) };
      }
      return { ok: true, providerMessageId: body.messages?.[0]?.id };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'textlocal send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    return this.config.apiKey
      ? { ok: true }
      : { ok: false, error: 'apiKey missing' };
  }

  static fromConfig(config: SmsProviderConfig): TextlocalProvider {
    return new TextlocalProvider({ apiKey: String(config.apiKey ?? '') });
  }
}

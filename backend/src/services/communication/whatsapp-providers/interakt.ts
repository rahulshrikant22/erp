import { logger } from '../../../utils/logger';
import type {
  IWhatsAppProvider,
  WhatsAppProviderConfig,
  WhatsAppProviderContext,
  WhatsAppTemplateSendInput,
  WhatsAppSessionSendInput,
  WhatsAppSendResult,
} from './types';

interface InteraktConfig {
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://api.interakt.ai/v1';

export class InteraktProvider implements IWhatsAppProvider {
  readonly providerCode = 'interakt';

  constructor(private readonly config: InteraktConfig) {}

  async sendTemplate(
    input: WhatsAppTemplateSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey) {
      return { ok: false, error: 'Interakt apiKey missing' };
    }
    try {
      const body: Record<string, unknown> = {
        countryCode: '+' + input.to.slice(0, 2),
        phoneNumber: input.to.slice(2),
        callbackData: '',
        type: 'Template',
        template: {
          name: input.templateName,
          languageCode: input.languageCode,
          headerValues: input.headerParams ?? [],
          bodyValues: input.bodyParams ?? [],
        },
      };
      if (input.mediaUrl) {
        (body.template as Record<string, unknown>).headerValues = [input.mediaUrl];
      }
      const res = await fetch(`${this.config.baseUrl}/public/message/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `Interakt HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { id?: string; result?: boolean } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return { ok: parsed.result !== false, providerMessageId: parsed.id };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'interakt sendTemplate failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async sendSession(
    input: WhatsAppSessionSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey) {
      return { ok: false, error: 'Interakt apiKey missing' };
    }
    try {
      const body: Record<string, unknown> = {
        countryCode: '+' + input.to.slice(0, 2),
        phoneNumber: input.to.slice(2),
        callbackData: '',
        type: 'Text',
        data: { message: input.message },
      };
      const res = await fetch(`${this.config.baseUrl}/public/message/`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `Interakt HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { id?: string } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return { ok: true, providerMessageId: parsed.id };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'interakt sendSession failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    return this.config.apiKey
      ? { ok: true }
      : { ok: false, error: 'apiKey missing' };
  }

  static fromConfig(config: WhatsAppProviderConfig): InteraktProvider {
    return new InteraktProvider({
      apiKey: String(config.apiKey ?? ''),
      baseUrl: String(config.baseUrl ?? DEFAULT_BASE_URL),
    });
  }
}

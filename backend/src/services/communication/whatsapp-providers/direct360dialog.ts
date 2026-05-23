import { logger } from '../../../utils/logger';
import type {
  IWhatsAppProvider,
  WhatsAppProviderConfig,
  WhatsAppProviderContext,
  WhatsAppTemplateSendInput,
  WhatsAppSessionSendInput,
  WhatsAppSendResult,
} from './types';

interface Direct360Config {
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = 'https://waba.360dialog.io/v1';

export class Direct360DialogProvider implements IWhatsAppProvider {
  readonly providerCode = '360dialog';

  constructor(private readonly config: Direct360Config) {}

  async sendTemplate(
    input: WhatsAppTemplateSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey) {
      return { ok: false, error: '360dialog apiKey missing' };
    }
    try {
      const components: Record<string, unknown>[] = [];
      if (input.headerParams?.length) {
        components.push({
          type: 'header',
          parameters: input.headerParams.map((v) =>
            input.mediaUrl
              ? { type: 'image', image: { link: v } }
              : { type: 'text', text: v },
          ),
        });
      }
      if (input.bodyParams?.length) {
        components.push({
          type: 'body',
          parameters: input.bodyParams.map((v) => ({ type: 'text', text: v })),
        });
      }

      const body = {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.languageCode },
          namespace: input.namespace,
          components,
        },
      };
      const res = await fetch(`${this.config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'D360-API-KEY': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `360dialog HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { messages?: { id?: string }[] } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return {
        ok: true,
        providerMessageId: parsed.messages?.[0]?.id,
      };
    } catch (err) {
      logger.warn({ err, to: input.to }, '360dialog sendTemplate failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async sendSession(
    input: WhatsAppSessionSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey) {
      return { ok: false, error: '360dialog apiKey missing' };
    }
    try {
      const body: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'text',
        text: { body: input.message },
      };
      if (input.mediaUrl) {
        body.type = input.mediaType ?? 'image';
        body[input.mediaType ?? 'image'] = {
          link: input.mediaUrl,
          caption: input.message,
        };
        delete body.text;
      }
      const res = await fetch(`${this.config.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'D360-API-KEY': this.config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `360dialog HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { messages?: { id?: string }[] } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return {
        ok: true,
        providerMessageId: parsed.messages?.[0]?.id,
      };
    } catch (err) {
      logger.warn({ err, to: input.to }, '360dialog sendSession failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    return this.config.apiKey
      ? { ok: true }
      : { ok: false, error: 'apiKey missing' };
  }

  static fromConfig(config: WhatsAppProviderConfig): Direct360DialogProvider {
    return new Direct360DialogProvider({
      apiKey: String(config.apiKey ?? ''),
      baseUrl: String(config.baseUrl ?? DEFAULT_BASE_URL),
    });
  }
}

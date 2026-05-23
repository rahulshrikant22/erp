import { logger } from '../../../utils/logger';
import type {
  IWhatsAppProvider,
  WhatsAppProviderConfig,
  WhatsAppProviderContext,
  WhatsAppTemplateSendInput,
  WhatsAppSessionSendInput,
  WhatsAppSendResult,
} from './types';

interface GupshupWhatsAppConfig {
  apiKey: string;
  appName: string;
  sourcePhone: string;
}

const GUPSHUP_URL = 'https://api.gupshup.io/wa/api/v1/msg';

export class GupshupWhatsAppProvider implements IWhatsAppProvider {
  readonly providerCode = 'gupshup_whatsapp';

  constructor(private readonly config: GupshupWhatsAppConfig) {}

  async sendTemplate(
    input: WhatsAppTemplateSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey || !this.config.appName) {
      return { ok: false, error: 'Gupshup apiKey or appName missing' };
    }
    try {
      const templatePayload: Record<string, unknown> = {
        id: input.templateName,
        params: input.bodyParams ?? [],
      };
      if (input.namespace) {
        templatePayload.namespace = input.namespace;
      }

      const params = new URLSearchParams();
      params.set('channel', 'whatsapp');
      params.set('source', this.config.sourcePhone);
      params.set('destination', input.to);
      params.set('src.name', this.config.appName);
      params.set('template', JSON.stringify(templatePayload));

      const res = await fetch(GUPSHUP_URL, {
        method: 'POST',
        headers: {
          apikey: this.config.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `Gupshup HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { status?: string; messageId?: string } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return {
        ok: parsed.status === 'submitted',
        providerMessageId: parsed.messageId,
        error: parsed.status !== 'submitted' ? text.slice(0, 200) : undefined,
      };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'gupshup whatsapp sendTemplate failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async sendSession(
    input: WhatsAppSessionSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey || !this.config.appName) {
      return { ok: false, error: 'Gupshup apiKey or appName missing' };
    }
    try {
      const msgPayload: Record<string, unknown> = input.mediaUrl
        ? { type: input.mediaType ?? 'image', url: input.mediaUrl, caption: input.message }
        : { type: 'text', text: input.message };

      const params = new URLSearchParams();
      params.set('channel', 'whatsapp');
      params.set('source', this.config.sourcePhone);
      params.set('destination', input.to);
      params.set('src.name', this.config.appName);
      params.set('message', JSON.stringify(msgPayload));

      const res = await fetch(GUPSHUP_URL, {
        method: 'POST',
        headers: {
          apikey: this.config.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `Gupshup HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { status?: string; messageId?: string } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return {
        ok: parsed.status === 'submitted',
        providerMessageId: parsed.messageId,
      };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'gupshup whatsapp sendSession failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    return this.config.apiKey && this.config.appName
      ? { ok: true }
      : { ok: false, error: 'apiKey or appName missing' };
  }

  static fromConfig(config: WhatsAppProviderConfig): GupshupWhatsAppProvider {
    return new GupshupWhatsAppProvider({
      apiKey: String(config.apiKey ?? ''),
      appName: String(config.appName ?? ''),
      sourcePhone: String(config.sourcePhone ?? ''),
    });
  }
}

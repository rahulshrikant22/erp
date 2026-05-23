import { logger } from '../../../utils/logger';
import type {
  IWhatsAppProvider,
  WhatsAppProviderConfig,
  WhatsAppProviderContext,
  WhatsAppTemplateSendInput,
  WhatsAppSessionSendInput,
  WhatsAppSendResult,
} from './types';

interface WatiConfig {
  apiKey: string;
  baseUrl: string;
}

export class WatiProvider implements IWhatsAppProvider {
  readonly providerCode = 'wati';

  constructor(private readonly config: WatiConfig) {}

  async sendTemplate(
    input: WhatsAppTemplateSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      return { ok: false, error: 'Wati apiKey or baseUrl missing' };
    }
    try {
      const params: Record<string, unknown>[] = (input.bodyParams ?? []).map(
        (v, i) => ({ name: `${i + 1}`, value: v }),
      );
      const body: Record<string, unknown> = {
        template_name: input.templateName,
        broadcast_name: `erp_${Date.now()}`,
        parameters: params,
      };
      if (input.mediaUrl) {
        body.header_media_url = input.mediaUrl;
      }
      const res = await fetch(
        `${this.config.baseUrl}/api/v1/sendTemplateMessage?whatsappNumber=${input.to}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `Wati HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { result?: boolean; messageId?: string; info?: string } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return {
        ok: parsed.result !== false,
        providerMessageId: parsed.messageId,
        error: parsed.result === false ? parsed.info : undefined,
      };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'wati sendTemplate failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async sendSession(
    input: WhatsAppSessionSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    if (!this.config.apiKey || !this.config.baseUrl) {
      return { ok: false, error: 'Wati apiKey or baseUrl missing' };
    }
    try {
      const res = await fetch(
        `${this.config.baseUrl}/api/v1/sendSessionMessage/${input.to}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ messageText: input.message }),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `Wati HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      let parsed: { result?: boolean; messageId?: string } = {};
      try { parsed = JSON.parse(text); } catch { /* ignore */ }
      return { ok: parsed.result !== false, providerMessageId: parsed.messageId };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'wati sendSession failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    return this.config.apiKey && this.config.baseUrl
      ? { ok: true }
      : { ok: false, error: 'apiKey or baseUrl missing' };
  }

  static fromConfig(config: WhatsAppProviderConfig): WatiProvider {
    return new WatiProvider({
      apiKey: String(config.apiKey ?? ''),
      baseUrl: String(config.baseUrl ?? ''),
    });
  }
}

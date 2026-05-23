import { logger } from '../../../utils/logger';
import type {
  IWhatsAppProvider,
  WhatsAppProviderContext,
  WhatsAppTemplateSendInput,
  WhatsAppSessionSendInput,
  WhatsAppSendResult,
} from './types';

export interface CapturedWhatsApp {
  type: 'template' | 'session';
  to: string;
  templateName?: string;
  message?: string;
  mediaUrl?: string;
  capturedAt: Date;
}

export class WhatsAppLogProvider implements IWhatsAppProvider {
  readonly providerCode = 'log';
  private static readonly capacity = 100;
  private static captured: CapturedWhatsApp[] = [];

  static getCaptured(): readonly CapturedWhatsApp[] {
    return WhatsAppLogProvider.captured;
  }

  static reset(): void {
    WhatsAppLogProvider.captured = [];
  }

  async sendTemplate(
    input: WhatsAppTemplateSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    WhatsAppLogProvider.captured.push({
      type: 'template',
      to: input.to,
      templateName: input.templateName,
      mediaUrl: input.mediaUrl,
      capturedAt: new Date(),
    });
    if (WhatsAppLogProvider.captured.length > WhatsAppLogProvider.capacity) {
      WhatsAppLogProvider.captured.shift();
    }
    logger.info(
      { to: input.to, templateName: input.templateName },
      `whatsapp template captured (log provider) → ${input.to}`,
    );
    return { ok: true, providerMessageId: `wa-log-${Date.now()}` };
  }

  async sendSession(
    input: WhatsAppSessionSendInput,
    _ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult> {
    WhatsAppLogProvider.captured.push({
      type: 'session',
      to: input.to,
      message: input.message,
      mediaUrl: input.mediaUrl,
      capturedAt: new Date(),
    });
    if (WhatsAppLogProvider.captured.length > WhatsAppLogProvider.capacity) {
      WhatsAppLogProvider.captured.shift();
    }
    logger.info(
      { to: input.to },
      `whatsapp session captured (log provider) → ${input.to}`,
    );
    return { ok: true, providerMessageId: `wa-log-${Date.now()}` };
  }

  async verify(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}

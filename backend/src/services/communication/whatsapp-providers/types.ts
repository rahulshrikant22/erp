export interface WhatsAppTemplateSendInput {
  to: string;
  templateName: string;
  languageCode: string;
  namespace?: string;
  headerParams?: string[];
  bodyParams?: string[];
  mediaUrl?: string;
}

export interface WhatsAppSessionSendInput {
  to: string;
  message: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'document' | 'video';
}

export interface WhatsAppSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface WhatsAppWebhookEvent {
  type: 'sent' | 'delivered' | 'read' | 'failed' | 'inbound';
  providerMessageId?: string;
  from?: string;
  timestamp?: Date;
  body?: string;
  mediaUrl?: string;
  mediaType?: string;
  error?: string;
}

export interface WhatsAppProviderContext {
  phoneNumberId?: string;
  businessAccountId?: string;
}

export interface IWhatsAppProvider {
  readonly providerCode: string;
  sendTemplate(
    input: WhatsAppTemplateSendInput,
    ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult>;
  sendSession(
    input: WhatsAppSessionSendInput,
    ctx: WhatsAppProviderContext,
  ): Promise<WhatsAppSendResult>;
  verify(): Promise<{ ok: boolean; error?: string }>;
}

export type WhatsAppProviderConfig = Record<string, unknown>;

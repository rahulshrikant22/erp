/**
 * SMS provider abstraction. Mirrors the email IEmailProvider design.
 *
 * Indian transactional SMS requires a DLT-registered sender ID and template
 * id from TRAI. The senderId belongs on the provider configuration (one
 * provider per sender ID per channel partner is typical); the dltTemplateId
 * lives on the CommunicationTemplate row and travels with each send via
 * the `dltTemplateId` field below.
 */

export interface SmsSendInput {
  to: string;
  /** Already-rendered SMS body. */
  body: string;
  /** TRAI/DLT template id when the destination is India. Required when
   *  DLT enforcement is on. */
  dltTemplateId?: string;
}

export interface SmsSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface SmsProviderContext {
  senderId: string;
}

export interface ISmsProvider {
  readonly providerCode: string;
  send(input: SmsSendInput, ctx: SmsProviderContext): Promise<SmsSendResult>;
  verify(): Promise<{ ok: boolean; error?: string }>;
}

export type SmsProviderConfig = Record<string, unknown>;

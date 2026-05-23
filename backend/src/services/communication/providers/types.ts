/**
 * Email provider abstraction. Every concrete provider implements
 * `IEmailProvider`; consumers only ever talk to that interface so the
 * underlying SDK is swappable without touching call sites.
 *
 * Provider configuration is read from `core.email_providers.configuration`
 * (a JSON object). The shape is per-provider — see the corresponding impl
 * for the keys it expects.
 */

export interface SendInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  /** Identifier for tracking — usually the Notification row id. */
  externalId?: string;
}

export interface SendResult {
  /** Provider-specific message id, when available. */
  providerMessageId?: string;
  /** When false, `error` carries the failure reason. */
  ok: boolean;
  error?: string;
}

export interface ProviderConfig {
  /** Free-form config — concrete provider parses from here. */
  [key: string]: unknown;
}

export interface ProviderContext {
  fromEmail: string;
  fromName?: string;
}

export interface IEmailProvider {
  readonly providerCode: string;
  /** Send a single email. NEVER throws — returns a SendResult instead. */
  send(input: SendInput, ctx: ProviderContext): Promise<SendResult>;
  /** Lightweight reachability / credential check. NEVER throws. */
  verify(): Promise<{ ok: boolean; error?: string }>;
}

export type EmailProviderCode = 'smtp' | 'sendgrid' | 'ses' | 'mailgun' | 'log';

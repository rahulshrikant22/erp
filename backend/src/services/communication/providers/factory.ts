/**
 * Provider factory — maps a `provider_code` to a concrete IEmailProvider.
 *
 * Configuration is the JSON object stored in
 * `core.email_providers.configuration`. Each provider class has a static
 * `fromConfig` that interprets it.
 *
 * Unknown provider codes throw — callers either know the set or have
 * already validated. The admin route validates against this list when
 * creating EmailProvider rows so users can't store nonsense.
 */
import type { IEmailProvider, ProviderConfig } from './types';
import { SmtpProvider } from './smtp';
import { SendGridProvider } from './sendgrid';
import { SesProvider } from './ses';
import { MailgunProvider } from './mailgun';
import { LogProvider } from './log';

export const SUPPORTED_PROVIDERS = ['smtp', 'sendgrid', 'ses', 'mailgun', 'log'] as const;
export type SupportedProviderCode = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(code: string): code is SupportedProviderCode {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(code);
}

export function createEmailProvider(
  providerCode: string,
  config: ProviderConfig,
): IEmailProvider {
  switch (providerCode) {
    case 'smtp':
      return SmtpProvider.fromConfig(config);
    case 'sendgrid':
      return SendGridProvider.fromConfig(config);
    case 'ses':
      return SesProvider.fromConfig(config);
    case 'mailgun':
      return MailgunProvider.fromConfig(config);
    case 'log':
      return new LogProvider();
    default:
      throw new Error(`Unknown email provider code: ${providerCode}`);
  }
}

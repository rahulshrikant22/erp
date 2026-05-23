import type { IWhatsAppProvider, WhatsAppProviderConfig } from './types';
import { InteraktProvider } from './interakt';
import { WatiProvider } from './wati';
import { GupshupWhatsAppProvider } from './gupshup-whatsapp';
import { Direct360DialogProvider } from './direct360dialog';
import { WhatsAppLogProvider } from './log';

export const SUPPORTED_WHATSAPP_PROVIDERS = [
  'interakt',
  'wati',
  'gupshup_whatsapp',
  '360dialog',
  'log',
] as const;
export type SupportedWhatsAppProviderCode = (typeof SUPPORTED_WHATSAPP_PROVIDERS)[number];

export function isSupportedWhatsAppProvider(
  code: string,
): code is SupportedWhatsAppProviderCode {
  return (SUPPORTED_WHATSAPP_PROVIDERS as readonly string[]).includes(code);
}

export function createWhatsAppProvider(
  providerCode: string,
  config: WhatsAppProviderConfig,
): IWhatsAppProvider {
  switch (providerCode) {
    case 'interakt':          return InteraktProvider.fromConfig(config);
    case 'wati':              return WatiProvider.fromConfig(config);
    case 'gupshup_whatsapp':  return GupshupWhatsAppProvider.fromConfig(config);
    case '360dialog':         return Direct360DialogProvider.fromConfig(config);
    case 'log':               return new WhatsAppLogProvider();
    default:
      throw new Error(`Unknown WhatsApp provider code: ${providerCode}`);
  }
}

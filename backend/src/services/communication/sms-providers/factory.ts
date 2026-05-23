/**
 * SMS provider factory — maps `provider_code` → impl. Validation against
 * SUPPORTED_SMS_PROVIDERS happens in the admin route layer so users can't
 * store nonsense.
 */
import type { ISmsProvider, SmsProviderConfig } from './types';
import { Msg91Provider } from './msg91';
import { TwilioProvider } from './twilio';
import { GupshupProvider } from './gupshup';
import { TextlocalProvider } from './textlocal';
import { SmsLogProvider } from './log';

export const SUPPORTED_SMS_PROVIDERS = [
  'msg91',
  'twilio',
  'gupshup',
  'textlocal',
  'log',
] as const;
export type SupportedSmsProviderCode = (typeof SUPPORTED_SMS_PROVIDERS)[number];

export function isSupportedSmsProvider(code: string): code is SupportedSmsProviderCode {
  return (SUPPORTED_SMS_PROVIDERS as readonly string[]).includes(code);
}

export function createSmsProvider(
  providerCode: string,
  config: SmsProviderConfig,
): ISmsProvider {
  switch (providerCode) {
    case 'msg91':     return Msg91Provider.fromConfig(config);
    case 'twilio':    return TwilioProvider.fromConfig(config);
    case 'gupshup':   return GupshupProvider.fromConfig(config);
    case 'textlocal': return TextlocalProvider.fromConfig(config);
    case 'log':       return new SmsLogProvider();
    default:
      throw new Error(`Unknown SMS provider code: ${providerCode}`);
  }
}

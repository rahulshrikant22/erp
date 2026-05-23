/**
 * Gupshup SMS provider — direct REST.
 *
 * Config keys:
 *   { userid, password }   // basic auth pair
 *
 * Endpoint: https://enterprise.smsgupshup.com/GatewayAPI/rest
 */
import { logger } from '../../../utils/logger';
import type {
  ISmsProvider,
  SmsProviderConfig,
  SmsProviderContext,
  SmsSendInput,
  SmsSendResult,
} from './types';

const GUPSHUP_URL = 'https://enterprise.smsgupshup.com/GatewayAPI/rest';

interface GupshupConfig {
  userid: string;
  password: string;
}

export class GupshupProvider implements ISmsProvider {
  readonly providerCode = 'gupshup';

  constructor(private readonly config: GupshupConfig) {}

  async send(input: SmsSendInput, ctx: SmsProviderContext): Promise<SmsSendResult> {
    if (!this.config.userid || !this.config.password) {
      return { ok: false, error: 'Gupshup userid/password missing' };
    }
    try {
      const params = new URLSearchParams({
        method: 'SendMessage',
        send_to: input.to.replace(/^\+/, ''),
        msg: input.body,
        msg_type: 'TEXT',
        userid: this.config.userid,
        auth_scheme: 'plain',
        password: this.config.password,
        v: '1.1',
        format: 'text',
        principalEntityId: '',
        dltTemplateId: input.dltTemplateId ?? '',
        mask: ctx.senderId,
      });
      const res = await fetch(`${GUPSHUP_URL}?${params}`);
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `Gupshup HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      // Gupshup REST returns plain text like "success | id"
      const ok = /success/i.test(text);
      return { ok, providerMessageId: ok ? text.split('|').pop()?.trim() : undefined, error: ok ? undefined : text.slice(0, 200) };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'gupshup send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    return this.config.userid && this.config.password
      ? { ok: true }
      : { ok: false, error: 'userid/password missing' };
  }

  static fromConfig(config: SmsProviderConfig): GupshupProvider {
    return new GupshupProvider({
      userid: String(config.userid ?? ''),
      password: String(config.password ?? ''),
    });
  }
}

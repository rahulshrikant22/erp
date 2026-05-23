/**
 * MSG91 provider — direct REST so we don't pull in their (stale) SDK.
 *
 * Config keys (all required for live sends):
 *   { authKey, dltPrincipalEntityId? }
 *
 * Uses MSG91's "Flow" API for transactional SMS. The DLT template id is
 * passed through; MSG91 enforces matching on its end.
 */
import { logger } from '../../../utils/logger';
import type {
  ISmsProvider,
  SmsProviderConfig,
  SmsProviderContext,
  SmsSendInput,
  SmsSendResult,
} from './types';

interface Msg91Config {
  authKey: string;
  dltPrincipalEntityId?: string;
}

const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

export class Msg91Provider implements ISmsProvider {
  readonly providerCode = 'msg91';

  constructor(private readonly config: Msg91Config) {}

  async send(input: SmsSendInput, ctx: SmsProviderContext): Promise<SmsSendResult> {
    if (!this.config.authKey) {
      return { ok: false, error: 'MSG91 authKey missing' };
    }
    if (!input.dltTemplateId) {
      return { ok: false, error: 'MSG91 requires dltTemplateId for transactional SMS' };
    }

    try {
      const res = await fetch(MSG91_FLOW_URL, {
        method: 'POST',
        headers: {
          authkey: this.config.authKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          template_id: input.dltTemplateId,
          short_url: '0',
          recipients: [{ mobiles: input.to.replace(/^\+/, '') }],
          sender: ctx.senderId,
          // The MSG91 Flow API substitutes variables defined on the template
          // itself; for our use, the body has already been rendered locally
          // so we send it as a single `var1` to match a one-variable template.
          // Real production usage will pre-register multi-variable templates.
          var1: input.body,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, error: `MSG91 HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      // MSG91 returns a tracking id-ish string. Best-effort.
      let body: { request_id?: string; type?: string } = {};
      try { body = JSON.parse(text); } catch { /* ignore */ }
      return { ok: body.type !== 'error', providerMessageId: body.request_id };
    } catch (err) {
      logger.warn({ err, to: input.to }, 'msg91 send failed');
      return { ok: false, error: (err as Error).message };
    }
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    return this.config.authKey
      ? { ok: true }
      : { ok: false, error: 'authKey missing' };
  }

  static fromConfig(config: SmsProviderConfig): Msg91Provider {
    return new Msg91Provider({
      authKey: String(config.authKey ?? ''),
      dltPrincipalEntityId: config.dltPrincipalEntityId as string | undefined,
    });
  }
}

/**
 * Backwards-compatible email shim.
 *
 * P0-05 introduced a single `sendMail()` helper backed by nodemailer. P0-15
 * replaced the implementation with a real provider abstraction in
 * `services/communication/email-service.ts`. This module preserves the
 * `sendMail({to, subject, html, text})` signature so older callers don't
 * need to change while we migrate to `sendTemplate(...)`.
 *
 * New code should import `sendTemplate` directly.
 */
import { sendRaw } from './communication/email-service';

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(input: SendMailInput): Promise<{ messageId: string }> {
  const r = await sendRaw({
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
  return { messageId: r.providerMessageId ?? '' };
}

/** Compatibility no-op — the old transport cache lived in this module. */
export function _resetEmailTransport(): void {
  // The new service caches its provider chain internally. If a test needs
  // to refresh after admin DB writes, import _invalidateProviderCache
  // from communication/email-service directly.
}

export { _invalidateProviderCache } from './communication/email-service';
export { sendTemplate, sendRaw } from './communication/email-service';

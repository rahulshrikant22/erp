/**
 * Template lookup + rendering for communication_templates.
 *
 * Substitution is intentionally minimal: `{{variable}}` and
 * `{{nested.field}}` (dotted path). No conditionals, no loops — those
 * encourage fragile templates that should be precomputed in code anyway.
 *
 * Both subject and body are rendered. The `text` field is derived from the
 * body when no separate plaintext template is stored (we keep one body
 * field today; templates that want a different plain version can prefix
 * with a sentinel — out of scope for P0).
 */
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from '../../errors';

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

const VAR_PATTERN = /{{\s*([\w.]+)\s*}}/g;

function readPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function substitute(template: string, variables: Record<string, unknown>): string {
  return template.replace(VAR_PATTERN, (_match, key: string) => {
    const v = readPath(variables, key);
    if (v === undefined || v === null) return '';
    return String(v);
  });
}

/** Convert HTML body to a plaintext approximation when no separate text is available. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function renderTemplate(
  templateCode: string,
  variables: Record<string, unknown> = {},
): Promise<RenderedTemplate> {
  const tpl = await prisma.communicationTemplate.findUnique({
    where: { templateCode },
  });
  if (!tpl) throw new NotFoundError(`Template ${templateCode} not found`);
  if (!tpl.isActive) {
    throw new ValidationError(`Template ${templateCode} is inactive`);
  }

  const subject = substitute(tpl.subjectTemplate ?? '', variables);
  const html = substitute(tpl.bodyTemplate, variables);
  const text = htmlToText(html);
  return { subject, html, text };
}

/**
 * Pure helper used by tests so we can verify substitution without writing
 * fixtures to the DB. Same logic the renderer uses.
 */
export function _renderRaw(
  subjectTemplate: string,
  bodyTemplate: string,
  variables: Record<string, unknown>,
): RenderedTemplate {
  const subject = substitute(subjectTemplate, variables);
  const html = substitute(bodyTemplate, variables);
  return { subject, html, text: htmlToText(html) };
}

/**
 * Date helpers — keep these tiny and side-effect-free.
 * Anything with timezones, formatting, or business calendars goes in a
 * dedicated module under /utils later (e.g. financial-year helpers in P0-04+).
 */

/** Current UTC instant as an ISO 8601 string. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Convert any Date to an ISO 8601 string (alias for clarity at call sites). */
export function toIso(d: Date): string {
  return d.toISOString();
}

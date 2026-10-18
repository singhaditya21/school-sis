/**
 * Vendor-free bot screening for the public lead form (issue #31).
 *
 * Two signals, neither of which a legitimate user trips, and both non-breaking —
 * a submission that omits the field is simply not screened on that signal, so
 * older forms and integrations keep working:
 *
 *   • honeypot — a field positioned off-screen and hidden from assistive tech, so
 *     only an automated form-filler completes it.
 *   • dwell time — the elapsed time between the form rendering and the submission.
 *     A person cannot read and complete the form in a couple of seconds; a script
 *     posts instantly.
 *
 * A positive result is a SILENT DROP at the caller (respond 200, write nothing) so
 * the bot learns nothing and a real user is never shown a false accusation. This is
 * a first, dependency-free layer; a CAPTCHA (vendor decision) can slot in alongside.
 */
export const LEAD_HONEYPOT_FIELD = 'homepageUrl';
export const LEAD_TIMESTAMP_FIELD = 'formLoadedAt';

/** A human takes longer than this to fill the form; a bot does not. */
export const MIN_DWELL_MS = 2500;

export type LeadScreenResult = { botLike: boolean; signal?: 'honeypot' | 'too_fast' };

/**
 * Screen a lead submission for bot signals. `now` is injectable for testing.
 * Only the two screening fields are read; the real lead fields are untouched.
 */
export function screenLeadSubmission(
  fields: { honeypot?: unknown; loadedAt?: unknown },
  now: number = Date.now(),
): LeadScreenResult {
  const honeypot = typeof fields.honeypot === 'string' ? fields.honeypot.trim() : '';
  if (honeypot.length > 0) {
    return { botLike: true, signal: 'honeypot' };
  }

  const loadedAtRaw = typeof fields.loadedAt === 'string' ? fields.loadedAt.trim() : '';
  if (loadedAtRaw) {
    const loadedAt = Number(loadedAtRaw);
    // Ignore an absent/garbage/future timestamp — only a real, too-short dwell blocks.
    if (Number.isFinite(loadedAt) && loadedAt > 0 && loadedAt <= now && now - loadedAt < MIN_DWELL_MS) {
      return { botLike: true, signal: 'too_fast' };
    }
  }

  return { botLike: false };
}

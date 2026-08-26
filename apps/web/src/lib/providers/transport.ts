/**
 * Shared outbound transport for notification provider adapters.
 *
 * Every live adapter goes through here so three properties hold everywhere:
 *
 *  1. A hung provider can never pin a worker tick open — every request carries an
 *     abort timeout.
 *  2. Failures surface as data (`ProviderResult.success === false`), never as a
 *     silent success, so `notification_outbox.status` can only reach SENT when a
 *     provider actually accepted the message.
 *  3. Nothing that identifies a parent, or authenticates us to a provider, is
 *     ever written to a log line, to `notification_outbox.last_error`, or to
 *     `notification_delivery_events.error`.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_ERROR_TEXT = 400;

/** Shared fallback so one env var can tighten every channel at once. */
const GLOBAL_TIMEOUT_ENV = 'NOTIFICATION_PROVIDER_TIMEOUT_MS';

function parseTimeout(raw: string | undefined): number | null {
  const parsed = Number.parseInt((raw || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, parsed));
}

export function resolveTimeoutMs(
  specificEnvName?: string,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const specific = specificEnvName ? parseTimeout(env[specificEnvName]) : null;
  if (specific !== null) return specific;
  return parseTimeout(env[GLOBAL_TIMEOUT_ENV]) ?? DEFAULT_TIMEOUT_MS;
}

// ─── Redaction ───────────────────────────────────────────────

/**
 * Provider error bodies routinely echo the recipient back at us (Meta: "Recipient
 * phone number not in allowed list: +91…"). Those strings land in the outbox and
 * in delivery events, so scrub identifiers before they are persisted or logged.
 */
export function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[redacted-email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[redacted-number]')
    .replace(/\b(?:Bearer|authkey|access_token|api[_-]?key)\b[:=\s]+\S+/gi, '$1 [redacted]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-token]');
}

export function truncateError(value: string): string {
  const clean = redactSensitiveText(value).replace(/\s+/g, ' ').trim();
  return clean.length > MAX_ERROR_TEXT ? `${clean.slice(0, MAX_ERROR_TEXT)}…` : clean;
}

/** Last four digits only — enough to reconcile with a parent, useless to a leak. */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return `***(${digits.length} digits)`;
  return `***${digits.slice(-4)}`;
}

export function maskEmail(value: string): string {
  const at = value.lastIndexOf('@');
  if (at <= 0) return '***';
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return `${value.slice(0, 1)}***@***${dot >= 0 ? domain.slice(dot) : ''}`;
}

// ─── Fetch ───────────────────────────────────────────────────

export type ProviderHttpResponse = {
  ok: boolean;
  status: number;
  /** Parsed JSON body, or null when the provider returned something else. */
  json: unknown;
  /** Redacted, truncated body text — safe to persist in an error column. */
  safeText: string;
};

export class ProviderTransportError extends Error {
  readonly timedOut: boolean;

  constructor(message: string, timedOut: boolean) {
    super(message);
    this.name = 'ProviderTransportError';
    this.timedOut = timedOut;
  }
}

/**
 * Performs one outbound provider call. Never throws for an HTTP status — only for
 * a timeout or a transport failure, which callers turn into a failed send.
 *
 * MUST NOT be called from inside a database transaction: a provider that takes
 * the full timeout would hold a Postgres connection and its row locks for that
 * whole window. `processNotification` commits its claim before dispatching.
 */
export async function providerFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<ProviderHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } catch (error: unknown) {
    const aborted = controller.signal.aborted;
    const detail = error instanceof Error ? error.message : 'unknown transport error';
    throw new ProviderTransportError(
      aborted
        ? `Provider did not respond within ${timeoutMs}ms.`
        : `Provider request failed: ${truncateError(detail)}`,
      aborted,
    );
  } finally {
    clearTimeout(timer);
  }

  let raw = '';
  try {
    raw = await response.text();
  } catch {
    raw = '';
  }

  let json: unknown = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = null;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    json,
    safeText: raw ? truncateError(raw) : '',
  };
}

/** Bounds a promise that has no abort signal of its own (e.g. the Firebase SDK). */
export async function withDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ProviderTransportError(`${label} did not respond within ${timeoutMs}ms.`, true)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation(), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Small JSON readers (no `any`) ───────────────────────────

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readString(source: unknown, key: string): string | null {
  const record = asRecord(source);
  const value = record ? record[key] : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readArray(source: unknown, key: string): unknown[] {
  const record = asRecord(source);
  const value = record ? record[key] : undefined;
  return Array.isArray(value) ? value : [];
}

// ─── Phone normalisation ─────────────────────────────────────

const DEFAULT_COUNTRY_CODE_ENV = 'NOTIFICATION_DEFAULT_COUNTRY_CODE';

/**
 * Returns bare E.164 digits (no `+`). Indian parent records are stored both as
 * `+91XXXXXXXXXX` and as bare 10-digit numbers, so a national number is promoted
 * with the configured country code (91 unless overridden).
 */
export function normalizeToE164Digits(
  raw: string,
  env: NodeJS.ProcessEnv = process.env,
): { digits: string } | { error: string } {
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) return { error: 'Recipient phone number contains no digits.' };

  if (!hadPlus && digits.length === 10) {
    const cc = (env[DEFAULT_COUNTRY_CODE_ENV] || '91').replace(/\D/g, '') || '91';
    digits = `${cc}${digits}`;
  }
  if (!hadPlus && digits.length === 11 && digits.startsWith('0')) {
    const cc = (env[DEFAULT_COUNTRY_CODE_ENV] || '91').replace(/\D/g, '') || '91';
    digits = `${cc}${digits.slice(1)}`;
  }

  if (digits.length < 8 || digits.length > 15) {
    return { error: `Recipient phone number is not a valid E.164 number (${digits.length} digits).` };
  }
  return { digits };
}

// ─── Availability ────────────────────────────────────────────
// Declared here rather than in `index.ts` so adapters can import the helpers
// without a runtime import cycle (index.ts re-exports the adapters themselves).

/**
 * What a provider reports about itself before anything is sent.
 * `missing` lists the environment variables that would make it available.
 */
export type ProviderAvailability = {
  provider: string;
  available: boolean;
  reason: string | null;
  missing: readonly string[];
};

/**
 * How far a message got, according to the provider's own response.
 * ACCEPTED  — the provider took custody (maps to notification status SENT).
 * DELIVERED — the provider confirmed handset/inbox delivery in this same response.
 * Anything weaker is a failure, not a partial success.
 */
export type ProviderDeliveryState = 'ACCEPTED' | 'DELIVERED';

export type ProviderDispatch = {
  messageId: string;
  deliveryState: ProviderDeliveryState;
  /** Non-identifying provider detail worth keeping on the delivery event. */
  providerStatus?: string;
};

export function providerUnavailable(
  provider: string,
  missing: readonly string[],
  detail?: string,
): ProviderAvailability {
  return {
    provider,
    available: false,
    missing,
    reason:
      detail
      || `${provider} is not configured. Set ${missing.join(', ')} to enable this channel.`,
  };
}

export function providerAvailable(provider: string): ProviderAvailability {
  return { provider, available: true, reason: null, missing: [] };
}

/** Environment variables that are present and are not blank. */
export function missingEnv(
  names: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return names.filter((name) => !(env[name] || '').trim());
}

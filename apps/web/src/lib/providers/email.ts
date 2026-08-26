/**
 * Email Provider — SMTP (nodemailer) + Resend, with a dev-only mock.
 *
 * Selection comes from EMAIL_PROVIDER via `notificationProviderForChannel`, which
 * refuses to resolve 'mock' in production.
 *
 *   EMAIL_PROVIDER=smtp    → SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)
 *   EMAIL_PROVIDER=resend  → RESEND_API_KEY + EMAIL_FROM
 *
 * When the required variables are absent the channel reports itself unavailable and
 * every send fails with that reason. Nothing is ever reported as sent on a guess.
 */

import type { ProviderResult } from './index';
import { logger } from '@/lib/observability/logger';
import { mockRuntimeIsAllowed, notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import {
    maskEmail,
    missingEnv,
    providerAvailable,
    providerFetch,
    providerUnavailable,
    readString,
    resolveTimeoutMs,
    truncateError,
    withDeadline,
    type ProviderAvailability,
    type ProviderDispatch,
} from './transport';

// ─── Interface ───────────────────────────────────────────────

export type EmailSendOptions = {
    to: string;
    subject: string;
    html: string;
    from?: string;
};

export interface EmailProvider {
    readonly provider: string;
    availability(): ProviderAvailability;
    send(options: EmailSendOptions): Promise<ProviderResult<ProviderDispatch>>;
}

// ─── Unavailable (no credentials) ────────────────────────────

/**
 * The adapter used whenever EMAIL_PROVIDER is unset, unknown, or its credentials
 * are missing. It exists so callers get a clean failure instead of an exception,
 * and so the outbox records FAILED rather than nothing at all.
 */
class UnavailableEmailProvider implements EmailProvider {
    readonly provider: string;
    private readonly detail: ProviderAvailability;

    constructor(detail: ProviderAvailability) {
        this.provider = detail.provider;
        this.detail = detail;
    }

    availability(): ProviderAvailability {
        return this.detail;
    }

    async send(): Promise<ProviderResult<ProviderDispatch>> {
        return { success: false, error: this.detail.reason || 'Email provider is not configured.' };
    }
}

// ─── Mock (development only) ─────────────────────────────────

class MockEmailProvider implements EmailProvider {
    readonly provider = 'mock';

    availability(): ProviderAvailability {
        return providerAvailable('mock');
    }

    async send(options: EmailSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        logger.info('notification.mock_email_sent', 'Mock email accepted', {
            source: 'notifications',
            metadata: {
                recipient: maskEmail(options.to),
                subjectLength: options.subject.length,
                bodyLength: options.html.length,
            },
        });
        return {
            success: true,
            data: {
                messageId: `mock_email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                deliveryState: 'ACCEPTED',
                providerStatus: 'mock',
            },
        };
    }
}

// ─── SMTP (nodemailer) ───────────────────────────────────────

const SMTP_TIMEOUT_ENV = 'SMTP_TIMEOUT_MS';

type SmtpSendInfo = {
    messageId?: string;
    accepted?: unknown[];
    rejected?: unknown[];
    response?: string;
};

type SmtpTransport = { sendMail(message: Record<string, unknown>): Promise<SmtpSendInfo> };

export function smtpAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const missing = missingEnv(['SMTP_HOST'], env);
    if (missing.length > 0) {
        return providerUnavailable(
            'smtp',
            missing,
            'SMTP is selected but SMTP_HOST is not set, so no mail server can be reached.',
        );
    }
    // Anonymous relays exist, but an accidentally half-configured one silently
    // rejects every message — so a user without a password is treated as broken.
    const user = (env.SMTP_USER || '').trim();
    const pass = (env.SMTP_PASS || '').trim();
    if (user && !pass) {
        return providerUnavailable('smtp', ['SMTP_PASS'], 'SMTP_USER is set without SMTP_PASS.');
    }
    if (!user && (env.SMTP_ALLOW_ANONYMOUS || '').trim().toLowerCase() !== 'true') {
        return providerUnavailable(
            'smtp',
            ['SMTP_USER', 'SMTP_PASS'],
            'SMTP has no credentials. Set SMTP_USER and SMTP_PASS, or SMTP_ALLOW_ANONYMOUS=true for an open relay.',
        );
    }
    if (!(env.EMAIL_FROM || '').trim() && !user) {
        return providerUnavailable('smtp', ['EMAIL_FROM'], 'No sender address: set EMAIL_FROM.');
    }
    return providerAvailable('smtp');
}

class SmtpProvider implements EmailProvider {
    readonly provider = 'smtp';
    private transport: SmtpTransport | null = null;

    availability(): ProviderAvailability {
        return smtpAvailability();
    }

    private async getTransport(timeoutMs: number): Promise<SmtpTransport> {
        if (this.transport) return this.transport;

        let nodemailer: typeof import('nodemailer');
        try {
            nodemailer = await import('nodemailer');
        } catch {
            throw new Error(
                'SMTP transport unavailable: the nodemailer module is not installed in this runtime.',
            );
        }

        const port = Number.parseInt((process.env.SMTP_PORT || '587').trim(), 10) || 587;
        const user = (process.env.SMTP_USER || '').trim();
        const pass = (process.env.SMTP_PASS || '').trim();

        this.transport = nodemailer.createTransport({
            host: (process.env.SMTP_HOST || '').trim(),
            port,
            secure: port === 465,
            auth: user ? { user, pass } : undefined,
            connectionTimeout: timeoutMs,
            greetingTimeout: timeoutMs,
            socketTimeout: timeoutMs,
        }) as unknown as SmtpTransport;

        return this.transport;
    }

    async send(options: EmailSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'SMTP is not configured.' };
        }

        const timeoutMs = resolveTimeoutMs(SMTP_TIMEOUT_ENV);
        try {
            const transport = await this.getTransport(timeoutMs);
            const from = options.from
                || (process.env.EMAIL_FROM || '').trim()
                || `ScholarMind <${(process.env.SMTP_USER || '').trim()}>`;

            // nodemailer's own timeouts cover the socket; the deadline covers DNS and
            // any stage that would otherwise hang past them.
            const info = await withDeadline(
                () => transport.sendMail({
                    from,
                    to: options.to,
                    subject: options.subject,
                    html: options.html,
                }),
                timeoutMs + 2_000,
                'SMTP server',
            );

            const accepted = Array.isArray(info.accepted) ? info.accepted.length : 0;
            const rejected = Array.isArray(info.rejected) ? info.rejected.length : 0;
            if (rejected > 0 || accepted === 0) {
                // The SMTP session succeeded but the server refused the recipient.
                // That is a failed delivery, not a send.
                return {
                    success: false,
                    error: truncateError(
                        `SMTP server rejected the recipient (${rejected} rejected, ${accepted} accepted).`,
                    ),
                };
            }

            const messageId = typeof info.messageId === 'string' && info.messageId.trim()
                ? info.messageId.trim()
                : null;
            if (!messageId) {
                return { success: false, error: 'SMTP server returned no message id.' };
            }

            return {
                success: true,
                data: { messageId, deliveryState: 'ACCEPTED', providerStatus: 'smtp_accepted' },
            };
        } catch (error: unknown) {
            // A failed session can leave a poisoned transport behind; rebuild next time.
            this.transport = null;
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'SMTP send failed.'),
            };
        }
    }
}

// ─── Resend ──────────────────────────────────────────────────

const RESEND_TIMEOUT_ENV = 'RESEND_TIMEOUT_MS';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function resendAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    // Resend rejects any `from` outside a verified domain, so guessing a default
    // sender guarantees a 403 at delivery time. Require it up front instead.
    const missing = missingEnv(['RESEND_API_KEY', 'EMAIL_FROM'], env);
    return missing.length > 0 ? providerUnavailable('resend', missing) : providerAvailable('resend');
}

class ResendProvider implements EmailProvider {
    readonly provider = 'resend';

    availability(): ProviderAvailability {
        return resendAvailability();
    }

    async send(options: EmailSendOptions): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'Resend is not configured.' };
        }

        try {
            const response = await providerFetch(
                RESEND_ENDPOINT,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${(process.env.RESEND_API_KEY || '').trim()}`,
                    },
                    body: JSON.stringify({
                        from: options.from || (process.env.EMAIL_FROM || '').trim(),
                        to: [options.to],
                        subject: options.subject,
                        html: options.html,
                    }),
                },
                resolveTimeoutMs(RESEND_TIMEOUT_ENV),
            );

            if (!response.ok) {
                const detail = readString(response.json, 'message') || response.safeText;
                return {
                    success: false,
                    error: truncateError(`Resend rejected the message (HTTP ${response.status}): ${detail}`),
                };
            }

            const messageId = readString(response.json, 'id');
            if (!messageId) {
                // A 2xx without an id means we cannot prove anything was queued.
                return { success: false, error: 'Resend accepted the request but returned no message id.' };
            }

            return {
                success: true,
                data: { messageId, deliveryState: 'ACCEPTED', providerStatus: 'resend_queued' },
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'Resend send failed.'),
            };
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────

/**
 * Reports whether email can leave this deployment, without constructing anything.
 * Safe to call from a page or action that needs to gate the UI.
 */
export function emailAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const provider = notificationProviderForChannel('EMAIL', env);
    switch (provider) {
        case 'smtp':
            return smtpAvailability(env);
        case 'resend':
            return resendAvailability(env);
        case 'mock':
            return mockRuntimeIsAllowed(env)
                ? providerAvailable('mock')
                : providerUnavailable('mock', [], 'Mock email delivery is disabled in this runtime.');
        case 'unconfigured':
            return providerUnavailable('unconfigured', ['EMAIL_PROVIDER'], 'No EMAIL_PROVIDER is set for this deployment.');
        default:
            return providerUnavailable(
                provider,
                ['EMAIL_PROVIDER'],
                `No adapter is installed for the "${provider}" email provider.`,
            );
    }
}

let _instance: EmailProvider | null = null;
let _instanceKey = '';

export function getEmailProvider(): EmailProvider {
    const provider = notificationProviderForChannel('EMAIL');
    // Re-resolve when the selection changes (tests, and per-request env in preview).
    if (_instance && _instanceKey === provider) return _instance;

    const state = emailAvailability();
    if (!state.available) {
        _instance = new UnavailableEmailProvider(state);
    } else if (provider === 'smtp') {
        _instance = new SmtpProvider();
    } else if (provider === 'resend') {
        _instance = new ResendProvider();
    } else if (provider === 'mock') {
        _instance = new MockEmailProvider();
    } else {
        _instance = new UnavailableEmailProvider(
            providerUnavailable(provider, ['EMAIL_PROVIDER'], `Unsupported email provider: ${provider}.`),
        );
    }

    _instanceKey = provider;
    return _instance;
}

/** Test hook: drops the cached adapter so a new environment takes effect. */
export function resetEmailProviderCache(): void {
    _instance = null;
    _instanceKey = '';
}

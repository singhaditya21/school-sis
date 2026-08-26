/**
 * SMS Provider — MSG91 (India/DLT) + Twilio, with a dev-only mock.
 *
 * Selection comes from SMS_PROVIDER via `notificationProviderForChannel`, which
 * refuses to resolve 'mock' in production.
 *
 *   SMS_PROVIDER=msg91   → MSG91_AUTH_KEY + MSG91_TEMPLATE_ID (the DLT-approved flow id)
 *   SMS_PROVIDER=twilio  → TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
 *                          + TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID
 *
 * Indian transactional SMS has required a DLT-registered template since 2021, so
 * MSG91 without a template id cannot deliver and reports itself unavailable rather
 * than posting a body that the operator will drop.
 */

import type { ProviderResult } from './index';
import { logger } from '@/lib/observability/logger';
import { mockRuntimeIsAllowed, notificationProviderForChannel } from '@/lib/integrations/runtime-mode';
import {
    asRecord,
    maskPhone,
    missingEnv,
    normalizeToE164Digits,
    providerAvailable,
    providerFetch,
    providerUnavailable,
    readString,
    resolveTimeoutMs,
    truncateError,
    type ProviderAvailability,
    type ProviderDispatch,
} from './transport';

// ─── Interface ───────────────────────────────────────────────

export interface SmsProvider {
    readonly provider: string;
    availability(): ProviderAvailability;
    send(to: string, message: string): Promise<ProviderResult<ProviderDispatch>>;
    sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>>;
}

/** Shared sequential fan-out. Providers here have no batch endpoint we can trust. */
async function sendEach(
    provider: SmsProvider,
    messages: { to: string; message: string }[],
): Promise<ProviderResult<{ sent: number; failed: number }>> {
    let sent = 0;
    let failed = 0;
    let firstError: string | undefined;
    for (const msg of messages) {
        const result = await provider.send(msg.to, msg.message);
        if (result.success) {
            sent += 1;
        } else {
            failed += 1;
            firstError = firstError || result.error;
        }
    }
    return {
        success: failed === 0,
        data: { sent, failed },
        error: failed > 0 ? `${failed} SMS message(s) failed: ${firstError || 'provider rejected delivery'}` : undefined,
    };
}

// ─── Unavailable (no credentials) ────────────────────────────

class UnavailableSmsProvider implements SmsProvider {
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
        return { success: false, error: this.detail.reason || 'SMS provider is not configured.' };
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        return {
            success: false,
            data: { sent: 0, failed: messages.length },
            error: this.detail.reason || 'SMS provider is not configured.',
        };
    }
}

// ─── Mock (development only) ─────────────────────────────────

class MockSmsProvider implements SmsProvider {
    readonly provider = 'mock';

    availability(): ProviderAvailability {
        return providerAvailable('mock');
    }

    async send(to: string, message: string): Promise<ProviderResult<ProviderDispatch>> {
        logger.info('notification.mock_sms_sent', 'Mock SMS accepted', {
            source: 'notifications',
            metadata: { recipient: maskPhone(to), messageLength: message.length },
        });
        return {
            success: true,
            data: {
                messageId: `mock_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                deliveryState: 'ACCEPTED',
                providerStatus: 'mock',
            },
        };
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        return sendEach(this, messages);
    }
}

// ─── MSG91 (flow API v5) ─────────────────────────────────────

const MSG91_TIMEOUT_ENV = 'MSG91_TIMEOUT_MS';
const MSG91_ENDPOINT = 'https://control.msg91.com/api/v5/flow/';

export function msg91Availability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const missing = missingEnv(['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'], env);
    if (missing.length === 0) return providerAvailable('msg91');
    return providerUnavailable(
        'msg91',
        missing,
        missing.includes('MSG91_TEMPLATE_ID')
            ? 'MSG91 needs MSG91_TEMPLATE_ID — the DLT-approved flow id. Indian operators drop transactional SMS sent without one.'
            : 'MSG91 is selected but MSG91_AUTH_KEY is not set.',
    );
}

class Msg91Provider implements SmsProvider {
    readonly provider = 'msg91';

    availability(): ProviderAvailability {
        return msg91Availability();
    }

    async send(to: string, message: string): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'MSG91 is not configured.' };
        }

        const normalized = normalizeToE164Digits(to);
        if ('error' in normalized) return { success: false, error: normalized.error };

        // The DLT template decides the variable name; MSG91_MESSAGE_VARIABLE lets a
        // deployment match whatever it registered without a code change.
        const variable = (process.env.MSG91_MESSAGE_VARIABLE || 'MESSAGE').trim() || 'MESSAGE';
        const body: Record<string, unknown> = {
            template_id: (process.env.MSG91_TEMPLATE_ID || '').trim(),
            short_url: '0',
            realTimeResponse: '1',
            recipients: [{ mobiles: normalized.digits, [variable]: message }],
        };
        const senderId = (process.env.MSG91_SENDER_ID || '').trim();
        if (senderId) body.sender = senderId;

        try {
            const response = await providerFetch(
                MSG91_ENDPOINT,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        accept: 'application/json',
                        authkey: (process.env.MSG91_AUTH_KEY || '').trim(),
                    },
                    body: JSON.stringify(body),
                },
                resolveTimeoutMs(MSG91_TIMEOUT_ENV),
            );

            if (!response.ok) {
                return {
                    success: false,
                    error: truncateError(`MSG91 rejected the message (HTTP ${response.status}): ${response.safeText}`),
                };
            }

            // MSG91 answers 200 for its own errors, so the envelope must be read.
            const type = readString(response.json, 'type');
            if (type && type.toLowerCase() !== 'success') {
                return {
                    success: false,
                    error: truncateError(
                        `MSG91 returned type=${type}: ${readString(response.json, 'message') || response.safeText}`,
                    ),
                };
            }

            const messageId = readString(response.json, 'request_id') || readString(response.json, 'message');
            if (!messageId) {
                return { success: false, error: 'MSG91 accepted the request but returned no request id.' };
            }

            return {
                success: true,
                data: { messageId, deliveryState: 'ACCEPTED', providerStatus: 'msg91_accepted' },
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'MSG91 send failed.'),
            };
        }
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        return sendEach(this, messages);
    }
}

// ─── Twilio ──────────────────────────────────────────────────

const TWILIO_TIMEOUT_ENV = 'TWILIO_TIMEOUT_MS';

/** Twilio statuses that mean the message is definitively not going to arrive. */
const TWILIO_FAILED_STATUSES = new Set(['failed', 'undelivered', 'canceled']);

export function twilioAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const missing = missingEnv(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'], env);
    const hasSender = Boolean((env.TWILIO_FROM_NUMBER || '').trim() || (env.TWILIO_MESSAGING_SERVICE_SID || '').trim());
    if (!hasSender) missing.push('TWILIO_FROM_NUMBER');
    return missing.length > 0 ? providerUnavailable('twilio', missing) : providerAvailable('twilio');
}

class TwilioProvider implements SmsProvider {
    readonly provider = 'twilio';

    availability(): ProviderAvailability {
        return twilioAvailability();
    }

    async send(to: string, message: string): Promise<ProviderResult<ProviderDispatch>> {
        const state = this.availability();
        if (!state.available) {
            return { success: false, error: state.reason || 'Twilio is not configured.' };
        }

        const normalized = normalizeToE164Digits(to);
        if ('error' in normalized) return { success: false, error: normalized.error };

        const accountSid = (process.env.TWILIO_ACCOUNT_SID || '').trim();
        const authToken = (process.env.TWILIO_AUTH_TOKEN || '').trim();
        const messagingServiceSid = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
        const fromNumber = (process.env.TWILIO_FROM_NUMBER || '').trim();

        const form = new URLSearchParams({ To: `+${normalized.digits}`, Body: message });
        if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
        else form.set('From', fromNumber);

        try {
            const response = await providerFetch(
                `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: form.toString(),
                },
                resolveTimeoutMs(TWILIO_TIMEOUT_ENV),
            );

            if (!response.ok) {
                const detail = readString(response.json, 'message') || response.safeText;
                return {
                    success: false,
                    error: truncateError(`Twilio rejected the message (HTTP ${response.status}): ${detail}`),
                };
            }

            const sid = readString(response.json, 'sid');
            if (!sid) {
                return { success: false, error: 'Twilio accepted the request but returned no message SID.' };
            }

            // Twilio can return 201 with a terminal failure status attached.
            const status = (readString(response.json, 'status') || 'queued').toLowerCase();
            if (TWILIO_FAILED_STATUSES.has(status)) {
                const record = asRecord(response.json);
                const code = record && record.error_code != null ? String(record.error_code) : 'none';
                return {
                    success: false,
                    error: truncateError(`Twilio reported status=${status} (error_code ${code}).`),
                };
            }

            return {
                success: true,
                data: {
                    messageId: sid,
                    deliveryState: status === 'delivered' ? 'DELIVERED' : 'ACCEPTED',
                    providerStatus: `twilio_${status}`,
                },
            };
        } catch (error: unknown) {
            return {
                success: false,
                error: truncateError(error instanceof Error ? error.message : 'Twilio send failed.'),
            };
        }
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        return sendEach(this, messages);
    }
}

// ─── Factory ─────────────────────────────────────────────────

/** Reports whether SMS can leave this deployment, without constructing anything. */
export function smsAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability {
    const provider = notificationProviderForChannel('SMS', env);
    switch (provider) {
        case 'msg91':
            return msg91Availability(env);
        case 'twilio':
            return twilioAvailability(env);
        case 'mock':
            return mockRuntimeIsAllowed(env)
                ? providerAvailable('mock')
                : providerUnavailable('mock', [], 'Mock SMS delivery is disabled in this runtime.');
        case 'unconfigured':
            return providerUnavailable('unconfigured', ['SMS_PROVIDER'], 'No SMS_PROVIDER is set for this deployment.');
        default:
            return providerUnavailable(
                provider,
                ['SMS_PROVIDER'],
                `No adapter is installed for the "${provider}" SMS provider.`,
            );
    }
}

let _instance: SmsProvider | null = null;
let _instanceKey = '';

export function getSmsProvider(): SmsProvider {
    const provider = notificationProviderForChannel('SMS');
    if (_instance && _instanceKey === provider) return _instance;

    const state = smsAvailability();
    if (!state.available) {
        _instance = new UnavailableSmsProvider(state);
    } else if (provider === 'msg91') {
        _instance = new Msg91Provider();
    } else if (provider === 'twilio') {
        _instance = new TwilioProvider();
    } else if (provider === 'mock') {
        _instance = new MockSmsProvider();
    } else {
        _instance = new UnavailableSmsProvider(
            providerUnavailable(provider, ['SMS_PROVIDER'], `Unsupported SMS provider: ${provider}.`),
        );
    }

    _instanceKey = provider;
    return _instance;
}

/** Test hook: drops the cached adapter so a new environment takes effect. */
export function resetSmsProviderCache(): void {
    _instance = null;
    _instanceKey = '';
}

/**
 * SMS Provider — mock + MSG91 + Twilio implementations.
 * 
 * Set SMS_PROVIDER to 'msg91' or 'twilio'. The 'mock' provider is test/dev-only.
 * MSG91: Set MSG91_AUTH_KEY
 * Twilio: Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */

import type { ProviderResult } from './index';
import { providerFailureOutcomeForHttpStatus } from './outcome';
import { logger } from '@/lib/observability/logger';
import { mockRuntimeIsAllowed, notificationProviderForChannel } from '@/lib/integrations/runtime-mode';

// ─── Interface ───────────────────────────────────────────────

export interface SmsProvider {
    send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>>;
    sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>>;
}

// ─── Mock Implementation ─────────────────────────────────────

class MockSmsProvider implements SmsProvider {
    async send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>> {
        logger.info('notification.mock_sms_sent', 'Mock SMS accepted', {
            source: 'notifications',
            metadata: { recipientLength: to.length, messageLength: message.length },
        });
        return {
            success: true,
            data: { messageId: `mock_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
        };
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        logger.info('notification.mock_sms_bulk_sent', 'Mock SMS bulk accepted', {
            source: 'notifications',
            metadata: { count: messages.length },
        });
        for (const msg of messages) {
            await this.send(msg.to, msg.message);
        }
        return { success: true, data: { sent: messages.length, failed: 0 } };
    }
}

// ─── MSG91 Implementation ────────────────────────────────────

class Msg91Provider implements SmsProvider {
    private authKey: string;
    private baseUrl = 'https://control.msg91.com/api/v5';

    constructor() {
        this.authKey = process.env.MSG91_AUTH_KEY || '';
        if (!this.authKey) console.warn('[MSG91] Missing MSG91_AUTH_KEY');
    }

    async send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>> {
        try {
            const res = await fetch(`${this.baseUrl}/flow/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    authkey: this.authKey,
                },
                body: JSON.stringify({
                    sender: process.env.MSG91_SENDER_ID || 'SCHMND',
                    route: '4', // transactional
                    country: '91',
                    sms: [{ message, to: [to.replace(/^\+91/, '')] }],
                }),
            });

            if (!res.ok) {
                const err = await res.text();
                return {
                    success: false,
                    error: `MSG91 error: ${err}`,
                    outcome: providerFailureOutcomeForHttpStatus(res.status),
                };
            }

            const data = await res.json();
            if (typeof data.request_id !== 'string' || !data.request_id.trim()) {
                return {
                    success: false,
                    error: 'MSG91 accepted the request without a request_id.',
                    outcome: 'UNKNOWN',
                };
            }
            return { success: true, data: { messageId: data.request_id } };
        } catch (err: unknown) {
            return { success: false, error: (err as Error).message, outcome: 'UNKNOWN' };
        }
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        let sent = 0;
        let failed = 0;
        let unknown = false;
        for (const msg of messages) {
            const result = await this.send(msg.to, msg.message);
            if (result.success) sent += 1;
            else failed += 1;
            if (result.outcome === 'UNKNOWN') unknown = true;
        }
        return {
            success: failed === 0,
            data: { sent, failed },
            error: failed > 0 ? `${failed} SMS message(s) failed.` : undefined,
            ...(failed > 0 ? { outcome: unknown ? 'UNKNOWN' as const : 'REJECTED' as const } : {}),
        };
    }
}

// ─── Twilio Implementation ───────────────────────────────────

class TwilioProvider implements SmsProvider {
    private accountSid: string;
    private authToken: string;
    private fromNumber: string;
    private statusCallback: string;

    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
        this.fromNumber = process.env.TWILIO_FROM_NUMBER || '';
        this.statusCallback = process.env.NOTIFICATION_TWILIO_STATUS_CALLBACK_URL || '';
        if (!this.accountSid || !this.authToken || !this.fromNumber) {
            throw new Error('Twilio SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.');
        }
        try {
            if (new URL(this.statusCallback).protocol !== 'https:') throw new Error();
        } catch {
            throw new Error('Twilio SMS requires NOTIFICATION_TWILIO_STATUS_CALLBACK_URL as an HTTPS URL.');
        }
    }

    async send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>> {
        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
            const auth = 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

            const body = new URLSearchParams({
                To: to,
                From: this.fromNumber,
                Body: message,
                StatusCallback: this.statusCallback,
            });

            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: auth,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body.toString(),
            });

            if (!res.ok) {
                const err = await res.json();
                return {
                    success: false,
                    error: err.message || 'Twilio send failed',
                    outcome: providerFailureOutcomeForHttpStatus(res.status),
                };
            }

            const data = await res.json();
            if (typeof data.sid !== 'string' || !data.sid.trim()) {
                return {
                    success: false,
                    error: 'Twilio accepted the request without a message SID.',
                    outcome: 'UNKNOWN',
                };
            }
            return { success: true, data: { messageId: data.sid } };
        } catch (err: unknown) {
            return { success: false, error: (err as Error).message, outcome: 'UNKNOWN' };
        }
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        let sent = 0;
        let failed = 0;
        let unknown = false;
        for (const msg of messages) {
            const result = await this.send(msg.to, msg.message);
            if (result.success) sent += 1;
            else failed += 1;
            if (result.outcome === 'UNKNOWN') unknown = true;
        }
        return {
            success: failed === 0,
            data: { sent, failed },
            error: failed > 0 ? `${failed} SMS message(s) failed.` : undefined,
            ...(failed > 0 ? { outcome: unknown ? 'UNKNOWN' as const : 'REJECTED' as const } : {}),
        };
    }
}

// ─── Factory ─────────────────────────────────────────────────

let _instance: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
    if (!_instance) {
        const provider = notificationProviderForChannel('SMS');
        switch (provider) {
            case 'msg91':
                _instance = new Msg91Provider();
                break;
            case 'twilio':
                _instance = new TwilioProvider();
                break;
            case 'mock':
                if (!mockRuntimeIsAllowed()) {
                    throw new Error('Mock SMS delivery is disabled in this runtime.');
                }
                _instance = new MockSmsProvider();
                break;
            case 'unconfigured':
                throw new Error('SMS provider is not configured.');
            default:
                throw new Error(`Unsupported SMS provider: ${provider}.`);
        }
        console.info(`[SMS] Using ${provider} provider`);
    }
    return _instance;
}

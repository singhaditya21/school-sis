/**
 * SMS Provider — mock + MSG91 + Twilio implementations.
 * 
 * Set SMS_PROVIDER env var to 'mock' (default), 'msg91', or 'twilio'.
 * MSG91: Set MSG91_AUTH_KEY
 * Twilio: Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */

import type { ProviderResult } from './index';

// ─── Interface ───────────────────────────────────────────────

export interface SmsProvider {
    send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>>;
    sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>>;
}

// ─── Mock Implementation ─────────────────────────────────────

class MockSmsProvider implements SmsProvider {
    async send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>> {
        console.log(`[MockSMS] → ${to}: ${message.substring(0, 80)}...`);
        return {
            success: true,
            data: { messageId: `mock_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
        };
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        console.log(`[MockSMS] Bulk send → ${messages.length} messages`);
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
                return { success: false, error: `MSG91 error: ${err}` };
            }

            const data = await res.json();
            return { success: true, data: { messageId: data.request_id || `msg91_${Date.now()}` } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        let sent = 0;
        let failed = 0;
        for (const msg of messages) {
            const result = await this.send(msg.to, msg.message);
            result.success ? sent++ : failed++;
        }
        return { success: true, data: { sent, failed } };
    }
}

// ─── Twilio Implementation ───────────────────────────────────

class TwilioProvider implements SmsProvider {
    private accountSid: string;
    private authToken: string;
    private fromNumber: string;

    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
        this.fromNumber = process.env.TWILIO_FROM_NUMBER || '';
        if (!this.accountSid || !this.authToken) console.warn('[Twilio] Missing credentials');
    }

    async send(to: string, message: string): Promise<ProviderResult<{ messageId: string }>> {
        try {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
            const auth = 'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');

            const body = new URLSearchParams({
                To: to,
                From: this.fromNumber,
                Body: message,
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
                return { success: false, error: err.message || 'Twilio send failed' };
            }

            const data = await res.json();
            return { success: true, data: { messageId: data.sid } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    async sendBulk(messages: { to: string; message: string }[]): Promise<ProviderResult<{ sent: number; failed: number }>> {
        let sent = 0;
        let failed = 0;
        for (const msg of messages) {
            const result = await this.send(msg.to, msg.message);
            result.success ? sent++ : failed++;
        }
        return { success: true, data: { sent, failed } };
    }
}

// ─── Factory ─────────────────────────────────────────────────

let _instance: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
    if (!_instance) {
        const provider = process.env.SMS_PROVIDER || 'mock';
        switch (provider) {
            case 'msg91':
                _instance = new Msg91Provider();
                break;
            case 'twilio':
                _instance = new TwilioProvider();
                break;
            case 'mock':
            default:
                _instance = new MockSmsProvider();
                break;
        }
        console.log(`[SMS] Using ${provider} provider`);
    }
    return _instance;
}


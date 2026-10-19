/**
 * Email Service — Transactional emails via Resend.
 *
 * Handles fee reminders, admission alerts, password resets,
 * and general notifications.
 *
 * FREE TIER: 100 emails/day, 3,000/month (capped at 90/day)
 * Required env var: RESEND_API_KEY
 */

import { getLimit } from '@/lib/config/limits';

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
    from?: string;
}

interface EmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
}

// In-memory daily counter (resets per process restart or daily)
let _emailCount = 0;
let _emailCountDate = new Date().toDateString();

function checkDailyLimit(): boolean {
    const today = new Date().toDateString();
    if (_emailCountDate !== today) {
        _emailCount = 0;
        _emailCountDate = today;
    }
    return _emailCount < getLimit('EMAIL_DAILY_CAP');
}

function getResendKey(): string {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
        throw new Error(
            'RESEND_API_KEY environment variable is required. ' +
            'Get it from https://resend.com/api-keys'
        );
    }
    return key;
}

/**
 * Send a transactional email via Resend API.
 * Enforces daily cap from limits config.
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
    if (!checkDailyLimit()) {
        console.warn(`[Email] Daily cap reached (${getLimit('EMAIL_DAILY_CAP')}). Email to ${options.to} queued.`);
        return { success: false, error: `Daily email limit reached (${getLimit('EMAIL_DAILY_CAP')}/day). Try again tomorrow.` };
    }

    const apiKey = getResendKey();
    _emailCount++;
    const from = options.from || process.env.EMAIL_FROM || 'ScholarMind <noreply@scholarmind.in>';

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from,
                to: options.to,
                subject: options.subject,
                html: options.html,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('[Email] Send failed:', error);
            return { success: false, error: error.message || 'Failed to send email' };
        }

        const data = await response.json();
        return { success: true, messageId: data.id };
    } catch (error: unknown) {
        console.error('[Email] Error:', (error as Error).message);
        return { success: false, error: (error as Error).message };
    }
}

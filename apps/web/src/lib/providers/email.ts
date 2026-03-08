/**
 * Email Provider — mock + SMTP + Resend implementations.
 * 
 * Set EMAIL_PROVIDER env var to 'mock' (default), 'smtp', or 'resend'.
 * SMTP: Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * Resend: Set RESEND_API_KEY
 */

import type { ProviderResult } from './index';

// ─── Interface ───────────────────────────────────────────────

export interface EmailProvider {
    send(options: {
        to: string;
        subject: string;
        html: string;
        from?: string;
    }): Promise<ProviderResult<{ messageId: string }>>;
}

// ─── Mock Implementation ─────────────────────────────────────

class MockEmailProvider implements EmailProvider {
    async send(options: {
        to: string;
        subject: string;
        html: string;
        from?: string;
    }): Promise<ProviderResult<{ messageId: string }>> {
        const from = options.from || process.env.EMAIL_FROM || 'noreply@schoolsis.local';
        console.log(`[MockEmail] ${from} → ${options.to}: "${options.subject}"`);
        return {
            success: true,
            data: { messageId: `mock_email_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
        };
    }
}

// ─── SMTP Implementation (Nodemailer-compatible) ─────────────

class SmtpProvider implements EmailProvider {
    private host: string;
    private port: number;
    private user: string;
    private pass: string;

    constructor() {
        this.host = process.env.SMTP_HOST || 'localhost';
        this.port = parseInt(process.env.SMTP_PORT || '587');
        this.user = process.env.SMTP_USER || '';
        this.pass = process.env.SMTP_PASS || '';
        if (!this.user) console.warn('[SMTP] Missing SMTP_USER');
    }

    async send(options: {
        to: string;
        subject: string;
        html: string;
        from?: string;
    }): Promise<ProviderResult<{ messageId: string }>> {
        try {
            // Dynamic import nodemailer (avoids bundling in client)
            const nodemailer = await import('nodemailer');
            const transporter = nodemailer.createTransport({
                host: this.host,
                port: this.port,
                secure: this.port === 465,
                auth: this.user ? { user: this.user, pass: this.pass } : undefined,
            });

            const from = options.from || process.env.EMAIL_FROM || `ScholarMind <${this.user}>`;
            const info = await transporter.sendMail({
                from,
                to: options.to,
                subject: options.subject,
                html: options.html,
            });

            return { success: true, data: { messageId: info.messageId } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
}

// ─── Resend Implementation ───────────────────────────────────

class ResendProvider implements EmailProvider {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.RESEND_API_KEY || '';
        if (!this.apiKey) console.warn('[Resend] Missing RESEND_API_KEY');
    }

    async send(options: {
        to: string;
        subject: string;
        html: string;
        from?: string;
    }): Promise<ProviderResult<{ messageId: string }>> {
        try {
            const from = options.from || process.env.EMAIL_FROM || 'ScholarMind <noreply@scholarmind.app>';
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    from,
                    to: [options.to],
                    subject: options.subject,
                    html: options.html,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                return { success: false, error: err.message || 'Resend API error' };
            }

            const data = await res.json();
            return { success: true, data: { messageId: data.id } };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }
}

// ─── Factory ─────────────────────────────────────────────────

let _instance: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
    if (!_instance) {
        const provider = process.env.EMAIL_PROVIDER || 'mock';
        switch (provider) {
            case 'smtp':
                _instance = new SmtpProvider();
                break;
            case 'resend':
                _instance = new ResendProvider();
                break;
            case 'mock':
            default:
                _instance = new MockEmailProvider();
                break;
        }
        console.log(`[Email] Using ${provider} provider`);
    }
    return _instance;
}


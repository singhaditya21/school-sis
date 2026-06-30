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
    } catch (error: any) {
        console.error('[Email] Error:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send a password reset email with a tokenized link.
 */
export async function sendPasswordResetEmail(
    email: string,
    resetToken: string,
    schoolName: string,
): Promise<EmailResult> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${resetToken}`;

    return sendEmail({
        to: email,
        subject: `Password Reset — ${schoolName}`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #1e293b; margin-bottom: 16px;">Reset Your Password</h2>
                <p style="color: #475569; line-height: 1.6;">
                    You requested a password reset for your <strong>${schoolName}</strong> account.
                    Click the button below to set a new password.
                </p>
                <div style="margin: 32px 0;">
                    <a href="${resetUrl}" style="
                        display: inline-block; background: #0f172a; color: #fff;
                        padding: 14px 28px; border-radius: 8px; text-decoration: none;
                        font-weight: 600; font-size: 14px;
                    ">Reset Password</a>
                </div>
                <p style="color: #94a3b8; font-size: 13px; line-height: 1.5;">
                    This link expires in 1 hour. If you didn't request this, ignore this email.
                    <br/>Your password will remain unchanged.
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
                <p style="color: #cbd5e1; font-size: 12px;">
                    Sent by ScholarMind • ${schoolName}
                </p>
            </div>
        `,
    });
}

/**
 * Send a fee reminder email.
 */
export async function sendFeeReminderEmail(
    email: string,
    studentName: string,
    invoiceNumber: string,
    amount: number,
    dueDate: string,
    schoolName: string,
): Promise<EmailResult> {
    return sendEmail({
        to: email,
        subject: `Fee Reminder: ₹${amount.toLocaleString('en-IN')} due for ${studentName}`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #1e293b; margin-bottom: 16px;">Fee Payment Reminder</h2>
                <p style="color: #475569; line-height: 1.6;">
                    This is a reminder that fees are due for <strong>${studentName}</strong>.
                </p>
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 8px 0; color: #64748b;">Invoice</td><td style="text-align: right; font-weight: 600; color: #1e293b;">#${invoiceNumber}</td></tr>
                        <tr><td style="padding: 8px 0; color: #64748b;">Amount</td><td style="text-align: right; font-weight: 600; color: #dc2626;">₹${amount.toLocaleString('en-IN')}</td></tr>
                        <tr><td style="padding: 8px 0; color: #64748b;">Due Date</td><td style="text-align: right; font-weight: 600; color: #1e293b;">${dueDate}</td></tr>
                    </table>
                </div>
                <p style="color: #475569; line-height: 1.6;">
                    Please log in to your parent portal to make the payment or contact the school office.
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
                <p style="color: #cbd5e1; font-size: 12px;">Sent by ScholarMind • ${schoolName}</p>
            </div>
        `,
    });
}

/**
 * Send an admission notification email.
 */
export async function sendAdmissionNotification(
    email: string,
    studentName: string,
    status: 'APPROVED' | 'WAITLISTED' | 'REJECTED',
    schoolName: string,
): Promise<EmailResult> {
    const statusMessages = {
        APPROVED: { color: '#16a34a', text: 'Approved', message: 'We are pleased to inform you that the admission application has been approved.' },
        WAITLISTED: { color: '#d97706', text: 'Waitlisted', message: 'The application has been placed on the waitlist. We will notify you when a seat becomes available.' },
        REJECTED: { color: '#dc2626', text: 'Not Approved', message: 'We regret to inform you that the admission application was not approved at this time.' },
    };

    const s = statusMessages[status];

    return sendEmail({
        to: email,
        subject: `Admission ${s.text}: ${studentName} — ${schoolName}`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <h2 style="color: #1e293b; margin-bottom: 16px;">Admission Update</h2>
                <div style="background: ${s.color}10; border-left: 4px solid ${s.color}; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0;">
                    <p style="color: ${s.color}; font-weight: 600; margin: 0;">Status: ${s.text}</p>
                </div>
                <p style="color: #475569; line-height: 1.6;">${s.message}</p>
                <p style="color: #475569; line-height: 1.6;">
                    For questions, please contact the admission office at <strong>${schoolName}</strong>.
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
                <p style="color: #cbd5e1; font-size: 12px;">Sent by ScholarMind • ${schoolName}</p>
            </div>
        `,
    });
}

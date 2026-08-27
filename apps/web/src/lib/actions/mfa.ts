'use server';

import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/auth/session';
import {
    activateMFA,
    generateMFAEnrollment,
    isMFARequired,
} from '@/lib/auth/mfa';

/**
 * Server actions for time-based one-time password enrolment.
 *
 * TOTP is the whole point: enrolment needs no SMS gateway and no mail provider.
 * The server shows a QR code, an authenticator app on the administrator's phone
 * derives the codes, and ten single-use backup codes cover a lost device. The
 * `mfa.ts` library beneath this has implemented all of it since before today —
 * nothing had ever called it, so the capability existed and was unreachable.
 *
 * Results are flat `{ success, error? }` objects rather than a discriminated
 * union: Next.js erases union narrowing across the `'use server'` boundary, so a
 * caller cannot narrow on a tag and would read `error` off a success value.
 */

export type BeginMfaEnrollmentResult = {
    success: boolean;
    error?: string;
    /** data: URI for the QR code to scan. Shown once. */
    qrCodeDataUrl?: string;
    /** The raw secret, for manual entry when a camera is unavailable. Shown once. */
    secret?: string;
    /** Single-use recovery codes. Shown once, stored only as bcrypt hashes. */
    backupCodes?: string[];
};

export type CompleteMfaEnrollmentResult = {
    success: boolean;
    error?: string;
};

async function currentSession() {
    return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/**
 * Start enrolment for the signed-in administrator.
 *
 * Deliberately callable while `mfaVerified` is false — that is the entire state
 * this flow exists to resolve. The middleware allows the enrolment route for a
 * session in exactly that position; every other route stays gated.
 */
export async function beginMfaEnrollment(): Promise<BeginMfaEnrollmentResult> {
    const session = await currentSession();

    if (!session.isLoggedIn || !session.userId || !session.tenantId) {
        return { success: false, error: 'Sign in before setting up two-factor authentication.' };
    }
    if (session.mfaVerified) {
        return { success: false, error: 'Two-factor authentication is already active on this account.' };
    }

    try {
        const enrollment = await generateMFAEnrollment(
            session.userId,
            session.tenantId,
            session.email,
        );
        return {
            success: true,
            qrCodeDataUrl: enrollment.qrCodeDataUrl,
            secret: enrollment.secret,
            backupCodes: enrollment.backupCodes,
        };
    } catch (error) {
        console.error('[MFA_ENROLLMENT_BEGIN]', error);
        return { success: false, error: 'Could not start two-factor setup. Please try again.' };
    }
}

/**
 * Verify the administrator's first code and activate MFA.
 *
 * On success the session is marked verified, which is what releases the
 * middleware gate — without it a freshly-created administrator is redirected to
 * /login?mfa=required forever, which is precisely how onboarding used to dead-end.
 */
export async function completeMfaEnrollment(
    formData: FormData,
): Promise<CompleteMfaEnrollmentResult> {
    const session = await currentSession();

    if (!session.isLoggedIn || !session.userId || !session.tenantId) {
        return { success: false, error: 'Sign in before setting up two-factor authentication.' };
    }

    // Authenticator apps display six digits; tolerate spaces from a paste.
    const code = String(formData.get('code') || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
        return { success: false, error: 'Enter the 6-digit code from your authenticator app.' };
    }

    try {
        const activated = await activateMFA(session.userId, session.tenantId, code);
        if (!activated.success) {
            // Prefer the library's own message — it distinguishes "enrolment never
            // started" and "already active" from a simply wrong code.
            return {
                success: false,
                error:
                    activated.error ??
                    'That code did not match. Codes change every 30 seconds — try the current one.',
            };
        }

        session.mfaVerified = true;
        session.mfaRequired = isMFARequired(session.role);
        await session.save();

        return { success: true };
    } catch (error) {
        console.error('[MFA_ENROLLMENT_COMPLETE]', error);
        return { success: false, error: 'Could not complete two-factor setup. Please try again.' };
    }
}

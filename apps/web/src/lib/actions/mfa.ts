'use server';

import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/auth/session';
import { isSessionDataExpired } from '@/lib/auth/session-options';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { runWithTenantContext } from '@/lib/db';
import { logger } from '@/lib/observability/logger';
import {
    activateMFA,
    generateMFAEnrollment,
    isMFARequired,
    redeemBackupCode,
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
 * this flow exists to resolve. The proxy allows the enrolment route for a
 * session in exactly that position; every other route stays gated.
 */
export async function beginMfaEnrollment(): Promise<BeginMfaEnrollmentResult> {
    const session = await currentSession();

    if (!session.isLoggedIn || !session.userId || !session.tenantId || isSessionDataExpired(session)) {
        return { success: false, error: 'Sign in before setting up two-factor authentication.' };
    }
    if (session.mfaVerified) {
        return { success: false, error: 'Two-factor authentication is already active on this account.' };
    }

    const rateLimitError = await consumeRateLimit(session.userId, {
        scope: 'mfa_enroll_begin',
        maxAttempts: 5,
        degradedMaxAttempts: 2,
        endpointClass: 'login',
        message: 'Too many MFA enrollment requests. Please wait a few minutes and try again.',
    });
    if (rateLimitError) {
        return { success: false, error: rateLimitError };
    }

    try {
        const enrollment = await runWithTenantContext(session.tenantId, () =>
            generateMFAEnrollment(session.userId, session.tenantId, session.email),
        );
        return {
            success: true,
            qrCodeDataUrl: enrollment.qrCodeDataUrl,
            secret: enrollment.secret,
            backupCodes: enrollment.backupCodes,
        };
    } catch (error) {
        logger.error('mfa.enrollment_begin_failed', 'Failed to begin MFA enrollment', {
            source: 'mfa-action',
            actorUserId: session.userId,
            tenantId: session.tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        const message =
            error instanceof Error && error.message.includes('already active')
                ? error.message
                : 'Could not start two-factor setup. Please try again.';
        return { success: false, error: message };
    }
}

/**
 * Verify the administrator's first code and activate MFA.
 *
 * On success the session is marked verified, which is what releases the
 * proxy gate — without it a freshly-created administrator is redirected to
 * /login?mfa=required forever, which is precisely how onboarding used to dead-end.
 */
export async function completeMfaEnrollment(
    formData: FormData,
): Promise<CompleteMfaEnrollmentResult> {
    const session = await currentSession();

    if (!session.isLoggedIn || !session.userId || !session.tenantId || isSessionDataExpired(session)) {
        return { success: false, error: 'Sign in before setting up two-factor authentication.' };
    }

    // Authenticator apps display six digits; tolerate spaces from a paste.
    const code = String(formData.get('code') || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
        return { success: false, error: 'Enter the 6-digit code from your authenticator app.' };
    }

    const rateLimitError = await consumeRateLimit(session.userId, {
        scope: 'mfa_enroll_verify',
        maxAttempts: 8,
        degradedMaxAttempts: 3,
        endpointClass: 'login',
        message: 'Too many verification attempts. Please wait 15 minutes and try again.',
    });
    if (rateLimitError) {
        return { success: false, error: rateLimitError };
    }

    try {
        const activated = await runWithTenantContext(session.tenantId, () =>
            activateMFA(session.userId, session.tenantId, code),
        );
        if (!activated.success) {
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
        logger.error('mfa.enrollment_complete_failed', 'Failed to complete MFA enrollment', {
            source: 'mfa-action',
            actorUserId: session.userId,
            tenantId: session.tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return { success: false, error: 'Could not complete two-factor setup. Please try again.' };
    }
}

export async function verifyMfaBackupCodeAction(
    rawCode: string,
): Promise<{ success: boolean; codesRemaining?: number; error?: string }> {
    const session = await currentSession();
    if (!session.isLoggedIn || !session.userId || !session.tenantId || isSessionDataExpired(session)) {
        return { success: false, error: 'Sign in before verifying a backup code.' };
    }

    const rateLimitError = await consumeRateLimit(session.userId, {
        scope: 'mfa_backup_redeem',
        maxAttempts: 5,
        degradedMaxAttempts: 1,
        endpointClass: 'login',
        message: 'Too many backup code attempts. Please try again later.',
    });
    if (rateLimitError) {
        return { success: false, error: rateLimitError };
    }

    const normalized = String(rawCode || '').trim().replace(/[\s-]+/g, '').toUpperCase();
    if (!/^[0-9A-F]{10}$/.test(normalized)) {
        return { success: false, error: 'Enter a valid 10-character backup code.' };
    }

    const result = await runWithTenantContext(session.tenantId, () =>
        redeemBackupCode(session.userId, session.tenantId, normalized),
    );
    if (result.success) {
        session.mfaVerified = true;
        session.mfaRequired = isMFARequired(session.role);
        await session.save();
    }
    return result;
}

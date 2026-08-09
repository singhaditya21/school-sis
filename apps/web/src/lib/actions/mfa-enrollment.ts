'use server';

import { z } from 'zod';
import { getSession } from '@/lib/auth/session';
import { activateMFA, generateMFAEnrollment } from '@/lib/auth/mfa';
import { consumeRateLimit } from '@/lib/auth/rate-limit';

const totpSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator app.');

type EnrollmentError = { success: false; error: string };
type EnrollmentStarted = {
    success: true;
    secret: string;
    qrCodeDataUrl: string;
    backupCodes: string[];
};
type EnrollmentCompleted = { success: true; redirectTo: string };

async function getPendingEnrollmentSession() {
    const session = await getSession();
    if (!session.isLoggedIn || !session.userId || !session.tenantId) {
        return { error: 'Your sign-in session has expired. Sign in again to continue.' } as const;
    }
    if (!session.mfaRequired || session.mfaVerified) {
        return { error: 'MFA enrollment is not pending for this account.' } as const;
    }
    return { session } as const;
}

export async function startMfaEnrollment(): Promise<EnrollmentStarted | EnrollmentError> {
    const auth = await getPendingEnrollmentSession();
    if ('error' in auth) return { success: false, error: auth.error };

    const { session } = auth;
    const rateLimitError = await consumeRateLimit(session.userId, {
        scope: 'mfa-enrollment-start',
        maxAttempts: 5,
        endpointClass: 'authenticated-internal',
        message: 'Too many enrollment attempts. Please wait before trying again.',
    });
    if (rateLimitError) return { success: false, error: rateLimitError };

    try {
        const enrollment = await generateMFAEnrollment(
            session.userId,
            session.tenantId,
            session.email,
        );
        return { success: true, ...enrollment };
    } catch (error) {
        console.error('[MFA enrollment] Failed to start:', error);
        return {
            success: false,
            error: 'MFA setup could not be started. Please try again or contact support.',
        };
    }
}

export async function completeMfaEnrollment(rawCode: string): Promise<EnrollmentCompleted | EnrollmentError> {
    const validation = totpSchema.safeParse(rawCode);
    if (!validation.success) {
        return { success: false, error: validation.error.errors[0].message };
    }

    const auth = await getPendingEnrollmentSession();
    if ('error' in auth) return { success: false, error: auth.error };

    const { session } = auth;
    const rateLimitError = await consumeRateLimit(session.userId, {
        scope: 'mfa-enrollment-verify',
        maxAttempts: 10,
        endpointClass: 'authenticated-internal',
        message: 'Too many verification attempts. Please wait before trying again.',
    });
    if (rateLimitError) return { success: false, error: rateLimitError };

    try {
        const activation = await activateMFA(session.userId, session.tenantId, validation.data);
        if (!activation.success) {
            return { success: false, error: activation.error || 'The verification code was not accepted.' };
        }

        session.mfaRequired = true;
        session.mfaVerified = true;
        try {
            await session.save();
            return { success: true, redirectTo: session.role === 'PLATFORM_ADMIN' ? '/hq' : '/dashboard' };
        } catch (error) {
            // Database activation already committed. Require a fresh login if the
            // signed session cannot be renewed instead of claiming a rollback.
            console.error('[MFA enrollment] Activated, but session renewal failed:', error);
            return { success: true, redirectTo: '/login?mfa=enabled' };
        }
    } catch (error) {
        console.error('[MFA enrollment] Failed to complete:', error);
        return {
            success: false,
            error: 'MFA could not be activated. Please try again or contact support.',
        };
    }
}

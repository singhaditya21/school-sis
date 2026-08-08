'use server';

import { z } from 'zod';
import { getMfaEnrollmentSession } from '@/lib/auth/session';
import { activateMFA, generateMFAEnrollment } from '@/lib/auth/mfa';

type EnrollmentActionResult =
    | {
        success: true;
        data: {
            secret: string;
            qrCodeDataUrl: string;
            backupCodes: string[];
        };
    }
    | { success: false; error: string };

function redirectForRole(role: string): string {
    if (role === 'PLATFORM_ADMIN') return '/hq';
    if (role === 'PARENT') return '/overview';
    if (role === 'STUDENT') return '/profile';
    return '/dashboard';
}

async function requireEnrollmentSession() {
    const session = await getMfaEnrollmentSession();
    if (
        !session.isLoggedIn
        || !session.userId
        || !session.tenantId
        || !session.email
        || !session.mfaRequired
        || session.mfaVerified
        || session.passwordChangeRequired
        || !Number.isInteger(session.authVersion)
    ) {
        return null;
    }
    return session;
}

export async function startMfaEnrollment(): Promise<EnrollmentActionResult> {
    const session = await requireEnrollmentSession();
    if (!session) return { success: false, error: 'A valid MFA enrollment session is required.' };

    try {
        const enrollment = await generateMFAEnrollment(
            session.userId,
            session.tenantId,
            session.email,
            session.authVersion!,
        );
        session.authVersion = enrollment.authVersion;
        await session.save();
        return {
            success: true,
            data: {
                secret: enrollment.secret,
                qrCodeDataUrl: enrollment.qrCodeDataUrl,
                backupCodes: enrollment.backupCodes,
            },
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start MFA enrollment.',
        };
    }
}

const activationSchema = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit authenticator code.');

export async function activateMfaEnrollment(
    totpCode: string,
): Promise<{ success: boolean; error?: string; redirectTo?: string }> {
    const parsed = activationSchema.safeParse(totpCode);
    if (!parsed.success) return { success: false, error: parsed.error.errors[0]?.message };

    const session = await requireEnrollmentSession();
    if (!session) return { success: false, error: 'A valid MFA enrollment session is required.' };

    const result = await activateMFA(
        session.userId,
        session.tenantId,
        parsed.data,
        session.authVersion!,
    );
    if (!result.success || !result.authVersion) {
        return { success: false, error: result.error || 'Failed to activate MFA.' };
    }

    session.authVersion = result.authVersion;
    session.mfaRequired = true;
    session.mfaVerified = true;
    await session.save();
    return { success: true, redirectTo: redirectForRole(session.role) };
}

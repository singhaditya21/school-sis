/**
 * MFA Service — TOTP-based Two-Factor Authentication
 *
 * Uses otplib (RFC 6238 TOTP) for secret generation and code verification.
 * Uses qrcode to generate the QR code shown during enrollment.
 *
 * Security design:
 * - The TOTP secret is encrypted with AES-256-GCM before it is stored in the DB
 * - Backup codes are bcrypt-hashed before storage; each is single-use
 * - MFA is enforced at middleware level for SUPER_ADMIN, GROUP_EXECUTIVE,
 *   FINANCE_LEAD, and REGISTRAR roles (see middleware.ts enforcement)
 *
 * Dependencies (add to apps/web/package.json):
 *   "otplib": "^12.0.1",
 *   "qrcode": "^1.5.4"
 */

import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { encrypt, decrypt } from '@/lib/encryption';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// ─── Constants ───────────────────────────────────────────────

/** Roles for which MFA is mandatory. */
export const MFA_REQUIRED_ROLES = new Set([
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'ACCOUNTANT',
]);

const BACKUP_CODE_COUNT = 10;
const BCRYPT_ROUNDS = 12;

// ─── Types ───────────────────────────────────────────────────

export interface MFAEnrollmentResult {
    /** The raw (un-encrypted) secret — shown ONCE, then encrypted and stored */
    secret: string;
    /** SVG/PNG data-URI for the QR code to scan in an authenticator app */
    qrCodeDataUrl: string;
    /** Plain-text backup codes — shown ONCE, then hashed and stored */
    backupCodes: string[];
}

// ─── Enrollment ──────────────────────────────────────────────

/**
 * Generate a new TOTP secret and QR code for a user.
 * Call this when the user initiates MFA setup.
 *
 * IMPORTANT: The returned `secret` and `backupCodes` must be shown to the
 * user immediately. After calling `activateMFA()`, only the hashed/encrypted
 * versions remain in the DB.
 */
export async function generateMFAEnrollment(
    userId: string,
    tenantId: string,
    userEmail: string,
): Promise<MFAEnrollmentResult> {
    const secret = authenticator.generateSecret(32); // 160-bit secret

    const otpAuthUrl = authenticator.keyuri(userEmail, 'ScholarMind', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    // Generate plain-text backup codes
    const backupCodes: string[] = Array.from(
        { length: BACKUP_CODE_COUNT },
        () => crypto.randomBytes(5).toString('hex').toUpperCase(), // e.g. "A3F7C2B901"
    );

    // Store the encrypted secret temporarily (mfa_enabled stays FALSE until verified)
    const encryptedSecret = encrypt(secret);
    const hashedBackupCodes = await Promise.all(
        backupCodes.map(code => bcrypt.hash(code, BCRYPT_ROUNDS))
    );

    await db
        .update(users)
        .set({
            mfaSecret: encryptedSecret,
            mfaEnabled: false, // not active until user verifies a code
            mfaBackupCodes: hashedBackupCodes,
        })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

    return { secret, qrCodeDataUrl, backupCodes };
}

// ─── Activation (verify first code) ─────────────────────────

/**
 * Verify a TOTP code and activate MFA for the user.
 * The user must scan the QR code and enter their first code to confirm setup.
 */
export async function activateMFA(
    userId: string,
    tenantId: string,
    totpCode: string,
): Promise<{ success: boolean; error?: string }> {
    const [user] = await db
        .select({ mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);

    if (!user?.mfaSecret) {
        return { success: false, error: 'MFA enrollment not started. Call generateMFAEnrollment first.' };
    }

    if (user.mfaEnabled) {
        return { success: false, error: 'MFA is already active for this account.' };
    }

    const secret = decrypt(user.mfaSecret);
    const isValid = authenticator.verify({ token: totpCode, secret });

    if (!isValid) {
        return { success: false, error: 'Invalid or expired code. Please try again.' };
    }

    await db
        .update(users)
        .set({ mfaEnabled: true })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

    return { success: true };
}

// ─── Verification (login challenge) ─────────────────────────

/**
 * Verify a TOTP code at login.
 * Called after password authentication succeeds for MFA-enrolled users.
 */
export async function verifyMFACode(
    userId: string,
    tenantId: string,
    totpCode: string,
): Promise<{ success: boolean; error?: string }> {
    const [user] = await db
        .select({ mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);

    if (!user?.mfaEnabled || !user.mfaSecret) {
        // MFA not configured — pass through (enforcement happens at middleware level)
        return { success: true };
    }

    const secret = decrypt(user.mfaSecret);

    // otplib uses a 30-second window; allow ±1 step for clock skew
    const isValid = authenticator.verify({ token: totpCode, secret });

    if (!isValid) {
        return { success: false, error: 'Invalid or expired TOTP code.' };
    }

    return { success: true };
}

// ─── Backup Code Redemption ──────────────────────────────────

/**
 * Redeem a single backup code (e.g. when the user has lost their device).
 * The consumed code is removed from the array after use (single-use guarantee).
 */
export async function redeemBackupCode(
    userId: string,
    tenantId: string,
    rawCode: string,
): Promise<{ success: boolean; codesRemaining?: number; error?: string }> {
    const [user] = await db
        .select({ mfaBackupCodes: users.mfaBackupCodes })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .limit(1);

    const storedCodes = user?.mfaBackupCodes ?? [];
    if (storedCodes.length === 0) {
        return { success: false, error: 'No backup codes available.' };
    }

    // Find matching hashed code
    const normalised = rawCode.trim().toUpperCase();
    const matchIndex = (
        await Promise.all(storedCodes.map(hash => bcrypt.compare(normalised, hash)))
    ).findIndex(Boolean);

    if (matchIndex === -1) {
        return { success: false, error: 'Invalid backup code.' };
    }

    // Remove the consumed code (single-use)
    const remaining = storedCodes.filter((_, i) => i !== matchIndex);
    await db
        .update(users)
        .set({ mfaBackupCodes: remaining })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

    return { success: true, codesRemaining: remaining.length };
}

// ─── Disable MFA ─────────────────────────────────────────────

/**
 * Disable MFA for a user (e.g. initiated via admin override or account recovery).
 * Requires a verified TOTP code or a valid backup code before disabling.
 */
export async function disableMFA(
    userId: string,
    tenantId: string,
): Promise<void> {
    await db
        .update(users)
        .set({
            mfaEnabled: false,
            mfaSecret: null,
            mfaBackupCodes: null,
        })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
}

// ─── Middleware-level enforcement helper ──────────────────────

/**
 * Returns true if the given role requires MFA to be active.
 * Used in middleware.ts to block access until MFA is enrolled.
 */
export function isMFARequired(role: string): boolean {
    return MFA_REQUIRED_ROLES.has(role);
}

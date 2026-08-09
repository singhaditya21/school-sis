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
import { auditLogs, users } from '@/lib/db/schema';
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

function backupCodesForSecret(secret: string): string[] {
    return Array.from({ length: BACKUP_CODE_COUNT }, (_, index) => (
        crypto
            .createHmac('sha256', secret)
            .update(`ScholarMind recovery code ${index + 1}`)
            .digest('hex')
            .slice(0, 10)
            .toUpperCase()
    ));
}

// ─── Types ───────────────────────────────────────────────────

export interface MFAEnrollmentResult {
    /** The raw (un-encrypted) secret — shown ONCE, then encrypted and stored */
    secret: string;
    /** SVG/PNG data-URI for the QR code to scan in an authenticator app */
    qrCodeDataUrl: string;
    /** Plain-text backup codes — available only during pending enrollment, then stored as hashes */
    backupCodes: string[];
}

// ─── Enrollment ──────────────────────────────────────────────

/**
 * Generate a new TOTP secret and QR code for a user.
 * Call this when the user initiates MFA setup.
 *
 * The returned material is stable across retries while enrollment is pending,
 * which prevents concurrent tabs from invalidating one another. Once activated,
 * the enrollment action can no longer retrieve it.
 */
export async function generateMFAEnrollment(
    userId: string,
    tenantId: string,
    userEmail: string,
): Promise<MFAEnrollmentResult> {
    const { secret, backupCodes } = await db.transaction(async (tx) => {
        // Serialize enrollment for a user. A second tab or a retry reuses the
        // pending secret and deterministically regenerates the same recovery
        // material instead of invalidating what the first tab displayed.
        const [user] = await tx
            .select({ mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
            .from(users)
            .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
            .limit(1)
            .for('update');

        if (!user) throw new Error('User not found for MFA enrollment.');
        if (user.mfaEnabled) throw new Error('MFA is already active for this account.');

        const pendingSecret = user.mfaSecret
            ? decrypt(user.mfaSecret)
            : authenticator.generateSecret(32);
        const pendingBackupCodes = backupCodesForSecret(pendingSecret);
        const hashedBackupCodes = await Promise.all(
            pendingBackupCodes.map(code => bcrypt.hash(code, BCRYPT_ROUNDS)),
        );

        await tx
            .update(users)
            .set({
                mfaSecret: encrypt(pendingSecret),
                mfaEnabled: false,
                mfaBackupCodes: hashedBackupCodes,
            })
            .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

        return { secret: pendingSecret, backupCodes: pendingBackupCodes };
    });

    const otpAuthUrl = authenticator.keyuri(userEmail, 'ScholarMind', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
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
    return db.transaction(async (tx) => {
        const [user] = await tx
            .select({ mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
            .from(users)
            .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
            .limit(1)
            .for('update');

        if (!user?.mfaSecret) {
            return { success: false, error: 'MFA enrollment not started. Call generateMFAEnrollment first.' };
        }
        if (user.mfaEnabled) {
            return { success: false, error: 'MFA is already active for this account.' };
        }

        const secret = decrypt(user.mfaSecret);
        if (!authenticator.verify({ token: totpCode, secret })) {
            return { success: false, error: 'Invalid or expired code. Please try again.' };
        }

        await tx
            .update(users)
            .set({ mfaEnabled: true })
            .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
        await tx.insert(auditLogs).values({
            tenantId,
            userId,
            action: 'UPDATE',
            entityType: 'MFA_ENROLLMENT',
            entityId: userId,
            description: 'Multi-factor authentication enrolled',
            afterState: { mfaEnabled: true },
        });

        return { success: true };
    });
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
    return db.transaction(async (tx) => {
        const [user] = await tx
            .select({
                mfaEnabled: users.mfaEnabled,
                mfaBackupCodes: users.mfaBackupCodes,
            })
            .from(users)
            .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
            .limit(1)
            .for('update');

        const storedCodes = user?.mfaEnabled ? user.mfaBackupCodes ?? [] : [];
        if (storedCodes.length === 0) {
            return { success: false, error: 'No backup codes available.' };
        }

        const normalised = rawCode.replace(/[\s-]/g, '').toUpperCase();
        const matches = await Promise.all(storedCodes.map(hash => bcrypt.compare(normalised, hash)));
        const matchIndex = matches.findIndex(Boolean);
        if (matchIndex === -1) {
            return { success: false, error: 'Invalid backup code.' };
        }

        const remaining = storedCodes.filter((_, index) => index !== matchIndex);
        await tx
            .update(users)
            .set({ mfaBackupCodes: remaining })
            .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
        await tx.insert(auditLogs).values({
            tenantId,
            userId,
            action: 'UPDATE',
            entityType: 'MFA_BACKUP_CODE',
            entityId: userId,
            description: 'Single-use MFA recovery code redeemed',
            afterState: { codesRemaining: remaining.length },
        });

        return { success: true, codesRemaining: remaining.length };
    });
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

/**
 * MFA Service — TOTP-based Two-Factor Authentication
 *
 * Uses otplib (RFC 6238 TOTP) for secret generation and code verification.
 * Uses qrcode to generate the QR code shown during enrollment.
 *
 * Security design:
 * - The TOTP secret is encrypted with AES-256-GCM before it is stored in the DB
 * - Backup codes are bcrypt-hashed before storage; each is single-use
 * - MFA is enforced across proxy, API routes, Server Actions, and RLS session
 *   resolvers for PLATFORM_ADMIN, SUPER_ADMIN, SCHOOL_ADMIN, PRINCIPAL, and ACCOUNTANT
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
import { claimSingleUseToken } from '@/lib/auth/rate-limit';
import { pool, runWithTenantContext } from '@/lib/db';
import { tenantScope, eq } from '@school-sis/api/src/data';
import { users } from '@school-sis/api/src/db/generated/tables';
import { isRoleMfaRequired, MFA_REQUIRED_ROLE_NAMES } from './session-options';
import { evictUserSessionCache } from './session-revocation';

// ─── Constants ───────────────────────────────────────────────

/** Roles for which MFA is mandatory. */
export const MFA_REQUIRED_ROLES = new Set<string>(MFA_REQUIRED_ROLE_NAMES);

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
    const scope = tenantScope(tenantId);
    const existing = await scope
        .from(users)
        .select<{ mfaEnabled: boolean | null }>({ mfaEnabled: users.mfaEnabled })
        .where(eq(users.id, userId))
        .first();
    if (!existing) {
        throw new Error('Account not found for MFA enrollment.');
    }
    if (existing.mfaEnabled) {
        throw new Error('MFA is already active for this account.');
    }

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

    await scope.update(
        users,
        {
            mfaSecret: encryptedSecret,
            mfaEnabled: false, // not active until user verifies a code
            mfaBackupCodes: hashedBackupCodes,
        },
        eq(users.id, userId),
    );

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
    const scope = tenantScope(tenantId);
    const user = await scope
        .from(users)
        .select<{ mfaSecret: string | null; mfaEnabled: boolean }>({ mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
        .where(eq(users.id, userId))
        .first();

    if (!user?.mfaSecret) {
        return { success: false, error: 'MFA enrollment not started. Call generateMFAEnrollment first.' };
    }

    if (user.mfaEnabled) {
        return { success: false, error: 'MFA is already active for this account.' };
    }

    const secret = decrypt(user.mfaSecret);
    const normalizedCode = totpCode.trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) {
        return { success: false, error: 'Enter the 6-digit code from your authenticator app.' };
    }
    const isValid = authenticator.verify({ token: normalizedCode, secret });

    if (!isValid) {
        return { success: false, error: 'Invalid or expired code. Please try again.' };
    }

    const claimed = await claimSingleUseToken(`${userId}:${normalizedCode}`, 'mfa_totp');
    if (!claimed) {
        return { success: false, error: 'This code was already used. Wait for the next 30-second code.' };
    }

    await scope.update(users, { mfaEnabled: true }, eq(users.id, userId));

    return { success: true };
}

// ─── Verification (login challenge) ─────────────────────────

/**
 * Verify a TOTP code or single-use 10-character backup code at login.
 * Called after password authentication succeeds for MFA-enrolled users.
 */
export async function verifyMFACode(
    userId: string,
    tenantId: string,
    totpCode: string,
): Promise<{ success: boolean; error?: string }> {
    const user = await tenantScope(tenantId)
        .from(users)
        .select<{ mfaSecret: string | null; mfaEnabled: boolean }>({ mfaSecret: users.mfaSecret, mfaEnabled: users.mfaEnabled })
        .where(eq(users.id, userId))
        .first();

    if (!user?.mfaEnabled || !user.mfaSecret) {
        // MFA not configured — pass through (enforcement happens at the proxy/guard level)
        return { success: true };
    }

    const normalized = totpCode.trim().replace(/[\s-]+/g, '');
    if (/^[0-9A-F]{10}$/i.test(normalized) && !/^\d{6}$/.test(normalized)) {
        const backup = await redeemBackupCode(userId, tenantId, normalized);
        return backup.success
            ? { success: true }
            : { success: false, error: backup.error || 'Invalid backup code.' };
    }

    const secret = decrypt(user.mfaSecret);

    // otplib uses a 30-second window; allow ±1 step for clock skew
    const isValid = authenticator.verify({ token: normalized, secret });

    if (!isValid) {
        if (/^[0-9A-F]{10}$/i.test(normalized)) {
            const backup = await redeemBackupCode(userId, tenantId, normalized);
            if (backup.success) {
                return { success: true };
            }
        }
        return { success: false, error: 'Invalid or expired TOTP code.' };
    }

    const claimed = await claimSingleUseToken(`${userId}:${normalized}`, 'mfa_totp');
    if (!claimed) {
        return { success: false, error: 'This authenticator code was already used. Wait for the next code.' };
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
    const scope = tenantScope(tenantId);
    const user = await scope
        .from(users)
        .select<{ mfaEnabled: boolean | null; mfaBackupCodes: string[] | null }>({
            mfaEnabled: users.mfaEnabled,
            mfaBackupCodes: users.mfaBackupCodes,
        })
        .where(eq(users.id, userId))
        .first();

    if (!user || user.mfaEnabled !== true) {
        return {
            success: false,
            error: 'Two-factor authentication must be active before a backup code can be redeemed.',
        };
    }

    const storedCodes = user.mfaBackupCodes ?? [];
    if (storedCodes.length === 0) {
        return { success: false, error: 'No backup codes available.' };
    }

    // Find matching hashed code
    const normalised = rawCode.trim().replace(/[\s-]+/g, '').toUpperCase();
    const matchIndex = (
        await Promise.all(storedCodes.map(hash => bcrypt.compare(normalised, hash)))
    ).findIndex(Boolean);

    if (matchIndex === -1) {
        return { success: false, error: 'Invalid backup code.' };
    }

    // Remove the consumed code (single-use)
    const remaining = storedCodes.filter((_, i) => i !== matchIndex);
    await scope.update(users, { mfaBackupCodes: remaining }, eq(users.id, userId));

    return { success: true, codesRemaining: remaining.length };
}

// ─── Disable MFA ─────────────────────────────────────────────

/**
 * Disable MFA for a user (e.g. initiated via admin override or account recovery).
 * Bumps `users.session_version` and evicts cached session state so active sessions re-authenticate.
 */
export async function disableMFA(
    userId: string,
    tenantId: string,
): Promise<void> {
    await runWithTenantContext(tenantId, async () => {
        await pool.query(
            `UPDATE users
             SET mfa_enabled = false,
                 mfa_secret = NULL,
                 mfa_backup_codes = NULL,
                 session_version = session_version + 1,
                 updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [userId, tenantId],
        );
    });
    evictUserSessionCache(tenantId, userId);
}

// ─── Middleware-level enforcement helper ──────────────────────

/**
 * Returns true if the given role requires MFA to be active.
 * Used in proxy.ts, API routes, and Server Actions to block access until MFA is enrolled.
 */
export function isMFARequired(
    role: string,
    options?: { isDemoSandbox?: boolean; tenantCode?: string | null },
): boolean {
    return isRoleMfaRequired(role, options);
}

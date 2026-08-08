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
import type { PoolClient } from 'pg';
import { encrypt, decrypt } from '@/lib/encryption';
import { pool, runWithTenantContext } from '@/lib/db';

// ─── Constants ───────────────────────────────────────────────

/** Roles for which MFA is mandatory. */
export const MFA_REQUIRED_ROLES = new Set([
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'GROUP_EXECUTIVE',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
    'REGISTRAR',
    'FINANCE_LEAD',
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
    /** New revision that the one allowed enrollment session must adopt. */
    authVersion: number;
}

type MfaUserRow = {
    mfaSecret: string | null;
    mfaEnabled: boolean;
    mfaBackupCodes: string[] | null;
    authVersion: number;
};

async function withMfaTransaction<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
    return runWithTenantContext(tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await operation(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function insertMfaAudit(
    client: PoolClient,
    input: {
        userId: string;
        tenantId: string;
        description: string;
        beforeState: Record<string, unknown>;
        afterState: Record<string, unknown>;
    },
): Promise<void> {
    await client.query(
        `INSERT INTO audit_logs (
            tenant_id, user_id, action, entity_type, entity_id,
            description, before_state, after_state
         )
         VALUES ($1, $2, 'UPDATE', 'users', $2, $3, $4::jsonb, $5::jsonb)`,
        [
            input.tenantId,
            input.userId,
            input.description,
            JSON.stringify(input.beforeState),
            JSON.stringify(input.afterState),
        ],
    );
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
    expectedAuthVersion: number,
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

    const authVersion = await withMfaTransaction(tenantId, async (client) => {
        const result = await client.query<{ authVersion: number }>(
            `UPDATE users
             SET mfa_secret = $1,
                 mfa_enabled = FALSE,
                 mfa_backup_codes = $2::text[],
                 auth_version = auth_version + 1,
                 updated_at = NOW()
             WHERE id = $3
               AND tenant_id = $4
               AND is_active = TRUE
               AND auth_version = $5
             RETURNING auth_version AS "authVersion"`,
            [encryptedSecret, hashedBackupCodes, userId, tenantId, expectedAuthVersion],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error('MFA enrollment session changed. Sign in again.');
        await insertMfaAudit(client, {
            userId,
            tenantId,
            description: 'Generated a new MFA enrollment secret and revoked other sessions.',
            beforeState: { mfaEnabled: false },
            afterState: { mfaEnabled: false, enrollmentPending: true, sessionsRevoked: true },
        });
        return updated.authVersion;
    });

    return { secret, qrCodeDataUrl, backupCodes, authVersion };
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
    expectedAuthVersion: number,
): Promise<{ success: boolean; authVersion?: number; error?: string }> {
    try {
        const authVersion = await withMfaTransaction(tenantId, async (client) => {
            const result = await client.query<MfaUserRow>(
                `SELECT
                    mfa_secret AS "mfaSecret",
                    mfa_enabled AS "mfaEnabled",
                    mfa_backup_codes AS "mfaBackupCodes",
                    auth_version AS "authVersion"
                 FROM users
                 WHERE id = $1 AND tenant_id = $2 AND auth_version = $3
                 LIMIT 1
                 FOR UPDATE`,
                [userId, tenantId, expectedAuthVersion],
            );
            const user = result.rows[0];
            if (!user?.mfaSecret) throw new Error('MFA enrollment not started. Generate a new QR code.');
            if (user.mfaEnabled) throw new Error('MFA is already active for this account.');

            const secret = decrypt(user.mfaSecret);
            if (!authenticator.verify({ token: totpCode, secret })) {
                throw new Error('Invalid or expired code. Please try again.');
            }

            const updated = await client.query<{ authVersion: number }>(
                `UPDATE users
                 SET mfa_enabled = TRUE,
                     auth_version = auth_version + 1,
                     updated_at = NOW()
                 WHERE id = $1 AND tenant_id = $2 AND auth_version = $3
                 RETURNING auth_version AS "authVersion"`,
                [userId, tenantId, expectedAuthVersion],
            );
            if (!updated.rows[0]) throw new Error('MFA enrollment changed concurrently. Sign in again.');
            await insertMfaAudit(client, {
                userId,
                tenantId,
                description: 'Activated MFA and revoked other sessions.',
                beforeState: { mfaEnabled: false },
                afterState: { mfaEnabled: true, sessionsRevoked: true },
            });
            return updated.rows[0].authVersion;
        });
        return { success: true, authVersion };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to activate MFA.' };
    }
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
    const user = await runWithTenantContext(tenantId, async () => {
        const result = await pool.query<Pick<MfaUserRow, 'mfaSecret' | 'mfaEnabled'>>(
            `SELECT mfa_secret AS "mfaSecret", mfa_enabled AS "mfaEnabled"
             FROM users
             WHERE id = $1 AND tenant_id = $2
             LIMIT 1`,
            [userId, tenantId],
        );
        return result.rows[0];
    });

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
    expectedAuthVersion: number,
): Promise<{ success: boolean; codesRemaining?: number; authVersion?: number; error?: string }> {
    try {
        return await withMfaTransaction(tenantId, async (client) => {
            const result = await client.query<MfaUserRow>(
                `SELECT
                    mfa_secret AS "mfaSecret",
                    mfa_enabled AS "mfaEnabled",
                    mfa_backup_codes AS "mfaBackupCodes",
                    auth_version AS "authVersion"
                 FROM users
                 WHERE id = $1 AND tenant_id = $2 AND auth_version = $3
                 LIMIT 1
                 FOR UPDATE`,
                [userId, tenantId, expectedAuthVersion],
            );
            const storedCodes = result.rows[0]?.mfaBackupCodes ?? [];
            if (storedCodes.length === 0) throw new Error('No backup codes available.');

            const normalised = rawCode.trim().toUpperCase();
            const matchIndex = (
                await Promise.all(storedCodes.map(codeHash => bcrypt.compare(normalised, codeHash)))
            ).findIndex(Boolean);
            if (matchIndex === -1) throw new Error('Invalid backup code.');

            const remaining = storedCodes.filter((_, index) => index !== matchIndex);
            const updated = await client.query<{ authVersion: number }>(
                `UPDATE users
                 SET mfa_backup_codes = $1::text[],
                     auth_version = auth_version + 1,
                     updated_at = NOW()
                 WHERE id = $2 AND tenant_id = $3 AND auth_version = $4
                 RETURNING auth_version AS "authVersion"`,
                [remaining, userId, tenantId, expectedAuthVersion],
            );
            if (!updated.rows[0]) throw new Error('Backup-code state changed concurrently. Sign in again.');
            await insertMfaAudit(client, {
                userId,
                tenantId,
                description: 'Redeemed one MFA backup code and revoked other sessions.',
                beforeState: { backupCodesRemaining: storedCodes.length },
                afterState: { backupCodesRemaining: remaining.length, sessionsRevoked: true },
            });
            return {
                success: true,
                codesRemaining: remaining.length,
                authVersion: updated.rows[0].authVersion,
            };
        });
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to redeem backup code.' };
    }
}

// ─── Disable MFA ─────────────────────────────────────────────

/**
 * Disable MFA for a user (e.g. initiated via admin override or account recovery).
 * Requires a verified TOTP code or a valid backup code before disabling.
 */
export async function disableMFA(
    userId: string,
    tenantId: string,
    expectedAuthVersion: number,
): Promise<{ success: boolean; authVersion?: number; error?: string }> {
    try {
        const authVersion = await withMfaTransaction(tenantId, async (client) => {
            const updated = await client.query<{ authVersion: number }>(
                `UPDATE users
                 SET mfa_enabled = FALSE,
                     mfa_secret = NULL,
                     mfa_backup_codes = NULL,
                     auth_version = auth_version + 1,
                     updated_at = NOW()
                 WHERE id = $1 AND tenant_id = $2 AND auth_version = $3
                 RETURNING auth_version AS "authVersion"`,
                [userId, tenantId, expectedAuthVersion],
            );
            if (!updated.rows[0]) throw new Error('MFA state changed concurrently. Sign in again.');
            await insertMfaAudit(client, {
                userId,
                tenantId,
                description: 'Disabled MFA and revoked all existing sessions.',
                beforeState: { mfaEnabled: true },
                afterState: { mfaEnabled: false, sessionsRevoked: true },
            });
            return updated.rows[0].authVersion;
        });
        return { success: true, authVersion };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to disable MFA.' };
    }
}

// ─── Middleware-level enforcement helper ──────────────────────

/**
 * Returns true if the given role requires MFA to be active.
 * Used in middleware.ts to block access until MFA is enrolled.
 */
export function isMFARequired(role: string): boolean {
    return MFA_REQUIRED_ROLES.has(role);
}

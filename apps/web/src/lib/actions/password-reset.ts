'use server';

import { pool } from '@/lib/db';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import { sendPasswordResetEmail } from '@/lib/services/email';

/**
 * Password Reset Server Actions
 *
 * Flow:
 * 1. User requests reset → token generated, stored in DB, emailed
 * 2. User clicks link → token validated
 * 3. User submits new password → password updated, token invalidated
 *
 * SECURITY:
 * - Tokens are SHA-256 hashed in DB (raw token only in email)
 * - 1-hour expiry
 * - Single-use (deleted after use)
 * - Same error message for valid/invalid emails (prevents enumeration)
 */

/**
 * Request a password reset email.
 */
export async function requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    if (!email || !email.includes('@')) {
        return { success: false, message: 'Please enter a valid email address' };
    }

    try {
        // Find user (don't reveal if email exists)
        const { rows } = await pool.query(
            'SELECT id, tenant_id AS "tenantId" FROM users WHERE email = $1 LIMIT 1',
            [email.toLowerCase()]
        );
        const user = rows[0];

        if (user) {
            // Generate token
            const rawToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            // Store hashed token in DB
            await pool.query(
                `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
                 VALUES ($1, $2, $3, NOW())
                 ON CONFLICT (user_id) DO UPDATE SET
                     token_hash = $2,
                     expires_at = $3,
                     created_at = NOW()`,
                [user.id, hashedToken, expiresAt.toISOString()]
            );

            // Get school name for email
            const { rows: tenantRows } = await pool.query(
                'SELECT name FROM tenants WHERE id = $1 LIMIT 1',
                [user.tenantId]
            );
            const tenant = tenantRows[0];

            // Send email with raw token
            await sendPasswordResetEmail(email, rawToken, tenant?.name || 'ScholarMind');
        }

        // Always return same message (prevents email enumeration)
        return {
            success: true,
            message: 'If an account exists with this email, you will receive a password reset link.',
        };
    } catch (error) {
        console.error('[Password Reset] Request error:', error);
        return { success: false, message: 'An error occurred. Please try again.' };
    }
}

/**
 * Validate a password reset token.
 */
export async function validateResetToken(token: string): Promise<{ valid: boolean; userId?: string }> {
    if (!token) return { valid: false };

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    try {
        const { rows } = await pool.query(
            `SELECT user_id FROM password_reset_tokens
             WHERE token_hash = $1
             AND expires_at > NOW()
             LIMIT 1`,
            [hashedToken]
        );

        if (rows.length === 0) return { valid: false };

        return { valid: true, userId: rows[0].user_id };
    } catch (error) {
        console.error('[Password Reset] Validation error:', error);
        return { valid: false };
    }
}

/**
 * Reset the password using a valid token.
 */
export async function resetPassword(
    token: string,
    newPassword: string,
): Promise<{ success: boolean; message: string }> {
    if (!token || !newPassword) {
        return { success: false, message: 'Token and new password are required' };
    }

    if (newPassword.length < 8) {
        return { success: false, message: 'Password must be at least 8 characters' };
    }

    const { valid, userId } = await validateResetToken(token);
    if (!valid || !userId) {
        return { success: false, message: 'Invalid or expired reset link. Please request a new one.' };
    }

    try {
        const hashedPassword = await hash(newPassword, 12);

        // Update password
        await pool.query(
            'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
            [hashedPassword, userId]
        );

        // Delete used token
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        await pool.query(
            'DELETE FROM password_reset_tokens WHERE token_hash = $1',
            [hashedToken]
        );

        return { success: true, message: 'Password updated successfully. You can now log in.' };
    } catch (error) {
        console.error('[Password Reset] Reset error:', error);
        return { success: false, message: 'An error occurred. Please try again.' };
    }
}

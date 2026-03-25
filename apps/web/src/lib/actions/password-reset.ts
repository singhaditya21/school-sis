'use server';

import { db, setTenantContext } from '@/lib/db';
import { users, tenants } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
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
        const [user] = await db.select({ id: users.id, tenantId: users.tenantId })
            .from(users)
            .where(eq(users.email, email.toLowerCase()))
            .limit(1);

        if (user) {
            // Generate token
            const rawToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            // Store hashed token in DB
            await db.execute(sql`
                INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
                VALUES (${user.id}, ${hashedToken}, ${expiresAt.toISOString()}, NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    token_hash = ${hashedToken},
                    expires_at = ${expiresAt.toISOString()},
                    created_at = NOW()
            `);

            // Get school name for email
            const [tenant] = await db.select({ name: tenants.name })
                .from(tenants)
                .where(eq(tenants.id, user.tenantId))
                .limit(1);

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
        const result = await db.execute(sql`
            SELECT user_id FROM password_reset_tokens
            WHERE token_hash = ${hashedToken}
            AND expires_at > NOW()
            LIMIT 1
        `);

        const rows = result as any[];
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
        await db.update(users)
            .set({
                passwordHash: hashedPassword,
                updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

        // Delete used token
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        await db.execute(sql`
            DELETE FROM password_reset_tokens WHERE token_hash = ${hashedToken}
        `);

        return { success: true, message: 'Password updated successfully. You can now log in.' };
    } catch (error) {
        console.error('[Password Reset] Reset error:', error);
        return { success: false, message: 'An error occurred. Please try again.' };
    }
}

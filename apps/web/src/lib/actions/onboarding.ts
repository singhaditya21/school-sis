'use server';

import { db } from '@/lib/db';
import { tenants, users } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { hash } from 'bcryptjs';
import { getLimit } from '@/lib/config/limits';

/**
 * Self-Serve School Onboarding
 *
 * Complete onboarding flow:
 * 1. Create tenant (school)
 * 2. Create admin account
 * 3. Set default subscription tier
 * 4. Initialize sample data (optional)
 */

export interface OnboardingInput {
    schoolName: string;
    schoolCode: string;
    adminEmail: string;
    adminPassword: string;
    adminFirstName: string;
    adminLastName: string;
    affiliationBoard?: string;
    city?: string;
    state?: string;
    phone?: string;
}

export interface OnboardingResult {
    success: boolean;
    tenantId?: string;
    adminId?: string;
    loginUrl?: string;
    error?: string;
}

export async function onboardSchool(input: OnboardingInput): Promise<OnboardingResult> {
    // Validation
    if (!input.schoolName || input.schoolName.length < 3) {
        return { success: false, error: 'School name must be at least 3 characters' };
    }
    if (!input.schoolCode || input.schoolCode.length < 2) {
        return { success: false, error: 'School code must be at least 2 characters' };
    }
    if (!input.adminEmail || !input.adminEmail.includes('@')) {
        return { success: false, error: 'Valid admin email is required' };
    }
    if (!input.adminPassword || input.adminPassword.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' };
    }

    const code = input.schoolCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

    try {
        // FREE TIER: Check tenant count cap
        const [tenantCount] = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM tenants WHERE is_active = true`);
        if ((tenantCount as any)?.cnt >= getLimit('MAX_TENANTS')) {
            return { success: false, error: `Free tier limit reached (${getLimit('MAX_TENANTS')} schools). Contact support to upgrade.` };
        }

        // Check if school code is taken
        const [existing] = await db.select({ id: tenants.id })
            .from(tenants)
            .where(eq(tenants.code, code))
            .limit(1);

        if (existing) {
            return { success: false, error: 'This school code is already taken. Try a different one.' };
        }

        // Check if admin email is taken
        const [existingUser] = await db.select({ id: users.id })
            .from(users)
            .where(eq(users.email, input.adminEmail.toLowerCase()))
            .limit(1);

        if (existingUser) {
            return { success: false, error: 'An account with this email already exists.' };
        }

        // Create tenant
        const passwordHash = await hash(input.adminPassword, 12);

        const result = await db.execute(sql`
            WITH new_tenant AS (
                INSERT INTO tenants (
                    name, code, affiliation_board, city, state, phone,
                    subscription_tier, active_modules, is_active
                ) VALUES (
                    ${input.schoolName}, ${code},
                    ${input.affiliationBoard || null}, ${input.city || null},
                    ${input.state || null}, ${input.phone || null},
                    'CORE',
                    ARRAY['ATTENDANCE', 'FEES', 'COMMUNICATION'],
                    true
                )
                RETURNING id
            ),
            new_admin AS (
                INSERT INTO users (
                    tenant_id, email, password_hash, first_name, last_name,
                    role, is_active
                )
                SELECT id, ${input.adminEmail.toLowerCase()}, ${passwordHash},
                       ${input.adminFirstName}, ${input.adminLastName},
                       'SUPER_ADMIN', true
                FROM new_tenant
                RETURNING id, tenant_id
            )
            SELECT new_admin.id AS admin_id, new_admin.tenant_id
            FROM new_admin
        `);

        const row = (result as any[])[0];
        if (!row) {
            return { success: false, error: 'Failed to create school account. Please try again.' };
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        return {
            success: true,
            tenantId: row.tenant_id,
            adminId: row.admin_id,
            loginUrl: `${appUrl}/login?code=${code}`,
        };
    } catch (error: any) {
        console.error('[Onboarding] Error:', error.message);
        return { success: false, error: 'An error occurred during registration. Please try again.' };
    }
}

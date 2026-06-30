import { NextResponse } from 'next/server';
import { pool, runWithRlsBypass } from '@/lib/db';
import { hash } from 'bcryptjs';
import { requireApiAuth, ROLE_GROUPS } from '@/lib/auth/api';

/**
 * Seed endpoint — STRICTLY gated.
 * 
 * SECURITY:
 * - Only accessible in development mode OR by authenticated PLATFORM_ADMIN
 * - Uses a strong default password (not 'password')
 * - Returns generic errors to prevent information disclosure
 */

export async function GET() {
    // SECURITY: Block in production unless called by authenticated PLATFORM_ADMIN
    if (process.env.NODE_ENV === 'production') {
        const auth = await requireApiAuth(ROLE_GROUPS.platform);
        if (auth.ok === false) return auth.response;
        if (!process.env.SEED_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD.length < 16) {
            return NextResponse.json({ error: 'Seed password is not configured' }, { status: 503 });
        }
    }

    return runWithRlsBypass(async () => {
    try {
        console.log('📦 Seeding Platform Admin account...');
        
        // 1. Create HQ Company
        let { rows: [hqCompany] } = await pool.query(
            `SELECT * FROM companies WHERE name = $1`, 
            ['ScholarMind HQ']
        );
        if (!hqCompany) {
            const { rows: [newComp] } = await pool.query(
                `INSERT INTO companies (name, subscription_tier, is_active, region) VALUES ($1, $2, $3, $4) RETURNING *`,
                ['ScholarMind HQ', 'ENTERPRISE', true, 'GLOBAL']
            );
            hqCompany = newComp;
            console.log('✅ Created HQ Company');
        }

        // 2. Create HQ Tenant
        let { rows: [hqTenant] } = await pool.query(
            `SELECT * FROM tenants WHERE code = $1`, 
            ['HQ']
        );
        if (!hqTenant) {
            const { rows: [newTen] } = await pool.query(
                `INSERT INTO tenants (name, code, company_id, is_active) VALUES ($1, $2, $3, $4) RETURNING *`,
                ['ScholarMind HQ', 'HQ', hqCompany.id, true]
            );
            hqTenant = newTen;
            console.log('✅ Created HQ Tenant');
        }

        // 3. Create Admin User with STRONG password from env var
        const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'ScholarM!nd#2026$Secure';
        const defaultPassword = await hash(seedPassword, 12);
        
        const emailsToSeed = ['founder@scholarmind.com', 'owner@scholarmind.com'];
        const seededUsers = [];

        for (const email of emailsToSeed) {
            let { rows: [user] } = await pool.query(
                `SELECT * FROM users WHERE email = $1`,
                [email]
            );
            if (!user) {
                const { rows: [newUser] } = await pool.query(
                    `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
                    [hqTenant.id, email, defaultPassword, 'Platform', 'Admin', 'SUPER_ADMIN']
                );
                seededUsers.push(newUser.email);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Seed completed successfully.',
            company: hqCompany.name,
            tenant: hqTenant.code,
            seededUsers: seededUsers.length > 0 ? seededUsers : 'Users already existed'
        });

    } catch (error: any) {
        console.error('Seed Error:', error);
        return NextResponse.json({ success: false, error: 'Seed operation failed' }, { status: 500 });
    }
    });
}

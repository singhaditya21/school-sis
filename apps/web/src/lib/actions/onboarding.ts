'use server';

import { pool, runWithRlsBypass } from '@/lib/db';
import { hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/auth/session';

export async function setupSchoolWorkspace(formData: FormData) {
    return runWithRlsBypass(() => setupSchoolWorkspaceWithBypass(formData));
}

async function setupSchoolWorkspaceWithBypass(formData: FormData) {
    try {
        const schoolName = formData.get('schoolName') as string;
        const firstName = formData.get('adminFirstName') as string;
        const lastName = formData.get('adminLastName') as string;
        const email = formData.get('email') as string;
        const domain = formData.get('domain') as string;
        const password = formData.get('password') as string;

        if (!schoolName || !email || !password || !domain) {
            return { error: 'Missing required onboarding parameters.' };
        }

        const domainUrl = `${domain}.scholarmind.app`.toLowerCase();

        // Ensure email isn't already used
        const { rows: existingUser } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existingUser.length > 0) {
            return { error: 'An administrator with this email already exists.' };
        }

        const { rows: existingDomain } = await pool.query('SELECT * FROM tenants WHERE code = $1', [domain.toLowerCase()]);
        if (existingDomain.length > 0) {
            return { error: 'This workspace subdomain is already taken. Please choose another.' };
        }

        // Generate tenant record. Defaults to 'TRIALING' billing status and 'isActive=true' for now
        // so they can log in, or we can make it false and let Stripe activate it.
        const { rows: tenantRows } = await pool.query(
            `INSERT INTO tenants (name, code, domain, email, billing_status, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id, name, code, domain, email, billing_status AS "billingStatus", is_active AS "isActive"`,
            [schoolName, domain.toLowerCase(), domainUrl, email.toLowerCase(), 'INCOMPLETE', false]
        );
        const tenant = tenantRows[0];

        // Hash admin password
        const passwordHash = await hash(password, 12);

        // Create the founding administrator user
        const { rows: adminUserRows } = await pool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, role, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING id, tenant_id AS "tenantId", email, password_hash AS "passwordHash", first_name AS "firstName", last_name AS "lastName", role, is_active AS "isActive"`,
            [tenant.id, email.toLowerCase(), passwordHash, firstName, lastName, 'SCHOOL_ADMIN', true]
        );
        const adminUser = adminUserRows[0];

        // Automatically log them in immediately so the checkout API route succeeds
        const c = await cookies();
        const session = await getIronSession<SessionData>(c, sessionOptions);
        
        session.isLoggedIn = true;
        session.userId = adminUser.id;
        session.tenantId = tenant.id;
        session.role = adminUser.role;
        session.email = adminUser.email;
        session.displayName = `${adminUser.firstName} ${adminUser.lastName}`;
        
        await session.save();

        return { success: true, tenantId: tenant.id };
    } catch (error: any) {
        console.error('[ONBOARDING_ERROR]', error);
        return { error: error.message || 'Failed to create workspace database. Please try again later.' };
    }
}

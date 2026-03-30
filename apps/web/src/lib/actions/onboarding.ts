'use server';

import { db } from '@/lib/db';
import { tenants, users } from '@/lib/db/schema/core';
import { hash } from 'bcryptjs';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/auth/session';
import { eq } from 'drizzle-orm';

export async function setupSchoolWorkspace(formData: FormData) {
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
        const existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
        if (existingUser.length > 0) {
            return { error: 'An administrator with this email already exists.' };
        }

        const existingDomain = await db.select().from(tenants).where(eq(tenants.code, domain.toLowerCase()));
        if (existingDomain.length > 0) {
            return { error: 'This workspace subdomain is already taken. Please choose another.' };
        }

        // Generate tenant record. Defaults to 'TRIALING' billing status and 'isActive=true' for now
        // so they can log in, or we can make it false and let Stripe activate it.
        const [tenant] = await db.insert(tenants).values({
            name: schoolName,
            code: domain.toLowerCase(),
            domain: domainUrl,
            email: email.toLowerCase(),
            billingStatus: 'INCOMPLETE',
            isActive: false // Will be activated via Stripe Webhook
        }).returning();

        // Hash admin password
        const passwordHash = await hash(password, 12);

        // Create the founding administrator user
        const [adminUser] = await db.insert(users).values({
            tenantId: tenant.id,
            email: email.toLowerCase(),
            passwordHash,
            firstName,
            lastName,
            role: 'SCHOOL_ADMIN',
            isActive: true
        }).returning();

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

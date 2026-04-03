import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, companies, tenants } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hash } from 'bcryptjs';

export async function GET() {
    try {
        console.log('📦 Seeding Platform Admin account...');
        
        // 1. Create HQ Company
        let [hqCompany] = await db.select().from(companies).where(eq(companies.name, 'ScholarMind HQ'));
        if (!hqCompany) {
            const [newComp] = await db.insert(companies).values({
                name: 'ScholarMind HQ',
                subscriptionTier: 'ENTERPRISE',
                isActive: true,
                region: 'GLOBAL',
            }).returning();
            hqCompany = newComp;
            console.log('✅ Created HQ Company');
        }

        // 2. Create HQ Tenant
        let [hqTenant] = await db.select().from(tenants).where(eq(tenants.code, 'HQ'));
        if (!hqTenant) {
            const [newTen] = await db.insert(tenants).values({
                name: 'ScholarMind HQ',
                code: 'HQ',
                companyId: hqCompany.id,
                isActive: true,
            }).returning();
            hqTenant = newTen;
            console.log('✅ Created HQ Tenant');
        }

        // 3. Create Admin Users (both founder and owner to be absolutely safe)
        const defaultPassword = await hash('password', 12);
        
        const emailsToSeed = ['founder@scholarmind.com', 'owner@scholarmind.com'];
        const seededUsers = [];

        for (const email of emailsToSeed) {
            let [user] = await db.select().from(users).where(eq(users.email, email));
            if (!user) {
                const [newUser] = await db.insert(users).values({
                    tenantId: hqTenant.id,
                    email: email,
                    passwordHash: defaultPassword,
                    firstName: 'Platform',
                    lastName: 'Admin',
                    role: 'SUPER_ADMIN',
                }).returning();
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
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

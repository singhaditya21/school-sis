import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { hash } from 'bcryptjs';
import * as schema from '../src/lib/db/schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is required. Set it in your .env file.');
    process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function setup() {
    console.log('🚀 Setting up ScholarMind Platform Admin (Founder)...');

    // 1. Check if HQ tenant exists
    const [existingHQ] = await db.select().from(schema.tenants).where(eq(schema.tenants.code, 'HQ'));
    
    let hqTenant;
    if (existingHQ) {
        console.log('HQ Tenant already exists.');
        hqTenant = existingHQ;
    } else {
        console.log('📦 Creating HQ tenant...');
        const [tenant] = await db.insert(schema.tenants).values({
            name: 'ScholarMind HQ',
            code: 'HQ',
            subscriptionTier: 'ENTERPRISE', // Master tier
            isActive: true,
        }).returning();
        hqTenant = tenant;
    }

    // 2. Check if founder exists
    const [existingFounder] = await db.select().from(schema.users).where(eq(schema.users.email, 'founder@scholarmind.com'));

    if (existingFounder) {
        console.log('Founder account already exists.');
    } else {
        console.log('👤 Creating founder user...');
        const defaultPassword = await hash('password', 12);
        
        await db.insert(schema.users).values({
            tenantId: hqTenant.id,
            email: 'founder@scholarmind.com',
            passwordHash: defaultPassword,
            firstName: 'SaaS',
            lastName: 'Founder',
            role: 'SUPER_ADMIN',
        });
        console.log('✅ Founder account created: founder@scholarmind.com / password');
    }

    await client.end();
    process.exit(0);
}

setup().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

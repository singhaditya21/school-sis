import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/lib/db/schema';
import { eq, isNull } from 'drizzle-orm';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is required.');
    process.exit(1);
}

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function run() {
    console.log('🚀 Migrating Tenants to Parent-Child Company Hierarchy...');

    // 0. Execute Database Schema Updates manually (Bypassing drizzle-kit sync issues)
    console.log('🏗️ Altering schema: creating companies table and modifying tenants...');
    await client`
        CREATE TABLE IF NOT EXISTS "companies" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "name" varchar(255) NOT NULL,
            "stripe_customer_id" varchar(255),
            "stripe_subscription_id" varchar(255),
            "stripe_price_id" varchar(255),
            "stripe_current_period_end" timestamp with time zone,
            "billing_status" varchar(50) DEFAULT 'TRIALING' NOT NULL,
            "subscription_tier" "subscription_tier" DEFAULT 'CORE' NOT NULL,
            "active_modules" text[] DEFAULT ARRAY['ATTENDANCE','FEES','COMMUNICATION']::text[],
            "is_active" boolean DEFAULT true NOT NULL,
            "created_at" timestamp with time zone DEFAULT now() NOT NULL,
            "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        );
    `;

    await client`
        ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "company_id" uuid;
    `;
    
    // Add foreign key constraint if it doesn't exist
    await client`
        DO $$ 
        BEGIN
            IF NOT EXISTS (
                SELECT 1 
                FROM information_schema.table_constraints 
                WHERE constraint_name = 'tenants_company_id_companies_id_fk'
            ) THEN
                ALTER TABLE "tenants" ADD CONSTRAINT "tenants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE cascade;
            END IF;
        END $$;
    `;

    // 1. Fetch all tenants that don't have a company yet
    const unparentedTenants = await db.select().from(schema.tenants).where(isNull(schema.tenants.companyId));
    console.log(`Found ${unparentedTenants.length} tenants without an associated company.`);

    for (const tenant of unparentedTenants) {
        console.log(`📦 Processing Company creation for: ${tenant.name}`);

        // Note: activeModules, stripeCustomerId, subscriptionTier, etc., physically still exist in PG until we drop/push.
        // We will execute a RAW insert because Drizzle types for 'tenants' no longer have those fields, 
        // but the DB STILL has them right now. We need the data.

        const rawResults = await client`SELECT stripe_customer_id, stripe_subscription_id, subscription_tier, billing_status, is_active FROM tenants WHERE id = ${tenant.id}`;
        
        if (rawResults.length === 0) continue;
        const tenantData = rawResults[0];

        // 2. Insert the Parent Company
        const [newCompany] = await db.insert(schema.companies).values({
            name: `${tenant.name} Org`,
            stripeCustomerId: tenantData.stripe_customer_id,
            stripeSubscriptionId: tenantData.stripe_subscription_id,
            subscriptionTier: tenantData.subscription_tier || 'CORE',
            billingStatus: tenantData.billing_status || 'TRIALING',
            isActive: tenantData.is_active,
        }).returning();

        // 3. Update the tenant to reference the company
        await db.update(schema.tenants).set({
            companyId: newCompany.id
        }).where(eq(schema.tenants.id, tenant.id));

        console.log(`✅ Bound Tenant ${tenant.code} to Company ${newCompany.id}`);
    }

    console.log('🏁 Migration Complete!');
    await client.end();
    process.exit(0);
}

run().catch(err => {
    console.error('Error Migration:', err);
    process.exit(1);
});

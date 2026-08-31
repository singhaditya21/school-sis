import { Pool, type QueryResultRow } from 'pg';
import { hash } from 'bcryptjs';
import { createSqlTag, identifier, type ColumnRef } from '../../../packages/api/src/db/sql';
import { resolveDatabaseConnectionOptions } from '../../../packages/api/src/db/ssl';
import { companies, tenants, users } from '../../../packages/api/src/db/generated/tables';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL is required. Set it in your .env file.');
    process.exit(1);
}

// A direct owner connection. This script seeds cross-tenant platform data (the HQ
// company/tenant and the founder), so it deliberately does NOT go through the app's
// RLS-routing pool, which requires a signed per-request tenant context.
const pool = new Pool({
    ...resolveDatabaseConnectionOptions(connectionString),
    max: 1,
});
const sql = createSqlTag(() => pool);

/**
 * INSERT one row from a generated table object and a values map keyed by the table's
 * own column properties. The keys are checked against the table at compile time (so a
 * drifted column name fails `tsc`), and every value is bound as a parameter.
 */
async function insertRow<T extends { readonly $name: string }, Row extends QueryResultRow = QueryResultRow>(
    table: T,
    values: { [K in Exclude<keyof T, '$name'>]?: unknown },
): Promise<Row> {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined);
    const columns = entries.map(([key]) => `"${((table as Record<string, unknown>)[key] as ColumnRef).column}"`).join(', ');
    const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
    const params = entries.map(([, value]) => value);
    const { rows } = await pool.query(
        `INSERT INTO "${table.$name}" (${columns}) VALUES (${placeholders}) RETURNING *`,
        params,
    );
    // node-pg returns raw snake_case column names; map them back to the table's own
    // camelCase property names so callers read `.id`, not the raw column key.
    const raw = rows[0] ?? {};
    const mapped: Record<string, unknown> = {};
    for (const [property, ref] of Object.entries(table)) {
        if (property === '$name') continue;
        mapped[property] = raw[(ref as ColumnRef).column];
    }
    return mapped as Row;
}

async function setup() {
    console.log('🚀 Setting up ScholarMind Platform Admin (Founder)...');

    // 1. HQ company
    let companyId: string;
    const existingCompany = await sql<{ id: string }>`
        SELECT id FROM ${identifier(companies.$name)} WHERE ${companies.name} = ${'ScholarMind HQ'} LIMIT 1
    `.maybeOne();
    if (existingCompany) {
        console.log('HQ Company already exists.');
        companyId = existingCompany.id;
    } else {
        console.log('🏢 Creating HQ company...');
        const company = await insertRow<typeof companies, { id: string }>(companies, {
            name: 'ScholarMind HQ',
            subscriptionTier: 'ENTERPRISE',
            isActive: true,
            region: 'GLOBAL',
        });
        companyId = company.id;
    }

    // 2. HQ tenant
    let tenantId: string;
    const existingHQ = await sql<{ id: string }>`
        SELECT id FROM ${identifier(tenants.$name)} WHERE ${tenants.code} = ${'HQ'} LIMIT 1
    `.maybeOne();
    if (existingHQ) {
        console.log('HQ Tenant already exists.');
        tenantId = existingHQ.id;
    } else {
        console.log('📦 Creating HQ tenant...');
        const tenant = await insertRow<typeof tenants, { id: string }>(tenants, {
            name: 'ScholarMind HQ',
            code: 'HQ',
            companyId,
            isActive: true,
        });
        tenantId = tenant.id;
    }

    // 3. Founder user
    const existingFounder = await sql<{ id: string }>`
        SELECT id FROM ${identifier(users.$name)} WHERE ${users.email} = ${'founder@scholarmind.com'} LIMIT 1
    `.maybeOne();

    if (existingFounder) {
        console.log('✅ Founder account already exists: founder@scholarmind.com');
    } else {
        console.log('👤 Creating founder user...');
        const founderPassword = process.env.FOUNDER_PASSWORD;
        if (!founderPassword || founderPassword.length < 12) {
            throw new Error('FOUNDER_PASSWORD is required and must be at least 12 characters.');
        }
        const defaultPassword = await hash(founderPassword, 12);

        await insertRow(users, {
            tenantId,
            email: 'founder@scholarmind.com',
            passwordHash: defaultPassword,
            firstName: 'SaaS',
            lastName: 'Founder',
            role: 'SUPER_ADMIN',
        });
        console.log('✅ Founder account created: founder@scholarmind.com');
    }

    await pool.end();
    process.exit(0);
}

setup().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});

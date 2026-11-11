import crypto from 'node:crypto';
import { Pool } from 'pg';
import { hash } from 'bcryptjs';
import { resolveDatabaseConnectionOptions } from '../../../packages/api/src/db/ssl';
import {
    PERMANENT_PLATFORM_ADMIN_EMAIL,
    PLATFORM_ALL_MODULES,
    PLATFORM_HQ_COMPANY_NAME,
    PLATFORM_HQ_TENANT_CODE,
} from '../src/lib/auth/platform-owner';
import { encryptEmail, encryptEmailCandidates } from '../src/lib/encryption';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DATABASE_URL or DIRECT_URL is required.');
    process.exit(1);
}

const hasPiiKey =
    (process.env.PII_ENCRYPTION_KEY && process.env.PII_ENCRYPTION_KEY.length >= 32) ||
    (process.env.NODE_ENV !== 'production' &&
        process.env.ENCRYPTION_KEY &&
        process.env.ENCRYPTION_KEY.length >= 32);

// Direct owner connection: bootstraps cross-tenant HQ company/tenant and permanent
// PLATFORM_ADMIN identity (`singhaditya21@gmail.com`).
const pool = new Pool({
    ...resolveDatabaseConnectionOptions(connectionString),
    max: 1,
});

async function setup() {
    console.log(`🚀 Bootstrapping permanent ScholarMind Platform Admin (${PERMANENT_PLATFORM_ADMIN_EMAIL})...`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Ensure ScholarMind HQ company exists and is locked to active ENTERPRISE + full modules
        const existingCompany = await client.query<{ id: string }>(
            `SELECT id FROM companies WHERE name = $1 LIMIT 1`,
            [PLATFORM_HQ_COMPANY_NAME],
        );

        let companyId: string;
        if (existingCompany.rows[0]) {
            companyId = existingCompany.rows[0].id;
            await client.query(
                `UPDATE companies
                 SET subscription_tier = 'ENTERPRISE',
                     billing_status = 'ACTIVE',
                     active_modules = $1::text[],
                     is_active = true,
                     region = COALESCE(region, 'GLOBAL'),
                     updated_at = NOW()
                 WHERE id = $2`,
                [[...PLATFORM_ALL_MODULES], companyId],
            );
            console.log('🏢 Verified HQ company governance settings.');
        } else {
            const insertedCompany = await client.query<{ id: string }>(
                `INSERT INTO companies (name, subscription_tier, billing_status, active_modules, is_active, region)
                 VALUES ($1, 'ENTERPRISE', 'ACTIVE', $2::text[], true, 'GLOBAL')
                 RETURNING id`,
                [PLATFORM_HQ_COMPANY_NAME, [...PLATFORM_ALL_MODULES]],
            );
            companyId = insertedCompany.rows[0].id;
            console.log('🏢 Created ScholarMind HQ company.');
        }

        // 2. Ensure HQ tenant exists and is active under ScholarMind HQ company
        const existingHqTenant = await client.query<{ id: string }>(
            `SELECT id FROM tenants WHERE upper(code) = $1 LIMIT 1`,
            [PLATFORM_HQ_TENANT_CODE],
        );

        let hqTenantId: string;
        if (existingHqTenant.rows[0]) {
            hqTenantId = existingHqTenant.rows[0].id;
            await client.query(
                `UPDATE tenants
                 SET code = $1,
                     name = $2,
                     company_id = $3,
                     domain = COALESCE(domain, 'hq.scholarmind.app'),
                     email = $4,
                     is_active = true,
                     updated_at = NOW()
                 WHERE id = $5`,
                [
                    PLATFORM_HQ_TENANT_CODE,
                    PLATFORM_HQ_COMPANY_NAME,
                    companyId,
                    PERMANENT_PLATFORM_ADMIN_EMAIL,
                    hqTenantId,
                ],
            );
            console.log('📦 Verified HQ tenant governance settings.');
        } else {
            const insertedTenant = await client.query<{ id: string }>(
                `INSERT INTO tenants (name, code, domain, company_id, email, is_active)
                 VALUES ($1, $2, 'hq.scholarmind.app', $3, $4, true)
                 RETURNING id`,
                [
                    PLATFORM_HQ_COMPANY_NAME,
                    PLATFORM_HQ_TENANT_CODE,
                    companyId,
                    PERMANENT_PLATFORM_ADMIN_EMAIL,
                ],
            );
            hqTenantId = insertedTenant.rows[0].id;
            console.log('📦 Created HQ tenant.');
        }

        // 3. Upsert & lock permanent full admin (`singhaditya21@gmail.com`) onto HQ
        const emailCandidates = hasPiiKey
            ? encryptEmailCandidates(PERMANENT_PLATFORM_ADMIN_EMAIL)
            : [];
        const encryptedOwnerEmail = hasPiiKey
            ? encryptEmail(PERMANENT_PLATFORM_ADMIN_EMAIL)
            : null;

        const existingOwner = await client.query<{ id: string }>(
            `SELECT id
             FROM users
             WHERE lower(email) = $1
                OR ($2::text[] IS NOT NULL AND cardinality($2::text[]) > 0 AND email_enc = ANY($2::text[]))
             ORDER BY CASE WHEN tenant_id = $3 THEN 0 ELSE 1 END, created_at ASC
             LIMIT 1`,
            [PERMANENT_PLATFORM_ADMIN_EMAIL, emailCandidates, hqTenantId],
        );

        const founderPassword = process.env.FOUNDER_PASSWORD?.trim();
        const rotatePassword = process.env.ROTATE_FOUNDER_PASSWORD === 'true';

        if (founderPassword && founderPassword.length < 12) {
            throw new Error('FOUNDER_PASSWORD must be at least 12 characters when provided.');
        }

        let ownerUserId: string;
        if (existingOwner.rows[0]) {
            ownerUserId = existingOwner.rows[0].id;
            if (founderPassword && rotatePassword) {
                const passwordHash = await hash(founderPassword, 12);
                await client.query(
                    `UPDATE users
                     SET tenant_id = $1,
                         email = $2,
                         email_enc = COALESCE($3, email_enc),
                         password_hash = $4,
                         first_name = COALESCE(NULLIF(first_name, ''), 'Aditya'),
                         last_name = COALESCE(NULLIF(last_name, ''), 'Singh'),
                         role = 'PLATFORM_ADMIN',
                         is_active = true,
                         updated_at = NOW()
                     WHERE id = $5`,
                    [
                        hqTenantId,
                        hasPiiKey ? null : PERMANENT_PLATFORM_ADMIN_EMAIL,
                        encryptedOwnerEmail,
                        passwordHash,
                        ownerUserId,
                    ],
                );
                console.log(`🔐 Updated permanent Platform Admin (${PERMANENT_PLATFORM_ADMIN_EMAIL}) with rotated password.`);
            } else {
                await client.query(
                    `UPDATE users
                     SET tenant_id = $1,
                         email = $2,
                         email_enc = COALESCE($3, email_enc),
                         first_name = COALESCE(NULLIF(first_name, ''), 'Aditya'),
                         last_name = COALESCE(NULLIF(last_name, ''), 'Singh'),
                         role = 'PLATFORM_ADMIN',
                         is_active = true,
                         updated_at = NOW()
                     WHERE id = $4`,
                    [
                        hqTenantId,
                        hasPiiKey ? null : PERMANENT_PLATFORM_ADMIN_EMAIL,
                        encryptedOwnerEmail,
                        ownerUserId,
                    ],
                );
                console.log(`✅ Verified permanent Platform Admin (${PERMANENT_PLATFORM_ADMIN_EMAIL}) on HQ.`);
            }
        } else {
            const bootstrapSecret =
                founderPassword || crypto.randomBytes(48).toString('base64url');
            const passwordHash = await hash(bootstrapSecret, 12);
            const insertedOwner = await client.query<{ id: string }>(
                `INSERT INTO users (tenant_id, email, email_enc, password_hash, first_name, last_name, role, is_active)
                 VALUES ($1, $2, $3, $4, 'Aditya', 'Singh', 'PLATFORM_ADMIN', true)
                 RETURNING id`,
                [
                    hqTenantId,
                    hasPiiKey ? null : PERMANENT_PLATFORM_ADMIN_EMAIL,
                    encryptedOwnerEmail,
                    passwordHash,
                ],
            );
            ownerUserId = insertedOwner.rows[0].id;
            console.log(
                founderPassword
                    ? `✅ Created permanent Platform Admin (${PERMANENT_PLATFORM_ADMIN_EMAIL}) with configured FOUNDER_PASSWORD.`
                    : `✅ Provisioned permanent Platform Admin (${PERMANENT_PLATFORM_ADMIN_EMAIL}) on HQ (set FOUNDER_PASSWORD + ROTATE_FOUNDER_PASSWORD=true to set password credential, or sign in via verified SSO).`,
            );
        }

        // 4. Deactivate any legacy non-owner PLATFORM_ADMIN accounts on HQ (e.g. old founder@scholarmind.com)
        await client.query(
            `UPDATE users
             SET is_active = false,
                 updated_at = NOW()
             WHERE role = 'PLATFORM_ADMIN'
               AND id <> $1
               AND is_active = true`,
            [ownerUserId],
        );

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

setup().catch((err) => {
    console.error('❌ Platform Admin bootstrap failed:', err);
    process.exit(1);
});

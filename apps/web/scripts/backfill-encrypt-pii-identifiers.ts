/**
 * One-off backfill for the PII encryption pilot (migration 0009).
 *
 * Copies each existing plaintext national identifier into its `<col>_enc` column as
 * deterministic ciphertext and NULLs the plaintext, for:
 *   students.apaar_id → apaar_id_enc
 *   students.aadhaar_number → aadhaar_number_enc
 *   staff_profiles.aadhaar_number → aadhaar_number_enc
 *
 * Idempotent (skips rows already migrated) and safe to re-run. Run once per
 * environment AFTER 0009 is applied, with PII_ENCRYPTION_KEY set:
 *   DATABASE_URL=… PII_ENCRYPTION_KEY=… \
 *     pnpm --filter @school-sis/web exec tsx scripts/backfill-encrypt-pii-identifiers.ts
 */
import { Pool } from 'pg';
import { resolveDatabaseConnectionOptions } from '../../../packages/api/src/db/ssl';
import { encryptIdNumber, encryptDeterministic, encryptEmail } from '@/lib/encryption';

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) {
    console.error('❌ DIRECT_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL is required.');
    process.exit(1);
}

const pool = new Pool({ ...resolveDatabaseConnectionOptions(connectionString), max: 4 });

// Table/column names are fixed constants below — never interpolate untrusted input.
// `encrypt` is the field's own policy: id numbers normalise (encryptIdNumber, for the
// equality dedup); free-text contact values preserve their exact form
// (encryptDeterministic), since nothing looks them up by value.
const TARGETS = [
    { table: 'students', plain: 'apaar_id', enc: 'apaar_id_enc', encrypt: encryptIdNumber },
    { table: 'students', plain: 'aadhaar_number', enc: 'aadhaar_number_enc', encrypt: encryptIdNumber },
    { table: 'staff_profiles', plain: 'aadhaar_number', enc: 'aadhaar_number_enc', encrypt: encryptIdNumber },
    { table: 'visitors', plain: 'phone', enc: 'phone_enc', encrypt: (value: string) => encryptDeterministic(value, 'visitors.phone') },
    { table: 'visitors', plain: 'email', enc: 'email_enc', encrypt: (value: string) => encryptDeterministic(value, 'visitors.email') },
    { table: 'guardians', plain: 'phone', enc: 'phone_enc', encrypt: (value: string) => encryptDeterministic(value, 'guardians.phone') },
    { table: 'guardians', plain: 'email', enc: 'email_enc', encrypt: (value: string) => encryptDeterministic(value, 'guardians.email') },
    { table: 'guardians', plain: 'alternate_phone', enc: 'alternate_phone_enc', encrypt: (value: string) => encryptDeterministic(value, 'guardians.alternate-phone') },
    // alumni email keeps a case-insensitive uniqueness check → encryptEmail (normalising).
    { table: 'alumni_profiles', plain: 'email', enc: 'email_enc', encrypt: encryptEmail },
    { table: 'alumni_profiles', plain: 'phone', enc: 'phone_enc', encrypt: (value: string) => encryptDeterministic(value, 'alumni-profiles.phone') },
    { table: 'host_families', plain: 'phone', enc: 'phone_enc', encrypt: (value: string) => encryptDeterministic(value, 'host-families.phone') },
    { table: 'health_records', plain: 'emergency_phone', enc: 'emergency_phone_enc', encrypt: (value: string) => encryptDeterministic(value, 'health-records.emergency-phone') },
    { table: 'health_records', plain: 'doctor_phone', enc: 'doctor_phone_enc', encrypt: (value: string) => encryptDeterministic(value, 'health-records.doctor-phone') },
    // users.email is the LOGIN identifier — encryptEmail (normalising) so every login
    // lookup's encryptEmail(input) matches the stored value. Highest-risk; verify sign-in.
    { table: 'users', plain: 'email', enc: 'email_enc', encrypt: encryptEmail },
    { table: 'marketing_leads', plain: 'contact_email', enc: 'contact_email_enc', encrypt: encryptEmail },
] as const;

const BATCH = 500;

async function backfill(target: (typeof TARGETS)[number]): Promise<number> {
    const { table, plain, enc } = target;
    let migrated = 0;
    for (;;) {
        const { rows } = await pool.query(
            `SELECT id, ${plain} AS value FROM ${table}
             WHERE ${plain} IS NOT NULL AND btrim(${plain}) <> '' AND ${enc} IS NULL
             LIMIT ${BATCH}`,
        );
        if (rows.length === 0) break;
        for (const row of rows) {
            await pool.query(`UPDATE ${table} SET ${enc} = $1, ${plain} = NULL WHERE id = $2`, [
                target.encrypt(String(row.value)),
                row.id,
            ]);
            migrated += 1;
        }
        console.info(`  … ${table}.${plain}: ${migrated} encrypted so far`);
    }
    return migrated;
}

async function main(): Promise<void> {
    console.info('🔐 Backfilling encrypted national identifiers…');
    let total = 0;
    for (const target of TARGETS) {
        const n = await backfill(target);
        console.info(`✓ ${target.table}.${target.plain}: ${n} value(s) encrypted`);
        total += n;
    }
    console.info(`Done — ${total} value(s) encrypted.`);
    await pool.end();
}

main().catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
});

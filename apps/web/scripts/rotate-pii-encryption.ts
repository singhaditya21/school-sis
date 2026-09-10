import { Pool, type PoolClient } from 'pg';
import { resolveDatabaseConnectionOptions } from '../../../packages/api/src/db/ssl';
import {
    decryptStrict,
    encrypt,
    encryptDeterministic,
    encryptEmail,
    encryptIdNumber,
    getPiiEncryptionKeyStatus,
} from '@/lib/encryption';

type RotationTarget = {
    table: string;
    column: string;
    currentPrefix: (keyId: string) => string;
    encrypt: (plaintext: string) => string;
};

const deterministicTarget = (
    table: string,
    column: string,
    purpose: string,
    encryptValue: (plaintext: string) => string = (plaintext) => encryptDeterministic(plaintext, purpose),
): RotationTarget => ({
    table,
    column,
    currentPrefix: (keyId) => `det.v2:${keyId}:${purpose}:`,
    encrypt: encryptValue,
});

const TARGETS: RotationTarget[] = [
    deterministicTarget('students', 'apaar_id_enc', 'id-number', encryptIdNumber),
    deterministicTarget('students', 'aadhaar_number_enc', 'id-number', encryptIdNumber),
    deterministicTarget('staff_profiles', 'aadhaar_number_enc', 'id-number', encryptIdNumber),
    deterministicTarget('visitors', 'phone_enc', 'visitors.phone'),
    deterministicTarget('visitors', 'email_enc', 'visitors.email'),
    deterministicTarget('guardians', 'phone_enc', 'guardians.phone'),
    deterministicTarget('guardians', 'email_enc', 'guardians.email'),
    deterministicTarget('guardians', 'alternate_phone_enc', 'guardians.alternate-phone'),
    deterministicTarget('alumni_profiles', 'email_enc', 'email', encryptEmail),
    deterministicTarget('alumni_profiles', 'phone_enc', 'alumni-profiles.phone'),
    deterministicTarget('host_families', 'phone_enc', 'host-families.phone'),
    deterministicTarget('health_records', 'emergency_phone_enc', 'health-records.emergency-phone'),
    deterministicTarget('health_records', 'doctor_phone_enc', 'health-records.doctor-phone'),
    deterministicTarget('users', 'email_enc', 'email', encryptEmail),
    deterministicTarget('marketing_leads', 'contact_email_enc', 'email', encryptEmail),
    {
        table: 'users',
        column: 'mfa_secret',
        currentPrefix: (keyId) => `rnd.v2:${keyId}:`,
        encrypt,
    },
];

function parseBatchSize(): number {
    const argument = process.argv.find((value) => value.startsWith('--batch-size='));
    if (!argument) return 250;
    const parsed = Number(argument.slice('--batch-size='.length));
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2_000) {
        throw new Error('--batch-size must be an integer between 1 and 2000.');
    }
    return parsed;
}

async function countPending(client: PoolClient | Pool, target: RotationTarget, prefix: string): Promise<number> {
    const result = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM ${target.table}
          WHERE ${target.column} IS NOT NULL
            AND ${target.column} <> ''
            AND ${target.column} NOT LIKE $1`,
        [`${prefix}%`],
    );
    return Number(result.rows[0]?.count || 0);
}

async function rotateBatch(
    pool: Pool,
    target: RotationTarget,
    prefix: string,
    batchSize: number,
): Promise<number> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query<{ id: string; ciphertext: string }>(
            `SELECT id::text AS id, ${target.column} AS ciphertext
               FROM ${target.table}
              WHERE ${target.column} IS NOT NULL
                AND ${target.column} <> ''
                AND ${target.column} NOT LIKE $1
              ORDER BY id
              FOR UPDATE SKIP LOCKED
              LIMIT $2`,
            [`${prefix}%`, batchSize],
        );

        for (const row of result.rows) {
            const plaintext = decryptStrict(row.ciphertext);
            const replacement = target.encrypt(plaintext);
            const update = await client.query(
                `UPDATE ${target.table}
                    SET ${target.column} = $1
                  WHERE id = $2
                    AND ${target.column} = $3`,
                [replacement, row.id, row.ciphertext],
            );
            if (update.rowCount !== 1) {
                throw new Error(`Concurrent update detected for ${target.table}.${target.column} id=${row.id}.`);
            }
        }

        await client.query('COMMIT');
        return result.rows.length;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function main(): Promise<void> {
    const execute = process.argv.includes('--execute');
    const assertCurrent = process.argv.includes('--assert-current');
    const batchSize = parseBatchSize();
    const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DIRECT_URL, DATABASE_URL_UNPOOLED, or DATABASE_URL is required.');
    }

    const keyStatus = getPiiEncryptionKeyStatus();
    if (keyStatus.legacyFallbackInUse) {
        throw new Error('PII_ENCRYPTION_KEY must be set explicitly before rotating data.');
    }

    console.info(`PII key: ${keyStatus.currentKeyId}`);
    console.info(`Previous key configured: ${keyStatus.rotationActive ? 'yes' : 'no'}`);
    console.info(`Mode: ${execute ? 'execute' : 'dry-run'}`);

    const pool = new Pool({ ...resolveDatabaseConnectionOptions(connectionString), max: 2 });
    try {
        let totalPending = 0;
        for (const target of TARGETS) {
            const prefix = target.currentPrefix(keyStatus.currentKeyId);
            const pending = await countPending(pool, target, prefix);
            totalPending += pending;
            console.info(`${target.table}.${target.column}: ${pending} pending`);

            if (!execute || pending === 0) continue;
            let rotated = 0;
            for (;;) {
                const batch = await rotateBatch(pool, target, prefix, batchSize);
                if (batch === 0) break;
                rotated += batch;
                console.info(`  ${rotated}/${pending} rotated`);
            }

            const remaining = await countPending(pool, target, prefix);
            if (remaining !== 0) {
                throw new Error(`${target.table}.${target.column} still has ${remaining} values on an older key.`);
            }
        }

        if (assertCurrent && totalPending > 0) {
            throw new Error(`${totalPending} encrypted value(s) are not on the current PII key.`);
        }
        if (!execute && totalPending > 0) {
            console.info(`Dry-run complete: ${totalPending} value(s) require rotation. Re-run with --execute.`);
        } else {
            console.info(`Rotation verification complete: ${execute ? 0 : totalPending} value(s) remain.`);
        }
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error('PII encryption rotation failed:', error);
    process.exitCode = 1;
});

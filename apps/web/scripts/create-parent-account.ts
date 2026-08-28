/**
 * Give a real guardian a working parent-portal login.
 *
 * The parent portal shows a guardian their children through guardians.user_id —
 * the link from a guardian record to a PARENT user account. Nothing in the
 * product ever creates that link for a real guardian: admissions conversion
 * inserts a guardian with no user_id and no account, and the synthetic pilot
 * parents are deliberately locked. So a real guardian could never sign in.
 *
 * This creates a PARENT user for a student's PRIMARY guardian and sets the link,
 * the same operator-run way the branch admin is created. PARENT is not an
 * MFA-required role, so the guardian signs in with the school code, this email
 * and this password — no enrolment step.
 *
 *   pnpm --filter @school-sis/web exec tsx scripts/create-parent-account.ts \
 *     --tenant cambridge-spm-pilot --student ADM-0001 \
 *     --email parent@their-domain.example
 *
 *   # supply your own password / preview only:
 *     ... --password 'a-strong-passphrase'
 *     ... --dry-run
 */

import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';

interface Options {
    tenantCode: string;
    admissionNumber: string;
    email: string;
    password: string | null;
    dryRun: boolean;
}

function parseOptions(argv: string[]): Options {
    const get = (flag: string): string | null => {
        const i = argv.indexOf(flag);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
    };
    const tenantCode = get('--tenant');
    const admissionNumber = get('--student');
    const email = get('--email');
    if (!tenantCode || !admissionNumber || !email) {
        throw new Error(
            'Usage: create-parent-account.ts --tenant <code> --student <admission_number> --email <email> [--password P] [--dry-run]',
        );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new Error(`--email is not a valid address: ${email}`);
    }
    return {
        tenantCode,
        admissionNumber,
        email: email.toLowerCase(),
        password: get('--password'),
        dryRun: argv.includes('--dry-run'),
    };
}

async function main(): Promise<void> {
    const options = parseOptions(process.argv.slice(2));
    const password = options.password ?? randomBytes(18).toString('base64url');
    const generated = options.password === null;
    if (password.length < 12) throw new Error('--password must be at least 12 characters.');

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TENANT_PROVISIONING, async () => {
        const client = await pool.connect();
        try {
            const { rows: tenantRows } = await client.query<{ id: string; name: string }>(
                'SELECT id, name FROM tenants WHERE code = $1 LIMIT 1',
                [options.tenantCode],
            );
            if (tenantRows.length === 0) {
                throw new Error(`No tenant with code "${options.tenantCode}".`);
            }
            const tenant = tenantRows[0];

            const { rows: studentRows } = await client.query<{ id: string; name: string }>(
                `SELECT id, first_name || ' ' || last_name AS name
                 FROM students WHERE tenant_id = $1 AND admission_number = $2 LIMIT 1`,
                [tenant.id, options.admissionNumber],
            );
            if (studentRows.length === 0) {
                throw new Error(
                    `No student with admission number "${options.admissionNumber}" in ${tenant.name}.`,
                );
            }
            const student = studentRows[0];

            const { rows: guardianRows } = await client.query<{
                id: string;
                userId: string | null;
                name: string;
            }>(
                `SELECT id, user_id AS "userId", first_name || ' ' || last_name AS name
                 FROM guardians
                 WHERE tenant_id = $1 AND student_id = $2
                 ORDER BY is_primary DESC, created_at ASC
                 LIMIT 1`,
                [tenant.id, student.id],
            );
            if (guardianRows.length === 0) {
                throw new Error(`${student.name} has no guardian record to attach a login to.`);
            }
            const guardian = guardianRows[0];

            const { rows: existingByEmail } = await client.query<{ id: string }>(
                'SELECT id FROM users WHERE tenant_id = $1 AND lower(email) = $2 LIMIT 1',
                [tenant.id, options.email],
            );

            if (options.dryRun) {
                console.log(
                    `DRY RUN — would give ${guardian.name} (guardian of ${student.name}) a PARENT login as ${options.email}.`,
                );
                return;
            }

            let userId: string;
            if (existingByEmail.length > 0) {
                // Reuse an account already created for this email rather than
                // making a duplicate; just ensure it is linked.
                userId = existingByEmail[0].id;
            } else {
                const passwordHash = await hash(password, 12);
                const [firstName, ...rest] = guardian.name.split(' ');
                const { rows: created } = await client.query<{ id: string }>(
                    `INSERT INTO users
                       (tenant_id, email, password_hash, first_name, last_name, role, is_active, mfa_enabled)
                     VALUES ($1, $2, $3, $4, $5, 'PARENT', true, false)
                     RETURNING id`,
                    [tenant.id, options.email, passwordHash, firstName, rest.join(' ') || firstName],
                );
                userId = created[0].id;
            }

            await client.query('UPDATE guardians SET user_id = $1 WHERE id = $2', [userId, guardian.id]);

            console.log('');
            console.log(`Parent login ready for ${guardian.name} (guardian of ${student.name}).`);
            console.log('');
            console.log(`  school code : ${options.tenantCode}`);
            console.log(`  email       : ${options.email}`);
            if (existingByEmail.length > 0) {
                console.log('  password    : (existing account — password unchanged)');
            } else if (generated) {
                console.log(`  password    : ${password}`);
                console.log('');
                console.log('  ^ Shown once, not stored. Record it now.');
            } else {
                console.log('  password    : (the one you supplied)');
            }
        } finally {
            client.release();
        }
    });

    await pool.end();
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    void pool.end();
});

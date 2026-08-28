/**
 * Create the first administrator for an already-provisioned branch.
 *
 * provision-pilot-group.ts deliberately creates no administrator accounts — they
 * carry real passwords and must not be seeded with the rest of a synthetic
 * cohort. But /setup cannot fill the gap either: it only ever creates a BRAND-NEW
 * company and tenant, so pointing it at a `-pilot` branch would spin up an empty
 * tenant orphaned from the seeded data, not an admin who can see it.
 *
 * So the admin is created here, the same way the branch itself was: a script the
 * owner runs with production credentials. It writes one SCHOOL_ADMIN into an
 * EXISTING tenant, found by its code, and prints the login once.
 *
 * The admin is created WITHOUT two-factor enrolled. That is intended: on first
 * login the account is given a restricted session and sent to /mfa/setup to
 * enrol (see the MFA-enrolment path in loginActionV2). Being able to create an
 * admin at all requires database credentials, which is the real gate here.
 *
 *   pnpm --filter @school-sis/web exec tsx scripts/create-branch-admin.ts \
 *     --tenant cambridge-spm-pilot --email principal@cambridge-spm.example \
 *     --first Meera --last Nair
 *
 *   # supply your own password instead of a generated one:
 *     ... --password 'a-strong-passphrase'
 *   # see what it would do, touch nothing:
 *     ... --dry-run
 */

import { pool, runWithRlsBypass, RLS_BYPASS_JUSTIFICATIONS } from '@/lib/db';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';

interface Options {
    tenantCode: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string | null;
    dryRun: boolean;
}

function parseOptions(argv: string[]): Options {
    const get = (flag: string): string | null => {
        const i = argv.indexOf(flag);
        return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
    };
    const tenantCode = get('--tenant');
    const email = get('--email');
    const firstName = get('--first') ?? 'School';
    const lastName = get('--last') ?? 'Administrator';
    if (!tenantCode || !email) {
        throw new Error(
            'Usage: create-branch-admin.ts --tenant <code> --email <email> [--first N] [--last N] [--password P] [--dry-run]',
        );
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        throw new Error(`--email is not a valid address: ${email}`);
    }
    return {
        tenantCode,
        email: email.toLowerCase(),
        firstName,
        lastName,
        password: get('--password'),
        dryRun: argv.includes('--dry-run'),
    };
}

/** A readable, strong generated passphrase when none is supplied. */
function generatePassword(): string {
    // base64url of 18 random bytes → 24 chars, no ambiguous separators.
    return randomBytes(18).toString('base64url');
}

async function main(): Promise<void> {
    const options = parseOptions(process.argv.slice(2));
    const password = options.password ?? generatePassword();
    const generated = options.password === null;

    if (password.length < 12) {
        throw new Error('--password must be at least 12 characters.');
    }

    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TENANT_PROVISIONING, async () => {
        const client = await pool.connect();
        try {
            const { rows: tenantRows } = await client.query<{ id: string; name: string }>(
                'SELECT id, name FROM tenants WHERE code = $1 LIMIT 1',
                [options.tenantCode],
            );
            if (tenantRows.length === 0) {
                throw new Error(
                    `No tenant with code "${options.tenantCode}". Provision the branch first.`,
                );
            }
            const tenant = tenantRows[0];

            const { rows: existing } = await client.query<{ id: string; role: string }>(
                'SELECT id, role FROM users WHERE tenant_id = $1 AND lower(email) = $2 LIMIT 1',
                [tenant.id, options.email],
            );
            if (existing.length > 0) {
                // Idempotent: creating the same admin twice is a no-op, not an error
                // and not a second account.
                console.log(
                    `Already present: ${options.email} exists in ${tenant.name} as ${existing[0].role}. Nothing to do.`,
                );
                return;
            }

            if (options.dryRun) {
                console.log(
                    `DRY RUN — would create a SCHOOL_ADMIN ${options.email} in ${tenant.name} (${options.tenantCode}). No password is generated in a dry run.`,
                );
                return;
            }

            const passwordHash = await hash(password, 12);
            await client.query(
                `INSERT INTO users
                   (tenant_id, email, password_hash, first_name, last_name, role, is_active, mfa_enabled)
                 VALUES ($1, $2, $3, $4, $5, 'SCHOOL_ADMIN', true, false)`,
                [tenant.id, options.email, passwordHash, options.firstName, options.lastName],
            );

            console.log('');
            console.log(`Administrator created for ${tenant.name} (${options.tenantCode}).`);
            console.log('');
            console.log(`  school code : ${options.tenantCode}`);
            console.log(`  email       : ${options.email}`);
            if (generated) {
                console.log(`  password    : ${password}`);
                console.log('');
                console.log('  ^ This is shown once and is not stored. Record it now.');
            } else {
                console.log('  password    : (the one you supplied)');
            }
            console.log('');
            console.log('On first login the account is sent to /mfa/setup to enrol two-factor,');
            console.log('then it has full SCHOOL_ADMIN access to the branch.');
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

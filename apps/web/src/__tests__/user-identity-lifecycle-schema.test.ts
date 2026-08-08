import fs from 'node:fs';
import path from 'node:path';

function repoFile(relativePath: string): string {
    return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('user identity lifecycle schema and integration paths', () => {
    it('migrates a persisted session revision, expiring temporary credentials, and tenant-local case-insensitive uniqueness', () => {
        const migration = repoFile('drizzle/0002_unique_wolfsbane.sql');
        const schema = repoFile('../../packages/api/src/db/schema/core.ts');

        expect(migration).toContain('"auth_version" integer DEFAULT 1 NOT NULL');
        expect(migration).toContain('"password_change_required" boolean DEFAULT false NOT NULL');
        expect(migration).toContain('"temporary_password_expires_at" timestamp with time zone');
        expect(migration).toContain('duplicate_group_count');
        expect(migration).toContain('remediate each group, then rerun the migration');
        expect(migration).toContain(
            'CREATE UNIQUE INDEX "users_tenant_email_lower_key" ON "users" USING btree ("tenant_id",lower("email"))',
        );
        expect(schema).toContain("uniqueIndex('users_tenant_email_lower_key')");
        expect(schema).toContain('sql`lower(${table.email})`');
    });

    it('requires authVersion at the sole session-construction boundary and supplies it at every caller', () => {
        const identity = repoFile('src/lib/auth/identity.ts');
        expect(identity).toContain('authVersion: number;');
        expect(identity).toContain('session.authVersion = input.authVersion;');

        for (const relativePath of [
            'src/lib/actions/auth.ts',
            'src/lib/actions/onboarding.ts',
            'src/lib/actions/platform.ts',
            'src/app/api/lti/launch/route.ts',
        ]) {
            const source = repoFile(relativePath);
            const establishCalls = source.match(/establishSession\(session, \{/g) || [];
            const revisions = source.match(/authVersion:/g) || [];
            expect(establishCalls.length).toBeGreaterThan(0);
            expect(revisions.length).toBeGreaterThanOrEqual(establishCalls.length);
        }

        const sourceRoot = path.resolve(process.cwd(), 'src');
        const directSessionWriters: string[] = [];
        const visit = (directory: string) => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const absolute = path.join(directory, entry.name);
                if (entry.isDirectory() && entry.name !== '__tests__') visit(absolute);
                else if (/\.(?:ts|tsx)$/.test(entry.name)) {
                    const source = fs.readFileSync(absolute, 'utf8');
                    if (source.includes('session.isLoggedIn = true') && !absolute.endsWith('/lib/auth/identity.ts')) {
                        directSessionWriters.push(path.relative(sourceRoot, absolute));
                    }
                }
            }
        };
        visit(sourceRoot);
        expect(directSessionWriters).toEqual([]);
    });

    it('revokes sessions when SCIM changes persisted identity state', () => {
        const route = repoFile('src/app/api/scim/v2/Users/[id]/route.ts');
        expect(route).toContain('auth_version = auth_version + 1');
        expect(route).toContain('users_tenant_email_lower_key');
        expect(route).toContain("scimError('A user with this email already exists in this tenant.', 409, 'uniqueness')");
    });

    it('keeps the restricted-session identity accessor confined to password replacement', () => {
        const sourceRoot = path.resolve(process.cwd(), 'src');
        const consumers: string[] = [];
        const visit = (directory: string) => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const absolute = path.join(directory, entry.name);
                if (entry.isDirectory() && entry.name !== '__tests__') visit(absolute);
                else if (/\.(?:ts|tsx)$/.test(entry.name)) {
                    const source = fs.readFileSync(absolute, 'utf8');
                    if (source.includes('getPasswordChangeSession')) {
                        consumers.push(path.relative(sourceRoot, absolute));
                    }
                }
            }
        };
        visit(sourceRoot);

        expect(consumers.sort()).toEqual([
            'lib/actions/password.ts',
            'lib/auth/session.ts',
        ]);
    });

    it('keeps the MFA enrollment identity accessor confined to its dedicated action', () => {
        const sourceRoot = path.resolve(process.cwd(), 'src');
        const consumers: string[] = [];
        const visit = (directory: string) => {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                const absolute = path.join(directory, entry.name);
                if (entry.isDirectory() && entry.name !== '__tests__') visit(absolute);
                else if (/\.(?:ts|tsx)$/.test(entry.name)) {
                    const source = fs.readFileSync(absolute, 'utf8');
                    if (source.includes('getMfaEnrollmentSession')) {
                        consumers.push(path.relative(sourceRoot, absolute));
                    }
                }
            }
        };
        visit(sourceRoot);

        expect(consumers.sort()).toEqual([
            'lib/actions/mfa-enrollment.ts',
            'lib/auth/session.ts',
        ]);
    });

    it('binds impersonation to the actor revision and restores the actor through an explicit platform scope', () => {
        const sessionOptions = repoFile('src/lib/auth/session-options.ts');
        const validation = repoFile('src/lib/auth/session-validation.ts');
        const platformActions = repoFile('src/lib/actions/platform.ts');

        expect(sessionOptions).toContain('actorAuthVersion: number;');
        expect(validation).toContain('actorRow.authVersion !== actor.actorAuthVersion');
        expect(validation).toContain("actorRow.role !== 'PLATFORM_ADMIN'");
        expect(platformActions).toContain('actorAuthVersion: originalAuthVersion');
        expect(platformActions).toMatch(/runWithRlsBypass(?:<[^\n]+>)?\(/);
        expect(platformActions).toContain('RLS_BYPASS_JUSTIFICATIONS.PLATFORM_SESSION');
        expect(platformActions).toContain('AND u.tenant_id = $2');
        expect(platformActions).toContain('AND u.auth_version = $3');
    });
});

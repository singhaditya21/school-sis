import {
    resolveDatabaseConnectionOptions,
    resolveDatabaseCredentials,
    resolveDatabaseSsl,
} from '../../../../packages/api/src/db/ssl';

describe('database TLS policy', () => {
    it('disables TLS for local Postgres by default', () => {
        expect(resolveDatabaseSsl('postgresql://postgres@localhost:5432/school_sis', undefined)).toBeUndefined();
    });

    it('verifies certificates for remote Postgres by default', () => {
        expect(resolveDatabaseSsl('postgresql://user:pass@db.example.com/school_sis', undefined)).toEqual({
            rejectUnauthorized: true,
        });
    });

    it('requires an explicit compatibility waiver to skip certificate verification', () => {
        expect(resolveDatabaseSsl('postgresql://user:pass@db.example.com/school_sis', 'require')).toEqual({
            rejectUnauthorized: false,
        });
    });

    it('rejects disabling TLS for a remote database', () => {
        expect(() => resolveDatabaseSsl('postgresql://user:pass@db.example.com/school_sis', 'disable')).toThrow(
            'allowed only for a local database',
        );
    });

    it('rejects unknown SSL modes', () => {
        expect(() => resolveDatabaseSsl('postgresql://user:pass@db.example.com/school_sis', 'prefer')).toThrow(
            'DATABASE_SSL_MODE',
        );
    });

    it('removes connection-string sslmode so it cannot override certificate verification', () => {
        const config = resolveDatabaseConnectionOptions(
            'postgresql://user:pass@db.example.com/school_sis?sslmode=require&application_name=school-sis',
            'verify-full',
        );

        expect(config.ssl).toEqual({ rejectUnauthorized: true });
        expect(config.connectionString).not.toContain('sslmode=');
        expect(config.connectionString).toContain('application_name=school-sis');
    });

    it('removes libpq compatibility flags that could weaken the explicit SSL mode', () => {
        const config = resolveDatabaseConnectionOptions(
            'postgresql://user:pass@db.example.com/school_sis?uselibpqcompat=true&sslmode=require',
            'verify-full',
        );

        expect(config.ssl).toEqual({ rejectUnauthorized: true });
        expect(config.connectionString).not.toContain('uselibpqcompat');
        expect(config.connectionString).not.toContain('sslmode=');
    });

    it('gives migration tooling parsed credentials with the same verify-full policy', () => {
        const credentials = resolveDatabaseCredentials(
            'postgresql://encoded%40user:p%40ss@db.example.com:6543/school_sis?sslmode=require',
            'verify-full',
        );

        expect(credentials).toEqual({
            host: 'db.example.com',
            port: 6543,
            user: 'encoded@user',
            password: 'p@ss',
            database: 'school_sis',
            ssl: { rejectUnauthorized: true },
        });
    });

    it('rejects incomplete migration connection strings', () => {
        expect(() => resolveDatabaseCredentials(
            'postgresql://user:pass@db.example.com',
            'verify-full',
        )).toThrow('host, port, and database name');
    });
});

describe('malformed connection strings never reach a log', () => {
    /**
     * `new URL()` throws a TypeError carrying the offending string on `err.input`,
     * so console.error(err), util.inspect(err), JSON.stringify(err) and Node's own
     * uncaught-exception banner all print the password verbatim.
     *
     * GitHub Actions masks registered secrets, which hid this in CI — a release log
     * showed `input: '[SENSITIVE]'`. Vercel's runtime logs do not mask, and
     * resolveDatabaseConnectionOptions is on the runtime path.
     */
    const SECRET = 'npg_thisIsTheProductionPassword';
    // The psql snippet Neon's Connect dialog offers: a leading command word makes
    // it unparseable, which is exactly how a real deployment reaches this path.
    const malformed = `psql 'postgresql://school_sis_platform:${SECRET}@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb'`;

    it('raises an error that does not carry the connection string', () => {
        let caught: unknown;
        try {
            resolveDatabaseConnectionOptions(malformed);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(Error);
        // Every channel an error realistically escapes through.
        expect((caught as Error).message).not.toContain(SECRET);
        expect(String(caught)).not.toContain(SECRET);
        expect(JSON.stringify(caught)).not.toContain(SECRET);
        expect(require('node:util').inspect(caught)).not.toContain(SECRET);
        // `input` is the own property Node attaches and the one that leaked.
        expect(Object.keys(caught as object)).not.toContain('input');
    });

    it('still rejects it, rather than passing a bad string through', () => {
        expect(() => resolveDatabaseConnectionOptions(malformed)).toThrow(
            'The database connection string is not a valid URL.',
        );
    });
});

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

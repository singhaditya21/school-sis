import type { Pool, PoolClient } from 'pg';
import {
    getCurrentDbContext,
    patchPoolForRlsContext,
    registerDbRlsContextResolver,
    RLS_BYPASS_JUSTIFICATIONS,
    runWithRlsBypass,
    runWithTenantContext,
} from '@/lib/db';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

function fakePool(queryImplementation?: (...args: unknown[]) => Promise<unknown>) {
    const rawQuery = jest.fn(queryImplementation || (async () => ({ rows: [] })));
    const releases: jest.Mock[] = [];
    const client = { query: rawQuery, release: jest.fn() } as unknown as PoolClient;
    const rawConnect = jest.fn(async () => {
        const release = jest.fn();
        releases.push(release);
        client.release = release as PoolClient['release'];
        return client;
    });
    const rawPool = {
        connect: rawConnect,
        query: jest.fn(),
    } as unknown as Pool;
    return {
        pool: patchPoolForRlsContext(rawPool),
        rawConnect,
        rawQuery,
        releases,
    };
}

const TENANT_SET_LOCAL =
    "SELECT set_config('app.current_tenant', $1, true), set_config('app.bypass_rls', 'off', true)";
const BYPASS_SET_LOCAL =
    "SELECT set_config('app.current_tenant', '', true), set_config('app.bypass_rls', 'on', true)";

describe('database tenant context', () => {
    afterEach(() => {
        registerDbRlsContextResolver(undefined);
    });

    it('scopes async work to the active tenant and restores the outer context', async () => {
        expect(getCurrentDbContext()).toBeUndefined();

        await runWithTenantContext(TENANT_ID, async () => {
            expect(getCurrentDbContext()).toEqual({ tenantId: TENANT_ID });

            await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TEST_CONTEXT_NESTING, async () => {
                expect(getCurrentDbContext()).toEqual({
                    bypassRls: true,
                    justification: RLS_BYPASS_JUSTIFICATIONS.TEST_CONTEXT_NESTING,
                });
            });

            expect(getCurrentDbContext()).toEqual({ tenantId: TENANT_ID });
        });

        expect(getCurrentDbContext()).toBeUndefined();
    });

    it('rejects invalid tenant and unreviewed bypass contexts before querying', async () => {
        await expect(runWithTenantContext('not-a-uuid', async () => 'unreachable'))
            .rejects.toThrow('Invalid tenant context');
        const unreviewed = { id: 'test.unreviewed', reason: 'not registered' };
        await expect(runWithRlsBypass(unreviewed as never, async () => 'unreachable'))
            .rejects.toThrow('RLS bypass requires a reviewed justification');
    });

    it('uses SET LOCAL inside an explicit tenant transaction', async () => {
        const { pool, rawQuery, releases } = fakePool(async (query) => (
            query === 'SELECT id FROM students' ? { rows: [{ id: 'student-1' }] } : { rows: [] }
        ));

        await runWithTenantContext(TENANT_ID, async () => {
            const client = await pool.connect();
            await client.query('BEGIN');
            await expect(client.query('SELECT id FROM students')).resolves.toEqual({
                rows: [{ id: 'student-1' }],
            });
            await client.query('COMMIT');
            client.release();
        });

        expect(rawQuery.mock.calls).toEqual([
            ['BEGIN'],
            [TENANT_SET_LOCAL, [TENANT_ID]],
            ['SELECT id FROM students'],
            ['COMMIT'],
        ]);
        expect(releases[0]).toHaveBeenCalledWith(undefined);
    });

    it('wraps each standalone protected query in its own pooler-safe transaction', async () => {
        const { pool, rawQuery, releases } = fakePool(async (query) => (
            typeof query === 'object'
                && query !== null
                && (query as { name?: string }).name === 'tenant-students'
                ? { rows: [{ id: 'student-1' }] }
                : { rows: [] }
        ));
        const query = { name: 'tenant-students', text: 'SELECT id FROM students', values: [] };

        await runWithTenantContext(TENANT_ID, async () => {
            await expect(pool.query(query)).resolves.toEqual({ rows: [{ id: 'student-1' }] });
            await pool.query('SELECT count(*) FROM students');
        });

        expect(rawQuery.mock.calls).toEqual([
            ['BEGIN'],
            [TENANT_SET_LOCAL, [TENANT_ID]],
            [query],
            ['COMMIT'],
            ['BEGIN'],
            [TENANT_SET_LOCAL, [TENANT_ID]],
            ['SELECT count(*) FROM students'],
            ['COMMIT'],
        ]);
        expect(releases).toHaveLength(2);
        expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
    });

    it('uses a reviewed bypass only within the same transaction as the query', async () => {
        const { pool, rawQuery } = fakePool();

        await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.TEST_CONTEXT_NESTING, () => (
            pool.query('SELECT count(*) FROM tenants')
        ));

        expect(rawQuery.mock.calls).toEqual([
            ['BEGIN'],
            [BYPASS_SET_LOCAL],
            ['SELECT count(*) FROM tenants'],
            ['COMMIT'],
        ]);
    });

    it('rolls back a failed standalone query before releasing the client', async () => {
        const queryError = new Error('business query failed');
        const { pool, rawQuery, releases } = fakePool(async (query) => {
            if (query === 'SELECT broken') throw queryError;
            return { rows: [] };
        });

        await expect(runWithTenantContext(TENANT_ID, () => pool.query('SELECT broken')))
            .rejects.toBe(queryError);
        expect(rawQuery.mock.calls.map((call) => call[0])).toEqual([
            'BEGIN',
            TENANT_SET_LOCAL,
            'SELECT broken',
            'ROLLBACK',
        ]);
        expect(releases[0]).toHaveBeenCalledTimes(1);
    });

    it('rolls back when SET LOCAL fails without leaking the checkout', async () => {
        const contextError = new Error('set_config failed');
        const { pool, rawQuery, releases } = fakePool(async (query) => {
            if (query === TENANT_SET_LOCAL) throw contextError;
            return { rows: [] };
        });

        await expect(runWithTenantContext(TENANT_ID, () => pool.query('SELECT protected')))
            .rejects.toBe(contextError);
        expect(rawQuery.mock.calls.map((call) => call[0])).toEqual([
            'BEGIN',
            TENANT_SET_LOCAL,
            'ROLLBACK',
        ]);
        expect(releases[0]).toHaveBeenCalledTimes(1);
    });

    it('destroys the checkout after an ambiguous commit failure', async () => {
        const commitError = new Error('commit failed');
        const { pool, rawQuery, releases } = fakePool(async (query) => {
            if (query === 'COMMIT') throw commitError;
            return query === 'SELECT protected' ? { rows: [{ ok: true }] } : { rows: [] };
        });

        await expect(runWithTenantContext(TENANT_ID, () => pool.query('SELECT protected')))
            .rejects.toBe(commitError);
        expect(rawQuery.mock.calls.map((call) => call[0])).toEqual([
            'BEGIN',
            TENANT_SET_LOCAL,
            'SELECT protected',
            'COMMIT',
            'ROLLBACK',
        ]);
        expect(releases[0]).toHaveBeenCalledWith(commitError);
    });

    it('rolls back a forgotten explicit transaction before returning the client', async () => {
        const { pool, rawQuery, releases } = fakePool();

        await runWithTenantContext(TENANT_ID, async () => {
            const client = await pool.connect();
            await client.query('BEGIN');
            await client.query('SELECT id FROM students');
            client.release();
        });
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(rawQuery).toHaveBeenLastCalledWith('ROLLBACK');
        expect(releases[0]).toHaveBeenCalledTimes(1);
    });

    it('resolves tenant context at query time after an async authentication boundary', async () => {
        const { pool, rawQuery } = fakePool(async (query) => (
            query === 'SELECT id FROM students' ? { rows: [{ id: 'student-1' }] } : { rows: [] }
        ));
        registerDbRlsContextResolver(async () => {
            await Promise.resolve();
            return { tenantId: TENANT_ID };
        });

        await Promise.resolve();
        await expect(pool.query('SELECT id FROM students')).resolves.toEqual({
            rows: [{ id: 'student-1' }],
        });
        expect(rawQuery.mock.calls[1]).toEqual([TENANT_SET_LOCAL, [TENANT_ID]]);
    });

    it('does not check out a client when the request context resolver rejects', async () => {
        const { pool, rawConnect } = fakePool();
        const resolverError = new Error('request context unavailable');
        registerDbRlsContextResolver(async () => {
            throw resolverError;
        });

        await expect(pool.connect()).rejects.toBe(resolverError);
        expect(rawConnect).not.toHaveBeenCalled();
    });

    it('rejects a context change during an explicit transaction', async () => {
        const secondTenant = '00000000-0000-4000-8000-000000000099';
        let resolvedTenant = TENANT_ID;
        registerDbRlsContextResolver(() => ({ tenantId: resolvedTenant }));
        const { pool, rawQuery, releases } = fakePool();
        const client = await pool.connect();

        await client.query('BEGIN');
        resolvedTenant = secondTenant;
        await expect(client.query('SELECT protected')).rejects.toThrow(/context changed/);
        client.release();
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(rawQuery).toHaveBeenLastCalledWith('ROLLBACK');
        expect(releases[0]).toHaveBeenCalledTimes(1);
    });

    it('commits before invoking a pool.query callback', async () => {
        const { pool, rawQuery } = fakePool(async (query) => (
            query === 'SELECT callback_result' ? { rows: [{ ok: true }] } : { rows: [] }
        ));

        await runWithTenantContext(TENANT_ID, () => new Promise<void>((resolve, reject) => {
            pool.query('SELECT callback_result', (error, result) => {
                if (error) return reject(error);
                expect(result.rows).toEqual([{ ok: true }]);
                expect(rawQuery).toHaveBeenLastCalledWith('COMMIT');
                resolve();
            });
        }));
    });
});

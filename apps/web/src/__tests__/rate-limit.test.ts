type AtomicState = {
    count: number;
    firstAttempt: number;
    lockedUntil: number | null;
};

function consumeAtomicState(
    states: Map<string, AtomicState>,
    key: string,
    now: number,
    windowMs: number,
    lockoutMs: number,
    maxAttempts: number,
) {
    const current = states.get(key);
    let next: AtomicState;
    let throttled = false;

    if (current?.lockedUntil && current.lockedUntil > now) {
        next = { ...current };
        throttled = true;
    } else if (!current || current.lockedUntil !== null || now - current.firstAttempt > windowMs) {
        next = { count: 1, firstAttempt: now, lockedUntil: null };
    } else if (current.count >= maxAttempts) {
        next = { ...current, lockedUntil: now + lockoutMs };
        throttled = true;
    } else {
        next = { ...current, count: current.count + 1 };
    }

    states.set(key, next);
    return { next, throttled };
}

describe('auth rate limiting', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const originalBackend = process.env.RATE_LIMIT_BACKEND;
    const originalMemoryMaxEntries = process.env.RATE_LIMIT_MEMORY_MAX_ENTRIES;

    function restoreEnv(name: string, value: string | undefined) {
        if (value === undefined) {
            delete process.env[name];
            return;
        }
        process.env[name] = value;
    }

    function mockLogger() {
        const logError = jest.fn();
        jest.doMock('@/lib/observability/logger', () => ({
            logger: {
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: logError,
                critical: jest.fn(),
            },
        }));
        return logError;
    }

    beforeEach(() => {
        jest.resetModules();
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        delete process.env.RATE_LIMIT_BACKEND;
        delete process.env.RATE_LIMIT_MEMORY_MAX_ENTRIES;
        process.env.NODE_ENV = 'test';
    });

    afterEach(() => {
        jest.dontMock('@/lib/db');
        jest.dontMock('@/lib/observability/logger');
        jest.dontMock('@upstash/redis');
        restoreEnv('NODE_ENV', originalNodeEnv);
        restoreEnv('UPSTASH_REDIS_REST_URL', originalRedisUrl);
        restoreEnv('UPSTASH_REDIS_REST_TOKEN', originalRedisToken);
        restoreEnv('RATE_LIMIT_BACKEND', originalBackend);
        restoreEnv('RATE_LIMIT_MEMORY_MAX_ENTRIES', originalMemoryMaxEntries);
    });

    async function importWithPostgresQuery(query: jest.Mock) {
        process.env.RATE_LIMIT_BACKEND = 'postgres';
        const logError = mockLogger();
        jest.doMock('@/lib/db', () => ({
            pool: { query },
            RLS_BYPASS_JUSTIFICATIONS: { RATE_LIMIT_BUCKETS: {} },
            runWithRlsBypass: (_justification: unknown, fn: () => Promise<unknown>) => fn(),
            runWithTenantContext: (_tenantId: string, fn: () => Promise<unknown>) => fn(),
        }));
        const limiter = await import('@/lib/auth/rate-limit');
        limiter.resetRateLimitMemoryForTests();
        return { limiter, logError };
    }

    async function importWithRedisClient(client: Record<string, jest.Mock>) {
        process.env.RATE_LIMIT_BACKEND = 'redis';
        process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
        const logError = mockLogger();
        jest.doMock('@upstash/redis', () => ({
            Redis: jest.fn().mockImplementation(() => client),
        }));
        const limiter = await import('@/lib/auth/rate-limit');
        limiter.resetRateLimitMemoryForTests();
        return { limiter, logError };
    }

    function createAtomicRedisClient() {
        const states = new Map<string, AtomicState>();
        return {
            eval: jest.fn((_: string, keys: string[], args: string[]) => {
                const now = Number(args[0]);
                const result = consumeAtomicState(
                    states,
                    keys[0],
                    now,
                    Number(args[1]),
                    Number(args[2]),
                    Number(args[3]),
                );
                return Promise.resolve([
                    result.throttled ? 1 : 0,
                    result.next.count,
                    result.next.firstAttempt,
                    result.next.lockedUntil ?? 0,
                ]);
            }),
            del: jest.fn((key: string) => {
                states.delete(key);
                return Promise.resolve(1);
            }),
        };
    }

    function createAtomicPostgresQuery() {
        const states = new Map<string, AtomicState>();
        return jest.fn((sql: unknown, parameters?: unknown[]) => {
            const text = String(sql);
            if (text.includes('DELETE FROM rate_limit_buckets WHERE expires_at')) {
                return Promise.resolve({ rows: [], rowCount: 0 });
            }
            if (text.includes('DELETE FROM rate_limit_buckets WHERE "key"')) {
                states.delete(String(parameters?.[0]));
                return Promise.resolve({ rows: [], rowCount: 1 });
            }
            if (text.includes('INSERT INTO rate_limit_buckets AS buckets')) {
                const key = String(parameters?.[0]);
                const now = (parameters?.[1] as Date).getTime();
                const maxAttempts = Number(parameters?.[3]);
                const result = consumeAtomicState(states, key, now, 15 * 60 * 1000, 15 * 60 * 1000, maxAttempts);
                return Promise.resolve({
                    rows: [{
                        count: result.next.count,
                        window_start: new Date(result.next.firstAttempt),
                        locked_until: result.next.lockedUntil ? new Date(result.next.lockedUntil) : null,
                        throttled: result.throttled,
                    }],
                    rowCount: 1,
                });
            }
            throw new Error(`Unexpected Postgres rate-limit query: ${text}`);
        });
    }

    it('consumes login attempts before authentication and clears the bucket after success', async () => {
        const { clearRateLimit, consumeLoginRateLimit, getRateLimitBackendName } = await import('@/lib/auth/rate-limit');
        const identifier = `student-${Date.now()}@example.com`;

        expect(getRateLimitBackendName()).toBe('memory');
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await expect(consumeLoginRateLimit(identifier)).resolves.toBeNull();
        }
        await expect(consumeLoginRateLimit(identifier)).resolves.toContain('Too many login attempts');

        await clearRateLimit(identifier);
        await expect(consumeLoginRateLimit(identifier)).resolves.toBeNull();
    });

    it('admits at most one concurrent request with maxAttempts=1 in memory', async () => {
        const limiter = await import('@/lib/auth/rate-limit');
        const options = {
            scope: 'memory-concurrency',
            maxAttempts: 1,
            endpointClass: 'public-write' as const,
            message: 'limited',
        };

        const decisions = await Promise.all(
            Array.from({ length: 20 }, () => limiter.consumeRateLimit('203.0.113.10', options)),
        );

        expect(decisions.filter((decision) => decision === null)).toHaveLength(1);
        expect(decisions.filter((decision) => decision === 'limited')).toHaveLength(19);
    });

    it('bounds in-process state and fails closed for new keys at capacity', async () => {
        process.env.RATE_LIMIT_MEMORY_MAX_ENTRIES = '2';
        const limiter = await import('@/lib/auth/rate-limit');
        const options = {
            scope: 'bounded-memory',
            maxAttempts: 5,
            endpointClass: 'public-write' as const,
            message: 'limited',
        };

        await expect(limiter.consumeRateLimit('first', options)).resolves.toBeNull();
        await expect(limiter.consumeRateLimit('second', options)).resolves.toBeNull();
        await expect(limiter.consumeRateLimit('third', options)).resolves.toBe('limited');

        const { register } = await import('prom-client');
        const metrics = await register.metrics();
        expect(metrics).toContain('school_sis_rate_limit_fallback_capacity_exhaustions_total');
    });

    it('uses Redis EVAL atomically under concurrent requests', async () => {
        const client = createAtomicRedisClient();
        const { limiter } = await importWithRedisClient(client);
        const options = {
            scope: 'redis-concurrency',
            maxAttempts: 1,
            endpointClass: 'authenticated-internal' as const,
            message: 'limited',
        };

        const decisions = await Promise.all(
            Array.from({ length: 20 }, () => limiter.consumeRateLimit('tenant:user', options)),
        );

        expect(decisions.filter((decision) => decision === null)).toHaveLength(1);
        expect(decisions.filter((decision) => decision === 'limited')).toHaveLength(19);
        expect(client.eval).toHaveBeenCalledTimes(20);
    });

    it('uses one atomic Postgres upsert under concurrent requests', async () => {
        const query = createAtomicPostgresQuery();
        const { limiter } = await importWithPostgresQuery(query);
        const options = {
            scope: 'postgres-concurrency',
            maxAttempts: 1,
            endpointClass: 'authenticated-internal' as const,
            message: 'limited',
        };

        const decisions = await Promise.all(
            Array.from({ length: 20 }, () => limiter.consumeRateLimit('tenant:user', options)),
        );

        expect(decisions.filter((decision) => decision === null)).toHaveLength(1);
        expect(decisions.filter((decision) => decision === 'limited')).toHaveLength(19);
        expect(query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO rate_limit_buckets AS buckets')))
            .toHaveLength(20);
    });

    it('honors an explicit Postgres backend even when Upstash credentials are present', async () => {
        process.env.RATE_LIMIT_BACKEND = 'postgres';
        process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.test';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

        const { getRateLimitBackendName } = await import('@/lib/auth/rate-limit');

        expect(getRateLimitBackendName()).toBe('postgres');
    });

    it('hashes persisted identifiers before calling Redis', async () => {
        const client = createAtomicRedisClient();
        const { limiter } = await importWithRedisClient(client);

        await limiter.consumeRateLimit('Sensitive.User@example.com', {
            scope: 'login',
            endpointClass: 'authenticated-internal',
        });

        const persistedKey = client.eval.mock.calls[0][1][0];
        expect(persistedKey).not.toContain('sensitive.user@example.com');
        expect(persistedKey).toMatch(/^ratelimit:login:[a-f0-9]{64}$/);
    });

    it('degrades public writes to a one-request atomic in-process limit', async () => {
        const query = jest.fn().mockRejectedValue(new Error('postgres unavailable'));
        const { limiter, logError } = await importWithPostgresQuery(query);
        const options = {
            scope: 'lead_capture_ip',
            maxAttempts: 10,
            degradedMaxAttempts: 1,
            endpointClass: 'public-write' as const,
            message: 'limited',
        };

        await expect(limiter.consumeRateLimit('203.0.113.10', options)).resolves.toBeNull();
        await expect(limiter.consumeRateLimit('203.0.113.10', options)).resolves.toBe('limited');
        expect(logError).toHaveBeenCalledWith(
            'rate_limit.backend_failure',
            expect.any(String),
            expect.objectContaining({ metadata: expect.objectContaining({ operation: 'consume' }) }),
        );
    });

    it('degrades Redis-backed AI limiting strictly when EVAL fails', async () => {
        const client = {
            eval: jest.fn().mockRejectedValue(new Error('redis unavailable')),
            del: jest.fn(),
        };
        const { limiter, logError } = await importWithRedisClient(client);
        const options = {
            scope: 'ai_agent_query',
            maxAttempts: 20,
            degradedMaxAttempts: 1,
            endpointClass: 'ai' as const,
            message: 'limited',
        };

        await expect(limiter.consumeRateLimit('tenant:user', options)).resolves.toBeNull();
        await expect(limiter.consumeRateLimit('tenant:user', options)).resolves.toBe('limited');
        expect(logError).toHaveBeenCalledWith(
            'rate_limit.backend_failure',
            expect.any(String),
            expect.objectContaining({
                metadata: expect.objectContaining({ backend: 'redis', operation: 'consume' }),
            }),
        );
    });

    it('probes real Postgres bucket mutation capability in backend health', async () => {
        const query = createAtomicPostgresQuery();
        const { limiter } = await importWithPostgresQuery(query);

        await expect(limiter.getRateLimitHealth()).resolves.toEqual(expect.objectContaining({
            status: 'healthy',
            configuredBackend: 'postgres',
            activeBackend: 'postgres',
        }));
        expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO rate_limit_buckets AS buckets')))
            .toBe(true);
        expect(query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM rate_limit_buckets WHERE "key"')))
            .toBe(true);
    });

    it('exposes degraded backend health when bucket mutation is unavailable', async () => {
        const query = jest.fn().mockRejectedValue(new Error('postgres unavailable'));
        const { limiter } = await importWithPostgresQuery(query);

        await expect(limiter.getRateLimitHealth()).resolves.toEqual(expect.objectContaining({
            status: 'degraded',
            configuredBackend: 'postgres',
            activeBackend: 'memory-fallback',
            lastFailureOperation: 'health',
        }));

        const { register } = await import('prom-client');
        const metrics = await register.metrics();
        expect(metrics).toContain('school_sis_rate_limit_backend_failures_total');
        expect(metrics).toContain('school_sis_rate_limit_backend_healthy');
    });

    it('preserves best-effort behavior for authenticated internal callers', async () => {
        const query = jest.fn().mockRejectedValue(new Error('postgres unavailable'));
        const { limiter } = await importWithPostgresQuery(query);
        const options = {
            scope: 'internal_poll',
            maxAttempts: 1,
            endpointClass: 'authenticated-internal' as const,
            message: 'limited',
        };

        await expect(limiter.consumeRateLimit('tenant:user', options)).resolves.toBeNull();
        await expect(limiter.consumeRateLimit('tenant:user', options)).resolves.toBeNull();
    });
});

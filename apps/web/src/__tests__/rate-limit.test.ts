describe('auth rate limiting', () => {
    const originalRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
    const originalRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const originalBackend = process.env.RATE_LIMIT_BACKEND;

    function restoreEnv(name: string, value: string | undefined) {
        if (value === undefined) {
            delete process.env[name];
            return;
        }
        process.env[name] = value;
    }

    beforeEach(() => {
        jest.resetModules();
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        delete process.env.RATE_LIMIT_BACKEND;
        process.env.NODE_ENV = 'test';
    });

    afterEach(() => {
        restoreEnv('UPSTASH_REDIS_REST_URL', originalRedisUrl);
        restoreEnv('UPSTASH_REDIS_REST_TOKEN', originalRedisToken);
        restoreEnv('RATE_LIMIT_BACKEND', originalBackend);
    });

    it('locks an identifier after the configured failed-attempt threshold', async () => {
        const {
            checkRateLimit,
            clearRateLimit,
            getRateLimitBackendName,
            recordFailedAttempt,
            resetRateLimitMemoryForTests,
        } = await import('@/lib/auth/rate-limit');

        const identifier = `student-${Date.now()}@example.com`;
        resetRateLimitMemoryForTests();

        expect(getRateLimitBackendName()).toBe('memory');
        expect(await checkRateLimit(identifier)).toBeNull();

        for (let attempt = 0; attempt < 5; attempt += 1) {
            await recordFailedAttempt(identifier);
        }

        await expect(checkRateLimit(identifier)).resolves.toContain('Too many login attempts');

        await clearRateLimit(identifier);
        await expect(checkRateLimit(identifier)).resolves.toBeNull();
    });
});

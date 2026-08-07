import { createHash, randomUUID } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { Counter, Gauge, register } from 'prom-client';
import type { QueryResult } from 'pg';
import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass } from '@/lib/db';
import { logger } from '@/lib/observability/logger';

interface RateLimitEntry {
    count: number;
    firstAttempt: number;
    lockedUntil: number | null;
}

type AtomicConsumeResult = {
    throttled: boolean;
    entry: RateLimitEntry;
    capacityExhausted?: boolean;
};

type RateLimitBackend = 'redis' | 'postgres' | 'memory';
type RateLimitStorageBackend = RateLimitBackend | 'memory-fallback';
export type RateLimitEndpointClass = 'public-write' | 'login' | 'ai' | 'authenticated-internal';
type ConsumeRateLimitOptions = {
    scope?: string;
    maxAttempts?: number;
    degradedMaxAttempts?: number;
    message?: string;
    endpointClass?: RateLimitEndpointClass;
};

type RateLimitOperation = 'consume' | 'delete' | 'health';
type RateLimitStorageResult<T> = {
    value: T;
    backend: RateLimitStorageBackend;
    degraded: boolean;
};

export type RateLimitHealth = {
    status: 'healthy' | 'degraded';
    configuredBackend: RateLimitBackend;
    activeBackend: RateLimitStorageBackend;
    degradedUntil: string | null;
    lastFailureAt: string | null;
    lastFailureOperation: RateLimitOperation | null;
};

const WINDOW_MS = 15 * 60 * 1000;
const rateLimitDisabledForDevelopment = process.env.DISABLE_RATE_LIMIT === 'true' && process.env.NODE_ENV !== 'production';
const MAX_ATTEMPTS = rateLimitDisabledForDevelopment ? 1000 : 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const BACKEND_FAILURE_COOLDOWN_MS = 60 * 1000;
const DEFAULT_DEGRADED_MAX_ATTEMPTS = 1;
const DEFAULT_MEMORY_MAX_ENTRIES = 10_000;

function configuredMemoryMaxEntries(): number {
    const configured = process.env.RATE_LIMIT_MEMORY_MAX_ENTRIES;
    if (!configured) return DEFAULT_MEMORY_MAX_ENTRIES;
    const parsed = Number(configured);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
        throw new Error('RATE_LIMIT_MEMORY_MAX_ENTRIES must be an integer between 1 and 1000000.');
    }
    return parsed;
}

const MEMORY_MAX_ENTRIES = configuredMemoryMaxEntries();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (redisUrl && redisToken) ? new Redis({ url: redisUrl, token: redisToken }) : null;
const rateLimitEntries = new Map<string, RateLimitEntry>();
let lastPostgresCleanup = 0;
let backendFailureState: {
    backend: Exclude<RateLimitBackend, 'memory'>;
    failedAt: number;
    degradedUntil: number;
    operation: RateLimitOperation;
} | null = null;

const REDIS_ATOMIC_CONSUME_SCRIPT = `
local now = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local lockout_ms = tonumber(ARGV[3])
local max_attempts = tonumber(ARGV[4])
local raw = redis.call('GET', KEYS[1])
local count = 0
local first_attempt = now
local locked_until = 0

if raw then
  local decoded = cjson.decode(raw)
  count = tonumber(decoded.count) or 0
  first_attempt = tonumber(decoded.firstAttempt) or now
  if decoded.lockedUntil and decoded.lockedUntil ~= cjson.null then
    locked_until = tonumber(decoded.lockedUntil) or 0
  end
end

local throttled = 0
if locked_until > now then
  throttled = 1
elseif raw and (locked_until > 0 or now - first_attempt > window_ms) then
  count = 1
  first_attempt = now
  locked_until = 0
elseif count >= max_attempts then
  locked_until = now + lockout_ms
  throttled = 1
else
  count = count + 1
end

local entry = {
  count = count,
  firstAttempt = first_attempt,
  lockedUntil = locked_until > 0 and locked_until or cjson.null
}
local ttl_ms = math.max(window_ms * 2, lockout_ms, 60000)
redis.call('SET', KEYS[1], cjson.encode(entry), 'PX', tostring(ttl_ms))
return { throttled, count, first_attempt, locked_until }
`;

function getCounter(name: string, help: string, labelNames: string[]): Counter<string> {
    const existing = register.getSingleMetric(name);
    if (existing) return existing as Counter<string>;
    return new Counter({ name, help, labelNames });
}

function getGauge(name: string, help: string, labelNames: string[]): Gauge<string> {
    const existing = register.getSingleMetric(name);
    if (existing) return existing as Gauge<string>;
    return new Gauge({ name, help, labelNames });
}

const rateLimitDecisions = getCounter(
    'school_sis_rate_limit_decisions_total',
    'Rate-limit decisions by endpoint class, outcome, and active backend',
    ['endpoint_class', 'outcome', 'backend'],
);
const rateLimitBackendFailures = getCounter(
    'school_sis_rate_limit_backend_failures_total',
    'Rate-limit storage backend failures by backend and operation',
    ['backend', 'operation'],
);
const rateLimitBackendHealthy = getGauge(
    'school_sis_rate_limit_backend_healthy',
    'Rate-limit storage backend health, 1 for healthy and 0 for degraded',
    ['backend'],
);
const rateLimitFallbackCapacityExhaustions = getCounter(
    'school_sis_rate_limit_fallback_capacity_exhaustions_total',
    'Strict requests denied because the bounded in-process fallback reached capacity',
    ['endpoint_class'],
);

export function initializeRateLimitMetrics(): void {
    // Importing this module registers the collectors. This hook makes that intent explicit.
}

export function getRateLimitBackendName(): RateLimitBackend {
    const configuredBackend = process.env.RATE_LIMIT_BACKEND;

    if (process.env.NODE_ENV === 'production'
        && configuredBackend !== 'redis'
        && configuredBackend !== 'postgres') {
        throw new Error('Production requires explicit RATE_LIMIT_BACKEND=redis or RATE_LIMIT_BACKEND=postgres.');
    }

    if (configuredBackend === 'redis') {
        if (!redis) throw new Error('RATE_LIMIT_BACKEND=redis requires complete Upstash credentials.');
        return 'redis';
    }
    if (configuredBackend === 'postgres' || configuredBackend === 'memory') return configuredBackend;
    if (configuredBackend) throw new Error('RATE_LIMIT_BACKEND must be redis, postgres, or memory.');
    if (redis) return 'redis';
    return 'memory';
}

function requiresStrictFallback(endpointClass: RateLimitEndpointClass): boolean {
    return endpointClass === 'public-write' || endpointClass === 'login' || endpointClass === 'ai';
}

function backendIsCoolingDown(backend: RateLimitBackend, now = Date.now()): boolean {
    return backend !== 'memory'
        && backendFailureState?.backend === backend
        && backendFailureState.degradedUntil > now;
}

function markBackendHealthy(backend: RateLimitBackend): void {
    rateLimitBackendHealthy.set({ backend }, 1);
    if (backendFailureState?.backend === backend) backendFailureState = null;
}

function markBackendFailure(
    backend: Exclude<RateLimitBackend, 'memory'>,
    operation: RateLimitOperation,
    error: unknown,
): void {
    const now = Date.now();
    backendFailureState = {
        backend,
        failedAt: now,
        degradedUntil: now + BACKEND_FAILURE_COOLDOWN_MS,
        operation,
    };
    rateLimitBackendFailures.inc({ backend, operation });
    rateLimitBackendHealthy.set({ backend }, 0);
    logger.error('rate_limit.backend_failure', 'Rate-limit backend failed; strict endpoints are using in-process fallback', {
        source: 'rate-limit',
        metadata: {
            backend,
            operation,
            degradedUntil: new Date(now + BACKEND_FAILURE_COOLDOWN_MS).toISOString(),
            error: error instanceof Error ? error.message : String(error),
        },
    });
}

function recordDecision(
    endpointClass: RateLimitEndpointClass,
    throttled: boolean,
    storage: Pick<RateLimitStorageResult<unknown>, 'backend' | 'degraded'>,
): void {
    const outcome = `${storage.degraded ? 'degraded_' : ''}${throttled ? 'throttled' : 'allowed'}`;
    rateLimitDecisions.inc({ endpoint_class: endpointClass, outcome, backend: storage.backend });
}

function hashIdentifier(identifier: string): string {
    return createHash('sha256').update(identifier.toLowerCase().trim()).digest('hex');
}

function normalizedLoginKey(identifier: string): string {
    return `ratelimit:login:${hashIdentifier(identifier)}`;
}

function normalizedScopedKey(scope: string, identifier: string): string {
    const safeScope = scope.toLowerCase().replace(/[^a-z0-9:-]/g, '-') || 'generic';
    return `ratelimit:${safeScope}:${hashIdentifier(identifier)}`;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
    if (!Number.isFinite(value) || value === undefined) return fallback;
    return Math.max(1, Math.floor(value));
}

function transitionEntry(
    current: RateLimitEntry | null,
    now: number,
    maxAttempts: number,
): AtomicConsumeResult {
    if (current?.lockedUntil && now < current.lockedUntil) {
        return { throttled: true, entry: { ...current } };
    }

    if (!current || current.lockedUntil !== null || now - current.firstAttempt > WINDOW_MS) {
        return {
            throttled: false,
            entry: { count: 1, firstAttempt: now, lockedUntil: null },
        };
    }

    if (current.count >= maxAttempts) {
        return {
            throttled: true,
            entry: { ...current, lockedUntil: now + LOCKOUT_MS },
        };
    }

    return {
        throttled: false,
        entry: { ...current, count: current.count + 1 },
    };
}

function deleteExpiredMemoryEntries(now: number): void {
    for (const [key, entry] of rateLimitEntries.entries()) {
        if (now - entry.firstAttempt > WINDOW_MS * 2 && (!entry.lockedUntil || now > entry.lockedUntil)) {
            rateLimitEntries.delete(key);
        }
    }
}

function storeMemoryEntry(key: string, entry: RateLimitEntry, now: number): boolean {
    if (!rateLimitEntries.has(key) && rateLimitEntries.size >= MEMORY_MAX_ENTRIES) {
        deleteExpiredMemoryEntries(now);
    }
    if (!rateLimitEntries.has(key) && rateLimitEntries.size >= MEMORY_MAX_ENTRIES) return false;
    rateLimitEntries.set(key, entry);
    return true;
}

function consumeMemoryEntry(key: string, now: number, maxAttempts: number): AtomicConsumeResult {
    const result = transitionEntry(rateLimitEntries.get(key) ?? null, now, maxAttempts);
    if (!storeMemoryEntry(key, result.entry, now)) {
        return {
            throttled: true,
            capacityExhausted: true,
            entry: { count: maxAttempts, firstAttempt: now, lockedUntil: now + LOCKOUT_MS },
        };
    }
    return result;
}

function stricterEntry(primary: RateLimitEntry | null, fallback: RateLimitEntry | null): RateLimitEntry | null {
    if (!primary) return fallback ? { ...fallback } : null;
    if (!fallback) return { ...primary };
    return {
        count: Math.max(primary.count, fallback.count),
        firstAttempt: Math.min(primary.firstAttempt, fallback.firstAttempt),
        lockedUntil: Math.max(primary.lockedUntil ?? 0, fallback.lockedUntil ?? 0) || null,
    };
}

function mergeMemoryEntry(key: string, entry: RateLimitEntry, now: number): void {
    const merged = stricterEntry(rateLimitEntries.get(key) ?? null, entry);
    if (merged) storeMemoryEntry(key, merged, now);
}

function tightenMemoryResult(
    key: string,
    result: AtomicConsumeResult,
    now: number,
    degradedMaxAttempts: number,
): AtomicConsumeResult {
    if (result.throttled || result.entry.count <= degradedMaxAttempts) return result;

    const tightened = {
        ...result.entry,
        lockedUntil: now + LOCKOUT_MS,
    };
    mergeMemoryEntry(key, tightened, now);
    return { throttled: true, entry: tightened };
}

async function consumeRedisEntry(
    key: string,
    now: number,
    maxAttempts: number,
): Promise<AtomicConsumeResult> {
    const rawResult = await redis!.eval(
        REDIS_ATOMIC_CONSUME_SCRIPT,
        [key],
        [String(now), String(WINDOW_MS), String(LOCKOUT_MS), String(maxAttempts)],
    );

    if (!Array.isArray(rawResult) || rawResult.length < 4) {
        throw new Error('Redis returned an invalid atomic rate-limit result.');
    }

    const [rawThrottled, rawCount, rawFirstAttempt, rawLockedUntil] = rawResult;
    const count = Number(rawCount);
    const firstAttempt = Number(rawFirstAttempt);
    const lockedUntil = Number(rawLockedUntil);
    if (![count, firstAttempt, lockedUntil].every(Number.isFinite)) {
        throw new Error('Redis returned non-numeric atomic rate-limit state.');
    }

    return {
        throttled: Number(rawThrottled) === 1,
        entry: {
            count,
            firstAttempt,
            lockedUntil: lockedUntil > 0 ? lockedUntil : null,
        },
    };
}

async function deleteRedisEntry(key: string): Promise<void> {
    await redis!.del(key);
}

async function cleanupExpiredPostgresBuckets(now: number): Promise<void> {
    if (now - lastPostgresCleanup < CLEANUP_INTERVAL_MS) return;
    lastPostgresCleanup = now;
    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.RATE_LIMIT_BUCKETS, () => pool.query(
        'DELETE FROM rate_limit_buckets WHERE expires_at < now()',
    ));
}

async function consumePostgresEntry(
    key: string,
    now: number,
    maxAttempts: number,
): Promise<AtomicConsumeResult> {
    await cleanupExpiredPostgresBuckets(now);
    const nowDate = new Date(now);
    const windowCutoff = new Date(now - WINDOW_MS);
    const expiresAt = new Date(now + (WINDOW_MS * 2));
    const lockUntil = new Date(now + LOCKOUT_MS);
    const result = await runWithRlsBypass<QueryResult<{
        count: number;
        window_start: Date;
        locked_until: Date | null;
        throttled: boolean;
    }>>(RLS_BYPASS_JUSTIFICATIONS.RATE_LIMIT_BUCKETS, () => pool.query(
        `
            INSERT INTO rate_limit_buckets AS buckets
                ("key", count, window_start, locked_until, expires_at, updated_at)
            VALUES ($1, 1, $2, NULL, $5, now())
            ON CONFLICT ("key") DO UPDATE SET
                count = CASE
                    WHEN buckets.locked_until > $2::timestamptz THEN buckets.count
                    WHEN buckets.locked_until IS NOT NULL
                        OR buckets.expires_at <= $2::timestamptz
                        OR buckets.window_start < $3::timestamptz THEN 1
                    WHEN buckets.count >= $4::integer THEN buckets.count
                    ELSE buckets.count + 1
                END,
                window_start = CASE
                    WHEN buckets.locked_until > $2::timestamptz THEN buckets.window_start
                    WHEN buckets.locked_until IS NOT NULL
                        OR buckets.expires_at <= $2::timestamptz
                        OR buckets.window_start < $3::timestamptz THEN $2::timestamptz
                    ELSE buckets.window_start
                END,
                locked_until = CASE
                    WHEN buckets.locked_until > $2::timestamptz THEN buckets.locked_until
                    WHEN buckets.locked_until IS NOT NULL
                        OR buckets.expires_at <= $2::timestamptz
                        OR buckets.window_start < $3::timestamptz THEN NULL
                    WHEN buckets.count >= $4::integer THEN $6::timestamptz
                    ELSE NULL
                END,
                expires_at = $5::timestamptz,
                updated_at = now()
            RETURNING count, window_start, locked_until,
                (locked_until > $2::timestamptz) AS throttled
        `,
        [key, nowDate, windowCutoff, maxAttempts, expiresAt, lockUntil],
    ));

    const row = result.rows[0];
    if (!row) throw new Error('Postgres returned no atomic rate-limit state.');
    return {
        throttled: Boolean(row.throttled),
        entry: {
            count: Number(row.count),
            firstAttempt: new Date(row.window_start).getTime(),
            lockedUntil: row.locked_until ? new Date(row.locked_until).getTime() : null,
        },
    };
}

async function deletePostgresEntry(key: string): Promise<void> {
    await runWithRlsBypass(RLS_BYPASS_JUSTIFICATIONS.RATE_LIMIT_BUCKETS, () => pool.query(
        'DELETE FROM rate_limit_buckets WHERE "key" = $1',
        [key],
    ));
}

async function consumeStorageEntry(
    key: string,
    now: number,
    maxAttempts: number,
    degradedMaxAttempts: number,
    endpointClass: RateLimitEndpointClass,
): Promise<RateLimitStorageResult<boolean>> {
    const backend = getRateLimitBackendName();
    if (backend === 'memory') {
        const result = consumeMemoryEntry(key, now, maxAttempts);
        if (result.capacityExhausted) rateLimitFallbackCapacityExhaustions.inc({ endpoint_class: endpointClass });
        markBackendHealthy(backend);
        return { value: result.throttled, backend, degraded: false };
    }

    const strict = requiresStrictFallback(endpointClass);
    if (backendIsCoolingDown(backend, now)) {
        if (strict) {
            const result = consumeMemoryEntry(key, now, degradedMaxAttempts);
            if (result.capacityExhausted) rateLimitFallbackCapacityExhaustions.inc({ endpoint_class: endpointClass });
            return { value: result.throttled, backend: 'memory-fallback', degraded: true };
        }
        return { value: false, backend, degraded: true };
    }

    try {
        const primaryResult = backend === 'redis'
            ? await consumeRedisEntry(key, now, maxAttempts)
            : await consumePostgresEntry(key, now, maxAttempts);
        markBackendHealthy(backend);
        if (strict) mergeMemoryEntry(key, primaryResult.entry, now);
        return {
            value: primaryResult.throttled,
            backend,
            degraded: false,
        };
    } catch (error) {
        markBackendFailure(backend, 'consume', error);
        if (strict) {
            const memoryResult = consumeMemoryEntry(key, now, degradedMaxAttempts);
            if (memoryResult.capacityExhausted) {
                rateLimitFallbackCapacityExhaustions.inc({ endpoint_class: endpointClass });
            }
            const fallbackResult = tightenMemoryResult(key, memoryResult, now, degradedMaxAttempts);
            return { value: fallbackResult.throttled, backend: 'memory-fallback', degraded: true };
        }
        return { value: false, backend, degraded: true };
    }
}

async function deleteEntry(
    key: string,
    endpointClass: RateLimitEndpointClass,
): Promise<Pick<RateLimitStorageResult<unknown>, 'backend' | 'degraded'>> {
    const backend = getRateLimitBackendName();
    if (requiresStrictFallback(endpointClass) || backend === 'memory') rateLimitEntries.delete(key);
    if (backend === 'memory') {
        markBackendHealthy(backend);
        return { backend, degraded: false };
    }
    if (backendIsCoolingDown(backend)) {
        return { backend: requiresStrictFallback(endpointClass) ? 'memory-fallback' : backend, degraded: true };
    }

    try {
        if (backend === 'redis') await deleteRedisEntry(key);
        else await deletePostgresEntry(key);
        markBackendHealthy(backend);
        return { backend, degraded: false };
    } catch (error) {
        markBackendFailure(backend, 'delete', error);
        return { backend: requiresStrictFallback(endpointClass) ? 'memory-fallback' : backend, degraded: true };
    }
}

if (typeof setInterval !== 'undefined') {
    const cleanupTimer = setInterval(() => {
        deleteExpiredMemoryEntries(Date.now());
    }, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();
}

export async function consumeRateLimit(
    identifier: string,
    options: ConsumeRateLimitOptions = {},
): Promise<string | null> {
    if (rateLimitDisabledForDevelopment) return null;

    const now = Date.now();
    const key = normalizedScopedKey(options.scope || 'generic', identifier || 'unknown');
    const maxAttempts = normalizeLimit(options.maxAttempts, MAX_ATTEMPTS);
    const degradedMaxAttempts = Math.min(
        maxAttempts,
        normalizeLimit(options.degradedMaxAttempts, DEFAULT_DEGRADED_MAX_ATTEMPTS),
    );
    const endpointClass = options.endpointClass ?? 'authenticated-internal';
    const message = options.message || 'Too many requests. Please try again later.';
    const storage = await consumeStorageEntry(
        key,
        now,
        maxAttempts,
        degradedMaxAttempts,
        endpointClass,
    );

    recordDecision(endpointClass, storage.value, storage);
    return storage.value ? message : null;
}

/**
 * Atomically claims a one-time token using the configured shared limiter. In
 * production a degraded in-process fallback is never accepted for this purpose,
 * because it cannot prevent the same token being replayed on another instance.
 */
export async function claimSingleUseToken(identifier: string, scope: string): Promise<boolean> {
    if (!identifier.trim() || !scope.trim()) return false;

    const now = Date.now();
    const storage = await consumeStorageEntry(
        normalizedScopedKey(scope, identifier),
        now,
        1,
        1,
        'public-write',
    );
    recordDecision('public-write', storage.value, storage);
    if (process.env.NODE_ENV === 'production' && storage.degraded) return false;
    return !storage.value;
}

export async function consumeLoginRateLimit(identifier: string): Promise<string | null> {
    return consumeRateLimit(identifier, {
        scope: 'login',
        maxAttempts: MAX_ATTEMPTS,
        degradedMaxAttempts: DEFAULT_DEGRADED_MAX_ATTEMPTS,
        endpointClass: 'login',
        message: 'Too many login attempts. Please try again later.',
    });
}

export async function clearRateLimit(identifier: string): Promise<void> {
    await deleteEntry(normalizedLoginKey(identifier), 'login');
}

async function probeBackendCapability(backend: Exclude<RateLimitBackend, 'memory'>): Promise<void> {
    const key = normalizedScopedKey('health', randomUUID());
    const now = Date.now();
    if (backend === 'redis') {
        await consumeRedisEntry(key, now, 1);
        await deleteRedisEntry(key);
        return;
    }

    await consumePostgresEntry(key, now, 1);
    await deletePostgresEntry(key);
}

export async function getRateLimitHealth(): Promise<RateLimitHealth> {
    const backend = getRateLimitBackendName();
    if (backend === 'memory') {
        markBackendHealthy(backend);
        return {
            status: 'healthy',
            configuredBackend: backend,
            activeBackend: backend,
            degradedUntil: null,
            lastFailureAt: null,
            lastFailureOperation: null,
        };
    }

    if (!backendIsCoolingDown(backend)) {
        try {
            await probeBackendCapability(backend);
            markBackendHealthy(backend);
        } catch (error) {
            markBackendFailure(backend, 'health', error);
        }
    }

    if (backendFailureState?.backend === backend) {
        return {
            status: 'degraded',
            configuredBackend: backend,
            activeBackend: 'memory-fallback',
            degradedUntil: new Date(backendFailureState.degradedUntil).toISOString(),
            lastFailureAt: new Date(backendFailureState.failedAt).toISOString(),
            lastFailureOperation: backendFailureState.operation,
        };
    }

    return {
        status: 'healthy',
        configuredBackend: backend,
        activeBackend: backend,
        degradedUntil: null,
        lastFailureAt: null,
        lastFailureOperation: null,
    };
}

export function resetRateLimitMemoryForTests(): void {
    if (process.env.NODE_ENV === 'test') {
        rateLimitEntries.clear();
        backendFailureState = null;
        lastPostgresCleanup = 0;
    }
}

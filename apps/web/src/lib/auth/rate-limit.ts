import { Redis } from '@upstash/redis';
import type { QueryResult } from 'pg';
import { pool, runWithRlsBypass } from '@/lib/db';

interface RateLimitEntry {
    count: number;
    firstAttempt: number;
    lockedUntil: number | null;
}

type RateLimitBackend = 'redis' | 'postgres' | 'memory';

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = process.env.DISABLE_RATE_LIMIT === 'true' ? 1000 : 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (redisUrl && redisToken) ? new Redis({ url: redisUrl, token: redisToken }) : null;
const loginAttempts = new Map<string, RateLimitEntry>();
let lastPostgresCleanup = 0;

function shouldUsePostgresBackend(): boolean {
    return process.env.RATE_LIMIT_BACKEND === 'postgres' || process.env.NODE_ENV === 'production';
}

export function getRateLimitBackendName(): RateLimitBackend {
    if (redis) return 'redis';
    if (shouldUsePostgresBackend()) return 'postgres';
    return 'memory';
}

function normalizedLoginKey(identifier: string): string {
    return `ratelimit:login:${identifier.toLowerCase().trim()}`;
}

function expirationFor(entry: RateLimitEntry, now: number): Date {
    return new Date(Math.max(
        now + WINDOW_MS,
        entry.firstAttempt + (WINDOW_MS * 2),
        entry.lockedUntil ?? 0,
    ));
}

function parseRedisEntry(value: string | RateLimitEntry | null): RateLimitEntry | null {
    if (!value) return null;
    if (typeof value === 'string') return JSON.parse(value) as RateLimitEntry;
    return value;
}

async function getRedisEntry(key: string): Promise<RateLimitEntry | null> {
    const value = await redis!.get<string | RateLimitEntry>(key);
    return parseRedisEntry(value);
}

async function setRedisEntry(key: string, entry: RateLimitEntry, now: number): Promise<void> {
    const seconds = Math.ceil((expirationFor(entry, now).getTime() - now) / 1000);
    await redis!.set(key, JSON.stringify(entry), { ex: Math.max(seconds, 60) });
}

async function deleteRedisEntry(key: string): Promise<void> {
    await redis!.del(key);
}

async function cleanupExpiredPostgresBuckets(now: number): Promise<void> {
    if (now - lastPostgresCleanup < CLEANUP_INTERVAL_MS) return;
    lastPostgresCleanup = now;
    await runWithRlsBypass(() => pool.query(
        'DELETE FROM rate_limit_buckets WHERE expires_at < now()',
    ));
}

async function getPostgresEntry(key: string, now: number): Promise<RateLimitEntry | null> {
    await cleanupExpiredPostgresBuckets(now);
    const result = await runWithRlsBypass<QueryResult<{
        count: number;
        window_start: Date;
        locked_until: Date | null;
    }>>(() => pool.query(
        'SELECT count, window_start, locked_until FROM rate_limit_buckets WHERE "key" = $1 AND expires_at > now()',
        [key],
    ));

    const row = result.rows[0];
    if (!row) return null;

    return {
        count: Number(row.count),
        firstAttempt: new Date(row.window_start).getTime(),
        lockedUntil: row.locked_until ? new Date(row.locked_until).getTime() : null,
    };
}

async function setPostgresEntry(key: string, entry: RateLimitEntry, now: number): Promise<void> {
    await runWithRlsBypass(() => pool.query(
        `
            INSERT INTO rate_limit_buckets ("key", count, window_start, locked_until, expires_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, now())
            ON CONFLICT ("key") DO UPDATE SET
                count = EXCLUDED.count,
                window_start = EXCLUDED.window_start,
                locked_until = EXCLUDED.locked_until,
                expires_at = EXCLUDED.expires_at,
                updated_at = now()
        `,
        [
            key,
            entry.count,
            new Date(entry.firstAttempt),
            entry.lockedUntil ? new Date(entry.lockedUntil) : null,
            expirationFor(entry, now),
        ],
    ));
}

async function deletePostgresEntry(key: string): Promise<void> {
    await runWithRlsBypass(() => pool.query(
        'DELETE FROM rate_limit_buckets WHERE "key" = $1',
        [key],
    ));
}

async function getMemoryEntry(key: string): Promise<RateLimitEntry | null> {
    return loginAttempts.get(key) ?? null;
}

async function setMemoryEntry(key: string, entry: RateLimitEntry): Promise<void> {
    loginAttempts.set(key, entry);
}

async function deleteMemoryEntry(key: string): Promise<void> {
    loginAttempts.delete(key);
}

async function getEntry(key: string, now: number): Promise<RateLimitEntry | null> {
    if (redis) {
        try {
            return await getRedisEntry(key);
        } catch (error) {
            console.error('[RateLimit/Redis] Error reading login throttle. Falling back:', error);
        }
    }

    if (shouldUsePostgresBackend()) {
        try {
            return await getPostgresEntry(key, now);
        } catch (error) {
            console.error('[RateLimit/Postgres] Error reading login throttle:', error);
            return null;
        }
    }

    return getMemoryEntry(key);
}

async function setEntry(key: string, entry: RateLimitEntry, now: number): Promise<void> {
    if (redis) {
        try {
            await setRedisEntry(key, entry, now);
            return;
        } catch (error) {
            console.error('[RateLimit/Redis] Error writing login throttle. Falling back:', error);
        }
    }

    if (shouldUsePostgresBackend()) {
        try {
            await setPostgresEntry(key, entry, now);
            return;
        } catch (error) {
            console.error('[RateLimit/Postgres] Error writing login throttle:', error);
            return;
        }
    }

    await setMemoryEntry(key, entry);
}

async function deleteEntry(key: string): Promise<void> {
    if (redis) {
        try {
            await deleteRedisEntry(key);
            return;
        } catch (error) {
            console.error('[RateLimit/Redis] Error clearing login throttle. Falling back:', error);
        }
    }

    if (shouldUsePostgresBackend()) {
        try {
            await deletePostgresEntry(key);
            return;
        } catch (error) {
            console.error('[RateLimit/Postgres] Error clearing login throttle:', error);
            return;
        }
    }

    await deleteMemoryEntry(key);
}

if (getRateLimitBackendName() === 'memory' && typeof setInterval !== 'undefined') {
    const cleanupTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of loginAttempts.entries()) {
            if (now - entry.firstAttempt > WINDOW_MS * 2 && (!entry.lockedUntil || now > entry.lockedUntil)) {
                loginAttempts.delete(key);
            }
        }
    }, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();
}

/**
 * Check if a login attempt is rate-limited.
 */
export async function checkRateLimit(identifier: string): Promise<string | null> {
    const now = Date.now();
    const normalizedKey = normalizedLoginKey(identifier);
    const entry = await getEntry(normalizedKey, now);

    if (!entry) return null;

    if (entry.lockedUntil && now < entry.lockedUntil) {
        const remainingMinutes = Math.ceil((entry.lockedUntil - now) / 60000);
        return `Too many login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`;
    }

    if (entry.lockedUntil && now >= entry.lockedUntil) {
        await deleteEntry(normalizedKey);
        return null;
    }

    if (now - entry.firstAttempt > WINDOW_MS) {
        await deleteEntry(normalizedKey);
        return null;
    }

    if (entry.count < MAX_ATTEMPTS) return null;

    entry.lockedUntil = now + LOCKOUT_MS;
    await setEntry(normalizedKey, entry, now);
    const remainingMins = Math.ceil(LOCKOUT_MS / 60000);
    return `Too many login attempts. Please try again in ${remainingMins} minutes.`;
}

/**
 * Record a failed login attempt.
 */
export async function recordFailedAttempt(identifier: string): Promise<void> {
    const now = Date.now();
    const normalizedKey = normalizedLoginKey(identifier);
    const current = await getEntry(normalizedKey, now);

    if (!current || now - current.firstAttempt > WINDOW_MS) {
        await setEntry(normalizedKey, { count: 1, firstAttempt: now, lockedUntil: null }, now);
        return;
    }

    current.count += 1;
    await setEntry(normalizedKey, current, now);
}

/**
 * Clear rate limit entries on successful login.
 */
export async function clearRateLimit(identifier: string): Promise<void> {
    await deleteEntry(normalizedLoginKey(identifier));
}

export function resetRateLimitMemoryForTests(): void {
    if (process.env.NODE_ENV === 'test') {
        loginAttempts.clear();
    }
}

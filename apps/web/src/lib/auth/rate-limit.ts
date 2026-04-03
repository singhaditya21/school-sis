/**
 * Rate limiter for login brute-force protection.
 *
 * Uses Upstash Redis in production for distributed rate limiting across Vercel edge.
 * Falls back to an In-Memory Map for local dev if REDIS_URL is not set.
 *
 * Policy: 5 failed attempts per email within 15 minutes → 15 minute lockout.
 */
import { Redis } from '@upstash/redis';

interface RateLimitEntry {
    count: number;
    firstAttempt: number;
    lockedUntil: number | null;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Safely initialize Redis only if vars exist
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = (redisUrl && redisToken) ? new Redis({ url: redisUrl, token: redisToken }) : null;

// Fallback in-memory store
const loginAttempts = new Map<string, RateLimitEntry>();

if (!redis && process.env.NODE_ENV === 'production') {
    // SECURITY PATCH: Horizontal Render deployments render local memory maps useless for rate limiting.
    console.warn('[SECURITY] Rate Limiter is using local memory Maps. Brute-force protection will fail across horizontal instances!');
}

// Periodic cleanup of expired entries (only relevant for in-memory fallback)
if (!redis && typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of loginAttempts.entries()) {
            if (now - entry.firstAttempt > WINDOW_MS * 2 && (!entry.lockedUntil || now > entry.lockedUntil)) {
                loginAttempts.delete(key);
            }
        }
    }, 30 * 60 * 1000);
}

/**
 * Check if a login attempt is rate-limited.
 */
export async function checkRateLimit(identifier: string): Promise<string | null> {
    const now = Date.now();
    const normalizedKey = `ratelimit:login:${identifier.toLowerCase().trim()}`;

    // Redis Mode
    if (redis) {
        try {
            const entryStr = await redis.get<string>(normalizedKey);
            if (!entryStr) return null;
            
            const entry: RateLimitEntry = typeof entryStr === 'string' ? JSON.parse(entryStr) : entryStr;

            if (entry.lockedUntil && now < entry.lockedUntil) {
                const remainingMinutes = Math.ceil((entry.lockedUntil - now) / 60000);
                return `Too many login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`;
            }

            if (entry.lockedUntil && now >= entry.lockedUntil) {
                await redis.del(normalizedKey);
                return null;
            }

            if (now - entry.firstAttempt > WINDOW_MS) {
                await redis.del(normalizedKey);
                return null;
            }

            if (entry.count < MAX_ATTEMPTS) return null;

            entry.lockedUntil = now + LOCKOUT_MS;
            await redis.set(normalizedKey, JSON.stringify(entry), { ex: Math.ceil(LOCKOUT_MS / 1000) });
            const remainingMins = Math.ceil(LOCKOUT_MS / 60000);
            return `Too many login attempts. Please try again in ${remainingMins} minutes.`;
        } catch (e) {
            console.error('[RateLimit/Redis] Error checking limit:', e);
            return null; // Fail open
        }
    }

    // In-Memory Fallback Mode
    const entry = loginAttempts.get(normalizedKey);
    if (!entry) return null;

    if (entry.lockedUntil && now < entry.lockedUntil) {
        const remainingMinutes = Math.ceil((entry.lockedUntil - now) / 60000);
        return `Too many login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`;
    }

    if (entry.lockedUntil && now >= entry.lockedUntil) {
        loginAttempts.delete(normalizedKey);
        return null;
    }

    if (now - entry.firstAttempt > WINDOW_MS) {
        loginAttempts.delete(normalizedKey);
        return null;
    }

    if (entry.count < MAX_ATTEMPTS) return null;

    entry.lockedUntil = now + LOCKOUT_MS;
    const remainingMins = Math.ceil(LOCKOUT_MS / 60000);
    return `Too many login attempts. Please try again in ${remainingMins} minutes.`;
}

/**
 * Record a failed login attempt.
 */
export async function recordFailedAttempt(identifier: string): Promise<void> {
    const now = Date.now();
    const normalizedKey = `ratelimit:login:${identifier.toLowerCase().trim()}`;

    if (redis) {
        try {
            const entryStr = await redis.get<string>(normalizedKey);
            let entry: RateLimitEntry | null = typeof entryStr === 'string' ? JSON.parse(entryStr) : (entryStr || null);

            if (!entry || now - entry.firstAttempt > WINDOW_MS) {
                entry = { count: 1, firstAttempt: now, lockedUntil: null };
            } else {
                entry.count += 1;
            }
            
            await redis.set(normalizedKey, JSON.stringify(entry), { ex: Math.ceil((WINDOW_MS * 2) / 1000) });
        } catch (e) {
             console.error('[RateLimit/Redis] Error recording attempt:', e);
        }
        return;
    }

    // Fallback
    const entry = loginAttempts.get(normalizedKey);
    if (!entry || now - entry.firstAttempt > WINDOW_MS) {
        loginAttempts.set(normalizedKey, { count: 1, firstAttempt: now, lockedUntil: null });
        return;
    }
    entry.count += 1;
}

/**
 * Clear rate limit entries on successful login.
 */
export async function clearRateLimit(identifier: string): Promise<void> {
    const normalizedKey = `ratelimit:login:${identifier.toLowerCase().trim()}`;
    if (redis) {
        try { await redis.del(normalizedKey); } catch (e) {}
    } else {
        loginAttempts.delete(normalizedKey);
    }
}

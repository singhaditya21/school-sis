/**
 * In-memory rate limiter for login brute-force protection.
 *
 * Production systems should use Upstash Redis for distributed rate limiting.
 * This provides sufficient protection for single-instance deployments.
 *
 * Policy: 5 failed attempts per email within 15 minutes → 15 minute lockout.
 */

interface RateLimitEntry {
    count: number;
    firstAttempt: number;
    lockedUntil: number | null;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// In-memory store — cleared on restart. Use Redis in production.
const loginAttempts = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries (every 30 minutes)
if (typeof setInterval !== 'undefined') {
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
 * @returns null if allowed, or an error message if blocked.
 */
export function checkRateLimit(identifier: string): string | null {
    const now = Date.now();
    const normalizedKey = identifier.toLowerCase().trim();
    const entry = loginAttempts.get(normalizedKey);

    if (!entry) return null;

    // Check active lockout
    if (entry.lockedUntil && now < entry.lockedUntil) {
        const remainingSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        return `Too many login attempts. Please try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`;
    }

    // Lockout expired — reset
    if (entry.lockedUntil && now >= entry.lockedUntil) {
        loginAttempts.delete(normalizedKey);
        return null;
    }

    // Window expired — reset
    if (now - entry.firstAttempt > WINDOW_MS) {
        loginAttempts.delete(normalizedKey);
        return null;
    }

    // Under threshold
    if (entry.count < MAX_ATTEMPTS) return null;

    // Over threshold — trigger lockout
    entry.lockedUntil = now + LOCKOUT_MS;
    const remainingMinutes = Math.ceil(LOCKOUT_MS / 60000);
    return `Too many login attempts. Please try again in ${remainingMinutes} minutes.`;
}

/**
 * Record a failed login attempt.
 */
export function recordFailedAttempt(identifier: string): void {
    const now = Date.now();
    const normalizedKey = identifier.toLowerCase().trim();
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
export function clearRateLimit(identifier: string): void {
    loginAttempts.delete(identifier.toLowerCase().trim());
}

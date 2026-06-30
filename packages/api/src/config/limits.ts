/**
 * Free Tier Limits Configuration
 *
 * Central config for all service limits to stay within free tiers.
 * Update these values when moving to production paid plans.
 *
 * IMPORTANT: Change these limits before going live!
 */

export const LIMITS = {
    // ─── Neon.tech (Free: 0.5 GB, 190 compute hrs) ─────────
    DB_POOL_MAX: 3,                      // Keep connections low (free tier)
    DB_IDLE_TIMEOUT: 10,                 // Close idle connections faster (saves compute hours)

    // ─── Upstash Redis (Free: 10,000 commands/day) ──────────
    REDIS_DAILY_COMMAND_CAP: 9_000,      // Leave 1K buffer
    REDIS_CACHE_TTL: 300,                // 5-min cache to reduce commands

    // ─── Resend (Free: 100 emails/day, 3K/month) ───────────
    EMAIL_DAILY_CAP: 90,                 // Leave 10 buffer
    EMAIL_MONTHLY_CAP: 2_800,            // Leave 200 buffer

    // ─── Cloudflare R2 (Free: 10 GB, 1M class A ops) ───────
    STORAGE_MAX_FILE_SIZE: 5 * 1024 * 1024,    // 5 MB per file
    STORAGE_MAX_TOTAL_GB: 8,                    // 8 GB cap (2 GB buffer)
    STORAGE_MAX_UPLOADS_PER_DAY: 100,           // Limit daily uploads

    // ─── Sentry (Free: 5,000 events/month) ──────────────────
    SENTRY_SAMPLE_RATE: 0.2,             // Only send 20% of errors
    SENTRY_MONTHLY_CAP: 4_500,           // Leave 500 buffer

    // ─── PostHog (Free: 1M events/month) ────────────────────
    POSTHOG_SAMPLE_RATE: 0.1,            // Only 10% of events (saves quota)
    POSTHOG_MONTHLY_CAP: 900_000,

    // ─── AI Agents (Self-hosted, but limit API calls) ───────
    AGENT_QUERIES_PER_SCHOOL_PER_DAY: 50,
    AGENT_MAX_TOKENS_PER_QUERY: 2048,

    // ─── General ────────────────────────────────────────────
    MAX_TENANTS: 5,                      // Free tier: max 5 schools
    MAX_STUDENTS_PER_TENANT: 500,
    CSV_IMPORT_MAX_ROWS: 200,
    CSV_EXPORT_MAX_ROWS: 1_000,
    SSE_POLL_INTERVAL_MS: 15_000,         // 15s instead of 5s (saves DB queries)
    PDF_GENERATE_DAILY_CAP: 50,
} as const;

/**
 * Type-safe access to limits.
 * In production, these could come from env vars or a DB table.
 */
export function getLimit(key: keyof typeof LIMITS): number {
    // Override from env if available (for production flexibility)
    const envKey = `LIMIT_${key}`;
    const envValue = process.env[envKey];
    if (envValue) {
        const parsed = Number(envValue);
        if (!isNaN(parsed)) return parsed;
    }
    return LIMITS[key];
}

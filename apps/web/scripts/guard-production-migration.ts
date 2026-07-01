const directUrl = process.env.DIRECT_URL;

function parseUrl(value: string): URL {
    try {
        return new URL(value);
    } catch {
        throw new Error('DIRECT_URL is not a valid Postgres URL.');
    }
}

if (!directUrl) {
    throw new Error('DIRECT_URL is required for production migrations.');
}

const parsed = parseUrl(directUrl);
const sslMode = parsed.searchParams.get('sslmode');

if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DIRECT_URL must use postgres:// or postgresql://.');
}

if (parsed.hostname.includes('-pooler.')) {
    throw new Error('DIRECT_URL must use the direct Neon host, not the pooled runtime host.');
}

if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && sslMode !== 'require' && sslMode !== 'verify-full') {
    throw new Error('DIRECT_URL must include sslmode=require or sslmode=verify-full.');
}

if ((process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') && process.env.CONFIRM_PRODUCTION_MIGRATION !== 'school-sis') {
    throw new Error('Set CONFIRM_PRODUCTION_MIGRATION=school-sis before running production migrations.');
}

console.log('[db:migrate:prod] Guard passed for explicit Drizzle migration run.');

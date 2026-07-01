function isLocalDatabase(value: string): boolean {
    try {
        const parsed = new URL(value);
        return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
    } catch {
        return false;
    }
}

const targetUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || '';
const productionLike = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

if (productionLike) {
    throw new Error('drizzle-kit push is blocked in production. Generate and run migrations instead.');
}

if (targetUrl && !isLocalDatabase(targetUrl) && process.env.ALLOW_REMOTE_DB_PUSH !== 'true') {
    throw new Error(
        'drizzle-kit push targets a remote database. Set ALLOW_REMOTE_DB_PUSH=true only for intentional non-production prototyping.',
    );
}

console.log('[db:push] Guard passed for local/prototype schema push.');

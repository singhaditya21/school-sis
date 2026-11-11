export function resolveAppUrl(): string {
    const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    return process.env.NODE_ENV !== 'production'
        ? 'http://localhost:3000'
        : 'https://school-sis-web.vercel.app';
}

import { buildCacheControl, cacheControlFor, withCacheHeaders } from '@/lib/performance/cache';

describe('performance cache profiles', () => {
    it('keeps sensitive responses explicitly uncached', () => {
        expect(cacheControlFor('noStore')).toBe('no-store');
    });

    it('builds bounded private cache controls for tenant data', () => {
        expect(cacheControlFor('tenantReference')).toBe('private, max-age=300, stale-while-revalidate=600');
    });

    it('sets headers on a response object', () => {
        const response = withCacheHeaders(new Response('ok'), 'publicStatic');
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600, stale-while-revalidate=86400');
    });

    it('normalizes negative max-age values', () => {
        expect(buildCacheControl({ scope: 'private', maxAgeSeconds: -10 })).toBe('private, max-age=0');
    });
});

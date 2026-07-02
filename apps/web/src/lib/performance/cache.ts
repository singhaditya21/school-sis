export type CacheScope = 'no-store' | 'private' | 'public';

export type CacheProfile = {
    scope: CacheScope;
    maxAgeSeconds?: number;
    staleWhileRevalidateSeconds?: number;
};

export const CACHE_PROFILES = {
    noStore: { scope: 'no-store' },
    tenantDashboard: { scope: 'private', maxAgeSeconds: 30, staleWhileRevalidateSeconds: 120 },
    tenantReference: { scope: 'private', maxAgeSeconds: 300, staleWhileRevalidateSeconds: 600 },
    publicStatic: { scope: 'public', maxAgeSeconds: 3600, staleWhileRevalidateSeconds: 86400 },
} satisfies Record<string, CacheProfile>;

export type CacheProfileName = keyof typeof CACHE_PROFILES;

export function buildCacheControl(profile: CacheProfile): string {
    if (profile.scope === 'no-store') {
        return 'no-store';
    }

    const directives: string[] = [profile.scope];
    directives.push(`max-age=${Math.max(0, profile.maxAgeSeconds ?? 0)}`);

    if (profile.staleWhileRevalidateSeconds && profile.staleWhileRevalidateSeconds > 0) {
        directives.push(`stale-while-revalidate=${Math.floor(profile.staleWhileRevalidateSeconds)}`);
    }

    return directives.join(', ');
}

export function cacheControlFor(profileName: CacheProfileName): string {
    return buildCacheControl(CACHE_PROFILES[profileName]);
}

export function withCacheHeaders<T extends Response>(response: T, profileName: CacheProfileName): T {
    response.headers.set('Cache-Control', cacheControlFor(profileName));
    return response;
}

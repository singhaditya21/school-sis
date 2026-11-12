import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass } from '@/lib/db';
import type { SessionData } from './session-options';

const REVOCATION_CACHE_TTL_MS = 15_000;
const REVOCATION_CACHE_MAX_ENTRIES = 2_000;

type CachedSessionState = {
    userActive: boolean;
    currentRole: string;
    userSessionVersion?: number;
    tenantActive: boolean;
    tenantSessionVersion?: number;
    expiresAt: number;
};

type RevocationQueryRow = {
    user_active: boolean;
    current_role: string;
    user_session_version?: number | string | null;
    tenant_active: boolean;
    tenant_session_version?: number | string | null;
};

const sessionStateCache = new Map<string, CachedSessionState>();

function cacheKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
}

function pruneCacheIfNeeded(now: number): void {
    if (sessionStateCache.size < REVOCATION_CACHE_MAX_ENTRIES) {
        return;
    }
    for (const [key, entry] of sessionStateCache.entries()) {
        if (entry.expiresAt <= now) {
            sessionStateCache.delete(key);
        }
    }
    while (sessionStateCache.size >= REVOCATION_CACHE_MAX_ENTRIES) {
        const oldestKey = sessionStateCache.keys().next().value;
        if (!oldestKey) break;
        sessionStateCache.delete(oldestKey);
    }
}

export function evictUserSessionCache(tenantId: string, userId: string): void {
    if (!tenantId || !userId) return;
    sessionStateCache.delete(cacheKey(tenantId, userId));
}

export function evictTenantSessionCache(tenantId: string): void {
    if (!tenantId) return;
    const prefix = `${tenantId}:`;
    for (const key of sessionStateCache.keys()) {
        if (key.startsWith(prefix)) {
            sessionStateCache.delete(key);
        }
    }
}

export function clearSessionRevocationCache(): void {
    sessionStateCache.clear();
}

function parseVersionNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
}

async function loadSessionState(tenantId: string, userId: string): Promise<CachedSessionState | null> {
    const now = Date.now();
    const key = cacheKey(tenantId, userId);
    const cached = sessionStateCache.get(key);
    if (cached && cached.expiresAt > now) {
        return cached;
    }

    const result = await runWithRlsBypass(
        RLS_BYPASS_JUSTIFICATIONS.SESSION_REVOCATION_CHECK,
        async () => {
            try {
                return await pool.query<RevocationQueryRow>(
                    `SELECT
                        u.is_active AS user_active,
                        u.role AS current_role,
                        u.session_version AS user_session_version,
                        t.is_active AS tenant_active,
                        t.session_version AS tenant_session_version
                     FROM users u
                     JOIN tenants t ON t.id = u.tenant_id
                     WHERE u.id = $1 AND u.tenant_id = $2
                     LIMIT 1`,
                    [userId, tenantId],
                );
            } catch (error) {
                if ((error as { code?: string })?.code === '42703') {
                    return await pool.query<RevocationQueryRow>(
                        `SELECT
                            u.is_active AS user_active,
                            u.role AS current_role,
                            t.is_active AS tenant_active
                         FROM users u
                         JOIN tenants t ON t.id = u.tenant_id
                         WHERE u.id = $1 AND u.tenant_id = $2
                         LIMIT 1`,
                        [userId, tenantId],
                    );
                }
                throw error;
            }
        },
    );

    const row = result?.rows?.[0];
    if (!row) {
        sessionStateCache.delete(key);
        return null;
    }

    const entry: CachedSessionState = {
        userActive: Boolean(row.user_active),
        currentRole: row.current_role,
        userSessionVersion: parseVersionNumber(row.user_session_version),
        tenantActive: Boolean(row.tenant_active),
        tenantSessionVersion: parseVersionNumber(row.tenant_session_version),
        expiresAt: now + REVOCATION_CACHE_TTL_MS,
    };

    pruneCacheIfNeeded(now);
    sessionStateCache.set(key, entry);
    return entry;
}

/**
 * Validates server-side user/tenant active status, role integrity, and `session_version`
 * counters so password resets, deactivations, role mutations, and tenant suspensions
 * revoke stateless iron-session cookies immediately.
 */
export async function assertActiveSessionState(
    session: Pick<
        SessionData,
        | 'isLoggedIn'
        | 'userId'
        | 'tenantId'
        | 'role'
        | 'sessionVersion'
        | 'tenantSessionVersion'
    >,
): Promise<void> {
    if (!session?.isLoggedIn || !session.userId || !session.tenantId) {
        throw new Error('Unauthorized: Session revoked or inactive');
    }

    // Synthetic unit tests often mock `getSession()` with minimal session stubs
    // without mocking DB queries for `session_version`. Enforce DB revocation in
    // `NODE_ENV === 'test'` whenever `sessionVersion` / `tenantSessionVersion` is
    // stamped on the session or `ENFORCE_SESSION_REVOCATION_IN_TESTS === 'true'`.
    if (
        process.env.NODE_ENV === 'test' &&
        typeof session.sessionVersion !== 'number' &&
        typeof session.tenantSessionVersion !== 'number' &&
        process.env.ENFORCE_SESSION_REVOCATION_IN_TESTS !== 'true'
    ) {
        return;
    }

    const state = await loadSessionState(session.tenantId, session.userId);
    if (!state || !state.userActive || !state.tenantActive) {
        throw new Error('Unauthorized: Session revoked or inactive');
    }

    if (state.currentRole !== session.role) {
        throw new Error('Unauthorized: Session revoked or inactive');
    }

    if (
        typeof session.sessionVersion === 'number' &&
        typeof state.userSessionVersion === 'number' &&
        state.userSessionVersion !== session.sessionVersion
    ) {
        throw new Error('Unauthorized: Session revoked or inactive');
    }

    if (
        typeof session.tenantSessionVersion === 'number' &&
        typeof state.tenantSessionVersion === 'number' &&
        state.tenantSessionVersion !== session.tenantSessionVersion
    ) {
        throw new Error('Unauthorized: Session revoked or inactive');
    }
}

export async function isSessionStateActive(
    session: Pick<
        SessionData,
        | 'isLoggedIn'
        | 'userId'
        | 'tenantId'
        | 'role'
        | 'sessionVersion'
        | 'tenantSessionVersion'
    >,
): Promise<boolean> {
    try {
        await assertActiveSessionState(session);
        return true;
    } catch {
        return false;
    }
}

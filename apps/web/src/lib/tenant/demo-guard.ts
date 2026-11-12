import { pool, RLS_BYPASS_JUSTIFICATIONS, runWithRlsBypass } from '@/lib/db';

export const DEMO_TENANT_CODES = new Set([
    'DEMO-CAMPUS',
    'DEMO-CAMPUS-SOUTH',
]);

const DEMO_CACHE_TTL_MS = 5 * 60 * 1000;
const demoTenantIdCache = new Map<string, { isDemo: boolean; expiresAt: number }>();

export function isPublicDemoSandboxEnabled(): boolean {
    return process.env.ENABLE_PUBLIC_DEMO_SANDBOX !== 'false';
}

export function isDemoTenantCode(code: string | null | undefined): boolean {
    if (!code) return false;
    return DEMO_TENANT_CODES.has(code.trim().toUpperCase());
}

export function isDemoSession(
    session:
        | {
              isDemoSandbox?: boolean;
              tenantCode?: string | null;
          }
        | null
        | undefined,
): boolean {
    if (!session) return false;
    if (session.isDemoSandbox === true) return true;
    return isDemoTenantCode(session.tenantCode);
}

/**
 * Checks whether a `tenantId` belongs to a shared interactive demo campus
 * (`DEMO-CAMPUS`, `DEMO-CAMPUS-SOUTH`, or `tenants.is_demo = true`).
 * Falls back safely if the `is_demo` column has not yet been applied in unit test mocks.
 */
export async function isDemoTenantId(tenantId: string | null | undefined): Promise<boolean> {
    if (!tenantId) return false;

    const now = Date.now();
    const cached = demoTenantIdCache.get(tenantId);
    if (cached && cached.expiresAt > now) {
        return cached.isDemo;
    }

    let isDemo = false;
    try {
        const result = await runWithRlsBypass(
            RLS_BYPASS_JUSTIFICATIONS.DEMO_TENANT_LOOKUP,
            async () => {
                try {
                    return await pool.query<{ code: string; is_demo?: boolean }>(
                        `SELECT code, is_demo FROM tenants WHERE id = $1 LIMIT 1`,
                        [tenantId],
                    );
                } catch {
                    return await pool.query<{ code: string; is_demo?: boolean }>(
                        `SELECT code FROM tenants WHERE id = $1 LIMIT 1`,
                        [tenantId],
                    );
                }
            },
        );
        const row = result?.rows?.[0];
        if (row) {
            isDemo = Boolean(row.is_demo) || isDemoTenantCode(row.code);
        }
    } catch {
        return false;
    }

    demoTenantIdCache.set(tenantId, {
        isDemo,
        expiresAt: now + DEMO_CACHE_TTL_MS,
    });
    return isDemo;
}

export function clearDemoTenantCache(): void {
    demoTenantIdCache.clear();
}

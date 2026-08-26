import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';

/**
 * Read-side queries for the procurement / vendor-trust surface.
 *
 * WHAT IS REAL HERE — the only procurement-relevant records this schema holds
 * for a campus are the third-party systems it has connected:
 * `integration_connections` (provider, MOCK vs LIVE mode, granted scopes, last
 * sync), `integration_api_keys` and `webhook_subscriptions`. All three are
 * tenant-scoped and readable under RLS.
 *
 * WHAT IS NOT — there is no table anywhere in this schema for compliance
 * certificates, shared-responsibility matrices, DPAs or subprocessor
 * attestations, so the page must not offer them. `platform_audit_logs` is
 * guarded by `platform_audit_logs_platform_only` (USING app_private.rls_bypass())
 * and returns zero rows to every tenant session, so it is not read here either;
 * tenant activity records live at /audit.
 *
 * Column names are taken from apps/web/drizzle/0000_init_baseline.sql.
 */

/**
 * /procurement sits behind the tenant-staff route gate, which admits every
 * staff role. Vendor and integration posture is an audit concern, so roles
 * without an audit grant are sent to /unauthorized.
 */
async function requireProcurementRead(): Promise<{ tenantId: string }> {
    const { tenantId, session } = await requireAuth();
    const role = session.role as UserRole;
    const allowed =
        hasPermission(role, 'procurement:read') ||
        hasPermission(role, 'audit:read') ||
        hasPermission(role, 'integrations:read');
    if (!allowed) {
        redirect('/unauthorized');
    }
    return { tenantId };
}

export interface ProcessorRow {
    id: string;
    provider: string;
    mode: string;
    status: string;
    scopes: unknown;
    lastSyncAt: Date | string | null;
    lastSuccessAt: Date | string | null;
    lastFailureAt: Date | string | null;
    lastError: string | null;
    createdAt: Date | string;
}

export interface ProcurementPageData {
    campusName: string | null;
    processors: ProcessorRow[];
    apiKeyCount: number;
    webhookCount: number;
}

/** `scopes` is jsonb; the column default is `[]` but the shape is not enforced. */
export function readScopes(scopes: unknown): string[] {
    if (!Array.isArray(scopes)) return [];
    return scopes.filter((value): value is string => typeof value === 'string');
}

export async function getProcurementPageData(): Promise<ProcurementPageData> {
    const { tenantId } = await requireProcurementRead();

    const [tenantResult, processorResult, keyResult, webhookResult] = await Promise.all([
        pool.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]),
        pool.query(
            `SELECT
                id,
                provider,
                mode,
                status,
                scopes,
                last_sync_at AS "lastSyncAt",
                last_success_at AS "lastSuccessAt",
                last_failure_at AS "lastFailureAt",
                last_error AS "lastError",
                created_at AS "createdAt"
             FROM integration_connections
             WHERE tenant_id = $1
             ORDER BY provider ASC`,
            [tenantId],
        ),
        pool.query(
            `SELECT COUNT(*)::int AS count FROM integration_api_keys WHERE tenant_id = $1`,
            [tenantId],
        ),
        pool.query(
            `SELECT COUNT(*)::int AS count FROM webhook_subscriptions WHERE tenant_id = $1`,
            [tenantId],
        ),
    ]);

    return {
        campusName: (tenantResult.rows[0]?.name as string | undefined) ?? null,
        processors: processorResult.rows as ProcessorRow[],
        apiKeyCount: Number(keyResult.rows[0]?.count ?? 0),
        webhookCount: Number(webhookResult.rows[0]?.count ?? 0),
    };
}

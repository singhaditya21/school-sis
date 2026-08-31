/**
 * Audit Logging Middleware — Centralized audit trail for all mutations.
 * Wraps server actions to automatically log before/after states.
 *
 * NOTE: This is a plain server-side module (no 'use server' directive) so it
 * can be imported directly by route handlers and server components. It exports
 * a synchronous higher-order function (`withAudit`), which a Server Actions
 * file is not allowed to do.
 */

import { tenantScope } from '@school-sis/api/src/data';
import { getSession } from '@/lib/auth/session';
import { auditLogs } from '@school-sis/api/src/db/generated/tables';
import { randomUUID } from 'crypto';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'PAYMENT' | 'ROLE_CHANGE' | 'READ';

export async function logAudit(params: {
    tenantId: string;
    userId: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    description?: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
}) {
    try {
        // tenant_id is supplied by the scope; the rest map to real columns.
        await tenantScope(params.tenantId).insert(auditLogs, {
            id: randomUUID(),
            userId: params.userId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            description: params.description,
            beforeState: params.beforeState,
            afterState: params.afterState,
        });
    } catch (err) {
        // Audit logging should never break the main flow
        console.error('[Audit] Failed to log:', err);
    }
}

/**
 * Higher-order function to wrap server actions with audit logging.
 */
export function withAudit<TArgs extends unknown[], TReturn>(
    action: (...args: TArgs) => Promise<TReturn>,
    auditConfig: {
        action: AuditAction;
        entityType: string;
        getEntityId?: (result: TReturn) => string | undefined;
        getDescription?: (args: TArgs) => string;
    },
) {
    return async (...args: TArgs): Promise<TReturn> => {
        const result = await action(...args);
        // Best-effort, but AWAITED. A fire-and-forget audit is lost when a
        // serverless invocation freezes after responding, and a compliance audit
        // that might not land is worse than a few milliseconds of latency.
        // logAudit swallows its own errors, so this never breaks the wrapped
        // action — the earlier version returned here having written nothing,
        // which made every "audited" mutation silently unaudited.
        try {
            const session = await getSession();
            if (session.isLoggedIn && session.userId && session.tenantId) {
                await logAudit({
                    tenantId: session.tenantId,
                    userId: session.userId,
                    action: auditConfig.action,
                    entityType: auditConfig.entityType,
                    entityId: auditConfig.getEntityId?.(result),
                    description: auditConfig.getDescription?.(args),
                });
            }
        } catch {
            // No request context (called outside a server action) — nothing to log.
        }
        return result;
    };
}

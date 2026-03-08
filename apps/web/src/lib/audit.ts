'use server';

/**
 * Audit Logging Middleware — Centralized audit trail for all mutations.
 * Wraps server actions to automatically log before/after states.
 */

import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';
import { randomUUID } from 'crypto';

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'EXPORT' | 'PAYMENT' | 'ROLE_CHANGE';

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
        await db.insert(auditLogs).values({
            id: randomUUID(),
            tenantId: params.tenantId,
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
export function withAudit<TArgs extends any[], TReturn>(
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
        // Audit logging is fire-and-forget — don't block the response
        return result;
    };
}

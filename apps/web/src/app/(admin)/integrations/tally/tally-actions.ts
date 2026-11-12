'use server';

import { revalidatePath } from 'next/cache';
import { sqlFor, withTenant } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { resolveTrustedAppOrigin } from '@/lib/security/client-ip';
import { integrationRuntimeMode } from '@/lib/integrations/runtime-mode';
import {
    normalizeAccountingLedgerConfig,
    type AccountingLedgerConfig,
} from '@/lib/integrations/accounting-vouchers';

export interface AccountingSyncHistoryItem {
    id: string;
    action: string;
    status: string;
    format: string;
    voucherCount: number;
    fromDate: string | null;
    toDate: string | null;
    createdAtIso: string;
}

export interface AccountingStudioData {
    appOrigin: string;
    schoolName: string;
    config: AccountingLedgerConfig;
    completedPaymentStats: {
        count: number;
        totalAmount: number;
        earliestDate: string;
        latestDate: string;
    };
    syncHistory: AccountingSyncHistoryItem[];
}

export async function getAccountingStudioDataAction(): Promise<AccountingStudioData> {
    const { tenantId } = await requireAuth('fees:read');
    const appOrigin = resolveTrustedAppOrigin();
    const todayIso = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    return withTenant(tenantId, async (client) => {
        const q = sqlFor(client);

        const [tenantRow, connRow, payStats, auditRows] = await Promise.all([
            q<{ name: string }>`
                SELECT name FROM tenants WHERE id = ${tenantId} LIMIT 1
            `.maybeOne(),
            q<{ config: unknown }>`
                SELECT config
                FROM integration_connections
                WHERE tenant_id = ${tenantId} AND provider = 'TALLY'
                LIMIT 1
            `.maybeOne(),
            q<{
                count: number;
                totalAmount: string;
                earliestDate: string | null;
                latestDate: string | null;
            }>`
                SELECT
                    COUNT(*)::int AS count,
                    COALESCE(SUM(amount), 0)::text AS "totalAmount",
                    to_char(MIN(paid_at), 'YYYY-MM-DD') AS "earliestDate",
                    to_char(MAX(paid_at), 'YYYY-MM-DD') AS "latestDate"
                FROM payments
                WHERE tenant_id = ${tenantId}
                  AND status = 'COMPLETED'
            `.one(),
            q<{
                id: string;
                action: string;
                status: string;
                metadata: Record<string, unknown> | null;
                createdAt: Date;
            }>`
                SELECT
                    id,
                    action,
                    status,
                    metadata,
                    created_at AS "createdAt"
                FROM integration_audit_logs
                WHERE tenant_id = ${tenantId}
                  AND provider = 'TALLY'
                ORDER BY created_at DESC
                LIMIT 8
            `,
        ]);

        const schoolName = tenantRow?.name || 'ScholarMind Campus';
        const config = normalizeAccountingLedgerConfig(connRow?.config, schoolName);

        const syncHistory: AccountingSyncHistoryItem[] = auditRows.map((row) => {
            const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
            return {
                id: row.id,
                action: row.action,
                status: row.status,
                format: typeof meta.format === 'string' ? meta.format : 'tally_xml',
                voucherCount: typeof meta.voucherCount === 'number' ? meta.voucherCount : 0,
                fromDate: typeof meta.fromDate === 'string' ? meta.fromDate : null,
                toDate: typeof meta.toDate === 'string' ? meta.toDate : null,
                createdAtIso: new Date(row.createdAt).toISOString(),
            };
        });

        return {
            appOrigin,
            schoolName,
            config,
            completedPaymentStats: {
                count: Number(payStats?.count || 0),
                totalAmount: Number(payStats?.totalAmount || 0),
                earliestDate: payStats?.earliestDate || thirtyDaysAgoIso,
                latestDate: payStats?.latestDate || todayIso,
            },
            syncHistory,
        };
    });
}

export async function saveAccountingLedgerConfigAction(
    input: AccountingLedgerConfig,
): Promise<{ success?: boolean; config?: AccountingLedgerConfig; error?: string }> {
    const { tenantId, session } = await requireAuth('fees:write');

    return withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        const tenantRow = await q<{ name: string }>`
            SELECT name FROM tenants WHERE id = ${tenantId} LIMIT 1
        `.maybeOne();

        const normalized = normalizeAccountingLedgerConfig(
            input,
            tenantRow?.name || 'ScholarMind Campus',
        );
        const mode = integrationRuntimeMode();
        const configPayload = JSON.stringify({ accounting: normalized });
        const scopesPayload = JSON.stringify(['tally:export']);

        await q`
            INSERT INTO integration_connections (
                tenant_id, provider, mode, status, config, scopes, created_by, updated_by
            )
            VALUES (
                ${tenantId},
                'TALLY',
                ${mode},
                'ACTIVE',
                ${configPayload}::jsonb,
                ${scopesPayload}::jsonb,
                ${session.userId},
                ${session.userId}
            )
            ON CONFLICT (tenant_id, provider)
            DO UPDATE SET
                status = 'ACTIVE',
                config = integration_connections.config || ${configPayload}::jsonb,
                updated_by = ${session.userId},
                updated_at = NOW()
        `.execute();

        revalidatePath('/integrations/tally');
        return { success: true, config: normalized };
    });
}

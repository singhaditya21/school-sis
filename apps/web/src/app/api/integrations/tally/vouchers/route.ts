/**
 * Institutional Accounting Sync API (TallyPrime XML, Zoho Books CSV & Open-Source ERPNext JSON)
 *
 * POST /api/integrations/tally/vouchers — export verified payment vouchers using
 * the tenant's persisted custom ledger mappings in zero-cost accounting formats.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { ROLE_GROUPS } from '@/lib/auth/api';
import {
    authenticateIntegrationRequest,
    ensureIntegrationConnection,
    integrationApiHeaders,
    integrationJson,
    recordIntegrationAudit,
    runWithIntegrationTenant,
} from '@/lib/integrations/api-platform';
import {
    buildErpNextJson,
    buildTallyPrimeXml,
    buildZohoBooksCsv,
    normalizeAccountingLedgerConfig,
    type AccountingExportFormat,
    type AccountingPaymentRow,
} from '@/lib/integrations/accounting-vouchers';
import { readTenantScopedJson } from '@/lib/tenant/isolation';
import { logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

function parseExportFormat(raw: unknown): AccountingExportFormat {
    if (raw === 'zoho_csv' || raw === 'erpnext_json' || raw === 'tally_xml') {
        return raw;
    }
    return 'tally_xml';
}

export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const auth = await authenticateIntegrationRequest(request, {
        provider: 'TALLY',
        scopes: ['tally:export'],
        allowSession: true,
        sessionRoles: ROLE_GROUPS.finance,
    });
    if (auth.ok === false) return auth.response;
    const tenantId = auth.context.tenantId;

    return runWithIntegrationTenant(auth.context, async () => {
        try {
            await ensureIntegrationConnection({
                tenantId,
                provider: 'TALLY',
                scopes: ['tally:export'],
                userId: auth.context.userId,
            });

            const json = await readTenantScopedJson<Record<string, unknown>>(request, tenantId);
            if (json.ok === false) return json.response;

            const fromDate =
                typeof json.data.fromDate === 'string'
                    ? json.data.fromDate.trim()
                    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const toDate =
                typeof json.data.toDate === 'string'
                    ? json.data.toDate.trim()
                    : new Date().toISOString().slice(0, 10);
            const format = parseExportFormat(json.data.format);

            if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
                return integrationJson(
                    { error: 'fromDate and toDate must use YYYY-MM-DD format' },
                    { status: 400 },
                );
            }

            const [tenantRows, connRows, payments] = await Promise.all([
                sql<{ name: string }>`
                    SELECT name FROM tenants WHERE id = ${tenantId} LIMIT 1
                `,
                sql<{ config: unknown }>`
                    SELECT config
                    FROM integration_connections
                    WHERE tenant_id = ${tenantId} AND provider = 'TALLY'
                    LIMIT 1
                `,
                sql<AccountingPaymentRow>`
                    SELECT
                        p.id,
                        p.amount,
                        p.method::text AS method,
                        p.paid_at AS "paidAt",
                        p.transaction_id AS "providerReference",
                        i.invoice_number AS "invoiceNumber",
                        s.first_name || ' ' || s.last_name AS "studentName",
                        s.admission_number AS "admissionNumber",
                        g.name AS grade
                    FROM payments p
                    JOIN invoices i ON i.id = p.invoice_id AND i.tenant_id = p.tenant_id
                    JOIN students s ON s.id = i.student_id AND s.tenant_id = p.tenant_id
                    LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = p.tenant_id
                    LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = p.tenant_id
                    WHERE p.tenant_id = ${tenantId}
                      AND p.status = 'COMPLETED'
                      AND p.paid_at >= ${fromDate}::date
                      AND p.paid_at < (${toDate}::date + INTERVAL '1 day')
                    ORDER BY p.paid_at ASC
                `,
            ]);

            const ledgerConfig = normalizeAccountingLedgerConfig(
                connRows[0]?.config,
                tenantRows[0]?.name || 'ScholarMind Campus',
            );

            let payloadBody: string;
            let contentType: string;
            let filename: string;

            if (format === 'zoho_csv') {
                payloadBody = buildZohoBooksCsv(payments, ledgerConfig);
                contentType = 'text/csv; charset=utf-8';
                filename = `zoho_books_journals_${fromDate}_${toDate}.csv`;
            } else if (format === 'erpnext_json') {
                payloadBody = buildErpNextJson(payments, ledgerConfig);
                contentType = 'application/json; charset=utf-8';
                filename = `erpnext_journal_entries_${fromDate}_${toDate}.json`;
            } else {
                payloadBody = buildTallyPrimeXml(payments, ledgerConfig);
                contentType = 'application/xml; charset=utf-8';
                filename = `tally_vouchers_${fromDate}_${toDate}.xml`;
            }

            await recordIntegrationAudit({
                tenantId,
                provider: 'TALLY',
                action: 'tally.vouchers.export',
                status: 'SUCCESS',
                request,
                context: auth.context,
                statusCode: 200,
                durationMs: Date.now() - startedAt,
                metadata: {
                    fromDate,
                    toDate,
                    format,
                    voucherCount: payments.length,
                },
            });

            return new NextResponse(payloadBody, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Disposition': `attachment; filename="${filename}"`,
                    'X-Voucher-Count': String(payments.length),
                    ...integrationApiHeaders(),
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Accounting export failed';
            await recordIntegrationAudit({
                tenantId,
                provider: 'TALLY',
                action: 'tally.vouchers.export',
                status: 'FAILED',
                request,
                context: auth.context,
                statusCode: 500,
                durationMs: Date.now() - startedAt,
                error: message,
            });
            logger.error('tally.export_failed', 'Failed to export accounting vouchers', {
                source: 'integrations',
                metadata: { tenantId, error: message },
            });
            return integrationJson({ error: 'Accounting export failed' }, { status: 500 });
        }
    });
}

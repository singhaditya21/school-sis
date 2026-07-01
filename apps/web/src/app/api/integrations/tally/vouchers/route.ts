/**
 * Tally ERP Sync API
 *
 * Exports fee collection data as Tally-compatible XML vouchers.
 * Enables automatic accounting sync between ScholarMind and Tally ERP 9/Prime.
 *
 * POST /api/integrations/tally/vouchers — export payment vouchers as Tally XML
 */

import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { ROLE_GROUPS } from '@/lib/auth/api';
import {
    authenticateIntegrationRequest,
    ensureMockIntegrationConnection,
    integrationApiHeaders,
    integrationJson,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';
import { readTenantScopedJson } from '@/lib/tenant/isolation';

export const dynamic = "force-dynamic";

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

    try {
        await ensureMockIntegrationConnection({
            tenantId,
            provider: 'TALLY',
            scopes: ['tally:export'],
            userId: auth.context.userId,
        });

        const json = await readTenantScopedJson<Record<string, unknown>>(request, tenantId);
        if (json.ok === false) return json.response;

        const fromDate = typeof json.data.fromDate === 'string'
            ? json.data.fromDate
            : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const toDate = typeof json.data.toDate === 'string'
            ? json.data.toDate
            : new Date().toISOString().slice(0, 10);

        const { rows: payments } = await pool.query(`
            SELECT
                p.id, p.amount, p.method, p.paid_at, p.transaction_id AS "provider_reference",
                i.invoice_number,
                s.first_name || ' ' || s.last_name AS student_name,
                s.admission_number,
                g.name AS grade
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            JOIN students s ON s.id = i.student_id
            LEFT JOIN sections sec ON sec.id = s.section_id
            LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE p.tenant_id = $1
              AND p.status = 'COMPLETED'
              AND p.paid_at >= $2::date
              AND p.paid_at <= $3::date
            ORDER BY p.paid_at ASC
        `, [tenantId, fromDate, toDate]);

        // Generate Tally XML
        const vouchers = payments.map(p => `
    <VOUCHER VCHTYPE="Receipt" ACTION="Create">
        <DATE>${formatTallyDate(p.paid_at)}</DATE>
        <NARRATION>${escapeXml(`Fee Receipt - ${p.student_name} (${p.admission_number}) - Invoice #${p.invoice_number}`)}</NARRATION>
        <VOUCHERNUMBER>${p.id.slice(0, 8)}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${escapeXml(p.student_name)}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(mapPaymentMethod(p.method))}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${p.amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${escapeXml(`Fee Collections - ${p.grade || 'General'}`)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${p.amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
    </VOUCHER>`).join('\n');

        const tallyXml = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
${vouchers}
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;

        await recordIntegrationAudit({
            tenantId,
            provider: 'TALLY',
            action: 'tally.vouchers.export',
            status: 'SUCCESS',
            request,
            context: auth.context,
            statusCode: 200,
            durationMs: Date.now() - startedAt,
            metadata: { fromDate, toDate, voucherCount: payments.length, mode: 'mock' },
        });

        return new NextResponse(tallyXml, {
            headers: {
                'Content-Type': 'application/xml',
                'Content-Disposition': `attachment; filename="tally_vouchers_${fromDate}_${toDate}.xml"`,
                ...integrationApiHeaders(),
            },
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Tally export failed';
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
        console.error('[Tally Sync] Error:', message);
        return integrationJson({ error: 'Tally export failed' }, { status: 500 });
    }
}

function formatTallyDate(date: string | Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function mapPaymentMethod(method: string): string {
    const map: Record<string, string> = {
        'CASH': 'Cash',
        'CARD': 'HDFC Bank',
        'UPI': 'UPI Collections',
        'BANK_TRANSFER': 'Bank Collections',
        'CHEQUE': 'Cheque Collections',
        'ONLINE': 'Online Payments',
    };
    return map[method] || 'Sundry Collections';
}

function escapeXml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

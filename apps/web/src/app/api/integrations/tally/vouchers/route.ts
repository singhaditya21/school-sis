/**
 * Tally ERP Sync API
 *
 * Exports fee collection data as Tally-compatible XML vouchers.
 * Enables automatic accounting sync between ScholarMind and Tally ERP 9/Prime.
 *
 * POST /api/integrations/tally/vouchers — export payment vouchers as Tally XML
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.tenantId;
    await setTenantContext(tenantId);

    try {
        const body = await request.json();
        const fromDate = body.fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const toDate = body.toDate || new Date().toISOString().slice(0, 10);

        const payments = await db.execute(sql`
            SELECT
                p.id, p.amount, p.method, p.paid_at, p.provider_reference,
                i.invoice_number,
                s.first_name || ' ' || s.last_name AS student_name,
                s.admission_number,
                g.name AS grade
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            JOIN students s ON s.id = i.student_id
            LEFT JOIN sections sec ON sec.id = s.section_id
            LEFT JOIN grades g ON g.id = sec.grade_id
            WHERE p.tenant_id = ${tenantId}
              AND p.status = 'COMPLETED'
              AND p.paid_at >= ${fromDate}::date
              AND p.paid_at <= ${toDate}::date
            ORDER BY p.paid_at ASC
        `);

        // Generate Tally XML
        const vouchers = (payments as any[]).map(p => `
    <VOUCHER VCHTYPE="Receipt" ACTION="Create">
        <DATE>${formatTallyDate(p.paid_at)}</DATE>
        <NARRATION>Fee Receipt - ${p.student_name} (${p.admission_number}) - Invoice #${p.invoice_number}</NARRATION>
        <VOUCHERNUMBER>${p.id.slice(0, 8)}</VOUCHERNUMBER>
        <PARTYLEDGERNAME>${p.student_name}</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${mapPaymentMethod(p.method)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${p.amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>
        <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>Fee Collections - ${p.grade || 'General'}</LEDGERNAME>
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

        return new NextResponse(tallyXml, {
            headers: {
                'Content-Type': 'application/xml',
                'Content-Disposition': `attachment; filename="tally_vouchers_${fromDate}_${toDate}.xml"`,
            },
        });
    } catch (error: any) {
        console.error('[Tally Sync] Error:', error.message);
        return NextResponse.json({ error: 'Tally export failed' }, { status: 500 });
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

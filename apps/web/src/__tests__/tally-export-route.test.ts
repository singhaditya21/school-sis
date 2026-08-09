import { NextRequest, NextResponse } from 'next/server';
import { POST } from '@/app/api/integrations/tally/vouchers/route';
import { pool } from '@/lib/db';
import {
    authenticateIntegrationRequest,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';
import { readTenantScopedJson } from '@/lib/tenant/isolation';

jest.mock('@/lib/db', () => ({
    pool: { query: jest.fn() },
}));

jest.mock('@/lib/integrations/api-platform', () => ({
    authenticateIntegrationRequest: jest.fn(),
    integrationApiHeaders: jest.fn(() => ({ 'X-Integration-API-Version': '1' })),
    integrationJson: jest.fn((body: unknown, init?: ResponseInit) => NextResponse.json(body, init)),
    recordIntegrationAudit: jest.fn(),
    runWithIntegrationTenant: jest.fn((_context: unknown, callback: () => unknown) => callback()),
}));

jest.mock('@/lib/tenant/isolation', () => ({
    readTenantScopedJson: jest.fn(),
}));

const TENANT_ID = 'eeaff354-619d-4c3f-8ce1-f0a8ff0c6a4a';

function request(): NextRequest {
    return new NextRequest('http://scholarmind.test/api/integrations/tally/vouchers', { method: 'POST' });
}

describe('Tally voucher export route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (authenticateIntegrationRequest as jest.Mock).mockResolvedValue({
            ok: true,
            context: {
                tenantId: TENANT_ID,
                subjectType: 'session',
                provider: 'TALLY',
                scopes: ['session'],
                userId: '9c14b043-8753-4784-8430-38e71ba10931',
                role: 'FINANCE_LEAD',
            },
        });
        (recordIntegrationAudit as jest.Mock).mockResolvedValue(undefined);
    });

    it('rejects a reversed date range before querying payments', async () => {
        (readTenantScopedJson as jest.Mock).mockResolvedValue({
            ok: true,
            data: { fromDate: '2026-08-10', toDate: '2026-08-01' },
        });

        const response = await POST(request());
        const body = await response.json();

        expect(response.status).toBe(400);
        expect(body).toEqual(expect.objectContaining({
            code: 'INVALID_EXPORT_RANGE',
            details: expect.arrayContaining(['fromDate must be on or before toDate.']),
        }));
        expect(pool.query).not.toHaveBeenCalled();
        expect(recordIntegrationAudit).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: TENANT_ID,
            status: 'FAILED',
            statusCode: 400,
        }));
    });

    it('rejects calendar dates that JavaScript would otherwise normalize', async () => {
        (readTenantScopedJson as jest.Mock).mockResolvedValue({
            ok: true,
            data: { fromDate: '2026-02-31', toDate: '2026-03-02' },
        });

        const response = await POST(request());

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual(expect.objectContaining({
            details: expect.arrayContaining(['Enter valid export dates.']),
        }));
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('exports only the authenticated tenant rows and escapes XML content', async () => {
        (readTenantScopedJson as jest.Mock).mockResolvedValue({
            ok: true,
            data: { fromDate: '2026-08-01', toDate: '2026-08-09' },
        });
        (pool.query as jest.Mock).mockResolvedValue({
            rows: [{
                id: 'e3c597cc-8de1-4c25-8acf-e5c08b0e5db6',
                amount: '1250.00',
                method: 'UPI',
                paid_at: '2026-08-08T10:00:00.000Z',
                provider_reference: 'pay_123',
                invoice_number: 'INV<&>42',
                student_name: 'Asha & Co',
                admission_number: 'ADM-42',
                grade: 'Grade 8',
            }],
        });

        const response = await POST(request());
        const xml = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('application/xml');
        expect(response.headers.get('content-disposition')).toContain('tally_vouchers_2026-08-01_2026-08-09.xml');
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE p.tenant_id = $1'), [
            TENANT_ID,
            '2026-08-01',
            '2026-08-09',
        ]);
        expect(xml).toContain('Asha &amp; Co');
        expect(xml).toContain('INV&lt;&amp;&gt;42');
        expect(xml).toContain('<LEDGERNAME>UPI Collections</LEDGERNAME>');
        expect(recordIntegrationAudit).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: TENANT_ID,
            status: 'SUCCESS',
            metadata: { fromDate: '2026-08-01', toDate: '2026-08-09', voucherCount: 1 },
        }));
    });
});

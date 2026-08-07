const TENANT_ID = '00000000-0000-4000-8000-000000000071';
let mockActiveTenant: string | undefined;
const mockContextualQueries: Array<{ sql: string; tenantId: string | undefined }> = [];

const mockPoolQuery = jest.fn(async (sqlInput: unknown, values: unknown[] = []) => {
    const sql = typeof sqlInput === 'string'
        ? sqlInput
        : String((sqlInput as { text?: string } | null)?.text || '');
    mockContextualQueries.push({ sql, tenantId: mockActiveTenant });

    if (sql.includes('FROM integration_api_keys')) {
        return {
            rows: [{
                id: '00000000-0000-4000-8000-000000000072',
                tenantId: TENANT_ID,
                provider: 'PLATFORM',
                keyHash: values[0],
                scopes: ['*'],
                status: 'ACTIVE',
                expiresAt: null,
                tenantActive: true,
            }],
        };
    }
    if (sql.includes('FROM integration_connections')) {
        if (mockActiveTenant !== TENANT_ID) {
            throw new Error('Integration data query escaped its authenticated tenant context.');
        }
        return { rows: [{ provider: 'SCIM', mode: 'LIVE', status: 'ACTIVE', scopes: ['scim:read'] }] };
    }
    if (sql.includes('INSERT INTO integration_audit_logs') && mockActiveTenant !== TENANT_ID) {
        throw new Error('Integration audit query escaped its authenticated tenant context.');
    }
    return { rows: [], rowCount: 1 };
});

jest.mock('@/lib/db', () => ({
    pool: { query: mockPoolQuery },
    RLS_BYPASS_JUSTIFICATIONS: {
        INTEGRATION_API_KEY_AUTH: {
            id: 'integration.api-key-auth',
            reason: 'Test integration key lookup.',
        },
    },
    runWithRlsBypass: async (_justification: unknown, fn: () => Promise<unknown>) => fn(),
    runWithTenantContext: async (tenantId: string, fn: () => Promise<unknown>) => {
        const previous = mockActiveTenant;
        mockActiveTenant = tenantId;
        try {
            return await fn();
        } finally {
            mockActiveTenant = previous;
        }
    },
}));

jest.mock('@/lib/auth/api', () => ({
    ROLE_GROUPS: { tenantAdmins: ['SUPER_ADMIN'] },
    requireApiAuth: jest.fn(),
}));

import { GET } from '@/app/api/v1/integrations/status/route';

describe('integration API-key tenant context', () => {
    beforeEach(() => {
        mockActiveTenant = undefined;
        mockContextualQueries.length = 0;
        mockPoolQuery.mockClear();
    });

    it('runs post-authentication route queries inside the API key tenant scope', async () => {
        const response = await GET(new Request('https://sis.example.edu/api/v1/integrations/status', {
            headers: { Authorization: 'Bearer ssis_platform_public.secret' },
        }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            tenantId: TENANT_ID,
            subjectType: 'api_key',
        });
        const connectionRead = mockContextualQueries.find(({ sql }) => sql.includes('FROM integration_connections'));
        const auditWrite = mockContextualQueries.find(({ sql }) => sql.includes('INSERT INTO integration_audit_logs'));
        expect(connectionRead?.tenantId).toBe(TENANT_ID);
        expect(auditWrite?.tenantId).toBe(TENANT_ID);
        expect(mockActiveTenant).toBeUndefined();
    });
});

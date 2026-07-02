import {
    getCurrentDbContext,
    runWithRlsBypass,
    runWithTenantContext,
} from '@/lib/db';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

describe('database tenant context', () => {
    it('scopes async work to the active tenant and restores the outer context', async () => {
        expect(getCurrentDbContext()).toBeUndefined();

        await runWithTenantContext(TENANT_ID, async () => {
            expect(getCurrentDbContext()).toEqual({ tenantId: TENANT_ID });

            await runWithRlsBypass(async () => {
                expect(getCurrentDbContext()).toEqual({ bypassRls: true });
            });

            expect(getCurrentDbContext()).toEqual({ tenantId: TENANT_ID });
        });

        expect(getCurrentDbContext()).toBeUndefined();
    });

    it('rejects invalid tenant context values before a query can run', async () => {
        await expect(runWithTenantContext('not-a-uuid', async () => 'unreachable')).rejects.toThrow('Invalid tenant context');
    });
});

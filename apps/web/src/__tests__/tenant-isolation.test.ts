import {
    createPlatformJobPayload,
    createTenantJobPayload,
    createTenantStorageKey,
    getTenantIdFromJobPayload,
    isValidTenantId,
    normalizeStorageFolder,
    readTenantScopedJson,
    rejectCrossTenantFields,
    stripTenantFields,
    validateTenantStorageKey,
} from '@/lib/tenant/isolation';

const TENANT_A = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const TENANT_B = 'f0df64c1-6d43-4e8d-9697-c25044e09eb4';

describe('tenant isolation primitives', () => {
    it('accepts only valid tenant UUIDs', () => {
        expect(isValidTenantId(TENANT_A)).toBe(true);
        expect(isValidTenantId('not-a-tenant')).toBe(false);
        expect(isValidTenantId(null)).toBe(false);
    });

    it('rejects caller-supplied cross-tenant fields', () => {
        const response = rejectCrossTenantFields({ tenantId: TENANT_B }, TENANT_A);
        expect(response?.status).toBe(403);
    });

    it('allows matching tenant fields and strips them before persistence payloads are built', () => {
        const input = { tenantId: TENANT_A, tenant_id: TENANT_A, name: 'Aarav' };
        expect(rejectCrossTenantFields(input, TENANT_A)).toBeNull();
        expect(stripTenantFields(input)).toEqual({ name: 'Aarav' });
    });

    it('validates tenant-scoped JSON request bodies', async () => {
        const request = new Request('https://example.test/api', {
            method: 'POST',
            body: JSON.stringify({ tenant_id: TENANT_B, value: 1 }),
        });

        const result = await readTenantScopedJson(request, TENANT_A);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(403);
        }
    });

    it('normalizes upload folders against the tenant storage allowlist', () => {
        expect(normalizeStorageFolder(' ID Cards ')).toBe('id-cards');
        expect(() => normalizeStorageFolder('private')).toThrow('Invalid upload folder');
    });

    it('creates and validates tenant-prefixed storage keys', () => {
        const key = createTenantStorageKey(TENANT_A, 'documents', 'Report Card Final.PDF');
        expect(key).toMatch(new RegExp(`^${TENANT_A}/documents/[0-9a-f-]+\\.pdf$`));
        expect(validateTenantStorageKey(key, TENANT_A)).toBe(key);
    });

    it('rejects encoded traversal and cross-tenant file retrieval', () => {
        expect(() => validateTenantStorageKey(`${TENANT_A}/documents/%2e%2e/secrets.pdf`, TENANT_A)).toThrow('Invalid file path');
        expect(() => validateTenantStorageKey(`${TENANT_B}/documents/file.pdf`, TENANT_A)).toThrow('Forbidden file path');
    });

    it('creates tenant job payloads from trusted context only', () => {
        expect(createTenantJobPayload(TENANT_A, { task: 'notify', tenantId: TENANT_A })).toEqual({
            task: 'notify',
            tenantId: TENANT_A,
        });

        expect(() => createTenantJobPayload(TENANT_A, { tenant_id: TENANT_B })).toThrow('Job payload tenant does not match context');
        expect(getTenantIdFromJobPayload({ tenantId: TENANT_A })).toBe(TENANT_A);
        expect(() => getTenantIdFromJobPayload({ tenantId: 'bad' })).toThrow('valid tenantId');
    });

    it('removes tenant fields from platform job payloads', () => {
        expect(createPlatformJobPayload({ tenantId: TENANT_A, tenant_id: TENANT_A, kind: 'backup' })).toEqual({
            kind: 'backup',
            scope: 'platform',
        });
    });
});

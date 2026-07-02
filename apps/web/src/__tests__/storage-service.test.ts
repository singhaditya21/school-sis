import { deleteFile, generateFileKey, uploadFile } from '@/lib/services/storage';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const OTHER_TENANT_ID = 'f0df64c1-6d43-4e8d-9697-c25044e09eb4';

describe('R2 storage service safety', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        jest.restoreAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('generates tenant-scoped keys without preserving user-controlled filenames', () => {
        const key = generateFileKey(TENANT_ID, 'reports', '../../term-results.final.pdf');
        expect(key).toMatch(new RegExp(`^${TENANT_ID}/reports/[0-9a-f-]+\\.pdf$`));
        expect(key).not.toContain('term-results');
    });

    it('rejects disallowed upload folders', () => {
        expect(() => generateFileKey(TENANT_ID, 'private', 'secret.pdf')).toThrow("Folder 'private' is not in the allowlist");
    });

    it('rejects traversal before storage credentials are read', async () => {
        await expect(uploadFile(`${TENANT_ID}/documents/%2e%2e/secret.pdf`, Buffer.from('x'), 'application/pdf', TENANT_ID))
            .rejects.toThrow('path traversal');
    });

    it('rejects cross-tenant object keys', async () => {
        await expect(uploadFile(`${OTHER_TENANT_ID}/documents/file.pdf`, Buffer.from('x'), 'application/pdf', TENANT_ID))
            .rejects.toThrow('must be scoped to tenant');
    });

    it('rejects deletion of keys outside the tenant namespace', async () => {
        await expect(deleteFile(`${TENANT_ID}/private/file.pdf`, TENANT_ID)).rejects.toThrow('allowlist');
    });

    it('writes tenant metadata on successful uploads', async () => {
        process.env.R2_ACCOUNT_ID = 'test-account';
        process.env.R2_ACCESS_KEY_ID = 'test-access';
        process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
        process.env.R2_BUCKET_NAME = 'school-sis-test';

        const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
        } as Response);

        const result = await uploadFile(`${TENANT_ID}/documents/file.pdf`, Buffer.from('hello'), 'application/pdf', TENANT_ID);

        expect(result).toEqual({
            url: `https://test-account.r2.cloudflarestorage.com/school-sis-test/${TENANT_ID}/documents/file.pdf`,
            key: `${TENANT_ID}/documents/file.pdf`,
            size: 5,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            `https://test-account.r2.cloudflarestorage.com/school-sis-test/${TENANT_ID}/documents/file.pdf`,
            expect.objectContaining({
                method: 'PUT',
                headers: expect.objectContaining({
                    'Content-Type': 'application/pdf',
                    'x-amz-meta-tenant-id': TENANT_ID,
                }),
            }),
        );
    });
});

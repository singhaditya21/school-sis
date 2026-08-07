import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/upload/route';
import { requireApiAuth } from '@/lib/auth/api';

jest.mock('@/lib/auth/api', () => ({
    requireApiAuth: jest.fn(),
}));

jest.mock('@aws-sdk/client-s3', () => ({
    PutObjectCommand: jest.fn((input) => ({ input })),
    S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({}) })),
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const OTHER_TENANT_ID = 'f0df64c1-6d43-4e8d-9697-c25044e09eb4';
const ORIGINAL_ENV = process.env;

function uploadRequest(options: { tenantId?: string; folder?: string; filename?: string } = {}) {
    const form = new FormData();
    form.set(
        'file',
        new File(['report'], options.filename ?? '../../term-results.final.pdf', {
            type: 'application/pdf',
        }),
    );
    if (options.folder) form.set('folder', options.folder);
    if (options.tenantId) form.set('tenantId', options.tenantId);

    return new NextRequest('https://school.example.edu/api/upload', {
        method: 'POST',
        body: form,
    });
}

describe('storage upload boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {
            ...ORIGINAL_ENV,
            R2_ACCOUNT_ID: 'test-account',
            R2_ACCESS_KEY_ID: 'test-access',
            R2_SECRET_ACCESS_KEY: 'test-secret',
            R2_BUCKET_NAME: 'school-sis-test',
        };
        (requireApiAuth as jest.Mock).mockResolvedValue({
            ok: true,
            context: {
                userId: 'user-1',
                tenantId: TENANT_ID,
                role: 'SCHOOL_ADMIN',
                email: 'admin@school.example.edu',
            },
        });
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('uploads through the configured adapter with a generated tenant key and tenant metadata', async () => {
        const response = await POST(uploadRequest());
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.data.key).toMatch(
            new RegExp(`^${TENANT_ID}/documents/[0-9a-f-]+\\.pdf$`),
        );
        expect(body.data.key).not.toContain('term-results');
        expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({
            Bucket: 'school-sis-test',
            Key: body.data.key,
            ContentType: 'application/pdf',
            Metadata: { tenantId: TENANT_ID },
        }));

        const client = (S3Client as unknown as jest.Mock).mock.results[0]?.value;
        expect(client.send).toHaveBeenCalledWith(expect.objectContaining({
            input: expect.objectContaining({ Key: body.data.key }),
        }));
    });

    it('rejects a caller-supplied cross-tenant identity before writing an object', async () => {
        const response = await POST(uploadRequest({ tenantId: OTHER_TENANT_ID }));

        expect(response.status).toBe(403);
        expect(PutObjectCommand).not.toHaveBeenCalled();
        const client = (S3Client as unknown as jest.Mock).mock.results[0]?.value;
        expect(client.send).not.toHaveBeenCalled();
    });
});

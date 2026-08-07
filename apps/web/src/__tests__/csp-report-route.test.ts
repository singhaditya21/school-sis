import { POST } from '@/app/api/security/csp-report/route';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { logger } from '@/lib/observability/logger';

jest.mock('@/lib/auth/rate-limit', () => ({
    consumeRateLimit: jest.fn(),
}));

jest.mock('@/lib/observability/logger', () => ({
    logger: {
        warn: jest.fn(),
    },
    requestContextFrom: jest.fn(() => ({
        requestId: 'request-test',
        traceId: null,
    })),
}));

beforeEach(() => {
    jest.clearAllMocks();
    (consumeRateLimit as jest.Mock).mockResolvedValue(null);
});

describe('CSP report endpoint', () => {
    it('accepts and sanitizes a browser CSP violation report', async () => {
        const response = await POST(new Request('https://school.example.edu/api/security/csp-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/csp-report',
                'x-real-ip': '203.0.113.10',
            },
            body: JSON.stringify({
                'csp-report': {
                    'document-uri': 'https://school.example.edu/login?token=secret#student-record',
                    'violated-directive': 'script-src-elem',
                    'blocked-uri': 'inline',
                    'source-file': 'https://school.example.edu/app.js?studentId=42',
                    'line-number': 8,
                    sample: 'sensitive inline source is intentionally discarded',
                },
            }),
        }));

        expect(response.status).toBe(204);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(consumeRateLimit).toHaveBeenCalledWith('203.0.113.10', expect.objectContaining({
            scope: 'csp_report_ip',
        }));
        expect(logger.warn).toHaveBeenCalledWith(
            'security.csp_violation',
            'Browser reported a Content Security Policy violation',
            expect.objectContaining({
                metadata: expect.objectContaining({
                    documentUri: 'https://school.example.edu/login',
                    violatedDirective: 'script-src-elem',
                    blockedUri: 'inline',
                }),
            }),
        );
        expect((logger.warn as jest.Mock).mock.calls[0]?.[2]?.metadata).not.toHaveProperty('sample');
        expect((logger.warn as jest.Mock).mock.calls[0]?.[2]?.metadata.sourceFile)
            .toBe('https://school.example.edu/app.js');
        expect(JSON.stringify((logger.warn as jest.Mock).mock.calls[0]?.[2]?.metadata))
            .not.toContain('secret');
    });

    it('rejects an oversized report before parsing it', async () => {
        const response = await POST(new Request('https://school.example.edu/api/security/csp-report', {
            method: 'POST',
            headers: {
                'content-length': String(17 * 1024),
            },
            body: '{}',
        }));

        expect(response.status).toBe(413);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('stops reading a streaming body as soon as the byte limit is exceeded', async () => {
        const read = jest.fn()
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(10 * 1024) })
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(10 * 1024) })
            .mockResolvedValueOnce({ done: false, value: new Uint8Array(10 * 1024) });
        const cancel = jest.fn().mockResolvedValue(undefined);
        const releaseLock = jest.fn();
        const request = {
            headers: new Headers({ 'x-real-ip': '203.0.113.11' }),
            body: {
                getReader: () => ({ read, cancel, releaseLock }),
            },
        } as unknown as Request;

        const response = await POST(request);

        expect(response.status).toBe(413);
        expect(read).toHaveBeenCalledTimes(2);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(releaseLock).toHaveBeenCalledTimes(1);
        expect(logger.warn).not.toHaveBeenCalled();
    });
});

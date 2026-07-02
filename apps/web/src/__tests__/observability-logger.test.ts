import { logger, requestContextFrom } from '@/lib/observability/logger';

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';

describe('observability logger', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('emits structured JSON and redacts sensitive metadata', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

        logger.info('auth.login_attempt', 'Login attempt received', {
            tenantId: TENANT_ID,
            requestId: 'req_123',
            metadata: {
                email: 'admin@example.com',
                password: 'plaintext',
                nested: {
                    apiKey: 'secret-key',
                    keep: 'visible',
                },
            },
        });

        expect(logSpy).toHaveBeenCalledTimes(1);
        const payload = JSON.parse(logSpy.mock.calls[0][0] as string);
        expect(payload).toEqual(expect.objectContaining({
            level: 'INFO',
            event: 'auth.login_attempt',
            message: 'Login attempt received',
            tenantId: TENANT_ID,
            requestId: 'req_123',
            source: 'web',
        }));
        expect(payload.metadata).toEqual({
            email: 'admin@example.com',
            password: '[Redacted]',
            nested: {
                apiKey: '[Redacted]',
                keep: 'visible',
            },
        });
    });

    it('extracts request and trace identifiers from headers', () => {
        const request = new Request('https://example.test/api', {
            headers: {
                'x-request-id': 'req_456',
                traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
            },
        });

        expect(requestContextFrom(request)).toEqual({
            requestId: 'req_456',
            traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        });
    });
});

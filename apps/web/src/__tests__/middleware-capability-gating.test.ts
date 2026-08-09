import { getIronSession } from 'iron-session';
import { NextRequest } from 'next/server';
import { config, middleware } from '@/middleware';
import { CAPABILITY_REGISTRY_REVISION } from '@/lib/capabilities/registry';

jest.mock('iron-session', () => ({ getIronSession: jest.fn() }));

const mockedGetIronSession = getIronSession as jest.MockedFunction<typeof getIronSession>;
const ORIGINAL_ENV = process.env;

function mockSession(
    activeModules: string[],
    overrides: Record<string, unknown> = {},
) {
    mockedGetIronSession.mockResolvedValue({
        isLoggedIn: true,
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'SCHOOL_ADMIN',
        email: 'admin@example.edu',
        token: '',
        activeModules,
        institutionType: 'K12',
        capabilityRevision: CAPABILITY_REGISTRY_REVISION,
        mfaRequired: false,
        mfaVerified: true,
        ...overrides,
    } as Awaited<ReturnType<typeof getIronSession>>);
}

describe('middleware capability gating', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...ORIGINAL_ENV, NODE_ENV: 'test' };
        delete process.env.EMAIL_PROVIDER;
        delete process.env.SMS_PROVIDER;
    });

    afterAll(() => {
        process.env = ORIGINAL_ENV;
    });

    it('does not allow an entitlement to expose a hidden page', async () => {
        mockSession(['AI_AGENTS']);

        const response = await middleware(new NextRequest('https://app.example.edu/chat'));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('/unavailable?capability=ai&reason=HIDDEN');
    });

    it('requires re-authentication when the code-owned registry changes', async () => {
        mockedGetIronSession.mockResolvedValueOnce({
            isLoggedIn: true,
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'SCHOOL_ADMIN',
            email: 'admin@example.edu',
            token: '',
            activeModules: ['FEES'],
            institutionType: 'K12',
            capabilityRevision: 'cap-v1-stale',
            mfaRequired: false,
            mfaVerified: false,
        } as Awaited<ReturnType<typeof getIronSession>>);

        const response = await middleware(new NextRequest('https://app.example.edu/fees'));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('/login?redirect=%2Ffees&reason=capabilities_changed');
    });

    it('fails closed without the session entitlement instead of using module defaults', async () => {
        mockSession([]);

        const response = await middleware(new NextRequest('https://app.example.edu/fees'));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://app.example.edu/upgrade?feature=payments');
    });

    it('distinguishes an unconfigured provider from an entitlement failure', async () => {
        mockSession(['COMMUNICATION']);

        const response = await middleware(new NextRequest('https://app.example.edu/messages'));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('capability=communications');
        expect(response.headers.get('location')).toContain('reason=UNCONFIGURED');
    });

    it('allows a pilot capability only when lifecycle, entitlement, permission, and institution checks pass', async () => {
        mockSession(['FEES']);

        const response = await middleware(new NextRequest('https://app.example.edu/fees'));

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });

    it('returns a non-disclosing 404 for protected hidden API namespaces', async () => {
        mockSession(['AI_AGENTS']);

        const response = await middleware(new NextRequest('https://app.example.edu/api/chat'));

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({
            error: 'Capability unavailable',
            capability: 'ai',
            reason: 'HIDDEN',
        });
    });

    it('covers authenticated capability APIs without intercepting provider webhooks', () => {
        expect(config.matcher).toContain('/api/finance/:path*');
        expect(config.matcher).toContain('/api/exports/:path*');
        expect(config.matcher).toContain('/api/payments/orders/:path*');
        expect(config.matcher).not.toContain('/api/payments/:path*');
        expect(config.matcher).not.toContain('/api/payments/webhook/:path*');
        expect(config.matcher).not.toContain('/api/integrations/:path*');
    });

    it('fails closed for unclassified product pages in production', async () => {
        process.env = { ...process.env, NODE_ENV: 'production' };
        mockSession([]);

        const response = await middleware(new NextRequest('https://app.example.edu/analytics'));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
            'https://app.example.edu/unavailable?reason=UNCLASSIFIED',
        );
    });

    it('keeps explicit access-support pages reachable under the production fail-closed policy', async () => {
        process.env = { ...process.env, NODE_ENV: 'production' };
        mockSession([]);

        const response = await middleware(new NextRequest('https://app.example.edu/unavailable'));

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });

    it('allows classified base-product pages in production', async () => {
        process.env = { ...process.env, NODE_ENV: 'production' };
        mockSession([]);

        const response = await middleware(new NextRequest('https://app.example.edu/dashboard'));

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });

    it('confines an MFA-pending session to the enrollment route', async () => {
        mockSession([], { mfaRequired: true, mfaVerified: false });

        const response = await middleware(new NextRequest('https://app.example.edu/dashboard'));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
            'https://app.example.edu/mfa/enroll?redirect=%2Fdashboard',
        );
    });

    it('keeps the MFA enrollment page reachable for a pending session', async () => {
        mockSession([], { mfaRequired: true, mfaVerified: false });

        const response = await middleware(new NextRequest('https://app.example.edu/mfa/enroll'));

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
    });

    it('denies API access while MFA enrollment is pending', async () => {
        mockSession(['FEES'], { mfaRequired: true, mfaVerified: false });

        const response = await middleware(new NextRequest('https://app.example.edu/api/finance/summary'));

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({
            error: 'MFA enrollment required',
            code: 'MFA_ENROLLMENT_REQUIRED',
        });
    });
});

import { GET } from '@/app/api/v1/capabilities/route';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/rbac/permissions';

jest.mock('@/lib/auth/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/rbac/permissions', () => ({
    hasPermission: jest.fn(() => true),
    UserRole: {},
}));
jest.mock('@/lib/capabilities/providers', () => ({
    configuredProviderRequirements: jest.fn(() => []),
}));

const mockedGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockedHasPermission = hasPermission as jest.MockedFunction<typeof hasPermission>;

describe('GET /api/v1/capabilities', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedHasPermission.mockReturnValue(true);
    });

    it('requires an authenticated tenant session', async () => {
        mockedGetSession.mockResolvedValue({ isLoggedIn: false } as Awaited<ReturnType<typeof getSession>>);

        const response = await GET();

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    });

    it('returns only the caller-safe capability decision shape', async () => {
        mockedGetSession.mockResolvedValue({
            isLoggedIn: true,
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'SCHOOL_ADMIN',
            email: 'admin@example.edu',
            token: '',
            activeModules: ['ATTENDANCE', 'FEES', 'COMMUNICATION'],
            institutionType: 'K12',
        } as Awaited<ReturnType<typeof getSession>>);

        const response = await GET();
        const body = await response.json() as { capabilities: Record<string, unknown>[] };

        expect(response.status).toBe(200);
        expect(body.capabilities.length).toBeGreaterThan(0);
        for (const capability of body.capabilities) {
            expect(Object.keys(capability).sort()).toEqual(
                capability.available
                    ? ['available', 'id', 'lifecycle']
                    : ['available', 'id', 'lifecycle', 'reason'],
            );
        }
        expect(body.capabilities.find(({ id }) => id === 'ai')).toMatchObject({
            lifecycle: 'HIDDEN',
            available: false,
            reason: 'HIDDEN',
        });
    });
});

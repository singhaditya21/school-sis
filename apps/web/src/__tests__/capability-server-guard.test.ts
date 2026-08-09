import { requireAuth } from '@/lib/auth/middleware';
import { getSession } from '@/lib/auth/session';
import { hasPermission } from '@/lib/rbac/permissions';
import {
    CapabilityAccessError,
    requireCapability,
} from '@/lib/capabilities/server';

jest.mock('@/lib/auth/middleware', () => ({ requireAuth: jest.fn() }));
jest.mock('@/lib/auth/session', () => ({ getSession: jest.fn() }));
jest.mock('@/lib/rbac/permissions', () => ({
    hasPermission: jest.fn(),
    UserRole: {},
}));
jest.mock('@/lib/capabilities/providers', () => ({
    configuredProviderRequirements: jest.fn(() => []),
}));

const mockedRequireAuth = requireAuth as jest.MockedFunction<typeof requireAuth>;
const mockedGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockedHasPermission = hasPermission as jest.MockedFunction<typeof hasPermission>;

describe('requireCapability', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedRequireAuth.mockResolvedValue({
            session: {
                userId: 'user-1',
                tenantId: 'tenant-1',
                role: 'SCHOOL_ADMIN',
                email: 'admin@example.edu',
            },
            tenantId: 'tenant-1',
            userId: 'user-1',
        });
        mockedHasPermission.mockReturnValue(true);
    });

    it('adds capability checks to the existing action permission guard', async () => {
        mockedGetSession.mockResolvedValue({
            isLoggedIn: true,
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'SCHOOL_ADMIN',
            email: 'admin@example.edu',
            token: '',
            activeModules: ['FEES'],
            institutionType: 'K12',
        } as Awaited<ReturnType<typeof getSession>>);

        const result = await requireCapability('payments', 'fees:update');

        expect(mockedRequireAuth).toHaveBeenCalledWith('fees:update');
        expect(result.capability).toMatchObject({ id: 'payments', available: true });
    });

    it('rejects missing session entitlements instead of supplying defaults', async () => {
        mockedGetSession.mockResolvedValue({
            isLoggedIn: true,
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'SCHOOL_ADMIN',
            email: 'admin@example.edu',
            token: '',
            activeModules: [],
            institutionType: 'K12',
        } as Awaited<ReturnType<typeof getSession>>);

        await expect(requireCapability('payments')).rejects.toMatchObject<Partial<CapabilityAccessError>>({
            capabilityId: 'payments',
            status: 403,
            decision: expect.objectContaining({ reason: 'NOT_ENTITLED' }),
        });
    });
});

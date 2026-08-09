import { getIronSession } from 'iron-session';
import { establishSession } from '@/lib/auth/identity';
import { getSession, type SessionData } from '@/lib/auth/session';
import { CAPABILITY_REGISTRY_REVISION } from '@/lib/capabilities/registry';

jest.mock('next/headers', () => ({ cookies: jest.fn().mockResolvedValue({}) }));
jest.mock('iron-session', () => ({ getIronSession: jest.fn() }));

const mockedGetIronSession = getIronSession as jest.MockedFunction<typeof getIronSession>;

describe('capability session revision', () => {
    it('stamps every newly established session with the current registry revision', () => {
        const session = {} as SessionData;

        establishSession(session, {
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'STUDENT',
            email: 'student@example.edu',
            provider: 'password',
            activeModules: [],
            institutionType: 'K12',
        });

        expect(session.capabilityRevision).toBe(CAPABILITY_REGISTRY_REVISION);
    });

    it('destroys stale sessions before server actions can use old entitlement context', async () => {
        const staleSession = {
            isLoggedIn: true,
            userId: 'user-1',
            tenantId: 'tenant-1',
            role: 'SCHOOL_ADMIN',
            email: 'admin@example.edu',
            token: '',
            activeModules: ['FEES'],
            capabilityRevision: 'cap-v1-stale',
            destroy: jest.fn(),
        };
        mockedGetIronSession.mockResolvedValue(staleSession as Awaited<ReturnType<typeof getIronSession>>);

        const session = await getSession();

        expect(staleSession.destroy).toHaveBeenCalledTimes(1);
        expect(session.isLoggedIn).toBe(false);
        expect(session.activeModules).toBeUndefined();
        expect(session.capabilityRevision).toBeUndefined();
    });
});

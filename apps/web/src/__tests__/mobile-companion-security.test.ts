import {
    appendOfflineAttendanceBatch,
    buildMobileRequestInit,
    clearMobileSession,
    extractBearerToken,
    getMobileSession,
    getOfflineAttendanceQueueSnapshot,
    hydrateOfflineAttendanceQueue,
    registerOfflineQueueStorageAdapter,
    saveOfflineAttendanceQueue,
    setMobileSession,
    subscribeMobileSession,
    subscribeOfflineAttendanceQueue,
    type KeyValueStorageAdapter,
    type QueuedAttendanceBatch,
} from '../../../../apps/mobile/lib/secure-session';

jest.mock(
    'expo-constants',
    () => ({
        __esModule: true,
        default: {
            expoConfig: {
                extra: {},
                hostUri: '192.168.1.25:8081',
            },
        },
    }),
    { virtual: true },
);

function makeBatch(index: number): QueuedAttendanceBatch {
    return {
        id: `batch-${index}`,
        sectionId: `sec-${index}`,
        sectionLabel: `Grade 8 - Section A (${index})`,
        date: '2026-11-15',
        queuedAt: '2026-11-15T06:30:00.000Z',
        entries: [
            { studentId: `stu-${index}-1`, status: 'PRESENT' },
            { studentId: `stu-${index}-2`, status: 'ABSENT' },
            { studentId: `stu-${index}-3`, status: 'LATE' },
        ],
    };
}

describe('Mobile companion security & offline queue contract (#21)', () => {
    const originalEnv = process.env;

    beforeEach(async () => {
        process.env = { ...originalEnv };
        clearMobileSession();
        registerOfflineQueueStorageAdapter(null);
        await saveOfflineAttendanceQueue([]);
    });

    afterAll(() => {
        process.env = originalEnv;
        delete (globalThis as Record<string, unknown>).__DEV__;
    });

    describe('Bearer session handling & ambient cookie avoidance', () => {
        it('extracts trimmed bearer tokens across supported auth response keys', () => {
            expect(extractBearerToken({ token: '  tok_123  ' })).toBe('tok_123');
            expect(extractBearerToken({ accessToken: 'acc_456' })).toBe('acc_456');
            expect(extractBearerToken({ bearerToken: 'br_789' })).toBe('br_789');
            expect(extractBearerToken({ token: '   ', other: 123 })).toBeNull();
        });

        it('sends Authorization: Bearer with credentials: omit when authenticated and clears cleanly on sign-out', () => {
            const events: boolean[] = [];
            const unsubscribe = subscribeMobileSession((state) => {
                events.push(state.authenticated);
            });

            setMobileSession({
                bearerToken: 'session-jwt-xyz',
                email: 'parent@school.edu.in',
                displayName: 'Anita Verma',
                schoolCode: 'DPS-NOIDA',
            });

            expect(getMobileSession()).toEqual({
                bearerToken: 'session-jwt-xyz',
                email: 'parent@school.edu.in',
                displayName: 'Anita Verma',
                schoolCode: 'DPS-NOIDA',
                authenticated: true,
            });

            const authedInit = buildMobileRequestInit({
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{"ok":true}',
            });
            expect(authedInit).toEqual({
                method: 'POST',
                headers: {
                    Authorization: 'Bearer session-jwt-xyz',
                    'Content-Type': 'application/json',
                },
                body: '{"ok":true}',
                credentials: 'omit',
            });

            clearMobileSession();
            unsubscribe();

            expect(getMobileSession().bearerToken).toBeNull();
            expect(getMobileSession().authenticated).toBe(false);
            expect(events).toEqual([true, false]);

            const unauthedInit = buildMobileRequestInit();
            expect(unauthedInit.credentials).toBe('same-origin');
            expect((unauthedInit.headers as Record<string, string>).Authorization).toBeUndefined();
        });
    });

    describe('Durable bounded offline teacher roll-call queue', () => {
        it('hydrates from storage adapter, rejects malformed entries, and caps queue at 50 batches', async () => {
            const backing = new Map<string, string>();
            const adapter: KeyValueStorageAdapter = {
                getItem: async (key) => backing.get(key) ?? null,
                setItem: async (key, value) => {
                    backing.set(key, value);
                },
                removeItem: async (key) => {
                    backing.delete(key);
                },
            };
            registerOfflineQueueStorageAdapter(adapter);

            const updates: number[] = [];
            const unsubscribe = subscribeOfflineAttendanceQueue((q) => updates.push(q.length));

            for (let i = 1; i <= 55; i += 1) {
                await appendOfflineAttendanceBatch(makeBatch(i));
            }
            unsubscribe();

            const snapshot = getOfflineAttendanceQueueSnapshot();
            expect(snapshot).toHaveLength(50);
            expect(snapshot[0].id).toBe('batch-6');
            expect(snapshot[49].id).toBe('batch-55');
            expect(updates[updates.length - 1]).toBe(50);

            // Corrupt + valid payload test during hydration
            backing.set(
                'scholarmind.mobile.offline_roll_call_v1',
                JSON.stringify([
                    makeBatch(101),
                    { id: 'bad', entries: [{ studentId: 's1', status: 'INVALID_STATUS' }] },
                ]),
            );
            await saveOfflineAttendanceQueue([]);
            backing.set(
                'scholarmind.mobile.offline_roll_call_v1',
                JSON.stringify([
                    makeBatch(101),
                    { id: 'bad', entries: [{ studentId: 's1', status: 'INVALID_STATUS' }] },
                ]),
            );
            const hydrated = await hydrateOfflineAttendanceQueue();
            expect(hydrated).toHaveLength(1);
            expect(hydrated[0].id).toBe('batch-101');
        });
    });

    describe('Production HTTPS transport & origin pinning (apps/mobile/config.ts)', () => {
        it('refuses cleartext http:// and unconfigured backend URLs in production builds', () => {
            (globalThis as Record<string, unknown>).__DEV__ = false;
            delete process.env.EXPO_PUBLIC_BACKEND_URL;

            jest.isolateModules(() => {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const mobileConfig = require('../../../../apps/mobile/config') as typeof import('../../../../apps/mobile/config');
                expect(mobileConfig.config.BACKEND_URL).toBeNull();
                expect(() => mobileConfig.requireBackendUrl()).toThrow(/EXPO_PUBLIC_BACKEND_URL is not set/i);
            });

            process.env.EXPO_PUBLIC_BACKEND_URL = 'http://school-sis-web.vercel.app';
            jest.isolateModules(() => {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const mobileConfig = require('../../../../apps/mobile/config') as typeof import('../../../../apps/mobile/config');
                expect(mobileConfig.config.BACKEND_URL).toBeNull();
                expect(mobileConfig.config.BACKEND_CONFIG_ERROR).toMatch(/Refusing cleartext http/i);
                expect(() => mobileConfig.requireBackendUrl()).toThrow(/Refusing cleartext http/i);
            });
        });

        it('enforces exact HTTPS origin pinning in resolveSafeBackendUrl and blocks open-redirect paths', () => {
            (globalThis as Record<string, unknown>).__DEV__ = false;
            process.env.EXPO_PUBLIC_BACKEND_URL = 'https://school-sis-web.vercel.app/';

            jest.isolateModules(() => {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const mobileConfig = require('../../../../apps/mobile/config') as typeof import('../../../../apps/mobile/config');
                expect(mobileConfig.requireBackendUrl()).toBe('https://school-sis-web.vercel.app');
                expect(mobileConfig.resolveSafeBackendUrl('/parent/fees?invoice=1')).toBe(
                    'https://school-sis-web.vercel.app/parent/fees?invoice=1',
                );
                expect(() => mobileConfig.resolveSafeBackendUrl('//evil.example.org/phish')).toThrow(
                    /Refusing to open untrusted external link path/i,
                );
                expect(() => mobileConfig.resolveSafeBackendUrl('https://evil.example.org/phish')).toThrow(
                    /Refusing to open untrusted external link path/i,
                );
                expect(() => mobileConfig.resolveSafeBackendUrl('/\\evil.example.org')).toThrow(
                    /Refusing to open untrusted external link path/i,
                );
            });
        });
    });
});

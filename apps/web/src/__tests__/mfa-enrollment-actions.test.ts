import {
    completeMfaEnrollment,
    startMfaEnrollment,
} from '@/lib/actions/mfa-enrollment';
import { getSession } from '@/lib/auth/session';
import { activateMFA, generateMFAEnrollment } from '@/lib/auth/mfa';
import { consumeRateLimit } from '@/lib/auth/rate-limit';

jest.mock('@/lib/auth/session', () => ({
    getSession: jest.fn(),
}));

jest.mock('@/lib/auth/mfa', () => ({
    activateMFA: jest.fn(),
    generateMFAEnrollment: jest.fn(),
}));

jest.mock('@/lib/auth/rate-limit', () => ({
    consumeRateLimit: jest.fn(),
}));

const USER_ID = 'b2ec7f65-62d2-430f-9e6f-628c24d37101';
const TENANT_ID = '5747e37e-10a9-4c78-ae17-d2fa7c437d30';

type MockEnrollmentSession = {
    isLoggedIn: boolean;
    userId: string;
    tenantId: string;
    email: string;
    role: string;
    mfaRequired: boolean;
    mfaVerified: boolean;
    save: jest.Mock;
};

function pendingEnrollmentSession(
    overrides: Partial<MockEnrollmentSession> = {},
): MockEnrollmentSession {
    return {
        isLoggedIn: true,
        userId: USER_ID,
        tenantId: TENANT_ID,
        email: 'admin@scholarmind.example',
        role: 'SCHOOL_ADMIN',
        mfaRequired: true,
        mfaVerified: false,
        save: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe('MFA enrollment actions', () => {
    let session: MockEnrollmentSession;

    beforeEach(() => {
        jest.clearAllMocks();
        session = pendingEnrollmentSession();
        (getSession as jest.Mock).mockResolvedValue(session);
        (consumeRateLimit as jest.Mock).mockResolvedValue(null);
        (generateMFAEnrollment as jest.Mock).mockResolvedValue({
            secret: 'JBSWY3DPEHPK3PXP',
            qrCodeDataUrl: 'data:image/png;base64,cXItY29kZQ==',
            backupCodes: ['BACKUP0001', 'BACKUP0002'],
        });
        (activateMFA as jest.Mock).mockResolvedValue({ success: true });
    });

    describe('startMfaEnrollment', () => {
        it('rejects an unauthenticated session before rate limiting or persistence', async () => {
            (getSession as jest.Mock).mockResolvedValue(pendingEnrollmentSession({
                isLoggedIn: false,
                userId: '',
                tenantId: '',
            }));

            await expect(startMfaEnrollment()).resolves.toEqual({
                success: false,
                error: 'Your sign-in session has expired. Sign in again to continue.',
            });
            expect(consumeRateLimit).not.toHaveBeenCalled();
            expect(generateMFAEnrollment).not.toHaveBeenCalled();
        });

        it.each([
            ['MFA is not required', { mfaRequired: false }],
            ['MFA has already been verified', { mfaVerified: true }],
        ])('rejects when enrollment is not pending: %s', async (_label, state) => {
            (getSession as jest.Mock).mockResolvedValue(pendingEnrollmentSession(state));

            await expect(startMfaEnrollment()).resolves.toEqual({
                success: false,
                error: 'MFA enrollment is not pending for this account.',
            });
            expect(consumeRateLimit).not.toHaveBeenCalled();
            expect(generateMFAEnrollment).not.toHaveBeenCalled();
        });

        it('stops before secret generation when the enrollment-start limit is reached', async () => {
            (consumeRateLimit as jest.Mock).mockResolvedValue(
                'Too many enrollment attempts. Please wait before trying again.',
            );

            await expect(startMfaEnrollment()).resolves.toEqual({
                success: false,
                error: 'Too many enrollment attempts. Please wait before trying again.',
            });
            expect(consumeRateLimit).toHaveBeenCalledWith(USER_ID, {
                scope: 'mfa-enrollment-start',
                maxAttempts: 5,
                endpointClass: 'authenticated-internal',
                message: 'Too many enrollment attempts. Please wait before trying again.',
            });
            expect(generateMFAEnrollment).not.toHaveBeenCalled();
        });

        it('binds generated enrollment material to the session user and tenant', async () => {
            await expect(startMfaEnrollment()).resolves.toEqual({
                success: true,
                secret: 'JBSWY3DPEHPK3PXP',
                qrCodeDataUrl: 'data:image/png;base64,cXItY29kZQ==',
                backupCodes: ['BACKUP0001', 'BACKUP0002'],
            });
            expect(generateMFAEnrollment).toHaveBeenCalledWith(
                USER_ID,
                TENANT_ID,
                'admin@scholarmind.example',
            );
        });
    });

    describe('completeMfaEnrollment', () => {
        it('rejects an unauthenticated completion before throttling or activation', async () => {
            (getSession as jest.Mock).mockResolvedValue(pendingEnrollmentSession({
                isLoggedIn: false,
                userId: '',
                tenantId: '',
            }));

            await expect(completeMfaEnrollment('123456')).resolves.toEqual({
                success: false,
                error: 'Your sign-in session has expired. Sign in again to continue.',
            });
            expect(consumeRateLimit).not.toHaveBeenCalled();
            expect(activateMFA).not.toHaveBeenCalled();
        });

        it('rejects completion when the session is no longer pending enrollment', async () => {
            (getSession as jest.Mock).mockResolvedValue(pendingEnrollmentSession({
                mfaVerified: true,
            }));

            await expect(completeMfaEnrollment('123456')).resolves.toEqual({
                success: false,
                error: 'MFA enrollment is not pending for this account.',
            });
            expect(consumeRateLimit).not.toHaveBeenCalled();
            expect(activateMFA).not.toHaveBeenCalled();
        });

        it('rejects a malformed code before reading or mutating enrollment state', async () => {
            await expect(completeMfaEnrollment('12ab')).resolves.toEqual({
                success: false,
                error: 'Enter the six-digit code from your authenticator app.',
            });
            expect(getSession).not.toHaveBeenCalled();
            expect(consumeRateLimit).not.toHaveBeenCalled();
            expect(activateMFA).not.toHaveBeenCalled();
            expect(session.save).not.toHaveBeenCalled();
        });

        it('returns an invalid-code failure without auditing or verifying the session', async () => {
            (activateMFA as jest.Mock).mockResolvedValue({
                success: false,
                error: 'Invalid or expired code. Please try again.',
            });

            await expect(completeMfaEnrollment('123456')).resolves.toEqual({
                success: false,
                error: 'Invalid or expired code. Please try again.',
            });
            expect(activateMFA).toHaveBeenCalledWith(USER_ID, TENANT_ID, '123456');
            expect(session.mfaVerified).toBe(false);
            expect(session.save).not.toHaveBeenCalled();
        });

        it('stops before activation when the verification limit is reached', async () => {
            (consumeRateLimit as jest.Mock).mockResolvedValue(
                'Too many verification attempts. Please wait before trying again.',
            );

            await expect(completeMfaEnrollment('123456')).resolves.toEqual({
                success: false,
                error: 'Too many verification attempts. Please wait before trying again.',
            });
            expect(consumeRateLimit).toHaveBeenCalledWith(USER_ID, {
                scope: 'mfa-enrollment-verify',
                maxAttempts: 10,
                endpointClass: 'authenticated-internal',
                message: 'Too many verification attempts. Please wait before trying again.',
            });
            expect(activateMFA).not.toHaveBeenCalled();
            expect(session.save).not.toHaveBeenCalled();
        });

        it('marks the signed session verified after durable activation', async () => {
            await expect(completeMfaEnrollment('123456')).resolves.toEqual({
                success: true,
                redirectTo: '/dashboard',
            });
            expect(activateMFA).toHaveBeenCalledWith(USER_ID, TENANT_ID, '123456');
            expect(session.mfaRequired).toBe(true);
            expect(session.mfaVerified).toBe(true);
            expect(session.save).toHaveBeenCalledTimes(1);
            expect((activateMFA as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(session.save.mock.invocationCallOrder[0]);
        });

        it('truthfully requires re-login when activation committed but session renewal fails', async () => {
            const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
            session.save.mockRejectedValue(new Error('cookie signing unavailable'));

            await expect(completeMfaEnrollment('123456')).resolves.toEqual({
                success: true,
                redirectTo: '/login?mfa=enabled',
            });
            expect(activateMFA).toHaveBeenCalledWith(USER_ID, TENANT_ID, '123456');
            expect(session.mfaVerified).toBe(true);
            expect(session.save).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledWith(
                '[MFA enrollment] Activated, but session renewal failed:',
                expect.any(Error),
            );

            consoleError.mockRestore();
        });
    });
});

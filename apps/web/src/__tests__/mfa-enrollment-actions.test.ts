import fs from 'node:fs';
import path from 'node:path';
import { getMfaEnrollmentSession } from '@/lib/auth/session';
import { activateMFA, generateMFAEnrollment } from '@/lib/auth/mfa';
import {
    activateMfaEnrollment,
    startMfaEnrollment,
} from '@/lib/actions/mfa-enrollment';

jest.mock('@/lib/auth/session', () => ({
    getMfaEnrollmentSession: jest.fn(),
}));

jest.mock('@/lib/auth/mfa', () => ({
    activateMFA: jest.fn(),
    generateMFAEnrollment: jest.fn(),
}));

const TENANT_ID = '0c413c23-6f0f-40ab-bd41-73e6e996ff35';
const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('MFA enrollment actions', () => {
    const session = {
        isLoggedIn: true,
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: 'SCHOOL_ADMIN',
        email: 'admin@example.edu',
        authVersion: 11,
        passwordChangeRequired: false,
        mfaRequired: true,
        mfaVerified: false,
        save: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        session.authVersion = 11;
        session.passwordChangeRequired = false;
        session.mfaRequired = true;
        session.mfaVerified = false;
        (getMfaEnrollmentSession as jest.Mock).mockResolvedValue(session);
    });

    it('generates enrollment material and promotes only the current restricted session revision', async () => {
        (generateMFAEnrollment as jest.Mock).mockResolvedValue({
            secret: 'MANUAL-SECRET',
            qrCodeDataUrl: 'data:image/png;base64,qr',
            backupCodes: ['BACKUP-ONE', 'BACKUP-TWO'],
            authVersion: 12,
        });

        const result = await startMfaEnrollment();

        expect(generateMFAEnrollment).toHaveBeenCalledWith(
            USER_ID,
            TENANT_ID,
            'admin@example.edu',
            11,
        );
        expect(result).toEqual({
            success: true,
            data: {
                secret: 'MANUAL-SECRET',
                qrCodeDataUrl: 'data:image/png;base64,qr',
                backupCodes: ['BACKUP-ONE', 'BACKUP-TWO'],
            },
        });
        expect(session.authVersion).toBe(12);
        expect(session.mfaVerified).toBe(false);
        expect(session.save).toHaveBeenCalledTimes(1);
    });

    it('activates MFA and promotes the enrolling session to a verified revision', async () => {
        (activateMFA as jest.Mock).mockResolvedValue({ success: true, authVersion: 12 });

        const result = await activateMfaEnrollment('123456');

        expect(activateMFA).toHaveBeenCalledWith(USER_ID, TENANT_ID, '123456', 11);
        expect(result).toEqual({ success: true, redirectTo: '/dashboard' });
        expect(session.authVersion).toBe(12);
        expect(session.mfaRequired).toBe(true);
        expect(session.mfaVerified).toBe(true);
        expect(session.save).toHaveBeenCalledTimes(1);
    });

    it('rejects malformed codes before resolving or mutating a session', async () => {
        const result = await activateMfaEnrollment('12ab');

        expect(result).toEqual({ success: false, error: 'Enter the 6-digit authenticator code.' });
        expect(getMfaEnrollmentSession).not.toHaveBeenCalled();
        expect(activateMFA).not.toHaveBeenCalled();
        expect(session.save).not.toHaveBeenCalled();
    });

    it('keeps password-change sessions out of MFA enrollment', async () => {
        session.passwordChangeRequired = true;

        const result = await startMfaEnrollment();

        expect(result).toEqual({
            success: false,
            error: 'A valid MFA enrollment session is required.',
        });
        expect(generateMFAEnrollment).not.toHaveBeenCalled();
        expect(session.save).not.toHaveBeenCalled();
    });

    it('uses tenant-scoped optimistic revisions for every MFA credential mutation', () => {
        const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/mfa.ts'), 'utf8');
        const enrollment = source.slice(
            source.indexOf('export async function generateMFAEnrollment'),
            source.indexOf('export async function activateMFA'),
        );
        const activation = source.slice(
            source.indexOf('export async function activateMFA'),
            source.indexOf('export async function verifyMFACode'),
        );
        const redemption = source.slice(
            source.indexOf('export async function redeemBackupCode'),
            source.indexOf('export async function disableMFA'),
        );
        const disable = source.slice(source.indexOf('export async function disableMFA'));

        for (const mutation of [enrollment, activation, redemption, disable]) {
            expect(mutation).toContain('withMfaTransaction(tenantId');
            expect(mutation).toContain('tenant_id');
            expect(mutation).toContain('auth_version = auth_version + 1');
            expect(mutation).toContain('expectedAuthVersion');
            expect(mutation).toContain('RETURNING auth_version AS "authVersion"');
        }

        expect(enrollment).not.toMatch(/beforeState:.*secret|afterState:.*secret/);
        expect(redemption).not.toMatch(/beforeState:.*rawCode|afterState:.*rawCode/);
    });

    it('reuses one enrollment request during Strict Mode effect replay and requires backup-code acknowledgement', () => {
        const page = fs.readFileSync(path.join(process.cwd(), 'src/app/mfa/enroll/page.tsx'), 'utf8');

        expect(page).toContain('useRef<ReturnType<typeof startMfaEnrollment> | null>(null)');
        expect(page).toContain('enrollmentRequest.current ?? startMfaEnrollment()');
        expect(page).toContain('enrollmentRequest.current = request');
        expect(page).toContain('I saved these backup codes in a secure place.');
        expect(page).toContain('!backupCodesSaved');
    });
});

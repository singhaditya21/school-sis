import { verifyLoginSecondFactor } from '@/lib/auth/mfa-login';
import { redeemBackupCode, verifyMFACode } from '@/lib/auth/mfa';

jest.mock('@/lib/auth/mfa', () => ({
    redeemBackupCode: jest.fn(),
    verifyMFACode: jest.fn(),
}));

const USER_ID = 'f2223e75-89a6-4cf8-a95a-ed68daf8358d';
const TENANT_ID = '8ef9488b-75cc-4460-9861-4f1f3b706c50';

describe('login second-factor verification', () => {
    beforeEach(() => jest.clearAllMocks());

    it('verifies a six-digit authenticator code', async () => {
        (verifyMFACode as jest.Mock).mockResolvedValue({ success: true });
        await expect(verifyLoginSecondFactor(USER_ID, TENANT_ID, '123456')).resolves.toEqual({ success: true });
        expect(verifyMFACode).toHaveBeenCalledWith(USER_ID, TENANT_ID, '123456');
        expect(redeemBackupCode).not.toHaveBeenCalled();
    });

    it('atomically redeems a normalized recovery code', async () => {
        (redeemBackupCode as jest.Mock).mockResolvedValue({ success: true, codesRemaining: 9 });
        await expect(verifyLoginSecondFactor(USER_ID, TENANT_ID, 'abcde-12345')).resolves.toEqual({ success: true });
        expect(redeemBackupCode).toHaveBeenCalledWith(USER_ID, TENANT_ID, 'ABCDE12345');
        expect(verifyMFACode).not.toHaveBeenCalled();
    });

    it.each(['invalid', '12345', '1234567'])('returns one generic error for malformed or rejected input: %s', async (code) => {
        await expect(verifyLoginSecondFactor(USER_ID, TENANT_ID, code)).resolves.toEqual({
            success: false,
            error: 'Invalid authenticator or recovery code.',
        });
    });

    it('does not expose why a well-formed recovery code was rejected', async () => {
        (redeemBackupCode as jest.Mock).mockResolvedValue({ success: false, error: 'No backup codes available.' });
        await expect(verifyLoginSecondFactor(USER_ID, TENANT_ID, 'ABCDE12345')).resolves.toEqual({
            success: false,
            error: 'Invalid authenticator or recovery code.',
        });
    });
});

import { redeemBackupCode, verifyMFACode } from './mfa';

const TOTP_CODE = /^\d{6}$/;
const RECOVERY_CODE = /^[A-F0-9]{10}$/;
const GENERIC_MFA_ERROR = 'Invalid authenticator or recovery code.';

export async function verifyLoginSecondFactor(
    userId: string,
    tenantId: string,
    rawCode: string,
): Promise<{ success: boolean; error?: string }> {
    const normalized = rawCode.replace(/[\s-]/g, '').toUpperCase();
    if (TOTP_CODE.test(normalized)) {
        const result = await verifyMFACode(userId, tenantId, normalized);
        return result.success ? { success: true } : { success: false, error: GENERIC_MFA_ERROR };
    }
    if (RECOVERY_CODE.test(normalized)) {
        const result = await redeemBackupCode(userId, tenantId, normalized);
        return result.success ? { success: true } : { success: false, error: GENERIC_MFA_ERROR };
    }
    return { success: false, error: GENERIC_MFA_ERROR };
}

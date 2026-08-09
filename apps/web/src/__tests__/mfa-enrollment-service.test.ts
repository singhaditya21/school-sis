import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { authenticator } from 'otplib';
import { db } from '@/lib/db';
import { auditLogs, users } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/encryption';
import { activateMFA, generateMFAEnrollment, redeemBackupCode } from '@/lib/auth/mfa';

jest.mock('@/lib/db', () => ({
    db: {
        transaction: jest.fn(),
    },
}));

jest.mock('@/lib/db/schema', () => ({
    users: {
        id: 'users.id',
        tenantId: 'users.tenant_id',
        mfaSecret: 'users.mfa_secret',
        mfaEnabled: 'users.mfa_enabled',
        mfaBackupCodes: 'users.mfa_backup_codes',
    },
    auditLogs: { table: 'audit_logs' },
}));

jest.mock('drizzle-orm', () => ({
    eq: jest.fn((column, value) => ({ operation: 'eq', column, value })),
    and: jest.fn((...conditions) => ({ operation: 'and', conditions })),
}));

jest.mock('@/lib/encryption', () => ({
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
}));

jest.mock('otplib', () => ({
    authenticator: {
        generateSecret: jest.fn(),
        keyuri: jest.fn(),
        verify: jest.fn(),
    },
}));

jest.mock('qrcode', () => ({
    __esModule: true,
    default: {
        toDataURL: jest.fn(),
    },
}));

jest.mock('bcryptjs', () => ({
    hash: jest.fn(),
    compare: jest.fn(),
}));

const USER_ID = 'f2223e75-89a6-4cf8-a95a-ed68daf8358d';
const TENANT_ID = '8ef9488b-75cc-4460-9861-4f1f3b706c50';
const EMAIL = 'principal@scholarmind.example';
const SECRET = 'JBSWY3DPEHPK3PXP';

const selectForUpdate = jest.fn();
const selectLimit = jest.fn(() => ({ for: selectForUpdate }));
const selectWhere = jest.fn(() => ({ limit: selectLimit }));
const selectFrom = jest.fn(() => ({ where: selectWhere }));
const select = jest.fn(() => ({ from: selectFrom }));

const updateWhere = jest.fn();
const updateSet = jest.fn(() => ({ where: updateWhere }));
const update = jest.fn(() => ({ set: updateSet }));

const insertValues = jest.fn();
const insert = jest.fn(() => ({ values: insertValues }));

const transactionClient = {
    select,
    update,
    insert,
};

describe('MFA enrollment service transactions', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        select.mockReturnValue({ from: selectFrom });
        selectFrom.mockReturnValue({ where: selectWhere });
        selectWhere.mockReturnValue({ limit: selectLimit });
        selectLimit.mockReturnValue({ for: selectForUpdate });
        update.mockReturnValue({ set: updateSet });
        updateSet.mockReturnValue({ where: updateWhere });
        updateWhere.mockResolvedValue(undefined);
        insert.mockReturnValue({ values: insertValues });
        insertValues.mockResolvedValue(undefined);

        (db.transaction as jest.Mock).mockImplementation(
            async (callback: (tx: typeof transactionClient) => Promise<unknown>) => callback(transactionClient),
        );
        (authenticator.generateSecret as jest.Mock).mockReturnValue(SECRET);
        (authenticator.keyuri as jest.Mock).mockImplementation(
            (email: string, issuer: string, secret: string) => `otpauth://${issuer}/${email}?secret=${secret}`,
        );
        (authenticator.verify as jest.Mock).mockReturnValue(true);
        (QRCode.toDataURL as jest.Mock).mockImplementation(
            async (uri: string) => `data:image/png;base64,${Buffer.from(uri).toString('base64')}`,
        );
        (bcrypt.hash as jest.Mock).mockImplementation(
            async (code: string, rounds: number) => `bcrypt-${rounds}:${code}`,
        );
        (bcrypt.compare as jest.Mock).mockResolvedValue(false);
        (encrypt as jest.Mock).mockImplementation((value: string) => `encrypted:${value}`);
        (decrypt as jest.Mock).mockImplementation((value: string) => value.replace(/^encrypted:/, ''));
    });

    describe('generateMFAEnrollment', () => {
        it('locks the user row and returns stable pending credentials across retries', async () => {
            selectForUpdate
                .mockResolvedValueOnce([{ mfaSecret: null, mfaEnabled: false }])
                .mockResolvedValueOnce([{ mfaSecret: `encrypted:${SECRET}`, mfaEnabled: false }]);

            const first = await generateMFAEnrollment(USER_ID, TENANT_ID, EMAIL);
            const retried = await generateMFAEnrollment(USER_ID, TENANT_ID, EMAIL);

            expect(first.secret).toBe(SECRET);
            expect(retried.secret).toBe(SECRET);
            expect(first.backupCodes).toHaveLength(10);
            expect(new Set(first.backupCodes).size).toBe(10);
            expect(first.backupCodes).toEqual(retried.backupCodes);
            expect(first.qrCodeDataUrl).toBe(retried.qrCodeDataUrl);
            for (const code of first.backupCodes) {
                expect(code).toMatch(/^[A-F0-9]{10}$/);
            }

            expect(db.transaction).toHaveBeenCalledTimes(2);
            expect(selectForUpdate).toHaveBeenNthCalledWith(1, 'update');
            expect(selectForUpdate).toHaveBeenNthCalledWith(2, 'update');
            expect(authenticator.generateSecret).toHaveBeenCalledTimes(1);
            expect(decrypt).toHaveBeenCalledWith(`encrypted:${SECRET}`);
            expect(update).toHaveBeenNthCalledWith(1, users);
            expect(update).toHaveBeenNthCalledWith(2, users);
            expect(updateSet).toHaveBeenNthCalledWith(1, {
                mfaSecret: `encrypted:${SECRET}`,
                mfaEnabled: false,
                mfaBackupCodes: first.backupCodes.map((code) => `bcrypt-12:${code}`),
            });
            expect(updateSet).toHaveBeenNthCalledWith(2, {
                mfaSecret: `encrypted:${SECRET}`,
                mfaEnabled: false,
                mfaBackupCodes: retried.backupCodes.map((code) => `bcrypt-12:${code}`),
            });
            expect(bcrypt.hash).toHaveBeenCalledTimes(20);
        });

        it('fails truthfully when the session user does not exist in the tenant', async () => {
            selectForUpdate.mockResolvedValue([]);

            await expect(generateMFAEnrollment(USER_ID, TENANT_ID, EMAIL)).rejects.toThrow(
                'User not found for MFA enrollment.',
            );
            expect(selectForUpdate).toHaveBeenCalledWith('update');
            expect(authenticator.generateSecret).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            expect(QRCode.toDataURL).not.toHaveBeenCalled();
        });

        it('fails truthfully without rotating credentials when MFA is already enabled', async () => {
            selectForUpdate.mockResolvedValue([{
                mfaSecret: `encrypted:${SECRET}`,
                mfaEnabled: true,
            }]);

            await expect(generateMFAEnrollment(USER_ID, TENANT_ID, EMAIL)).rejects.toThrow(
                'MFA is already active for this account.',
            );
            expect(selectForUpdate).toHaveBeenCalledWith('update');
            expect(decrypt).not.toHaveBeenCalled();
            expect(authenticator.generateSecret).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            expect(QRCode.toDataURL).not.toHaveBeenCalled();
        });
    });

    describe('activateMFA', () => {
        it('returns a truthful non-mutating result for an unknown or unenrolled user', async () => {
            selectForUpdate.mockResolvedValue([]);

            await expect(activateMFA(USER_ID, TENANT_ID, '123456')).resolves.toEqual({
                success: false,
                error: 'MFA enrollment not started. Call generateMFAEnrollment first.',
            });
            expect(selectForUpdate).toHaveBeenCalledWith('update');
            expect(authenticator.verify).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            expect(insert).not.toHaveBeenCalled();
        });

        it('returns a truthful non-mutating result when MFA is already enabled', async () => {
            selectForUpdate.mockResolvedValue([{
                mfaSecret: `encrypted:${SECRET}`,
                mfaEnabled: true,
            }]);

            await expect(activateMFA(USER_ID, TENANT_ID, '123456')).resolves.toEqual({
                success: false,
                error: 'MFA is already active for this account.',
            });
            expect(authenticator.verify).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            expect(insert).not.toHaveBeenCalled();
        });

        it('enables MFA and inserts its audit evidence in the same transaction', async () => {
            selectForUpdate.mockResolvedValue([{
                mfaSecret: `encrypted:${SECRET}`,
                mfaEnabled: false,
            }]);

            await expect(activateMFA(USER_ID, TENANT_ID, '123456')).resolves.toEqual({ success: true });

            expect(db.transaction).toHaveBeenCalledTimes(1);
            expect(selectForUpdate).toHaveBeenCalledWith('update');
            expect(authenticator.verify).toHaveBeenCalledWith({ token: '123456', secret: SECRET });
            expect(update).toHaveBeenCalledWith(users);
            expect(updateSet).toHaveBeenCalledWith({ mfaEnabled: true });
            expect(insert).toHaveBeenCalledWith(auditLogs);
            expect(insertValues).toHaveBeenCalledWith({
                tenantId: TENANT_ID,
                userId: USER_ID,
                action: 'UPDATE',
                entityType: 'MFA_ENROLLMENT',
                entityId: USER_ID,
                description: 'Multi-factor authentication enrolled',
                afterState: { mfaEnabled: true },
            });
            expect(updateWhere.mock.invocationCallOrder[0]).toBeLessThan(
                insertValues.mock.invocationCallOrder[0],
            );
        });

        it('rejects the transaction result when the audit insert fails', async () => {
            selectForUpdate.mockResolvedValue([{
                mfaSecret: `encrypted:${SECRET}`,
                mfaEnabled: false,
            }]);
            insertValues.mockRejectedValue(new Error('audit insert failed'));

            await expect(activateMFA(USER_ID, TENANT_ID, '123456')).rejects.toThrow('audit insert failed');
            expect(updateSet).toHaveBeenCalledWith({ mfaEnabled: true });
            expect(insert).toHaveBeenCalledWith(auditLogs);
            expect(insertValues).toHaveBeenCalledTimes(1);
        });
    });

    describe('redeemBackupCode', () => {
        it('consumes one recovery code and audits it within the locked transaction', async () => {
            selectForUpdate.mockResolvedValue([{
                mfaEnabled: true,
                mfaBackupCodes: ['hash-one', 'hash-two'],
            }]);
            (bcrypt.compare as jest.Mock)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await expect(redeemBackupCode(USER_ID, TENANT_ID, 'ABCDE-12345')).resolves.toEqual({
                success: true,
                codesRemaining: 1,
            });

            expect(selectForUpdate).toHaveBeenCalledWith('update');
            expect(bcrypt.compare).toHaveBeenNthCalledWith(1, 'ABCDE12345', 'hash-one');
            expect(bcrypt.compare).toHaveBeenNthCalledWith(2, 'ABCDE12345', 'hash-two');
            expect(updateSet).toHaveBeenCalledWith({ mfaBackupCodes: ['hash-one'] });
            expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
                tenantId: TENANT_ID,
                userId: USER_ID,
                entityType: 'MFA_BACKUP_CODE',
                afterState: { codesRemaining: 1 },
            }));
        });

        it('does not mutate recovery codes when none match', async () => {
            selectForUpdate.mockResolvedValue([{
                mfaEnabled: true,
                mfaBackupCodes: ['hash-one'],
            }]);

            await expect(redeemBackupCode(USER_ID, TENANT_ID, 'ABCDE12345')).resolves.toEqual({
                success: false,
                error: 'Invalid backup code.',
            });
            expect(update).not.toHaveBeenCalled();
            expect(insert).not.toHaveBeenCalled();
        });

        it('rejects when the recovery-code audit cannot commit', async () => {
            selectForUpdate.mockResolvedValue([{
                mfaEnabled: true,
                mfaBackupCodes: ['hash-one'],
            }]);
            (bcrypt.compare as jest.Mock).mockResolvedValue(true);
            insertValues.mockRejectedValue(new Error('audit insert failed'));

            await expect(redeemBackupCode(USER_ID, TENANT_ID, 'ABCDE12345')).rejects.toThrow('audit insert failed');
            expect(updateSet).toHaveBeenCalledWith({ mfaBackupCodes: [] });
        });
    });
});

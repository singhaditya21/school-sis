import { createCoachingBatch } from '@/actions/coaching';
import { db } from '@/lib/db';
import { requireCapability } from '@/lib/capabilities/server';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

jest.mock('@/lib/db', () => ({
    db: {
        insert: jest.fn(),
    },
}));

jest.mock('@/lib/capabilities/server', () => ({
    requireCapability: jest.fn(),
}));

jest.mock('@/lib/audit', () => ({
    logAudit: jest.fn(),
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn(),
}), { virtual: true });

const SESSION_TENANT_ID = '4f4397bf-b71a-48a9-ac36-5543e6ee5169';
const SESSION_USER_ID = '22dc245b-c099-4cba-b045-414020dadf7f';
const CLIENT_TENANT_ID = 'b66175fc-8dae-4124-8a28-b8fe06fe4d47';

function validFormData(): FormData {
    const formData = new FormData();
    formData.set('name', 'JEE 2027 Morning Batch');
    formData.set('examTarget', 'JEE');
    formData.set('startDate', '2026-09-01');
    formData.set('endDate', '2027-05-31');
    return formData;
}

describe('createCoachingBatch', () => {
    const returning = jest.fn();
    const values = jest.fn(() => ({ returning }));

    beforeEach(() => {
        jest.clearAllMocks();
        (requireCapability as jest.Mock).mockResolvedValue({
            tenantId: SESSION_TENANT_ID,
            userId: SESSION_USER_ID,
        });
        (db.insert as jest.Mock).mockReturnValue({ values });
        returning.mockResolvedValue([{
            id: 'c8d78763-54ce-4f5f-a563-83035d18cdbe',
            tenantId: SESSION_TENANT_ID,
            name: 'JEE 2027 Morning Batch',
            targetExam: 'JEE',
            startDate: '2026-09-01',
            endDate: '2027-05-31',
            isActive: true,
        }]);
        (logAudit as jest.Mock).mockResolvedValue(undefined);
    });

    it('derives tenant and actor from the authenticated session', async () => {
        const formData = validFormData();
        formData.set('tenantId', CLIENT_TENANT_ID);
        formData.set('userId', '6b0ad677-5c73-4403-a631-96a714f52d6e');

        const result = await createCoachingBatch(formData);

        expect(requireCapability).toHaveBeenCalledWith('coaching', 'academic:write');
        expect(values).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: SESSION_TENANT_ID,
            name: 'JEE 2027 Morning Batch',
            targetExam: 'JEE',
        }));
        expect(values).not.toHaveBeenCalledWith(expect.objectContaining({ tenantId: CLIENT_TENANT_ID }));
        expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: SESSION_TENANT_ID,
            userId: SESSION_USER_ID,
            action: 'CREATE',
        }));
        expect(revalidatePath).toHaveBeenCalledWith('/coaching');
        expect(result.success).toBe(true);
    });

    it('does not access the database when authorization fails', async () => {
        (requireCapability as jest.Mock).mockRejectedValue(new Error('Forbidden'));

        await expect(createCoachingBatch(validFormData())).rejects.toThrow('Forbidden');

        expect(db.insert).not.toHaveBeenCalled();
        expect(logAudit).not.toHaveBeenCalled();
    });

    it('rejects an end date before the start date without inserting', async () => {
        const formData = validFormData();
        formData.set('endDate', '2026-08-31');

        const result = await createCoachingBatch(formData);

        expect(result).toEqual(expect.objectContaining({
            success: false,
            message: 'Please correct the invalid batch details.',
            errors: expect.objectContaining({
                endDate: expect.arrayContaining(['End date must be on or after the start date']),
            }),
        }));
        expect(db.insert).not.toHaveBeenCalled();
        expect(logAudit).not.toHaveBeenCalled();
    });
});

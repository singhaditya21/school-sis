import { maskDeniedFields } from '@/lib/auth/field-masking';

/**
 * The field policies (AUTHORIZATION_FIELD_POLICIES) marked student PII and
 * guardian contact as registrar/finance-grade, but nothing enforced them — a
 * TEACHER opening a pupil's record saw date of birth, blood group, address and
 * the guardians' phone and email. maskDeniedFields is the enforcement; this pins
 * it against the real policy.
 */
describe('field masking enforces the read policy', () => {
    const student = {
        firstName: 'Aarohi',
        admissionNumber: 'CSPM202600001',
        dateOfBirth: '2015-06-01',
        bloodGroup: 'O+',
        address: '12 MG Road',
    };

    it('nulls student PII for a role without registrar-grade access', () => {
        const masked = maskDeniedFields('TEACHER', 'students', student);
        expect(masked.dateOfBirth).toBeNull();
        expect(masked.bloodGroup).toBeNull();
        expect(masked.address).toBeNull();
        // Non-sensitive fields are untouched, so the UI still renders.
        expect(masked.firstName).toBe('Aarohi');
        expect(masked.admissionNumber).toBe('CSPM202600001');
    });

    it('leaves the record intact for a registrar', () => {
        const masked = maskDeniedFields('REGISTRAR', 'students', student);
        expect(masked).toEqual(student);
    });

    it('masks guardian contact for a role not permitted to see it', () => {
        const guardian = { firstName: 'Sanjay', phone: '+91-99999-00000', email: 'p@x.example' };
        const masked = maskDeniedFields('TEACHER', 'guardians', guardian);
        expect(masked.phone).toBeNull();
        expect(masked.email).toBeNull();
        expect(masked.firstName).toBe('Sanjay');
    });

    it('lets a finance role see guardian contact (operationally required)', () => {
        const guardian = { phone: '+91-99999-00000', email: 'p@x.example' };
        const masked = maskDeniedFields('FINANCE_LEAD', 'guardians', guardian);
        expect(masked.phone).toBe('+91-99999-00000');
    });
});

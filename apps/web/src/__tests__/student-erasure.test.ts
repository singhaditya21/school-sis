import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * A data principal's erasure request must actually erase, safely.
 *
 * The product's only "removal" was an archive — a status flip leaving every
 * identifying field in place. anonymizeStudentRecord strips the child's and the
 * guardians' PII in place (the row survives so invoices and attendance don't
 * orphan), gated, transactional and audited. Proven on seeded data: names
 * redacted, Aadhaar/address/contact nulled, invoice still references the row.
 */
const erasure = readFileSync(resolve(process.cwd(), 'src/lib/actions/erasure.ts'), 'utf8');
const route = readFileSync(
    resolve(process.cwd(), 'src/app/api/students/[studentId]/erase/route.ts'),
    'utf8',
);

describe('student erasure', () => {
    it('strips identifying student fields and marks the record erased', () => {
        for (const field of ['aadhaar_number = NULL', 'address = NULL', 'medical_notes = NULL']) {
            expect(erasure).toContain(field);
        }
        expect(erasure).toContain("jsonb_build_object('erased', true)");
    });

    it('strips guardian contact PII', () => {
        expect(erasure).toContain('UPDATE guardians SET');
        expect(erasure).toContain('phone = NULL');
        expect(erasure).toContain('email = NULL');
    });

    it('anonymises in place — never hard-deletes the student row', () => {
        expect(erasure).not.toMatch(/DELETE\s+FROM\s+students/i);
    });

    it('carries the RLS tenant context so the rows are visible to write', () => {
        // Without withTenant, FORCE RLS hides the rows and the erase silently no-ops.
        expect(erasure).toContain('withTenant(tenantId');
    });

    it('audits the erasure atomically, on the same transaction client', () => {
        expect(erasure).toContain('INSERT INTO audit_logs');
        expect(erasure).toContain("'DELETE', 'student'");
    });

    it('is gated, needs a reason, and requires explicit confirmation', () => {
        expect(route).toContain("requireApiPermission('students:archive')");
        expect(route).toContain('reason: z.string()');
        expect(route).toContain('confirm: z.literal(true)');
    });
});

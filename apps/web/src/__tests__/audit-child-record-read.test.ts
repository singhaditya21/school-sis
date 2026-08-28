import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Reads of a child's record must be audited, and the audit wrapper must not be
 * a silent no-op.
 *
 * DPDPA accountability requires answering "who accessed this student's data."
 * getStudentDetail returns a child's DOB, address, blood group and guardian
 * contact, and wrote no audit row. And withAudit — an "audit wrapper" — returned
 * the result having logged nothing, so any mutation wrapped in it was silently
 * unaudited. Both are fixed; these pin them.
 */
const queries = readFileSync(
    resolve(process.cwd(), 'src/lib/actions/queries.ts'),
    'utf8',
);
const audit = readFileSync(resolve(process.cwd(), 'src/lib/audit.ts'), 'utf8');

describe('audit of child-record access', () => {
    it('logs a READ when a full student record is viewed', () => {
        const detail = queries.slice(
            queries.indexOf('export async function getStudentDetail'),
            queries.indexOf('export async function getStudentsBySection'),
        );
        expect(detail).toContain('logAudit(');
        expect(detail).toContain("action: 'READ'");
        expect(detail).toContain("entityType: 'student'");
    });

    it('makes withAudit actually write, not just return the result', () => {
        const wrapper = audit.slice(audit.indexOf('export function withAudit'));
        expect(wrapper).toContain('await logAudit(');
        // The old body returned the result with only a comment — no write.
        expect(wrapper).not.toMatch(/const result = await action\([\s\S]{0,120}?return result;\s*};/);
    });
});

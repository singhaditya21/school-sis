import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Two bounded PII fixes, guarded.
 *
 * 1. The bulk student CSV — gated only by students:read, which many staff hold,
 *    and writing no audit row — dumped every student's Aadhaar and APAAR national
 *    IDs. Those must not be in a general roster export.
 * 2. The schema claimed student Aadhaar / email / phone were "encrypted at app
 *    level." They are not: the encryption helper is wired only to TOTP secrets.
 *    A false compliance claim in the schema is worse than an honest gap.
 *
 * This does NOT encrypt PII at rest — that is a tracked compliance workstream,
 * large in a codebase whose reads are all raw SQL. These guards pin the two
 * concrete fixes.
 */
const root = resolve(process.cwd(), '..', '..');
const csv = readFileSync(resolve(root, 'apps/web/src/app/api/csv/route.ts'), 'utf8');
const studentsSchema = readFileSync(
    resolve(root, 'packages/api/src/db/schema/students.ts'),
    'utf8',
);

describe('PII export and honest claims', () => {
    it('keeps national IDs out of the bulk roster CSV', () => {
        expect(csv).not.toContain('aadhaar_number');
        expect(csv).not.toContain('apaar_id');
    });

    it('does not claim PII is encrypted at rest when it is not', () => {
        expect(studentsSchema).not.toContain('encrypted at app level');
    });
});

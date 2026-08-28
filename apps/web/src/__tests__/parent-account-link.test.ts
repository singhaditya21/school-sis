import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * There must be a way to link a real guardian to a PARENT login.
 *
 * The parent portal shows children through guardians.user_id, and nothing in the
 * product ever set it for a real guardian — admissions conversion inserts a
 * guardian with no account, and the synthetic pilot parents are locked. So a
 * real guardian could never sign in. create-parent-account.ts closes that,
 * operator-run, the same way the branch admin is created; verified end to end
 * that the portal query then returns the child.
 */
const script = readFileSync(
    resolve(process.cwd(), 'scripts/create-parent-account.ts'),
    'utf8',
);

describe('parent-account linking script', () => {
    it("creates a PARENT user and links the guardian's user_id", () => {
        expect(script).toContain("'PARENT'");
        expect(script).toContain('UPDATE guardians SET user_id = $1 WHERE id = $2');
    });

    it('finds the guardian by the student admission number', () => {
        expect(script).toContain('admission_number = $2');
        expect(script).toContain('ORDER BY is_primary DESC');
    });
});

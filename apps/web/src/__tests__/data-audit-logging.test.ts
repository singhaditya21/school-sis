import fs from 'fs';
import path from 'path';
import { AUDIT_ACTION_VALUES } from '@school-sis/api/src/db/generated/tables';

/**
 * The dynamic metadata data API must record audit-log entries for reads and
 * writes, and the audit_action enum must support the READ action. Audit
 * finding P0 #2 (residual: audit logging).
 */
const ROUTE = path.join(process.cwd(), 'src/app/api/data/[object_name]/route.ts');

describe('dynamic data API audit logging', () => {
    const routeSrc = fs.readFileSync(ROUTE, 'utf8');

    it("audit_action enum includes 'READ'", () => {
        // Pinned against the generated schema (from the migrated DB) now that the
        // pgTable source is gone; AUDIT_ACTION_VALUES is the canonical enum list.
        expect(AUDIT_ACTION_VALUES).toContain('READ');
    });

    it('imports the audit logger', () => {
        expect(routeSrc).toMatch(/import\s*\{\s*logAudit\s*\}\s*from\s*'@\/lib\/audit'/);
    });

    it('audits reads in GET (action READ)', () => {
        const getBody = routeSrc.slice(routeSrc.indexOf('export async function GET'), routeSrc.indexOf('export async function POST'));
        expect(getBody).toContain('logAudit');
        expect(getBody).toContain("action: 'READ'");
    });

    it('audits writes in POST (action CREATE)', () => {
        const postBody = routeSrc.slice(routeSrc.indexOf('export async function POST'));
        expect(postBody).toContain('logAudit');
        expect(postBody).toContain("action: 'CREATE'");
    });
});

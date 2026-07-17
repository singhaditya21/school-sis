import fs from 'fs';
import path from 'path';

/**
 * The dynamic metadata data API must record audit-log entries for reads and
 * writes, and the audit_action enum must support the READ action. Audit
 * finding P0 #2 (residual: audit logging).
 */
const ROUTE = path.join(process.cwd(), 'src/app/api/data/[object_name]/route.ts');
const AUDIT_SCHEMA = path.join(process.cwd(), '../../packages/api/src/db/schema/audit.ts');

describe('dynamic data API audit logging', () => {
    const routeSrc = fs.readFileSync(ROUTE, 'utf8');

    it("audit_action enum includes 'READ'", () => {
        const schemaSrc = fs.readFileSync(AUDIT_SCHEMA, 'utf8');
        const enumLine = schemaSrc.split('\n').find((l) => l.includes("pgEnum('audit_action'"));
        expect(enumLine).toBeDefined();
        expect(enumLine).toContain("'READ'");
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

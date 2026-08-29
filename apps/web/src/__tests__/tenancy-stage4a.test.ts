import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Stage 4a — the signed-context v2 substrate (dual-accept), point-of-no-return prep.
 * The DB verifier accepts BOTH v1 and v2 payloads; the app still SIGNS v1 (owner/group
 * GUCs are set empty), so nothing can lock out and 4a is fully reversible. These pin
 * the byte-match-critical verifier shape and the rollout evidence columns. (The
 * owner/group SOURCING — how the signer learns a tenant's owner/group — is deferred
 * to 4b via runWithRlsBypass; a SECURITY DEFINER helper does NOT bypass FORCE RLS
 * unless its owner is BYPASSRLS, which the migration owner is not.)
 */
const rls = readFileSync(resolve(process.cwd(), '../../packages/api/src/db/migrations/tenant-rls.sql'), 'utf8');
const deployment = readFileSync(resolve(process.cwd(), 'scripts/deployment-migrations.ts'), 'utf8');

describe('tenancy stage 4a — dual-accept signed context', () => {
    it('verifier tries v2 (owner/group after tenant) then falls back to v1', () => {
        expect(rls).toContain("'school-sis:tenant-context:v2'");
        expect(rls).toMatch(/tenant_value::text \|\| E'\\n' \|\|\s*owner_text \|\| E'\\n' \|\|\s*group_text \|\| E'\\n' \|\|\s*expires_text/);
        expect(rls).toContain('v2_eligible');
        expect(rls).toContain("'school-sis:tenant-context:v1'");
    });

    it('a malformed owner/group falls through to v1 rather than denying', () => {
        // v2_eligible gates the v2 branch on well-formed UUIDs; the v1 fallback runs
        // unconditionally after, so a garbled owner GUC never turns a valid v1 into NULL.
        expect(rls).toMatch(/v2_eligible := owner_text IS NOT NULL/);
    });

    it('sets empty owner/group context defaults and rollout evidence columns', () => {
        expect(rls).toContain("SET LOCAL app.current_owner = ''");
        expect(rls).toContain('v2_signed_runtime_sha');
        expect(rls).toContain('v2_promoted_at');
    });

    it('extends the rollout-state contract for the two new columns', () => {
        expect(deployment).toContain('count(*) FROM rollout_columns) = 11');
        expect(deployment).toContain('count(*) FROM rollout_constraints) = 10');
    });

    it('does NOT ship a SECURITY DEFINER tenant_scope helper (would not bypass FORCE RLS)', () => {
        expect(rls).not.toContain('tenant_scope');
        expect(deployment).not.toContain('tenant_scope');
    });
});

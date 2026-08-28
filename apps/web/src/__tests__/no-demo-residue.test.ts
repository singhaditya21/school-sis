import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * The shipped application must carry no demo-tenant identity.
 *
 * The login page defaulted its School Code to a demo value, a settings form fell
 * back to writing demo-domain staff emails, and two placeholders named a demo
 * school — all of it live in production, all of it what a real pilot school would
 * have seen on day one. It survived because nothing looked for it.
 *
 * The test fixtures and seed script use the demo identity legitimately and are
 * excluded — that is the one place it belongs. The exclusion is done here in JS,
 * not with a git pathspec glob: `:(exclude).../__tests__/**` silently failed to
 * exclude a __tests__ directory sitting directly under src, which let this very
 * file's own explanatory text trip the check in CI.
 */
const repoRoot = resolve(process.cwd(), '..', '..');
const DEMO_TENANT = 'greenwood';

function grepShipped(pattern: string): string[] {
    let out = '';
    try {
        out = execFileSync('git', ['grep', '-Ini', pattern, '--', 'apps/web/src'], {
            cwd: repoRoot,
            encoding: 'utf8',
        });
    } catch (error) {
        // git grep exits 1 with no output when nothing matches — the pass case.
        const e = error as { status?: number; stdout?: string };
        if (e.status === 1 && !e.stdout) return [];
        throw error;
    }
    return out
        .split('\n')
        .filter(Boolean)
        // Tests and any __tests__ directory are where the demo identity belongs.
        .filter((line) => !/(^|\/)__tests__\/|\.test\.tsx?:/.test(line));
}

describe('no demo-tenant residue in the shipped app', () => {
    it('does not carry the demo tenant identity anywhere users can reach', () => {
        expect({ hits: grepShipped(DEMO_TENANT) }).toEqual({ hits: [] });
    });

    it('does not default the login School Code to any hardcoded tenant', () => {
        // A shipped default school code pre-fills a real school's login with
        // someone else's identity; the field must start empty.
        const hits = grepShipped("useState('[A-Z][A-Z0-9_-]*')").filter((line) =>
            /schoolCode|school_code/i.test(line),
        );
        expect({ hits }).toEqual({ hits: [] });
    });
});

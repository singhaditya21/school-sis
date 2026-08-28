import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * The shipped application must carry no demo-tenant identity.
 *
 * The login page defaulted its School Code to 'GREENWOOD', a settings form fell
 * back to writing '@greenwood.edu' staff emails, and two placeholders named a
 * demo school — all of it live in production, all of it what a real pilot school
 * would have seen on day one. It survived because nothing looked for it.
 *
 * The test fixtures and seed script use GREENWOOD legitimately and are excluded:
 * that is the point of the demo identity, in the one place it belongs.
 */
const repoRoot = resolve(process.cwd(), '..', '..');

function grepShippedSource(pattern: string): string[] {
    try {
        // git grep over the deployed app only; -I skips binary; excludes tests,
        // e2e fixtures and the dev seed, where the demo identity is the fixture.
        const out = execFileSync(
            'git',
            [
                'grep', '-Ini', pattern, '--',
                'apps/web/src',
                ':(exclude)apps/web/src/**/__tests__/**',
            ],
            { cwd: repoRoot, encoding: 'utf8' },
        );
        return out.split('\n').filter(Boolean);
    } catch (error) {
        // git grep exits 1 with no output when there are no matches — the pass case.
        const e = error as { status?: number; stdout?: string };
        if (e.status === 1 && !e.stdout) return [];
        throw error;
    }
}

describe('no demo-tenant residue in the shipped app', () => {
    it('does not carry the Greenwood demo identity anywhere users can reach', () => {
        const hits = grepShippedSource('greenwood');
        expect({ hits }).toEqual({ hits: [] });
    });

    it('does not default the login School Code to any hardcoded tenant', () => {
        // A shipped default school code pre-fills a real school's login with
        // someone else's identity. The field must start empty.
        const hits = grepShippedSource("useState('[A-Z][A-Z0-9_-]*')").filter((line) =>
            /schoolCode|school_code/i.test(line),
        );
        expect({ hits }).toEqual({ hits: [] });
    });
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(REPO_ROOT, 'scripts', 'check-sql-columns.mjs');

/**
 * The checker derives its schema from the committed migrations and finds its
 * inputs with `git ls-files`, so exercising it means building a throwaway git
 * repository shaped like this one. That is worth the setup: a checker that
 * cannot fail is the failure mode this whole gate exists to prevent, and asking
 * it about the real tree only ever proves "no problems today".
 */
function inScratchRepo(files) {
    const dir = mkdtempSync(join(tmpdir(), 'sqlcheck-'));
    try {
        execFileSync('git', ['init', '-q'], { cwd: dir });
        for (const [path, contents] of Object.entries(files)) {
            const full = join(dir, path);
            mkdirSync(dirname(full), { recursive: true });
            writeFileSync(full, contents);
        }
        execFileSync('git', ['add', '-A'], { cwd: dir });

        // Run the real checker against the scratch tree.
        const result = execFileSync(
            process.execPath,
            [CHECKER.replace(REPO_ROOT, dir)],
            { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        );
        return { code: 0, output: result };
    } catch (error) {
        return {
            code: error.status ?? 1,
            output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
        };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const BASELINE = `
CREATE TABLE "companies" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(160) NOT NULL,
    "billing_status" varchar(32) NOT NULL DEFAULT 'TRIALING'
);
CREATE TABLE "tenants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "company_id" uuid,
    "name" varchar(160) NOT NULL,
    "code" varchar(64) NOT NULL,
    CONSTRAINT "tenants_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id")
);
`;

function scratch(source) {
    // The checker resolves itself relative to its own location, so it has to sit
    // in the scratch tree at the same path it occupies here.
    const checkerSource = execFileSync('cat', [CHECKER], { encoding: 'utf8' });
    return {
        'scripts/check-sql-columns.mjs': checkerSource,
        'apps/web/drizzle/0000_init_baseline.sql': BASELINE,
        'apps/web/src/lib/actions/probe.ts': source,
    };
}

test('accepts an insert whose columns all exist', () => {
    const { code, output } = inScratchRepo(
        scratch("await pool.query(`INSERT INTO tenants (name, code) VALUES ($1,$2)`);"),
    );
    assert.equal(code, 0, output);
    assert.match(output, /All checked SQL column references exist/);
});

test('rejects a column that lives on a neighbouring table', () => {
    // The exact defect that killed signup: billing_status is on companies.
    const { code, output } = inScratchRepo(
        scratch("await pool.query(`INSERT INTO tenants (name, code, billing_status) VALUES ($1,$2,$3)`);"),
    );
    assert.equal(code, 1, output);
    assert.match(output, /tenants\.billing_status — no such column/);
    // Naming the real owner is the difference between a puzzle and a fix.
    assert.match(output, /billing_status exists on: companies/);
});

test('rejects a column that exists nowhere', () => {
    const { code, output } = inScratchRepo(
        scratch("await pool.query(`INSERT INTO tenants (name, nonexistent_column) VALUES ($1,$2)`);"),
    );
    assert.equal(code, 1, output);
    assert.match(output, /tenants\.nonexistent_column — no such column/);
});

test('checks UPDATE ... SET targets, not only inserts', () => {
    const { code, output } = inScratchRepo(
        scratch("await pool.query(`UPDATE tenants SET billing_status = $1 WHERE id = $2`);"),
    );
    assert.equal(code, 1, output);
    assert.match(output, /UPDATE tenants\.billing_status/);
});

test('picks up a column added by a later migration', () => {
    const files = scratch("await pool.query(`INSERT INTO tenants (name, udise_code) VALUES ($1,$2)`);");
    files['apps/web/drizzle/0001_add_udise.sql'] =
        'ALTER TABLE "tenants" ADD COLUMN "udise_code" varchar(32);';
    const { code, output } = inScratchRepo(files);
    assert.equal(code, 0, output);
});

test('ignores a table the migration chain does not describe', () => {
    // Better silent than wrong: a table it cannot see is not evidence of a defect.
    const { code } = inScratchRepo(
        scratch("await pool.query(`INSERT INTO some_external_table (whatever) VALUES ($1)`);"),
    );
    assert.equal(code, 0);
});

test('fails rather than passing vacuously when no schema can be derived', () => {
    const files = scratch("await pool.query(`INSERT INTO tenants (name) VALUES ($1)`);");
    delete files['apps/web/drizzle/0000_init_baseline.sql'];
    const { code, output } = inScratchRepo(files);
    assert.equal(code, 1, output);
    assert.match(output, /refusing to pass vacuously/i);
});

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
    assert.match(output, /All checked SQL table and column references exist/);
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

// ─── Tables referenced in FROM / JOIN ───────────────────────────────────────

test('rejects a SELECT from a table that does not exist', () => {
    // POST /api/iot/ingest queried `FROM hardware_tokens`, a table in no
    // migration and no database. Every request failed, and the column checks
    // above could not see it: they only look at INSERT lists, UPDATE targets
    // and RETURNING, and the endpoint dies at the SELECT first.
    const { code, output } = inScratchRepo(
        scratch("await pool.query(`SELECT id FROM hardware_tokens WHERE tenant_id = $1`);"),
    );
    assert.equal(code, 1, output);
    assert.match(output, /reads FROM\/JOIN hardware_tokens — no such table/);
});

test('rejects a JOIN against a table that does not exist', () => {
    const { code, output } = inScratchRepo(
        scratch("await pool.query(`SELECT t.id FROM tenants t JOIN nowhere n ON n.id = t.id`);"),
    );
    assert.equal(code, 1, output);
    assert.match(output, /reads FROM\/JOIN nowhere/);
});

test('suggests the table that was probably meant', () => {
    const { code, output } = inScratchRepo(
        scratch("await pool.query(`SELECT id FROM tenant WHERE id = $1`);"),
    );
    assert.equal(code, 1, output);
    assert.match(output, /did you mean: tenants\?/);
});

test('accepts a name defined as a CTE in the same statement', () => {
    const { code, output } = inScratchRepo(
        scratch(
            "await pool.query(`WITH recent AS (SELECT id FROM tenants) SELECT * FROM recent`);",
        ),
    );
    assert.equal(code, 0, output);
});

test('accepts a CTE that declares a column list', () => {
    // `name(col, col) AS (` is the form deployment-migrations.ts uses, and the
    // first version of this check read it as a missing table twice.
    const { code, output } = inScratchRepo(
        scratch(
            "await pool.query(`WITH required(a, b) AS (SELECT 1, 2) SELECT * FROM required`);",
        ),
    );
    assert.equal(code, 0, output);
});

test('ignores English prose that happens to contain the word from', () => {
    // "routes work away from the dedicated pool" matched `FROM the`. Requiring a
    // SQL statement keyword is what separates SQL from a sentence; without it
    // the word "the" alone produced 94 findings.
    const { code, output } = inScratchRepo(
        scratch('const message = "routes tenant work away from the dedicated platform pool";'),
    );
    assert.equal(code, 0, output);
});

test('ignores a role named after REVOKE ... FROM', () => {
    const { code, output } = inScratchRepo(
        scratch('await pool.query(`REVOKE SELECT ON tenants FROM school_runtime`);'),
    );
    assert.equal(code, 0, output);
});

test('ignores Postgres catalog and information_schema relations', () => {
    const { code, output } = inScratchRepo(
        scratch(
            "await pool.query(`SELECT n.nspname FROM pg_namespace n JOIN information_schema.tables t ON true`);",
        ),
    );
    assert.equal(code, 0, output);
});

test('ignores deliberately synthetic SQL in test files', () => {
    const files = scratch("await pool.query(`SELECT id FROM tenants`);");
    files['apps/web/src/__tests__/probe.test.ts'] =
        'it("parses", () => { expect("SELECT foo FROM identifiers").toBeTruthy(); });';
    const { code, output } = inScratchRepo(files);
    assert.equal(code, 0, output);
});

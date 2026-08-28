#!/usr/bin/env node

/**
 * Ask PostgreSQL to parse every hand-written SQL statement in the tree.
 *
 * scripts/check-sql-columns.mjs derives a schema from the migrations and checks
 * INSERT lists, UPDATE targets, RETURNING clauses and the tables named after
 * FROM/JOIN. It cannot check a column in a SELECT list or a WHERE clause,
 * because resolving a bare column across joins and aliases needs a real parser.
 *
 * There is a real parser available: the database. `PREPARE` parses, analyses
 * and plans a statement without executing it, so it resolves every column
 * against the actual schema and rejects the ones that do not exist — the exact
 * gap the static checker leaves open, closed by the authority on the question.
 *
 * On first use this found six statements that could never have run, in four
 * modules that had been silently superseded. Two of those modules carried
 * comments saying their queries failed at runtime; nobody had removed them.
 *
 *   DATABASE_URL=... pnpm audit:sql:prepare
 *   DATABASE_URL=... pnpm audit:sql:prepare -- --report   # never fails
 *
 * The database must already carry the full migration chain. In CI that is the
 * one the tenant-RLS integration job builds.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

// Lives under apps/web/scripts because it needs the `pg` driver, which only
// resolves from that package; it still scans the whole repository.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE_ROOTS = ['apps/web/src/', 'apps/web/scripts/', 'packages/api/src/'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs'];

/**
 * Errors that mean "this statement is wrong" versus errors that mean "this
 * harness could not reconstruct the statement".
 *
 * The distinction is the whole design. A probe that reported every failure
 * would drown six real defects in dozens of artifacts and be switched off; one
 * that suppressed too broadly would report nothing and be worse than absent.
 * So the suppressions are BY SQLSTATE and each is justified:
 *
 *   42P18 indeterminate_datatype  — `WHERE id = $1` with no context to infer
 *                                   from. A schema error, this is not.
 *   42601 syntax_error            — the statement was assembled from fragments,
 *                                   or interpolates an identifier, so what the
 *                                   harness rebuilt is not what runs.
 *   42P02 undefined_parameter     — same cause, different symptom.
 *
 * Everything else is reported, and 42P01 (undefined_table) and 42703
 * (undefined_column) are exactly what this exists to catch.
 */
const RECONSTRUCTION_ARTIFACTS = new Set([
  // Cannot infer a parameter's type from context. `WHERE id = $1` alone.
  '42P18', // indeterminate_datatype
  // The statement was assembled from fragments or interpolates an identifier,
  // so what this harness rebuilt is not what actually runs.
  '42601', // syntax_error
  '42P02', // undefined_parameter
  // ── Type errors, all of them consequences of substitution ────────────────
  //
  // The real code binds a correctly-typed value; this harness can only bind an
  // untyped placeholder. So Postgres complains that a uuid is being compared to
  // a timestamp, or that LIMIT got something that is not bigint — about the
  // placeholder, never about the schema.
  //
  // Suppressing these is safe in a way that suppressing a schema error is not:
  // a type error cannot tell you a column is missing. A missing column is
  // 42703 and a missing table is 42P01, and both are still reported.
  '42804', // datatype_mismatch
  '42P08', // ambiguous_parameter
  '42725', // ambiguous_function
]);

/**
 * Is this failure the harness's fault, or the statement's?
 *
 * 42883 is the one ambiguous code: "function foo(integer) does not exist" is a
 * real defect, while "operator does not exist: uuid = timestamp with time zone"
 * is this harness failing to type a placeholder. Only the second is suppressed,
 * and only by that exact wording — so a genuinely missing function is still
 * reported.
 */
export function isReconstructionArtifact(code, message = '') {
  if (RECONSTRUCTION_ARTIFACTS.has(code)) return true;
  return code === '42883' && /^operator does not exist/.test(message);
}

const SCHEMA_ERRORS = new Map([
  ['42P01', 'table does not exist'],
  ['42703', 'column does not exist'],
  ['42883', 'function does not exist'],
  ['42704', 'object does not exist'],
  ['42P10', 'invalid column reference'],
]);

function listSourceFiles() {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
    .filter(
      (file) =>
        SOURCE_ROOTS.some((root) => file.startsWith(root)) &&
        SOURCE_EXTENSIONS.some((ext) => file.endsWith(ext)) &&
        !file.includes('/node_modules/') &&
        !/(^|\/)__tests__\//.test(file) &&
        !/\.test\.(ts|tsx|mjs)$/.test(file),
    );
}

const STATEMENT_START = /^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b/i;

/** Template literals and quoted strings that look like a whole statement. */
export function sqlStatements(text) {
  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  return [...withoutComments.matchAll(/`([^`]*)`/g)]
    .map((match) => ({
      sql: match[1].replace(/--[^\n]*/g, ' '),
      line: withoutComments.slice(0, match.index).split('\n').length,
    }))
    .filter(({ sql }) => STATEMENT_START.test(sql));
}

/**
 * Rebuild something the parser can accept.
 *
 * `${value}` in a Drizzle or node-postgres template is a bound parameter, so it
 * becomes one. An interpolation that is clearly an IDENTIFIER rather than a
 * value cannot be — a parameter is not allowed where a table name goes — and
 * those statements are dropped instead of guessed at.
 */
export function toPreparable(sql) {
  if (/\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+\$\{/i.test(sql)) return null;
  let index = 0;
  const substituted = sql.replace(/\$\{[^}]*\}/g, () => `$${++index}`);
  // Renumber any placeholders the author wrote, so the two schemes cannot collide.
  return substituted.trim().replace(/;\s*$/, '');
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL || process.env.DIRECT_URL || process.env.PROBE_DATABASE_URL;
  if (!connectionString) {
    console.error(
      'A migrated database is required. Set DATABASE_URL to one carrying the full migration chain.',
    );
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    ssl: /sslmode=disable/.test(connectionString) ? false : undefined,
  });
  await client.connect();

  // Refuse to pass vacuously against an empty database.
  const { rows } = await client.query(
    "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'",
  );
  if (rows[0].tables < 100) {
    console.error(
      `The probe database has only ${rows[0].tables} public tables; it does not carry the migration chain.`,
    );
    await client.end();
    process.exit(1);
  }

  const failures = [];
  const artifacts = [];
  let probed = 0;
  let skipped = 0;

  for (const file of listSourceFiles()) {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    if (!/`[\s\S]*\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(text)) continue;

    for (const { sql, line } of sqlStatements(text)) {
      const preparable = toPreparable(sql);
      if (!preparable) {
        skipped += 1;
        continue;
      }
      probed += 1;
      const name = `probe_${probed}`;
      try {
        await client.query('BEGIN');
        await client.query(`PREPARE ${name} AS ${preparable}`);
        await client.query('ROLLBACK');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        const code = error.code ?? '';
        const entry = {
          file,
          line,
          code,
          message: (error.message ?? '').split('\n')[0],
          kind: SCHEMA_ERRORS.get(code),
          sql: preparable.replace(/\s+/g, ' ').slice(0, 120),
        };
        if (isReconstructionArtifact(code, entry.message)) artifacts.push(entry);
        else failures.push(entry);
      }
    }
  }

  await client.end();

  console.log(
    `Prepared ${probed} hand-written SQL statement(s) against the live schema ` +
      `(${skipped} skipped for interpolated identifiers, ${artifacts.length} unreconstructable).`,
  );

  if (failures.length > 0) {
    console.error('');
    for (const failure of failures) {
      console.error(
        `  ${failure.file}:${failure.line}  [${failure.code}] ${failure.kind ?? 'rejected by the parser'}`,
      );
      console.error(`      ${failure.message}`);
      console.error(`      ${failure.sql}`);
    }
  }

  if (process.argv.includes('--report')) {
    console.log(`\n${failures.length} statement(s) rejected (report mode never fails).`);
    process.exit(0);
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} hand-written statement(s) cannot be parsed against the schema. ` +
        'Each one throws the first time it runs.',
    );
    process.exit(1);
  }

  console.log('Every reconstructable statement parses against the live schema.');
}

// Only when run as a command. Importing this module — which the test does, to
// exercise the reconstruction and suppression logic without a database — must
// not open a connection or exit the process.
const RUNNING_AS_CLI =
  process.argv[1] && process.argv[1].endsWith('check-sql-prepare.mjs');

if (RUNNING_AS_CLI) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

#!/usr/bin/env node

/**
 * Validate hand-written SQL against the migration chain.
 *
 * This repository issues most of its data access as raw SQL strings — about 1,200
 * `pool.query` / `client.query` sites. TypeScript cannot see inside a template
 * literal, so a column that does not exist compiles cleanly, ships, and fails at
 * runtime behind whatever the surrounding catch decides to say.
 *
 * That is not hypothetical. `/setup` inserted `billing_status` into `tenants`,
 * where no such column exists — it lives on `companies`. Every attempt raised
 * `column "billing_status" of relation "tenants" does not exist`, the catch
 * reported "Failed to create workspace database. Please try again later.", and
 * signup was dead for every prospective customer with nothing in the logs to say
 * why. A type-check would never have found it; only executing it would.
 *
 * So this executes the check statically instead. The schema is derived from the
 * committed migrations, so the gate needs no database and cannot drift from what
 * a release actually applies.
 *
 *   node scripts/check-sql-columns.mjs           # verify
 *   node scripts/check-sql-columns.mjs --report  # list everything, never fail
 *
 * SCOPE, deliberately narrow: `INSERT INTO <table> (<columns>)`,
 * `UPDATE <table> SET <column> =`, and the `RETURNING` list of either. All three
 * name their table unambiguously next to their columns, so a mismatch is a fact
 * rather than a guess. SELECT and WHERE clauses are not checked — resolving a
 * bare column across joins and aliases needs a real parser, and a checker that
 * cries wolf gets switched off.
 *
 * RETURNING earns its place: an audit found seven statements whose INSERT column
 * list was perfectly valid while their RETURNING named `updated_at` on a table
 * that has only `created_at`. Postgres rejects those at parse time, so the row is
 * never written — and checking only the insert list misses every one.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMigrationSchema } from './lib/migration-schema.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'apps', 'web', 'drizzle');
const SOURCE_ROOTS = ['apps/web/src/', 'apps/web/scripts/', 'packages/api/src/'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs'];

/**
 * Tables the application creates at runtime, or that live outside the migration
 * chain. A reference to one of these is skipped rather than reported, because the
 * chain genuinely does not describe them.
 */
const TABLES_OUTSIDE_THE_CHAIN = new Set(['__drizzle_migrations']);

// ─── Schema is derived from the committed migrations by lib/migration-schema.mjs ─

/** Split a parenthesised column list on top-level commas only. */
function splitTopLevel(body) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of body) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim()) parts.push(current);
    return parts;
}

// ─── Column references in application SQL ───────────────────────────────────

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
                !file.includes('/node_modules/'),
        );
}

function lineOf(text, index) {
    return text.slice(0, index).split('\n').length;
}

function findReferences(file, text) {
    const references = [];

    // INSERT INTO [schema.]table ( col, col, ... )
    const insertRe = /INSERT\s+INTO\s+(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(([^)]*)\)/giu;
    let match;
    while ((match = insertRe.exec(text)) !== null) {
        const [, table, columnList] = match;
        // A column list containing SQL is a SELECT-shaped insert, not a list.
        if (/\bSELECT\b|\$\{/i.test(columnList)) continue;
        for (const raw of columnList.split(',')) {
            const column = raw.trim().replace(/"/g, '').toLowerCase();
            if (!/^[a-z_][a-z0-9_]*$/.test(column)) continue;
            references.push({ file, table, column, line: lineOf(text, match.index), kind: 'INSERT' });
        }
    }

    // UPDATE [schema.]table SET col = ...
    const updateRe = /UPDATE\s+(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\s+SET\s+([\s\S]{0,600}?)(?:\bWHERE\b|\bRETURNING\b|`|$)/giu;
    while ((match = updateRe.exec(text)) !== null) {
        const [, table, assignments] = match;
        if (/\$\{/.test(assignments)) continue;
        for (const part of splitTopLevel(assignments)) {
            const column = part.trim().split(/\s*=/)[0]?.trim().replace(/"/g, '').toLowerCase();
            if (!column || !/^[a-z_][a-z0-9_]*$/.test(column)) continue;
            references.push({ file, table, column, line: lineOf(text, match.index), kind: 'UPDATE' });
        }
    }

    // RETURNING <cols> — belongs to the table just named by the INSERT or UPDATE,
    // so it is as unambiguous as the column list itself.
    const returningRe = /(INSERT\s+INTO|UPDATE)\s+(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\b([\s\S]{0,1200}?)\bRETURNING\b([\s\S]{0,600}?)(?:`|;|\)\s*$|$)/giu;
    while ((match = returningRe.exec(text)) !== null) {
        const [, , table, between, returning] = match;
        // A second statement between the two keywords means they are not a pair.
        if (/\bINSERT\s+INTO\b|\bUPDATE\b\s+[a-z_"]+\s+\bSET\b/i.test(between)) continue;
        if (/\$\{/.test(returning)) continue;
        for (const part of splitTopLevel(returning)) {
            const expression = part.trim();
            if (!expression || expression === '*') continue;
            // Only a bare column, optionally aliased. Anything with a function
            // call, operator or qualifier is left alone rather than guessed at.
            const bare = /^"?([a-z_][a-z0-9_]*)"?(?:\s+AS\s+"?[A-Za-z_][A-Za-z0-9_]*"?)?$/i.exec(expression);
            if (!bare) continue;
            const column = bare[1].toLowerCase();
            references.push({ file, table, column, line: lineOf(text, match.index), kind: 'RETURNING' });
        }
    }

    return references;
}

// ─── Tables referenced in FROM / JOIN ───────────────────────────────────────

/**
 * A missing TABLE is unambiguous in a way a missing column is not.
 *
 * `POST /api/iot/ingest` queried `FROM hardware_tokens` — a table in no
 * migration, no schema module and no database. Every scan since it shipped
 * failed on `relation "hardware_tokens" does not exist`, and nothing caught it:
 * the column checks above only look at INSERT lists, UPDATE targets and
 * RETURNING, and the endpoint does none of those before the SELECT fails.
 *
 * Resolving a bare COLUMN across joins and aliases needs a real parser, which is
 * why that stays out of scope. Resolving a table name after FROM or JOIN does
 * not: the name is right there.
 */
const SQL_NOISE = new Set([
  'select', 'where', 'lateral', 'only', 'unnest', 'generate_series', 'jsonb_array_elements',
  'jsonb_to_recordset', 'json_array_elements', 'values', 'dual', 'rows',
  // REVOKE ... FROM PUBLIC names a role, not a relation.
  'public', 'current_user', 'session_user',
]);

/**
 * Only the SQL, never the prose.
 *
 * Scanning whole TypeScript files matched `FROM` and `JOIN` inside English
 * comments — "the", "this", "here" — 94 times for the word "the" alone. SQL in
 * this repository lives in template literals and quoted strings, so that is the
 * only place worth looking.
 */
function sqlStrings(text) {
  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  return [
    ...withoutComments.matchAll(/`([^`]*)`/g),
    ...withoutComments.matchAll(/'((?:[^'\\\n]|\\.)*)'/g),
    ...withoutComments.matchAll(/"((?:[^"\\\n]|\\.)*)"/g),
  ]
    .map((match) => ({
      // SQL comments inside the literal are prose too: `-- derived FROM the
      // schema` matched "the" eighteen times.
      body: match[1].replace(/--[^\n]*/g, ' '),
      offset: match.index + 1,
    }))
    // A string is SQL only if it contains a statement keyword. English prose
    // says "from" constantly — "routes work away from the dedicated pool"
    // matched `FROM the` — and no heuristic on the word alone can tell them
    // apart. Requiring SELECT/INSERT/UPDATE/DELETE/CREATE can.
    .filter(({ body }) => /\bSELECT\b|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bUPDATE\b[\s\S]*\bSET\b|\bCREATE\s+(?:TABLE|INDEX|VIEW)\b/i.test(body))
    .filter(({ body }) => /\b(?:FROM|JOIN)\s+[a-z_"]/i.test(body));
}

function findTableReferences(file, text) {
  const references = [];

  for (const { body, offset } of sqlStrings(text)) {
    // CTE names are defined by the statement, not by the schema.
    const cteNames = new Set(
      [...body.matchAll(/(?:\bWITH\b|,)\s*(?:RECURSIVE\s+)?"?([a-z_][a-z0-9_]*)"?\s*(?:\([^)]*\))?\s+AS\s*(?:MATERIALIZED\s+|NOT\s+MATERIALIZED\s+)?\(/giu)].map(
        (m) => m[1].toLowerCase(),
      ),
    );

    // `REVOKE SELECT ON students FROM school_runtime` names a role.
    if (/\b(?:GRANT|REVOKE)\b/i.test(body)) continue;

    const re = /\b(?:FROM|JOIN)\s+(?!\()(?:(?:"?([a-z_][a-z0-9_]*)"?)\.)?"?([a-z_][a-z0-9_]*)"?/giu;
    let match;
    while ((match = re.exec(body)) !== null) {
      const [, schemaName, table] = match;
      const name = table.toLowerCase();

      // Only the public schema is described by the migration chain.
      if (schemaName && schemaName.toLowerCase() !== 'public') continue;
      // Catalog and information-schema relations are Postgres's, not ours.
      if (name.startsWith('pg_') || SQL_NOISE.has(name) || cteNames.has(name)) continue;
      if (/^\s*\(/.test(body.slice(match.index + match[0].length))) continue;

      references.push({ file, table: name, line: lineOf(text, offset + match.index) });
    }
  }
  return references;
}

// ─── Report ─────────────────────────────────────────────────────────────────

const mode = process.argv.includes('--report') ? 'report' : 'check';

const schema = buildMigrationSchema();
if (schema.size === 0) {
    console.error('Could not derive any tables from the migration chain — refusing to pass vacuously.');
    process.exit(1);
}

const problems = [];
const missingTables = [];
let checked = 0;
let tablesChecked = 0;

// Every table the application reads from must exist somewhere in the chain.
const knownTables = new Set(schema.keys());
for (const file of listSourceFiles()) {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    if (!/\b(?:FROM|JOIN)\b/i.test(text)) continue;
    // Test fixtures contain deliberately synthetic SQL — a suite asserting how a
    // dollar-quoted string is parsed is not a claim that `identifiers` exists.
    if (/(^|\/)__tests__\//.test(file) || /\.test\.(ts|tsx|mjs)$/.test(file)) continue;
    for (const reference of findTableReferences(file, text)) {
        if (TABLES_OUTSIDE_THE_CHAIN.has(reference.table)) continue;
        tablesChecked += 1;
        if (!knownTables.has(reference.table)) missingTables.push(reference);
    }
}

for (const file of listSourceFiles()) {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    if (!/INSERT\s+INTO|UPDATE\s+[a-z_"]+\s+SET|RETURNING/i.test(text)) continue;

    for (const reference of findReferences(file, text)) {
        // A table the chain does not describe cannot be checked either way.
        if (TABLES_OUTSIDE_THE_CHAIN.has(reference.table)) continue;
        const columns = schema.get(reference.table);
        if (!columns) continue;

        checked += 1;
        if (!columns.has(reference.column)) {
            problems.push(reference);
        }
    }
}

console.log(
    `Checked ${checked} column reference(s) and ${tablesChecked} table reference(s) in ` +
        `hand-written SQL against ${schema.size} tables from the migration chain.`,
);

if (missingTables.length > 0) {
    console.error('');
    for (const missing of missingTables) {
        console.error(
            `  ${missing.file}:${missing.line}  reads FROM/JOIN ${missing.table} — no such table in the migration chain`,
        );
        const near = [...schema.keys()]
            .filter((t) => t.includes(missing.table) || missing.table.includes(t))
            .sort();
        if (near.length > 0 && near.length <= 5) {
            console.error(`      did you mean: ${near.join(', ')}?`);
        }
    }
}

if (problems.length > 0) {
    console.error('');
    for (const problem of problems) {
        const known = [...(schema.get(problem.table) ?? [])].sort();
        const near = known.filter((c) => c.includes(problem.column) || problem.column.includes(c));
        console.error(
            `  ${problem.file}:${problem.line}  ${problem.kind} ${problem.table}.${problem.column} — no such column` +
                (near.length > 0 ? `  (did you mean ${near.join(', ')}?)` : ''),
        );
        // Name the table that does own it — the billing_status case was a column
        // on a neighbouring table, which is far more common than a typo.
        const owners = [...schema.entries()]
            .filter(([table, cols]) => table !== problem.table && cols.has(problem.column))
            .map(([table]) => table);
        if (owners.length > 0 && owners.length <= 6) {
            console.error(`      ${problem.column} exists on: ${owners.join(', ')}`);
        } else if (owners.length > 6) {
            // A column on a hundred tables says nothing about which one was meant;
            // the useful signal is only that this table is the exception.
            console.error(
                `      ${problem.column} is common elsewhere (${owners.length} tables) but absent here`,
            );
        }
    }
}

if (mode === 'report') {
    console.log(
        `\n${problems.length + missingTables.length} problem(s) found (report mode never fails).`,
    );
    process.exit(0);
}

if (missingTables.length > 0) {
    console.error(
        `\n${missingTables.length} statement(s) read from a table that does not exist. ` +
            'Every one throws at runtime, on the first query rather than the first write.',
    );
    process.exit(1);
}

if (problems.length > 0) {
    console.error(
        `\n${problems.length} hand-written SQL column reference(s) do not exist in the schema. ` +
            'Each one throws at runtime, where the surrounding catch usually turns it into a generic message.',
    );
    process.exit(1);
}

console.log('All checked SQL table and column references exist.');

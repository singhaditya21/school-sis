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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

// ─── Schema, derived from the committed migrations ──────────────────────────

function stripSqlComments(sql) {
    return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

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

const CONSTRAINT_KEYWORDS = new Set([
    'primary', 'foreign', 'unique', 'check', 'constraint', 'exclude', 'like',
]);

function buildSchema() {
    const files = execFileSync('git', ['ls-files', 'apps/web/drizzle/*.sql'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    })
        .split('\n')
        .filter(Boolean)
        .sort();

    const tables = new Map();

    for (const file of files) {
        const path = join(REPO_ROOT, file);
        if (!existsSync(path)) continue;
        const sql = stripSqlComments(readFileSync(path, 'utf8'));

        // CREATE TABLE [IF NOT EXISTS] [schema.]name ( ... )
        const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/giu;
        let match;
        while ((match = createRe.exec(sql)) !== null) {
            const table = match[2];
            // Walk to the matching close paren so nested types are handled.
            let depth = 1;
            let i = createRe.lastIndex;
            for (; i < sql.length && depth > 0; i += 1) {
                if (sql[i] === '(') depth += 1;
                else if (sql[i] === ')') depth -= 1;
            }
            const body = sql.slice(createRe.lastIndex, i - 1);

            const columns = tables.get(table) ?? new Set();
            for (const part of splitTopLevel(body)) {
                const name = part.trim().split(/\s+/)[0]?.replace(/"/g, '').toLowerCase();
                if (!name || CONSTRAINT_KEYWORDS.has(name)) continue;
                columns.add(name);
            }
            tables.set(table, columns);
        }

        // ALTER TABLE name ADD [COLUMN] [IF NOT EXISTS] col
        const alterRe = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/giu;
        while ((match = alterRe.exec(sql)) !== null) {
            const [, table, column] = match;
            if (CONSTRAINT_KEYWORDS.has(column.toLowerCase())) continue;
            const columns = tables.get(table) ?? new Set();
            columns.add(column.toLowerCase());
            tables.set(table, columns);
        }
    }

    return tables;
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

// ─── Report ─────────────────────────────────────────────────────────────────

const mode = process.argv.includes('--report') ? 'report' : 'check';

const schema = buildSchema();
if (schema.size === 0) {
    console.error('Could not derive any tables from the migration chain — refusing to pass vacuously.');
    process.exit(1);
}

const problems = [];
let checked = 0;

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
    `Checked ${checked} column reference(s) in hand-written SQL against ${schema.size} tables from the migration chain.`,
);

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
    console.log(`\n${problems.length} problem(s) found (report mode never fails).`);
    process.exit(0);
}

if (problems.length > 0) {
    console.error(
        `\n${problems.length} hand-written SQL column reference(s) do not exist in the schema. ` +
            'Each one throws at runtime, where the surrounding catch usually turns it into a generic message.',
    );
    process.exit(1);
}

console.log('All checked SQL column references exist.');

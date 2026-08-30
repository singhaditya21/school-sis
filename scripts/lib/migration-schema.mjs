import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Derive the database schema (tables → column names) from the committed raw-SQL
 * migration chain in apps/web/drizzle. This is the single source of truth now that
 * the Drizzle schema snapshots are gone; both the hand-written-SQL column audit and
 * the RLS policy-matrix audit read from here so they can never disagree about which
 * tables and columns the chain defines.
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

/**
 * @returns {Map<string, Set<string>>} unqualified table name → lowercased column names.
 */
export function buildMigrationSchema() {
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

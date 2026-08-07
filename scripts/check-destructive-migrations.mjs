import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const migrationDirectories = [
  `${repoRoot}/apps/web/drizzle`,
  `${repoRoot}/packages/api/src/db/migrations`,
];
const destructivePatterns = [
  /\bDROP\s+(?:TABLE|TYPE|SCHEMA|DATABASE|MATERIALIZED\s+VIEW|VIEW|INDEX|FUNCTION|PROCEDURE|SEQUENCE|EXTENSION|TRIGGER)\b/i,
  /\bTRUNCATE(?:\s+TABLE)?\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+(?:COLUMN|CONSTRAINT)\b/i,
];
const approvalMarker = 'destructive-migration-approved:';
const approvalPattern = /^\s*--\s*destructive-migration-approved:\s+owner=\S+\s+rollback=\S+\s*$/i;
const failures = [];

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function statementsWithOffsets(source) {
  const statements = [];
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    if (index !== source.length && source[index] !== ';') continue;
    statements.push({ text: source.slice(start, index), start });
    start = index + 1;
  }
  return statements;
}

function approvalLineFor(statement) {
  const lines = statement.text.split(/\r?\n/);
  const firstSqlLine = lines.findIndex((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('--');
  });
  if (firstSqlLine < 1) return null;

  for (let index = firstSqlLine - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) continue;
    return lines[index];
  }
  return null;
}

for (const directory of migrationDirectories) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== '.sql') continue;
    const path = join(directory, entry.name);
    const source = readFileSync(path, 'utf8');
    for (const statement of statementsWithOffsets(source)) {
      const normalized = statement.text
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*--.*$/gm, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!normalized || !destructivePatterns.some((pattern) => pattern.test(normalized))) continue;

      const approvalLine = approvalLineFor(statement);
      if (!approvalLine || !approvalPattern.test(approvalLine)) {
        const firstSqlOffset = statement.text.search(/\S/);
        const line = lineNumberAt(source, statement.start + Math.max(firstSqlOffset, 0));
        failures.push(`${path.replace(`${repoRoot}/`, '')}:${line}: ${normalized.slice(0, 180)}`);
      }
    }
  }
}

if (failures.length) {
  console.error('Destructive migration statements require an adjacent approval marker with an owner and rollback reference.');
  console.error(`Use: -- ${approvalMarker} owner=<name> rollback=<document-or-command>`);
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.info('No unapproved destructive migration statements found.');

#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MAINTENANCE_RECORD_PATH =
  "scripts/destructive-migration-maintenance.json";

const DRIZZLE_DIRECTORY = "apps/web/drizzle";
const AUXILIARY_MIGRATION_DIRECTORY = "packages/api/src/db/migrations";
const APPROVAL_MARKER = "destructive-migration-approved:";
const APPROVAL_PATTERN =
  /^\s*--\s*destructive-migration-approved:\s+owner=\S+\s+rollback=\S+\s*$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OWNER_PATTERN = /^[A-Za-z0-9_.@/-]{2,100}$/;
const MIGRATION_PATH_PATTERN = /^apps\/web\/drizzle\/[A-Za-z0-9_-]+\.sql$/;
const IDENTIFIER = String.raw`(?:"(?:[^"]|"")*"|%I|[a-z_][a-z0-9_$]*)`;

const BACKWARD_INCOMPATIBLE_PATTERNS = Object.freeze([
  Object.freeze({
    kind: "drop-object",
    pattern:
      /\bDROP\s+(?:TABLE|TYPE|SCHEMA|DATABASE|MATERIALIZED\s+VIEW|VIEW|INDEX|FUNCTION|PROCEDURE|SEQUENCE|EXTENSION|TRIGGER|RULE|ROLE|OWNED|DOMAIN|COLLATION|PUBLICATION|SUBSCRIPTION)\b/giu,
  }),
  Object.freeze({
    kind: "truncate",
    pattern: /\bTRUNCATE(?:\s+TABLE)?\b/giu,
  }),
  Object.freeze({
    kind: "delete-data",
    pattern: /\bDELETE\s+FROM\b/giu,
  }),
  Object.freeze({
    kind: "revoke-privilege",
    pattern: /\bREVOKE\b/giu,
  }),
  Object.freeze({
    kind: "drop-column-or-constraint",
    pattern:
      /\bALTER\s+(?:TABLE|DOMAIN)\b[^;]*?\bDROP\s+(?:COLUMN|CONSTRAINT)\b/giu,
  }),
  Object.freeze({
    kind: "alter-column-type",
    pattern:
      /\bALTER\s+TABLE\b[^;]*?\bALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+(?:SET\s+DATA\s+TYPE|TYPE)\b/giu,
  }),
  Object.freeze({
    kind: "set-not-null",
    pattern:
      /\bALTER\s+(?:TABLE|DOMAIN)\b[^;]*?\b(?:ALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+)?SET\s+NOT\s+NULL\b/giu,
  }),
  Object.freeze({
    kind: "drop-default",
    pattern:
      /\bALTER\s+(?:TABLE|DOMAIN)\b[^;]*?\b(?:ALTER\s+(?:COLUMN\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)\s+)?DROP\s+DEFAULT\b/giu,
  }),
  Object.freeze({
    kind: "rename-contract",
    pattern:
      /\bALTER\s+(?:TABLE|TYPE|DOMAIN|INDEX|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|SCHEMA|FUNCTION|PROCEDURE)\b[^;]*?\bRENAME\s+(?:COLUMN\s+|CONSTRAINT\s+|ATTRIBUTE\s+|VALUE\s+)?(?:"[^"]+"|'(?:''|[^'])*'|[a-z_][a-z0-9_$]*)?\s*TO\b/giu,
  }),
  Object.freeze({
    kind: "move-schema",
    pattern:
      /\bALTER\s+(?:TABLE|TYPE|DOMAIN|INDEX|VIEW|MATERIALIZED\s+VIEW|SEQUENCE|FUNCTION|PROCEDURE|COLLATION)\b[^;]*?\bSET\s+SCHEMA\b/giu,
  }),
  Object.freeze({
    kind: "weaken-rls",
    pattern:
      /\bALTER\s+TABLE\b[^;]*?\b(?:DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY)\b/giu,
  }),
  Object.freeze({
    kind: "disable-trigger",
    pattern: /\bALTER\s+TABLE\b[^;]*?\bDISABLE\s+TRIGGER\b/giu,
  }),
  Object.freeze({
    kind: "detach-partition",
    pattern: /\bALTER\s+TABLE\b[^;]*?\bDETACH\s+PARTITION\b/giu,
  }),
]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function assertExactKeys(value, expectedKeys, label) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}.`);
  }
}

function assertSingleLine(value, label, maximumLength) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    value.length > maximumLength ||
    /[\r\n\0]/u.test(value)
  ) {
    throw new Error(`${label} must be a non-empty single-line string.`);
  }
}

function assertEvidenceUrl(value, label) {
  assertSingleLine(value, label, 500);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error(`${label} must be an https://github.com evidence URL.`);
  }
}

export function parseMaintenanceRecordDocument(value) {
  if (!isPlainObject(value)) {
    throw new Error(
      "Destructive-migration maintenance record must be a JSON object.",
    );
  }
  assertExactKeys(
    value,
    ["records", "version"],
    "Destructive-migration maintenance record",
  );
  if (value.version !== 1) {
    throw new Error(
      "Destructive-migration maintenance record version must be 1.",
    );
  }
  if (!Array.isArray(value.records)) {
    throw new Error(
      "Destructive-migration maintenance records must be an array.",
    );
  }

  const timestamps = new Set();
  const paths = new Set();
  return value.records.map((record, index) => {
    const label = `Maintenance record ${index}`;
    if (!isPlainObject(record)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    assertExactKeys(
      record,
      [
        "evidenceUrl",
        "migrationPath",
        "migrationTimestamp",
        "owner",
        "rollbackPlan",
        "sha256",
      ],
      label,
    );
    if (
      !Number.isSafeInteger(record.migrationTimestamp) ||
      record.migrationTimestamp <= 0
    ) {
      throw new Error(
        `${label} migrationTimestamp must be a positive integer.`,
      );
    }
    if (
      typeof record.migrationPath !== "string" ||
      !MIGRATION_PATH_PATTERN.test(record.migrationPath)
    ) {
      throw new Error(
        `${label} migrationPath must name one apps/web/drizzle SQL file.`,
      );
    }
    if (
      typeof record.sha256 !== "string" ||
      !SHA256_PATTERN.test(record.sha256)
    ) {
      throw new Error(`${label} sha256 must be a lowercase SHA-256 digest.`);
    }
    if (typeof record.owner !== "string" || !OWNER_PATTERN.test(record.owner)) {
      throw new Error(`${label} owner has an invalid format.`);
    }
    assertSingleLine(record.rollbackPlan, `${label} rollbackPlan`, 500);
    assertEvidenceUrl(record.evidenceUrl, `${label} evidenceUrl`);
    if (timestamps.has(record.migrationTimestamp)) {
      throw new Error(
        `Duplicate maintenance migrationTimestamp ${record.migrationTimestamp}.`,
      );
    }
    if (paths.has(record.migrationPath)) {
      throw new Error(
        `Duplicate maintenance migrationPath ${record.migrationPath}.`,
      );
    }
    timestamps.add(record.migrationTimestamp);
    paths.add(record.migrationPath);
    return Object.freeze({ ...record });
  });
}

function maskComments(source) {
  const characters = [...source];
  let state = "sql";

  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    const next = characters[index + 1];

    if (state === "line-comment") {
      if (current === "\n" || current === "\r") state = "sql";
      else characters[index] = " ";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "sql";
      } else if (current !== "\n" && current !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
    if (state === "single-quote") {
      if (current === "'" && next === "'") index += 1;
      else if (current === "'") state = "sql";
      continue;
    }
    if (state === "double-quote") {
      if (current === '"' && next === '"') index += 1;
      else if (current === '"') state = "sql";
      continue;
    }
    if (current === "-" && next === "-") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      state = "line-comment";
    } else if (current === "/" && next === "*") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      state = "block-comment";
    } else if (current === "'") {
      state = "single-quote";
    } else if (current === '"') {
      state = "double-quote";
    }
  }
  return characters.join("");
}

function policyKey(policy, schemaOrTable, table) {
  return [policy, schemaOrTable, table]
    .filter(Boolean)
    .map((part) => part.replaceAll('"', "").toLowerCase())
    .join("|");
}

function policyTableKey(schemaOrTable, table) {
  return [schemaOrTable, table]
    .filter(Boolean)
    .map((part) => part.replaceAll('"', "").toLowerCase())
    .join("|");
}

function policyMatches(source, operation) {
  const pattern = new RegExp(
    String.raw`\b${operation}\s+POLICY(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+(${IDENTIFIER})\s+ON\s+(${IDENTIFIER})(?:\s*\.\s*(${IDENTIFIER}))?`,
    "giu",
  );
  return [...source.matchAll(pattern)].map((match) => ({
    index: match.index,
    key: policyKey(match[1], match[2], match[3]),
    policyName: match[1].replaceAll('"', "").toLowerCase(),
    tableKey: policyTableKey(match[2], match[3]),
    text: match[0],
  }));
}

export function findBackwardIncompatibleStatements(source) {
  const searchable = maskComments(source);
  const findings = [];
  for (const { kind, pattern } of BACKWARD_INCOMPATIBLE_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of searchable.matchAll(pattern)) {
      findings.push({ index: match.index, kind, text: match[0] });
    }
  }

  const createdPolicyMatches = policyMatches(searchable, "CREATE");
  const createdPolicies = new Set(
    createdPolicyMatches.map((match) => match.key),
  );
  const tablesWithCreatedPolicies = new Set(
    createdPolicyMatches.map((match) => match.tableKey),
  );
  for (const droppedPolicy of policyMatches(searchable, "DROP")) {
    if (
      !createdPolicies.has(droppedPolicy.key) &&
      !(
        droppedPolicy.policyName === "tenant_isolation_policy" &&
        tablesWithCreatedPolicies.has(droppedPolicy.tableKey)
      )
    ) {
      findings.push({
        index: droppedPolicy.index,
        kind: "drop-rls-policy",
        text: droppedPolicy.text,
      });
    }
  }

  return findings.sort((left, right) => left.index - right.index);
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/u).length;
}

function approvalLineBefore(source, offset) {
  const statementStart = source.lastIndexOf(";", Math.max(0, offset - 1)) + 1;
  const beforeFinding = source.slice(statementStart, offset);
  const lines = beforeFinding.split(/\r?\n/u);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) continue;
    return lines[index];
  }
  return null;
}

function readJson(path, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} is not valid JSON: ${detail}`);
  }
  return value;
}

function toRepoPath(repoRoot, path) {
  return relative(repoRoot, path).split(sep).join("/");
}

function readJournal(repoRoot) {
  const journalPath = resolve(
    repoRoot,
    DRIZZLE_DIRECTORY,
    "meta/_journal.json",
  );
  const journal = readJson(journalPath, "Drizzle migration journal");
  if (!isPlainObject(journal) || !Array.isArray(journal.entries)) {
    throw new Error("Drizzle migration journal must contain an entries array.");
  }
  const byPath = new Map();
  for (const [index, entry] of journal.entries.entries()) {
    if (
      !isPlainObject(entry) ||
      !Number.isSafeInteger(entry.when) ||
      entry.when <= 0 ||
      typeof entry.tag !== "string" ||
      !/^[A-Za-z0-9_-]+$/u.test(entry.tag)
    ) {
      throw new Error(`Drizzle migration journal entry ${index} is malformed.`);
    }
    const migrationPath = `${DRIZZLE_DIRECTORY}/${entry.tag}.sql`;
    if (byPath.has(migrationPath)) {
      throw new Error(
        `Duplicate Drizzle migration journal path ${migrationPath}.`,
      );
    }
    byPath.set(migrationPath, entry.when);
  }
  return byPath;
}

function readAndValidateMaintenanceRecords(repoRoot, sqlByPath) {
  const recordPath = resolve(repoRoot, MAINTENANCE_RECORD_PATH);
  if (!existsSync(recordPath)) {
    throw new Error(`Missing ${MAINTENANCE_RECORD_PATH}.`);
  }
  const records = parseMaintenanceRecordDocument(
    readJson(recordPath, "Destructive-migration maintenance record"),
  );
  const journalByPath = readJournal(repoRoot);
  const byPath = new Map();

  for (const record of records) {
    const journalTimestamp = journalByPath.get(record.migrationPath);
    if (journalTimestamp !== record.migrationTimestamp) {
      throw new Error(
        `Maintenance record ${record.migrationPath} does not exactly match its Drizzle journal timestamp.`,
      );
    }
    const source = sqlByPath.get(record.migrationPath);
    if (source === undefined) {
      throw new Error(
        `Maintenance record ${record.migrationPath} does not name a checked-in migration.`,
      );
    }
    const actualHash = createHash("sha256").update(source).digest("hex");
    if (record.sha256 !== actualHash) {
      throw new Error(
        `Maintenance record ${record.migrationPath} has a stale or tampered SHA-256 digest.`,
      );
    }
    if (findBackwardIncompatibleStatements(source).length === 0) {
      throw new Error(
        `Maintenance record ${record.migrationPath} does not identify a destructive migration.`,
      );
    }
    byPath.set(record.migrationPath, record);
  }
  return byPath;
}

export function evaluateMigrationPolicy({ repoRoot, releaseMode = false }) {
  const migrationDirectories = [
    resolve(repoRoot, DRIZZLE_DIRECTORY),
    resolve(repoRoot, AUXILIARY_MIGRATION_DIRECTORY),
  ];
  const sqlFiles = [];
  const sqlByPath = new Map();
  for (const directory of migrationDirectories) {
    if (!existsSync(directory)) {
      throw new Error(
        `Missing migration directory ${toRepoPath(repoRoot, directory)}.`,
      );
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || extname(entry.name) !== ".sql") continue;
      const path = join(directory, entry.name);
      const repoPath = toRepoPath(repoRoot, path);
      const source = readFileSync(path, "utf8");
      sqlFiles.push({ path, repoPath, source });
      sqlByPath.set(repoPath, source);
    }
  }

  const recordsByPath = readAndValidateMaintenanceRecords(repoRoot, sqlByPath);
  const failures = [];
  for (const file of sqlFiles) {
    const record = recordsByPath.get(file.repoPath);
    for (const finding of findBackwardIncompatibleStatements(file.source)) {
      const approvalLine = approvalLineBefore(file.source, finding.index);
      const approvedForDevelopment =
        record !== undefined ||
        (approvalLine !== null && APPROVAL_PATTERN.test(approvalLine));
      const approvedForRelease = record !== undefined;
      if (
        (releaseMode && approvedForRelease) ||
        (!releaseMode && approvedForDevelopment)
      ) {
        continue;
      }
      failures.push(
        `${file.repoPath}:${lineNumberAt(file.source, finding.index)}: ${finding.kind}: ${finding.text.replace(/\s+/gu, " ").slice(0, 180)}`,
      );
    }
  }
  return { failures, recordCount: recordsByPath.size };
}

function runCli() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some((argument) => argument !== "--release")) {
    throw new Error("Only the optional --release argument is supported.");
  }
  const releaseMode = arguments_.includes("--release");
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const result = evaluateMigrationPolicy({ repoRoot, releaseMode });

  if (result.failures.length > 0) {
    if (releaseMode) {
      console.error(
        "Automated releases are expand-only; destructive migrations require an exact, source-controlled maintenance record and must already be applied manually in production.",
      );
    } else {
      console.error(
        "Backward-incompatible SQL requires an adjacent approval marker or an exact maintenance record.",
      );
      console.error(
        `Use: -- ${APPROVAL_MARKER} owner=<name> rollback=<document-or-command>`,
      );
    }
    for (const failure of result.failures) console.error(failure);
    process.exitCode = 1;
    return;
  }

  console.info(
    releaseMode
      ? `Migration release policy passed with ${result.recordCount} immutable maintenance record(s).`
      : "No unapproved backward-incompatible migration statements found.",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runCli();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Migration policy check failed: ${message}`);
    process.exitCode = 1;
  }
}

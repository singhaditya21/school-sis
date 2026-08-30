import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationFiles } from "./read-migration-files";
import { EXPECTED_DATABASE_MIGRATIONS } from "../src/generated/migration-manifest";

/**
 * Static migration-chain integrity check — the in-repo replacement for the
 * `drizzle-kit check` CI step. It needs no database and runs in the `validate` job.
 *
 * What it guarantees:
 *   - every journal entry has a well-formed, unique tag;
 *   - timestamps (`when`) are positive and STRICTLY increasing (the ledger orders by
 *     them, so a tie or regression would corrupt apply order);
 *   - the in-repo reader (read-migration-files.ts) loads every .sql and each carries
 *     at least one statement — this also exercises the reader that replaced
 *     drizzle-orm/migrator on the production path;
 *   - every reader hash equals the committed runtime manifest, and vice versa.
 *
 * `db:manifest:check` separately proves the manifest itself is regenerated; this adds
 * the ordering/uniqueness guarantees `drizzle-kit check` used to provide against the
 * (now-removed) schema snapshots.
 */
function fail(message: string): never {
    console.error(`[audit:migrations:chain] ${message}`);
    process.exit(1);
}

interface JournalEntry {
    tag: string;
    when: number;
    breakpoints: boolean;
}

function findMigrationsFolder(): string {
    for (const root of [resolve(process.cwd()), resolve(process.cwd(), "apps/web")]) {
        const folder = resolve(root, "drizzle");
        if (existsSync(resolve(folder, "meta/_journal.json"))) return folder;
    }
    return fail("could not locate apps/web/drizzle/meta/_journal.json from the working directory.");
}

const migrationsFolder = findMigrationsFolder();
const journal = JSON.parse(readFileSync(resolve(migrationsFolder, "meta/_journal.json"), "utf8")) as {
    entries: JournalEntry[];
};
const entries = journal.entries;
if (!Array.isArray(entries) || entries.length === 0) {
    fail("the migration journal has no entries.");
}

const tags = new Set<string>();
let previousWhen = -1;
for (const entry of entries) {
    if (typeof entry.tag !== "string" || !/^[A-Za-z0-9_-]+$/.test(entry.tag)) {
        fail(`invalid migration tag: ${JSON.stringify(entry.tag)}`);
    }
    if (tags.has(entry.tag)) fail(`duplicate migration tag: ${entry.tag}`);
    tags.add(entry.tag);
    if (!Number.isSafeInteger(entry.when) || entry.when <= 0) {
        fail(`invalid timestamp for ${entry.tag}: ${String(entry.when)}`);
    }
    if (entry.when <= previousWhen) {
        fail(`timestamps must be strictly increasing; ${entry.tag} (${entry.when}) <= previous (${previousWhen}).`);
    }
    previousWhen = entry.when;
}

const migrations = readMigrationFiles({ migrationsFolder });
if (migrations.length !== entries.length) {
    fail(`reader returned ${migrations.length} migration(s), the journal has ${entries.length}.`);
}

const manifestByTimestamp = new Map(EXPECTED_DATABASE_MIGRATIONS.map((m) => [m.createdAt, m.hash]));
if (manifestByTimestamp.size !== EXPECTED_DATABASE_MIGRATIONS.length) {
    fail("the runtime manifest has duplicate migration timestamps.");
}
for (const migration of migrations) {
    if (migration.sql.join("").trim().length === 0) {
        fail(`migration at ${migration.folderMillis} has no SQL statements.`);
    }
    const expected = manifestByTimestamp.get(String(migration.folderMillis));
    if (!expected) fail(`no manifest entry for migration timestamp ${migration.folderMillis}.`);
    if (expected !== migration.hash) {
        fail(`hash mismatch at ${migration.folderMillis}: manifest ${expected} != reader ${migration.hash}.`);
    }
    manifestByTimestamp.delete(String(migration.folderMillis));
}
if (manifestByTimestamp.size !== 0) {
    fail(`the manifest has ${manifestByTimestamp.size} migration(s) with no matching .sql file.`);
}

console.log(
    `Migration chain OK: ${entries.length} migrations — tags unique, timestamps strictly increasing, every .sql parses, hashes match the manifest.`,
);

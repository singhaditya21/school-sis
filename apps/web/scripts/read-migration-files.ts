import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/**
 * In-repo replacement for `drizzle-orm/migrator`'s `readMigrationFiles`, so the
 * production migration runner (deployment-migrations.ts) no longer depends on
 * drizzle-orm. This is a byte-for-byte reproduction of drizzle-orm@0.45.2's
 * implementation — deliberately identical, because the `hash` it computes is the
 * value already stored in every deployed `drizzle.__drizzle_migrations` ledger row
 * and cross-checked by the release preflight. Any drift here would make the runner
 * reject an already-applied migration.
 *
 * The parity is asserted against the real drizzle function in
 * read-migration-files.test.ts for the whole live chain; keep them in lockstep
 * until drizzle-orm is removed entirely.
 *
 *   hash         = sha256 of the full, unmodified .sql file text
 *   sql          = the file split on the `--> statement-breakpoint` marker (no trim)
 *   folderMillis = the journal entry's `when`
 *   bps          = the journal entry's `breakpoints`
 */
export interface MigrationMeta {
    sql: string[];
    bps: boolean;
    folderMillis: number;
    hash: string;
}

interface JournalEntry {
    tag: string;
    when: number;
    breakpoints: boolean;
}

export function readMigrationFiles(config: { migrationsFolder: string }): MigrationMeta[] {
    const migrationFolderTo = config.migrationsFolder;
    const migrationQueries: MigrationMeta[] = [];
    const journalPath = `${migrationFolderTo}/meta/_journal.json`;
    if (!existsSync(journalPath)) {
        throw new Error(`Can't find meta/_journal.json file`);
    }
    const journalAsString = readFileSync(`${migrationFolderTo}/meta/_journal.json`).toString();
    const journal = JSON.parse(journalAsString) as { entries: JournalEntry[] };
    for (const journalEntry of journal.entries) {
        const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;
        try {
            const query = readFileSync(`${migrationFolderTo}/${journalEntry.tag}.sql`).toString();
            const result = query.split("--> statement-breakpoint");
            migrationQueries.push({
                sql: result,
                bps: journalEntry.breakpoints,
                folderMillis: journalEntry.when,
                hash: createHash("sha256").update(query).digest("hex"),
            });
        } catch {
            throw new Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
        }
    }
    return migrationQueries;
}

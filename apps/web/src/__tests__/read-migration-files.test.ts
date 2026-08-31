import { resolve } from "node:path";
import { readMigrationFiles as ourReadMigrationFiles } from "../../scripts/read-migration-files";
import { EXPECTED_DATABASE_MIGRATIONS } from "../generated/migration-manifest";

/**
 * The in-repo reader replaced drizzle-orm/migrator on the production migration path
 * (drizzle-orm is now removed). Its `hash` is the value stored in every deployed
 * __drizzle_migrations ledger row, so it MUST stay byte-identical to the original
 * drizzle-orm@0.45.2 output. That equivalence is now pinned by the committed manifest
 * (EXPECTED_DATABASE_MIGRATIONS) — the hash+timestamp cross-check below — since the
 * live drizzle oracle is gone. Do NOT refactor read-migration-files.ts: any change to
 * its splitting or hashing would silently break already-applied migrations.
 */
const migrationsFolder = resolve(__dirname, "..", "..", "drizzle");

describe("readMigrationFiles (in-repo reimplementation)", () => {
    const ours = ourReadMigrationFiles({ migrationsFolder });

    it("returns the whole live chain", () => {
        expect(ours.length).toBe(EXPECTED_DATABASE_MIGRATIONS.length);
        expect(ours.length).toBeGreaterThan(0);
    });

    it("computes the same hash and timestamp the committed manifest pins", () => {
        const byTimestamp = new Map(ours.map((m) => [String(m.folderMillis), m.hash]));
        for (const expected of EXPECTED_DATABASE_MIGRATIONS) {
            expect(byTimestamp.get(expected.createdAt)).toBe(expected.hash);
        }
    });

    it("throws a clear error when the journal is missing", () => {
        expect(() => ourReadMigrationFiles({ migrationsFolder: resolve(migrationsFolder, "does-not-exist") })).toThrow(
            /Can't find meta\/_journal\.json/,
        );
    });
});

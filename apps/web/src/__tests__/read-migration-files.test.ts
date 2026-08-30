import { resolve } from "node:path";
import { readMigrationFiles as drizzleReadMigrationFiles } from "drizzle-orm/migrator";
import { readMigrationFiles as ourReadMigrationFiles } from "../../scripts/read-migration-files";
import { EXPECTED_DATABASE_MIGRATIONS } from "../generated/migration-manifest";

/**
 * The in-repo reader replaces drizzle-orm/migrator on the production migration path.
 * Its `hash` is the value stored in every deployed __drizzle_migrations ledger row,
 * so it MUST stay byte-identical to drizzle's. While drizzle-orm is still installed,
 * assert that directly against the real function over the live chain. When drizzle-orm
 * is finally removed, drop the drizzle comparison and keep the manifest cross-check.
 */
const migrationsFolder = resolve(__dirname, "..", "..", "drizzle");

describe("readMigrationFiles (in-repo reimplementation)", () => {
    const ours = ourReadMigrationFiles({ migrationsFolder });
    const drizzle = drizzleReadMigrationFiles({ migrationsFolder });

    it("returns the whole live chain", () => {
        expect(ours.length).toBe(EXPECTED_DATABASE_MIGRATIONS.length);
        expect(ours.length).toBeGreaterThan(0);
    });

    it("is byte-for-byte identical to drizzle-orm's readMigrationFiles", () => {
        // Deep equality covers sql[] (split on the breakpoint marker), bps,
        // folderMillis, and — the load-bearing field — hash.
        expect(ours).toEqual(drizzle);
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

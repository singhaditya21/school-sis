import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveDatabaseCredentials } from "../../packages/api/src/db/ssl";

const configuredDirectConnectionString =
  process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED;
const configuredConnectionString =
  configuredDirectConnectionString || process.env.DATABASE_URL;
const commandNeedsDatabase = process.argv.some((argument) =>
  ["migrate", "push", "pull", "studio", "introspect"].includes(argument),
);
const invokesMigration = process.argv.includes("migrate");
const invokesPush = process.argv.includes("push");
if (!configuredConnectionString && commandNeedsDatabase) {
  throw new Error(
    "DATABASE_URL, DIRECT_URL, or DATABASE_URL_UNPOOLED is required for Drizzle tooling.",
  );
}
// `drizzle-kit check` and schema generation are offline operations, but the
// config type still requires credentials. This local-only placeholder is never
// contacted by those commands.
const connectionString =
  configuredConnectionString ||
  "postgresql://config-only@localhost:5432/school_sis_config_only";

const parsedConnection = new URL(connectionString);
if (
  [...parsedConnection.searchParams.keys()].some(
    (key) => key.toLowerCase() === "host",
  )
) {
  throw new Error(
    "Database URLs must not override the hostname through a host query parameter.",
  );
}
const hostname = parsedConnection.hostname.toLowerCase();
const localDatabase = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
  hostname,
);
if (!localDatabase && (invokesMigration || invokesPush)) {
  throw new Error(
    invokesPush
      ? "db:push is local-only. Remote schemas must change through reviewed Drizzle migrations."
      : "Remote migrations must use db:migrate:deploy so ledger, locking, and RLS checks cannot be bypassed.",
  );
}
if (
  !localDatabase &&
  commandNeedsDatabase &&
  !configuredDirectConnectionString
) {
  throw new Error(
    "Remote Drizzle tooling requires an explicit direct URL (DIRECT_URL or DATABASE_URL_UNPOOLED).",
  );
}

export default defineConfig({
  schema: "../../packages/api/src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: resolveDatabaseCredentials(connectionString),
  verbose: true,
  strict: true,
});

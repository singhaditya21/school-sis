import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { resolveDatabaseConnectionOptions } from "../../../packages/api/src/db/ssl";

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "DATABASE_URL, DIRECT_URL, or DATABASE_URL_UNPOOLED is required to apply tenant RLS.",
  );
  process.exit(1);
}

const parsedConnection = new URL(connectionString);
if (
  [...parsedConnection.searchParams.keys()].some(
    (key) => key.toLowerCase() === "host",
  )
) {
  console.error(
    "Database URLs must not override the hostname through a host query parameter.",
  );
  process.exit(1);
}
const targetHost = parsedConnection.hostname.toLowerCase();
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(targetHost)) {
  console.error(
    "The standalone db:rls command is local-only. Remote RLS must run inside db:migrate:deploy.",
  );
  process.exit(1);
}

const migrationPath = fileURLToPath(
  new URL(
    "../../../packages/api/src/db/migrations/tenant-rls.sql",
    import.meta.url,
  ),
);

const sql = readFileSync(migrationPath, "utf8");
const pool = new Pool({
  ...resolveDatabaseConnectionOptions(connectionString),
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Tenant RLS application failed and rollback also failed.",
        );
      }
      throw error;
    }
    console.info("Tenant RLS policies applied successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Failed to apply tenant RLS policies:", error);
  process.exitCode = 1;
});

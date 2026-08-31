import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The IoT attendance path shipped complete except for its storage.
 *
 * POST /api/iot/ingest resolves a scanned RFID or biometric token to a student
 * through `hardware_tokens`; its job handler then reads `users.fcm_token` to
 * push the parent a notification. The endpoint, the handler, the service-token
 * auth, the env contract, the push provider and the public API-docs entry all
 * existed. The table and the column did not, so every scan failed on
 * `relation "hardware_tokens" does not exist` and every push on
 * `column u.fcm_token does not exist`.
 *
 * Nothing caught it: audit:sql checks INSERT lists, UPDATE targets and
 * RETURNING clauses, and the endpoint fails at a SELECT before reaching any of
 * them. So this pins the schema against the queries that read it.
 */
const migrations = readFileSync(
  resolve(process.cwd(), "drizzle", "0004_normal_jasper_sitwell.sql"),
  "utf8",
);
const ingestRoute = readFileSync(
  resolve(process.cwd(), "src/app/api/iot/ingest/route.ts"),
  "utf8",
);
const workerTasks = readFileSync(
  resolve(process.cwd(), "src/lib/worker/tasks.ts"),
  "utf8",
);

describe("IoT attendance ingest schema", () => {
  it("creates every column the ingest lookup reads", () => {
    // Exactly the columns in the endpoint's WHERE and SELECT.
    for (const column of ["tenant_id", "student_id", "token_id", "is_active"]) {
      expect(migrations).toMatch(
        new RegExp(`"${column}"`, "i"),
      );
      expect(ingestRoute).toContain(column);
    }
    expect(migrations).toContain('CREATE TABLE "hardware_tokens"');
  });

  it("creates the column the parent notification reads", () => {
    expect(workerTasks).toContain("u.fcm_token");
    expect(migrations).toContain('ALTER TABLE "users" ADD COLUMN "fcm_token"');
  });

  it("carries tenant_id, so the dynamic RLS policy covers it", () => {
    // tenant-rls.sql discovers every public base table with a tenant_id column
    // and applies ENABLE + FORCE row level security plus tenant_isolation_policy.
    // A tenant-scoped table without that column would silently sit outside the
    // isolation model that protects every other table in this schema.
    // Pinned against the migration DDL (the schema source is gone); this is
    // strictly stronger than the old DSL-intent check — it verifies the real
    // NOT NULL column and the FK/cascade the DDL actually creates.
    const createTable = migrations.slice(
      migrations.indexOf('CREATE TABLE "hardware_tokens"'),
    );
    const createBlock = createTable.slice(0, createTable.indexOf("--> statement-breakpoint"));
    expect(createBlock).toContain('"tenant_id" uuid NOT NULL');
    expect(migrations).toContain(
      'ADD CONSTRAINT "hardware_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade',
    );
  });

  it("keeps a token unique within a tenant, not globally", () => {
    // Two schools may legitimately issue cards whose UIDs collide, and a UID is
    // not a secret. Within one tenant a card must identify exactly one student,
    // or a scan is ambiguous about whose attendance to mark.
    expect(migrations).toContain(
      'CONSTRAINT "hardware_tokens_tenant_token_key" UNIQUE("tenant_id","token_id")',
    );
  });

  it("indexes the lookup the endpoint actually performs", () => {
    expect(migrations).toContain(
      'CREATE INDEX "idx_hardware_tokens_tenant_token_active" ON "hardware_tokens" USING btree ("tenant_id","token_id","is_active")',
    );
  });

  it("stores fcm_token wide enough for a real FCM registration token", () => {
    // FCM registration tokens run to roughly 160-200 characters today and have
    // grown before; 512 leaves room without inviting arbitrary data. Pinned
    // against the migration DDL (the schema source is gone).
    expect(migrations).toContain('ALTER TABLE "users" ADD COLUMN "fcm_token" varchar(512)');
  });
});

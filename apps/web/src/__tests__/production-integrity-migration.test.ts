import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findBackwardIncompatibleSql } from "../../scripts/deployment-migrations";

const migrationSql = readFileSync(
  join(process.cwd(), "drizzle/0001_reconcile_production_integrity.sql"),
  "utf8",
);

describe("production integrity reconciliation migration", () => {
  it("restores the complete handwritten integrity-object contract", () => {
    const checkDefinitions = migrationSql.match(
      /\('public\.[^']+', '[^']+_check', \$check\$[\s\S]*?\$check\$\)/gu,
    );
    expect(checkDefinitions).toHaveLength(61);
    expect(new Set(checkDefinitions).size).toBe(61);

    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_metadata_objects_system_api_name"',
    );
    expect(migrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_metadata_records_tenant_object"',
    );
    expect(migrationSql).toContain(
      'CREATE INDEX IF NOT EXISTS "idx_exams_tenant_status"',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_exam_result_hashes_result"',
    );
    expect(migrationSql).toContain("public.notify_entity_change()");
    expect(migrationSql).toContain("'trg_student_changes', 'public.students'");
    expect(migrationSql).toContain("'trg_invoice_changes', 'public.invoices'");
    expect(migrationSql).toContain("ALTER COLUMN \"mode\" SET DEFAULT 'LIVE'");
  });

  it("is forward-only, idempotent, and production-auto-apply eligible", () => {
    expect(findBackwardIncompatibleSql(migrationSql)).toEqual([]);
    expect(migrationSql).toContain("IF NOT FOUND THEN");
    expect(migrationSql).toContain("school_sis_reconciliation_probe_rollback");
    expect(migrationSql).not.toMatch(/\bALTER\s+TYPE\b[\s\S]*\buser_role\b/iu);
    expect(migrationSql).not.toMatch(/\bRENAME\s+CONSTRAINT\b/iu);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/iu);
    expect(migrationSql).not.toMatch(
      /\bDROP\s+(?:CONSTRAINT|FUNCTION|INDEX|TRIGGER)\b/iu,
    );
  });
});

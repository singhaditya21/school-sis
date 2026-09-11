import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("Phase 3 and Phase 4 hardening", () => {
  const coachingWriteActions = readSource("src/actions/coaching.ts");
  const coachingReadActions = readSource("src/lib/actions/coaching.ts");
  const coachingDashboard = readSource("src/app/(admin)/coaching/page.tsx");
  const higherEducationActions = readSource("src/lib/actions/higher_ed.ts");
  const internationalActions = readSource("src/lib/actions/international.ts");
  const internationalDashboard = readSource(
    "src/app/(admin)/international/page.tsx",
  );
  const passportMigration = readSource(
    "drizzle/0015_secure_phase4_passport_data.sql",
  );
  const passportBackfill = readSource(
    "scripts/backfill-encrypt-pii-identifiers.ts",
  );
  const passportRotation = readSource("scripts/rotate-pii-encryption.ts");

  it("derives coaching writes from the authenticated tenant", () => {
    expect(coachingWriteActions).toContain("requireRole");
    expect(coachingWriteActions).toContain("tenantId");
    expect(coachingWriteActions).not.toContain("uuidv4");
    expect(coachingWriteActions).not.toContain("Mocking tenant ID");
  });

  it("uses measured coaching and faculty metrics instead of placeholders", () => {
    expect(coachingReadActions).toContain("test_series_results");
    expect(coachingDashboard).not.toContain("liveDoubts: 14");
    expect(coachingDashboard).not.toContain("Model updated 2 hours ago");
    expect(higherEducationActions).toContain(
      "COUNT(*)::int FROM faculty_workload WHERE tenant_id = ${tenantId}",
    );
    expect(higherEducationActions).toContain(
      "SUM(assigned_hours), 0)::int FROM faculty_workload WHERE tenant_id = ${tenantId}",
    );
  });

  it("encrypts new passport identifiers and never writes their plaintext column", () => {
    expect(internationalActions).toContain("parsed.data.passportNumber");
    expect(internationalActions).toContain("student-visas.passport-number");
    expect(internationalActions).toContain("passport_number_enc");
    expect(internationalActions).not.toMatch(
      /INSERT INTO student_visas[\s\S]*?passport_number,/,
    );
    expect(passportMigration).toContain(
      'ADD COLUMN "passport_number_enc" text',
    );
    expect(passportMigration).toContain(
      'ALTER COLUMN "passport_number" DROP NOT NULL',
    );
    expect(passportBackfill).toContain('plain: "passport_number"');
    expect(passportBackfill).toContain('"student-visas.passport-number"');
    expect(passportRotation).toContain('"passport_number_enc"');
    expect(passportRotation).toContain('"student-visas.passport-number"');
  });

  it("masks passport identifiers and exposes tenant-safe operational forms", () => {
    expect(internationalActions).toContain("maskPassport");
    expect(internationalActions).toContain("AND s.tenant_id = ${tenantId}");
    expect(internationalActions).toContain("AND hf.tenant_id = ${tenantId}");
    expect(internationalDashboard).toContain("<InternationalForms");
    expect(internationalDashboard).toContain(
      "Only masked passport identifiers are shown.",
    );
  });
});

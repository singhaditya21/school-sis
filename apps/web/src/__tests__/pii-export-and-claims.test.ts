import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Two bounded PII fixes, guarded.
 *
 * 1. The bulk student CSV — gated only by students:read, which many staff hold,
 *    and writing no audit row — dumped every student's Aadhaar and APAAR national
 *    IDs. Those must not be in a general roster export.
 * 2. The schema once claimed student Aadhaar / email / phone were "encrypted at
 *    app level." They are not: the encryption helper is wired only to TOTP
 *    secrets. A false compliance claim is worse than an honest gap. The claim
 *    lived in the (now-deleted) pgTable schema; the guard below is generalised to
 *    the whole DB-definition tree so it cannot reappear in any source.
 *
 * PII encryption is now being applied through explicit encrypted columns and
 * tolerant read paths. These guards still prevent an inaccurate blanket schema
 * claim from replacing evidence about the individual protected fields.
 */
const root = resolve(process.cwd(), "..", "..");
const csv = readFileSync(
  resolve(root, "apps/web/src/app/api/csv/route.ts"),
  "utf8",
);

describe("PII export and honest claims", () => {
  it("keeps national IDs out of the bulk roster CSV", () => {
    expect(csv).not.toContain("aadhaar_number");
    expect(csv).not.toContain("apaar_id");
  });

  it("does not claim PII is encrypted at rest anywhere in the DB definitions", () => {
    // Built from parts so this test file is not its own match.
    const claim = ["encrypted", "at", "app", "level"].join(" ");
    const dbDir = resolve(root, "packages/api/src/db");
    const offenders = readdirSync(dbDir, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((e) => e.isFile() && /\.(ts|sql)$/.test(e.name))
      .map((e) => join(e.parentPath, e.name))
      .filter((f) => readFileSync(f, "utf8").includes(claim));
    expect(offenders).toEqual([]);
  });
});

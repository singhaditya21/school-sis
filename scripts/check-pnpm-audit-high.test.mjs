import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAuditReport } from "./check-pnpm-audit-high.mjs";

const URLS = [
  "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr",
  "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq",
];
const BEFORE_EXPIRATION = new Date("2026-09-15T12:00:00.000Z");

function allowlist() {
  return {
    exceptions: Object.fromEntries(
      URLS.map((url) => [
        url,
        {
          module: "image-size",
          severity: "high",
          pathPrefix: "apps/mobile >",
          expires: "2026-09-15",
          reason: "Scoped Metro build-time exposure.",
        },
      ]),
    ),
  };
}

function advisory(id, overrides = {}) {
  return {
    id,
    module_name: "image-size",
    title: "image-size advisory",
    severity: "high",
    url: URLS[id - 1] ?? "https://github.com/advisories/GHSA-other",
    findings: [
      {
        version: "1.2.1",
        paths: [
          "apps/mobile > react-native@0.85.3 > @react-native/community-cli-plugin@0.85.3 > metro@0.84.4 > image-size@1.2.1",
        ],
      },
    ],
    ...overrides,
  };
}

function report(advisories = [advisory(1), advisory(2)], metadata = {}) {
  return {
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: advisories.filter((item) => item.severity === "high").length,
        critical: advisories.filter((item) => item.severity === "critical")
          .length,
        ...metadata,
      },
    },
    advisories: Object.fromEntries(
      advisories.map((item) => [String(item.id), item]),
    ),
  };
}

test("allows exactly the two scoped image-size advisories through expiration day", () => {
  const result = evaluateAuditReport(report(), allowlist(), BEFORE_EXPIRATION);
  assert.equal(result.allowedAdvisories.length, 2);
  assert.deepEqual(result.blockingAdvisories, []);
});

test("blocks every other high or critical advisory", () => {
  const unknown = advisory(3, {
    severity: "critical",
    module_name: "other-package",
  });
  const result = evaluateAuditReport(
    report([unknown]),
    allowlist(),
    BEFORE_EXPIRATION,
  );
  assert.deepEqual(result.allowedAdvisories, []);
  assert.deepEqual(result.blockingAdvisories, [unknown]);
});

test("blocks an allowlisted GHSA if its severity is reclassified to critical", () => {
  const reclassified = advisory(1, { severity: "critical" });
  const result = evaluateAuditReport(
    report([reclassified]),
    allowlist(),
    BEFORE_EXPIRATION,
  );
  assert.deepEqual(result.allowedAdvisories, []);
  assert.deepEqual(result.blockingAdvisories, [reclassified]);
});

test("fails closed when required report fields are missing or malformed", () => {
  assert.throws(
    () => evaluateAuditReport({}, allowlist(), BEFORE_EXPIRATION),
    /metadata/,
  );
  assert.throws(
    () =>
      evaluateAuditReport(
        { ...report(), advisories: [] },
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /advisories must be a JSON object/,
  );
  const malformed = report();
  malformed.advisories["1"].severity = "HIGH";
  assert.throws(
    () => evaluateAuditReport(malformed, allowlist(), BEFORE_EXPIRATION),
    /invalid severity/,
  );
  const missingVersion = report();
  delete missingVersion.advisories["1"].findings[0].version;
  assert.throws(
    () => evaluateAuditReport(missingVersion, allowlist(), BEFORE_EXPIRATION),
    /missing version/,
  );
});

test("fails closed on metadata and advisory mismatches", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report([advisory(1)], { high: 0 }),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /metadata\/advisory mismatch/,
  );
  const mismatchedId = advisory(1, { id: 99 });
  const mismatchedReport = report([mismatchedId]);
  mismatchedReport.advisories = { 1: mismatchedId };
  assert.throws(
    () => evaluateAuditReport(mismatchedReport, allowlist(), BEFORE_EXPIRATION),
    /does not match its id/,
  );
});

test("fails closed on malformed allowlists and invalid dates", () => {
  assert.throws(
    () => evaluateAuditReport(report(), { exceptions: [] }, BEFORE_EXPIRATION),
    /exceptions must be a JSON object/,
  );
  const extraException = allowlist();
  extraException.exceptions["https://github.com/advisories/GHSA-other"] = {
    module: "other-package",
    pathPrefix: "apps/mobile >",
    expires: "2026-09-15",
    reason: "Should not be accepted.",
  };
  assert.throws(
    () => evaluateAuditReport(report(), extraException, BEFORE_EXPIRATION),
    /must contain exactly/,
  );
  const missingSeverity = allowlist();
  delete missingSeverity.exceptions[URLS[0]].severity;
  assert.throws(
    () => evaluateAuditReport(report(), missingSeverity, BEFORE_EXPIRATION),
    /must contain exactly/,
  );
  const malformedSeverity = allowlist();
  malformedSeverity.exceptions[URLS[0]].severity = "critical";
  assert.throws(
    () => evaluateAuditReport(report(), malformedSeverity, BEFORE_EXPIRATION),
    /unexpected severity/,
  );
  const invalidDate = allowlist();
  invalidDate.exceptions[URLS[0]].expires = "2026-02-30";
  assert.throws(
    () => evaluateAuditReport(report(), invalidDate, BEFORE_EXPIRATION),
    /unexpected expiration/,
  );
});

test("fails closed on empty findings or finding paths", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report([advisory(1, { findings: [] })]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /has no findings/,
  );
  assert.throws(
    () =>
      evaluateAuditReport(
        report([advisory(1, { findings: [{ version: "1.2.1", paths: [] }] })]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /has no paths/,
  );
});

test("rejects paths outside mobile and traversal-shaped path escapes", () => {
  for (const path of [
    "apps/web > image-size@1.2.1",
    "apps/mobile-ish > image-size@1.2.1",
    "apps/mobile > ../web > image-size@1.2.1",
    "apps/mobile > package/../../web > image-size@1.2.1",
  ]) {
    assert.throws(
      () =>
        evaluateAuditReport(
          report([
            advisory(1, {
              findings: [{ version: "1.2.1", paths: [path] }],
            }),
          ]),
          allowlist(),
          BEFORE_EXPIRATION,
        ),
      /scope|path escape/,
      path,
    );
  }
});

test("rejects a direct mobile dependency without the observed build-tool graph", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report([
          advisory(1, {
            findings: [
              {
                version: "1.2.1",
                paths: ["apps/mobile > image-size@1.2.1"],
              },
            ],
          }),
        ]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /build-tool graph/,
  );
});

test("rejects an unrelated mobile runtime chain", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report([
          advisory(1, {
            findings: [
              {
                version: "1.2.1",
                paths: [
                  "apps/mobile > react-native@0.85.3 > runtime-loader@1.0.0 > image-size@1.2.1",
                ],
              },
            ],
          }),
        ]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /build-tool graph/,
  );
});

test("rejects changed vulnerable finding and terminal package versions", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report([
          advisory(1, {
            findings: [
              {
                version: "1.2.2",
                paths: [
                  "apps/mobile > react-native@0.85.3 > @react-native/community-cli-plugin@0.85.3 > metro@0.84.4 > image-size@1.2.2",
                ],
              },
            ],
          }),
        ]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /unapproved vulnerable version/,
  );
  assert.throws(
    () =>
      evaluateAuditReport(
        report([
          advisory(1, {
            findings: [
              {
                version: "1.2.1",
                paths: [
                  "apps/mobile > react-native@0.85.3 > @react-native/community-cli-plugin@0.85.3 > metro@0.84.4 > image-size@1.2.2",
                ],
              },
            ],
          }),
        ]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /must terminate in image-size@1\.2\.1/,
  );
});

test("rejects a nonterminal image-size package", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report([
          advisory(1, {
            findings: [
              {
                version: "1.2.1",
                paths: [
                  "apps/mobile > react-native@0.85.3 > @react-native/community-cli-plugin@0.85.3 > metro@0.84.4 > image-size@1.2.1 > runtime-loader@1.0.0",
                ],
              },
            ],
          }),
        ]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /must terminate/,
  );
});

test("rejects duplicate high/critical advisory identities", () => {
  assert.throws(
    () =>
      evaluateAuditReport(
        report([advisory(1), advisory(2, { url: URLS[0] })]),
        allowlist(),
        BEFORE_EXPIRATION,
      ),
    /duplicate high\/critical advisories/,
  );
});

test("blocks an allowed advisory immediately after its UTC expiration day", () => {
  const result = evaluateAuditReport(
    report([advisory(1)]),
    allowlist(),
    new Date("2026-09-16T00:00:00.000Z"),
  );
  assert.deepEqual(result.allowedAdvisories, []);
  assert.equal(result.blockingAdvisories.length, 1);
});

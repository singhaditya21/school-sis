import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateRequiredChecks,
  evaluateRequiredWorkflows,
  parseArgs,
  parseNameList,
} from "./wait-for-required-checks.mjs";

test("parseNameList accepts JSON and comma-separated exact names", () => {
  assert.deepEqual(parseNameList('["validate","Playwright Smoke"]', "checks"), [
    "validate",
    "Playwright Smoke",
  ]);
  assert.deepEqual(parseNameList("CI/CD Pipeline,E2E Tests", "workflows"), [
    "CI/CD Pipeline",
    "E2E Tests",
  ]);
  assert.throws(
    () => parseNameList('["validate","validate"]', "checks"),
    /duplicate/i,
  );
});

test("parseArgs requires a full SHA and keeps the token out of CLI options", () => {
  const options = parseArgs([], {
    GITHUB_REPOSITORY: "singhaditya21/school-sis",
    GITHUB_TOKEN: "not-printed",
    TARGET_SHA: "a".repeat(40),
    REQUIRED_CHECKS: '["validate"]',
    REQUIRED_WORKFLOWS: '["CI/CD Pipeline"]',
    EXPECTED_TRIGGER_WORKFLOW_RUN_ID: "1234",
  });
  assert.equal(options.sha, "a".repeat(40));
  assert.equal(options.token, "not-printed");
  assert.throws(
    () => parseArgs(["--token", "secret"], {}),
    /Unknown option --token/,
  );
});

test("required checks use the newest run for each exact name", () => {
  const result = evaluateRequiredChecks(
    [
      {
        name: "validate",
        status: "completed",
        conclusion: "success",
        started_at: "2026-01-01T00:00:00Z",
      },
      {
        name: "validate",
        status: "completed",
        conclusion: "failure",
        started_at: "2026-01-01T00:01:00Z",
      },
    ],
    ["validate", "Playwright Smoke"],
  );
  assert.deepEqual(result.failed, ["validate (failure)"]);
  assert.deepEqual(result.waiting, ["Playwright Smoke (missing)"]);
  assert.equal(result.ok, false);
});

test("required workflows must be completed successfully", () => {
  const result = evaluateRequiredWorkflows(
    [
      {
        name: "CI/CD Pipeline",
        status: "completed",
        conclusion: "success",
        run_started_at: "2026-01-01T00:00:00Z",
      },
      {
        name: "E2E Tests",
        status: "in_progress",
        conclusion: null,
        run_started_at: "2026-01-01T00:00:00Z",
      },
    ],
    ["CI/CD Pipeline", "E2E Tests"],
  );
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.waiting, ["E2E Tests (in_progress)"]);
  assert.equal(result.ok, false);
});

test("a skipped check does not outrank a real result that ran earlier", () => {
  // Reproduces release 33060293340: commit 25bc25da had "Migration Chain"
  // success from the push-event run at 09:45:56Z, then skipped from the
  // scheduled run at 12:04:42Z. Newest-by-name picked the skip and failed.
  const result = evaluateRequiredChecks(
    [
      {
        name: "Migration Chain",
        status: "completed",
        conclusion: "success",
        completed_at: "2026-08-27T09:45:56Z",
      },
      {
        name: "Migration Chain",
        status: "completed",
        conclusion: "skipped",
        completed_at: "2026-08-27T12:04:42Z",
      },
    ],
    ["Migration Chain"],
  );
  assert.deepEqual(result, { ok: true, waiting: [], failed: [] });
});

test("a check that has only ever been skipped is still reported", () => {
  const result = evaluateRequiredChecks(
    [
      {
        name: "Migration Chain",
        status: "completed",
        conclusion: "skipped",
        completed_at: "2026-08-27T12:04:42Z",
      },
    ],
    ["Migration Chain"],
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed, ["Migration Chain (skipped)"]);
});

test("a genuine failure is still a failure even with an older success", () => {
  const result = evaluateRequiredChecks(
    [
      {
        name: "validate",
        status: "completed",
        conclusion: "success",
        completed_at: "2026-08-27T09:00:00Z",
      },
      {
        name: "validate",
        status: "completed",
        conclusion: "failure",
        completed_at: "2026-08-27T12:00:00Z",
      },
    ],
    ["validate"],
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed, ["validate (failure)"]);
});

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

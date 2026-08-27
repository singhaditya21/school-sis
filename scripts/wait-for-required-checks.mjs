#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

const GITHUB_API_VERSION = "2022-11-28";
const TERMINAL_FAILURE_CONCLUSIONS = new Set([
  "action_required",
  "cancelled",
  "failure",
  "neutral",
  "skipped",
  "stale",
  "startup_failure",
  "timed_out",
]);

function usage() {
  return `Usage: node scripts/wait-for-required-checks.mjs [options]

Required (flag or matching environment variable):
  --repository OWNER/REPO       GITHUB_REPOSITORY
  --sha 40_HEX_SHA              TARGET_SHA
  --checks JSON_OR_CSV          REQUIRED_CHECKS
  --workflows JSON_OR_CSV       REQUIRED_WORKFLOWS
  --trigger-run-id ID           EXPECTED_TRIGGER_WORKFLOW_RUN_ID

Options:
  --ref BRANCH                  EXPECTED_HEAD_BRANCH (default: main)
  --trigger-workflow NAME       EXPECTED_TRIGGER_WORKFLOW (default: E2E Tests)
  --trigger-event EVENT         EXPECTED_TRIGGER_EVENT (default: push)
  --timeout-seconds N           CHECK_WAIT_TIMEOUT_SECONDS (default: 1200)
  --poll-seconds N              CHECK_WAIT_POLL_SECONDS (default: 15)

Authentication is read only and must be supplied through GITHUB_TOKEN. Secret
values are never accepted as command-line arguments or printed.`;
}

function positiveInteger(value, label, defaultValue) {
  const raw = value ?? defaultValue;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function parseNameList(value, label) {
  if (!value || !value.trim()) {
    throw new Error(`${label} must contain at least one exact name.`);
  }

  let names;
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      names = JSON.parse(trimmed);
    } catch {
      throw new Error(
        `${label} must be a JSON string array or comma-separated names.`,
      );
    }
    if (!Array.isArray(names)) {
      throw new Error(`${label} JSON must be an array.`);
    }
  } else {
    names = trimmed.split(",");
  }

  const normalized = names.map((name) => String(name).trim()).filter(Boolean);
  if (normalized.length === 0 || normalized.some((name) => name.length > 200)) {
    throw new Error(`${label} contains an empty or invalid name.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} contains duplicate names.`);
  }
  return normalized;
}

export function parseArgs(argv, env = process.env) {
  const values = new Map();
  const allowedOptions = new Set([
    "repository",
    "sha",
    "checks",
    "workflows",
    "trigger-run-id",
    "ref",
    "trigger-workflow",
    "trigger-event",
    "timeout-seconds",
    "poll-seconds",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (!argument.startsWith("--"))
      throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    if (!allowedOptions.has(name)) throw new Error(`Unknown option --${name}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new Error(`Missing value for --${name}.`);
    if (values.has(name)) throw new Error(`Duplicate option --${name}.`);
    values.set(name, value);
    index += 1;
  }

  const repository = values.get("repository") ?? env.GITHUB_REPOSITORY;
  const sha = (values.get("sha") ?? env.TARGET_SHA ?? "").toLowerCase();
  const ref = values.get("ref") ?? env.EXPECTED_HEAD_BRANCH ?? "main";
  const token = env.GITHUB_TOKEN;
  const triggerRunId =
    values.get("trigger-run-id") ?? env.EXPECTED_TRIGGER_WORKFLOW_RUN_ID;
  const triggerWorkflow =
    values.get("trigger-workflow") ??
    env.EXPECTED_TRIGGER_WORKFLOW ??
    "E2E Tests";
  const triggerEvent =
    values.get("trigger-event") ?? env.EXPECTED_TRIGGER_EVENT ?? "push";

  if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("repository must use the OWNER/REPO form.");
  }
  if (!/^[0-9a-f]{40}$/.test(sha))
    throw new Error("sha must be a full 40-character Git commit SHA.");
  if (!ref || !/^[A-Za-z0-9._/-]+$/.test(ref) || ref.includes("..")) {
    throw new Error("ref contains unsupported characters.");
  }
  if (!token) throw new Error("GITHUB_TOKEN is required.");
  if (!triggerRunId || !/^\d+$/.test(String(triggerRunId))) {
    throw new Error("trigger-run-id must be a GitHub Actions workflow run ID.");
  }

  return {
    help: false,
    repository,
    sha,
    ref,
    token,
    triggerRunId: String(triggerRunId),
    triggerWorkflow,
    triggerEvent,
    requiredChecks: parseNameList(
      values.get("checks") ?? env.REQUIRED_CHECKS ?? "",
      "checks",
    ),
    requiredWorkflows: parseNameList(
      values.get("workflows") ?? env.REQUIRED_WORKFLOWS ?? "",
      "workflows",
    ),
    timeoutSeconds: positiveInteger(
      values.get("timeout-seconds") ?? env.CHECK_WAIT_TIMEOUT_SECONDS,
      "timeout-seconds",
      1200,
    ),
    pollSeconds: positiveInteger(
      values.get("poll-seconds") ?? env.CHECK_WAIT_POLL_SECONDS,
      "poll-seconds",
      15,
    ),
  };
}

function timestampOf(item, fields) {
  for (const field of fields) {
    const timestamp = Date.parse(item[field] ?? "");
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

export function latestByName(items, fields) {
  const latest = new Map();
  for (const item of items) {
    if (!item?.name) continue;
    const current = latest.get(item.name);
    if (!current || timestampOf(item, fields) > timestampOf(current, fields)) {
      latest.set(item.name, item);
    }
  }
  return latest;
}

/**
 * A check run that was skipped carries no signal about the commit: the job
 * decided not to run. GitHub still publishes it under the same name, so it can
 * outrank a real result purely by being newer.
 *
 * That is not hypothetical. E2E's `migrate-check` job is `if: github.event_name
 * != 'schedule'`, so the nightly run publishes "Migration Chain (skipped)".
 * Release 33060293340 was gated on commit 25bc25da, whose push-event run had
 * reported success at 09:45:56Z — but a scheduled run skipped it at 12:04:42Z,
 * and the gate rejected the release. The release could only ever pass in the
 * window between a push and the next scheduled run.
 *
 * Prefer the newest result that ACTUALLY RAN. A name that has only ever been
 * skipped still surfaces as skipped, so a genuinely absent check is not masked.
 */
function preferExecuted(checkRuns) {
  const executed = checkRuns.filter(
    (check) => check?.status !== "completed" || check?.conclusion !== "skipped",
  );
  const namesWithExecution = new Set(executed.map((check) => check?.name));
  return checkRuns.filter(
    (check) => !namesWithExecution.has(check?.name) || executed.includes(check),
  );
}

export function evaluateRequiredChecks(checkRuns, requiredNames) {
  const latest = latestByName(preferExecuted(checkRuns), [
    "started_at",
    "completed_at",
    "created_at",
  ]);
  const waiting = [];
  const failed = [];

  for (const name of requiredNames) {
    const check = latest.get(name);
    if (!check) {
      waiting.push(`${name} (missing)`);
      continue;
    }
    if (check.status !== "completed" || !check.conclusion) {
      waiting.push(`${name} (${check.status ?? "unknown"})`);
      continue;
    }
    if (check.conclusion !== "success") {
      failed.push(`${name} (${check.conclusion})`);
    }
  }

  return { ok: waiting.length === 0 && failed.length === 0, waiting, failed };
}

export function evaluateRequiredWorkflows(workflowRuns, requiredNames) {
  const latest = latestByName(workflowRuns, [
    "run_started_at",
    "created_at",
    "updated_at",
  ]);
  const waiting = [];
  const failed = [];

  for (const name of requiredNames) {
    const run = latest.get(name);
    if (!run) {
      waiting.push(`${name} (missing)`);
      continue;
    }
    if (run.status !== "completed" || !run.conclusion) {
      waiting.push(`${name} (${run.status ?? "unknown"})`);
      continue;
    }
    if (run.conclusion !== "success") {
      failed.push(`${name} (${run.conclusion})`);
    }
  }

  return { ok: waiting.length === 0 && failed.length === 0, waiting, failed };
}

function apiUrl(path) {
  return new URL(path, "https://api.github.com").toString();
}

async function githubJson(path, token, fetchImpl) {
  const response = await fetchImpl(apiUrl(path), {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "school-sis-release-gate",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
    },
  });
  if (!response.ok) {
    const requestId = response.headers.get("x-github-request-id");
    throw new Error(
      `GitHub API request failed with HTTP ${response.status}${requestId ? ` (request ${requestId})` : ""}.`,
    );
  }
  return response.json();
}

async function githubList(path, token, fetchImpl, selectItems) {
  const results = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await githubJson(
      `${path}${separator}per_page=100&page=${page}`,
      token,
      fetchImpl,
    );
    const items = selectItems(payload);
    if (!Array.isArray(items))
      throw new Error("GitHub API returned an unexpected list payload.");
    results.push(...items);
    if (items.length < 100) return results;
  }
  throw new Error(
    "GitHub API pagination exceeded the fail-closed 2,000-item limit.",
  );
}

function assertTriggerRun(run, options) {
  const problems = [];
  if (String(run.id) !== options.triggerRunId) problems.push("run ID mismatch");
  if (run.name !== options.triggerWorkflow)
    problems.push("workflow name mismatch");
  if (run.head_sha?.toLowerCase() !== options.sha)
    problems.push("head SHA mismatch");
  if (run.head_branch !== options.ref) problems.push("head branch mismatch");
  if (run.event !== options.triggerEvent) problems.push("event mismatch");
  if (run.status !== "completed")
    problems.push(`status is ${run.status ?? "unknown"}`);
  if (run.conclusion !== "success")
    problems.push(`conclusion is ${run.conclusion ?? "unknown"}`);
  if (problems.length > 0) {
    throw new Error(
      `Trigger workflow verification failed: ${problems.join(", ")}.`,
    );
  }
}

async function assertCurrentHead(options, fetchImpl) {
  const encodedRef = options.ref.split("/").map(encodeURIComponent).join("/");
  const payload = await githubJson(
    `/repos/${options.repository}/git/ref/heads/${encodedRef}`,
    options.token,
    fetchImpl,
  );
  const currentSha = payload?.object?.sha?.toLowerCase();
  if (currentSha !== options.sha) {
    throw new Error(
      `Ref ${options.ref} no longer points to the requested SHA; refusing a stale production release.`,
    );
  }
}

function terminalFailureMessage(checkState, workflowState) {
  const failures = [...checkState.failed, ...workflowState.failed];
  if (failures.length === 0) return null;
  const knownTerminal = failures.every((entry) => {
    const conclusion = entry.match(/\(([^)]+)\)$/)?.[1];
    return conclusion && TERMINAL_FAILURE_CONCLUSIONS.has(conclusion);
  });
  return knownTerminal
    ? `Required CI failed: ${failures.join(", ")}.`
    : `Required CI did not succeed: ${failures.join(", ")}.`;
}

export async function waitForRequiredChecks(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const sleep =
    dependencies.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = dependencies.now ?? Date.now;
  if (typeof fetchImpl !== "function")
    throw new Error("A fetch implementation is required.");

  const trigger = await githubJson(
    `/repos/${options.repository}/actions/runs/${options.triggerRunId}`,
    options.token,
    fetchImpl,
  );
  assertTriggerRun(trigger, options);
  await assertCurrentHead(options, fetchImpl);

  const deadline = now() + options.timeoutSeconds * 1000;
  let attempt = 0;
  while (now() <= deadline) {
    attempt += 1;
    await assertCurrentHead(options, fetchImpl);

    const [checkRuns, workflowRuns] = await Promise.all([
      githubList(
        `/repos/${options.repository}/commits/${options.sha}/check-runs?filter=latest`,
        options.token,
        fetchImpl,
        (payload) => payload.check_runs,
      ),
      githubList(
        `/repos/${options.repository}/actions/runs?head_sha=${options.sha}&exclude_pull_requests=true`,
        options.token,
        fetchImpl,
        (payload) => payload.workflow_runs,
      ),
    ]);

    const eligibleWorkflowRuns = workflowRuns.filter(
      (run) =>
        run.head_sha?.toLowerCase() === options.sha &&
        run.head_branch === options.ref &&
        run.event === options.triggerEvent,
    );
    const checkState = evaluateRequiredChecks(
      checkRuns,
      options.requiredChecks,
    );
    const workflowState = evaluateRequiredWorkflows(
      eligibleWorkflowRuns,
      options.requiredWorkflows,
    );
    const terminalFailure = terminalFailureMessage(checkState, workflowState);
    if (terminalFailure) throw new Error(terminalFailure);
    if (checkState.ok && workflowState.ok) {
      return { attempts: attempt, sha: options.sha };
    }

    const waiting = [...checkState.waiting, ...workflowState.waiting];
    if (now() + options.pollSeconds * 1000 > deadline) break;
    console.log(
      `Required CI is not complete (attempt ${attempt}): ${waiting.join(", ")}.`,
    );
    await sleep(options.pollSeconds * 1000);
  }

  throw new Error(
    `Timed out after ${options.timeoutSeconds}s waiting for required CI.`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await waitForRequiredChecks(options);
  console.log(
    `Verified ${options.requiredChecks.length} checks and ${options.requiredWorkflows.length} workflows for ${result.sha.slice(0, 12)}.`,
  );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `verified_sha=${result.sha}\n`,
      { encoding: "utf8" },
    );
  }
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(
      `Release gate failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  });
}

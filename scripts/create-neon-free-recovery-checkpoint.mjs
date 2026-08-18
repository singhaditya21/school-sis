#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

const API_ORIGIN = "https://console.neon.tech";
const FREE_BRANCH_LIMIT = 10;
const MAX_RESPONSE_BYTES = 1_000_000;
const WORKFLOW_BRANCH_PATTERN =
  /^recovery\/pre-migrate-[0-9a-f]{12}-[1-9][0-9]*$/;

function usage() {
  return `Usage: node scripts/create-neon-free-recovery-checkpoint.mjs [options]

Required:
  --project-id ID              Exact Neon production project ID
  --production-branch-id ID    Exact unprotected Free default root branch ID
  --sha SHA                    Full Git commit SHA
  --run-id ID                  Positive GitHub Actions run ID
  --expires-at TIMESTAMP       Canonical UTC checkpoint expiration

Options:
  --attempts N                 Safe GET reconciliation attempts (default: 20)
  --delay-ms N                 Delay between safe GET attempts (default: 1000)
  --request-timeout-ms N       API timeout (default: 20000)

NEON_API_KEY is required through the environment. It is never accepted on the
command line or printed. The script creates one no-endpoint recovery branch,
proves its exact identity, and only then removes older workflow-owned recovery
branches in the reserved recovery/pre-migrate-<sha>-<run> namespace. It never
deletes branches outside that namespace.`;
}

function positiveInteger(value, label, defaultValue) {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function canonicalTimestamp(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value ?? "")) {
    throw new Error(`${label} must be a canonical UTC timestamp.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} must be a canonical UTC timestamp.`);
  }
  return new Date(timestamp).toISOString().replace(".000Z", "Z");
}

export function parseArgs(argv, env = process.env) {
  const allowed = new Set([
    "project-id",
    "production-branch-id",
    "sha",
    "run-id",
    "expires-at",
    "attempts",
    "delay-ms",
    "request-timeout-ms",
  ]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const name = argument.slice(2);
    if (!allowed.has(name)) throw new Error(`Unknown option --${name}.`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}.`);
    }
    if (values.has(name)) throw new Error(`Duplicate option --${name}.`);
    values.set(name, value);
    index += 1;
  }

  const projectId = values.get("project-id") ?? "";
  const productionBranchId = values.get("production-branch-id") ?? "";
  const sha = (values.get("sha") ?? "").toLowerCase();
  const runId = values.get("run-id") ?? "";
  const token = env.NEON_API_KEY ?? "";

  if (!/^[a-z][a-z0-9-]{2,59}$/.test(projectId)) {
    throw new Error("project-id must be a canonical Neon project ID.");
  }
  if (!/^br-[a-z0-9-]{3,57}$/.test(productionBranchId)) {
    throw new Error("production-branch-id must be a canonical Neon branch ID.");
  }
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new Error("sha must be a full 40-character Git commit SHA.");
  }
  if (!/^[1-9][0-9]*$/.test(runId)) {
    throw new Error("run-id must be a positive integer.");
  }
  if (token.length < 16) {
    throw new Error("NEON_API_KEY is required through the environment.");
  }

  return {
    help: false,
    projectId,
    productionBranchId,
    sha,
    runId,
    checkpointName: `recovery/pre-migrate-${sha.slice(0, 12)}-${runId}`,
    expiresAt: canonicalTimestamp(values.get("expires-at"), "expires-at"),
    token,
    attempts: positiveInteger(values.get("attempts"), "attempts", 20),
    delayMs: positiveInteger(values.get("delay-ms"), "delay-ms", 1_000),
    requestTimeoutMs: positiveInteger(
      values.get("request-timeout-ms"),
      "request-timeout-ms",
      20_000,
    ),
  };
}

function apiUrl(options, path) {
  return new URL(`/api/v2/projects/${options.projectId}${path}`, API_ORIGIN)
    .href;
}

function headers(options, withBody = false) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${options.token}`,
    ...(withBody ? { "Content-Type": "application/json" } : {}),
  };
}

async function boundedBody(response, label) {
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} exceeded the response-size limit.`);
  }
  return body;
}

async function readJson(response, label) {
  const body = await boundedBody(response, label);
  if (
    !(response.headers.get("content-type") ?? "").includes("application/json")
  ) {
    throw new Error(`${label} did not return JSON.`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
}

async function requestJson(options, path, label, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(apiUrl(options, path), {
      headers: headers(options),
      redirect: "error",
      signal: AbortSignal.timeout(options.requestTimeoutMs),
    });
  } catch {
    throw new Error(`${label} could not connect.`);
  }
  if (response.status !== 200) {
    await boundedBody(response, label);
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }
  return readJson(response, label);
}

async function requestBranchOrMissing(options, branchId, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(
      apiUrl(options, `/branches/${encodeURIComponent(branchId)}`),
      {
        headers: headers(options),
        redirect: "error",
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      },
    );
  } catch {
    throw new Error("Neon branch verification could not connect.");
  }
  if (response.status === 404) {
    await boundedBody(response, "Neon branch verification");
    return null;
  }
  if (response.status !== 200) {
    await boundedBody(response, "Neon branch verification");
    throw new Error(
      `Neon branch verification returned HTTP ${response.status}.`,
    );
  }
  const payload = await readJson(response, "Neon branch verification");
  if (
    !payload?.branch ||
    typeof payload.branch !== "object" ||
    Array.isArray(payload.branch)
  ) {
    throw new Error(
      "Neon branch verification returned a malformed branch object.",
    );
  }
  return payload.branch;
}

function assertProductionRoot(branch, options) {
  if (
    !branch ||
    branch.id !== options.productionBranchId ||
    branch.project_id !== options.projectId ||
    branch.parent_id != null ||
    branch.default !== true ||
    branch.protected !== false ||
    branch.current_state !== "ready" ||
    branch.pending_state != null
  ) {
    throw new Error(
      "Neon did not confirm the exact unprotected Free default root production branch.",
    );
  }
}

function assertWorkflowBranchIdentity(branch, options, expected) {
  if (
    !branch ||
    branch.id !== expected.id ||
    branch.project_id !== options.projectId ||
    branch.name !== expected.name ||
    branch.parent_id !== options.productionBranchId ||
    branch.default !== false ||
    branch.protected !== false
  ) {
    throw new Error(
      `Recovery branch ${expected.name} does not have the exact workflow-owned identity.`,
    );
  }
}

function assertWorkflowBranchReady(branch, expected) {
  if (branch.current_state !== "ready" || branch.pending_state != null) {
    throw new Error(`Recovery branch ${expected.name} is not ready yet.`);
  }
}

function assertNewCheckpointIdentity(branch, options) {
  if (!branch || !/^br-[a-z0-9-]{3,57}$/.test(branch.id ?? "")) {
    throw new Error("Neon recovery checkpoint has an invalid branch ID.");
  }
  assertWorkflowBranchIdentity(branch, options, {
    id: branch.id,
    name: options.checkpointName,
  });
  assertWorkflowBranchReady(branch, {
    id: branch.id,
    name: options.checkpointName,
  });
  const expiresAt = Date.parse(branch.expires_at ?? "");
  if (
    !Number.isFinite(expiresAt) ||
    expiresAt !== Date.parse(options.expiresAt)
  ) {
    throw new Error(
      "Neon recovery checkpoint does not have the exact requested expiration.",
    );
  }
}

async function assertNoEndpoints(options, branchId, fetchImpl) {
  const payload = await requestJson(
    options,
    `/branches/${encodeURIComponent(branchId)}/endpoints`,
    "Neon recovery branch endpoint verification",
    fetchImpl,
  );
  if (!Array.isArray(payload?.endpoints) || payload.endpoints.length !== 0) {
    throw new Error("Neon recovery branch must not have a compute endpoint.");
  }
}

async function listBranches(options, fetchImpl) {
  const payload = await requestJson(
    options,
    "/branches?limit=100",
    "Neon branch inventory",
    fetchImpl,
  );
  if (!Array.isArray(payload?.branches)) {
    throw new Error("Neon branch inventory returned an invalid branch list.");
  }
  if (payload.branches.length > FREE_BRANCH_LIMIT) {
    throw new Error(
      `Neon branch inventory exceeds the Free-plan limit of ${FREE_BRANCH_LIMIT}.`,
    );
  }
  const roots = payload.branches.filter(
    (branch) => branch?.id === options.productionBranchId,
  );
  if (roots.length !== 1) {
    throw new Error(
      "Neon branch inventory does not contain exactly one configured production root.",
    );
  }
  assertProductionRoot(roots[0], options);
  return payload.branches;
}

function exactNameMatch(branches, name) {
  const matches = branches.filter((branch) => branch?.name === name);
  if (matches.length > 1) {
    throw new Error(`Neon returned duplicate branches named ${name}.`);
  }
  return matches[0] ?? null;
}

function workflowOwnedCandidates(branches, options) {
  const candidates = [];
  for (const branch of branches) {
    if (!WORKFLOW_BRANCH_PATTERN.test(branch?.name ?? "")) continue;
    if (!/^br-[a-z0-9-]{3,57}$/.test(branch?.id ?? "")) {
      throw new Error(
        `Workflow-looking recovery branch ${branch?.name ?? "<unnamed>"} has an invalid ID.`,
      );
    }
    assertWorkflowBranchIdentity(branch, options, {
      id: branch.id,
      name: branch.name,
    });
    assertWorkflowBranchReady(branch, { id: branch.id, name: branch.name });
    candidates.push({ id: branch.id, name: branch.name });
  }
  return candidates;
}

async function inspectExactCheckpoint(options, branchSummary, fetchImpl) {
  if (!branchSummary) return null;
  if (!/^br-[a-z0-9-]{3,57}$/.test(branchSummary.id ?? "")) {
    throw new Error("Neon recovery checkpoint has an invalid branch ID.");
  }
  const branch = await requestBranchOrMissing(
    options,
    branchSummary.id,
    fetchImpl,
  );
  if (!branch) return null;
  assertNewCheckpointIdentity(branch, options);
  await assertNoEndpoints(options, branch.id, fetchImpl);
  return branch;
}

async function reconcileCheckpoint(options, fetchImpl, sleep, mutationStatus) {
  let lastFailure = "checkpoint branch was not found";
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const branches = await listBranches(options, fetchImpl);
      const summary = exactNameMatch(branches, options.checkpointName);
      const branch = await inspectExactCheckpoint(options, summary, fetchImpl);
      if (branch) return branch;
      lastFailure = "checkpoint branch was not found";
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "safe GET failed";
      if (
        /duplicate branches|invalid branch ID|exact workflow-owned identity|exact requested expiration|must not have a compute endpoint|unprotected Free default root/.test(
          lastFailure,
        )
      ) {
        throw error;
      }
    }
    if (attempt < options.attempts) await sleep(options.delayMs);
  }
  throw new Error(
    `Neon recovery checkpoint was not proven after ${mutationStatus}: ${lastFailure}`,
  );
}

async function createCheckpoint(options, fetchImpl, sleep) {
  let mutationStatus = "transport-error";
  try {
    const response = await fetchImpl(apiUrl(options, "/branches"), {
      method: "POST",
      headers: headers(options, true),
      body: JSON.stringify({
        branch: {
          name: options.checkpointName,
          parent_id: options.productionBranchId,
          expires_at: options.expiresAt,
        },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(options.requestTimeoutMs),
    });
    mutationStatus = `HTTP ${response.status}`;
    await boundedBody(response, "Neon recovery checkpoint creation");
  } catch {
    // POST is never retried. Exact-name GET reconciliation settles whether it
    // committed without risking a duplicate recovery branch.
  }
  return reconcileCheckpoint(options, fetchImpl, sleep, mutationStatus);
}

async function deleteAndReconcile(options, expected, fetchImpl, sleep) {
  const current = await requestBranchOrMissing(options, expected.id, fetchImpl);
  if (!current) return;
  assertWorkflowBranchIdentity(current, options, expected);
  assertWorkflowBranchReady(current, expected);
  await assertNoEndpoints(options, expected.id, fetchImpl);

  let mutationStatus = "transport-error";
  try {
    const response = await fetchImpl(
      apiUrl(options, `/branches/${encodeURIComponent(expected.id)}`),
      {
        method: "DELETE",
        headers: headers(options),
        redirect: "error",
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      },
    );
    mutationStatus = `HTTP ${response.status}`;
    await boundedBody(response, "Neon recovery branch deletion");
  } catch {
    // DELETE is never retried. A missing exact ID is the only accepted proof.
  }

  let lastFailure = "branch still exists";
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const branch = await requestBranchOrMissing(
        options,
        expected.id,
        fetchImpl,
      );
      if (!branch) return;
      assertWorkflowBranchIdentity(branch, options, expected);
      assertWorkflowBranchReady(branch, expected);
      await assertNoEndpoints(options, expected.id, fetchImpl);
      lastFailure = "exact workflow-owned branch still exists";
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "safe GET failed";
      if (
        /exact workflow-owned identity|must not have a compute endpoint/.test(
          message,
        )
      ) {
        throw error;
      }
      lastFailure = message;
    }
    if (attempt < options.attempts) await sleep(options.delayMs);
  }
  throw new Error(
    `Neon recovery branch deletion was not proven after ${mutationStatus}: ${lastFailure}`,
  );
}

export async function createNeonFreeRecoveryCheckpoint(
  options,
  {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const root = await requestBranchOrMissing(
    options,
    options.productionBranchId,
    fetchImpl,
  );
  assertProductionRoot(root, options);

  const before = await listBranches(options, fetchImpl);
  const ownedBefore = workflowOwnedCandidates(before, options);
  const existing = exactNameMatch(before, options.checkpointName);
  if (!existing && before.length >= FREE_BRANCH_LIMIT) {
    throw new Error(
      `Neon Free branch capacity is exhausted (${before.length}/${FREE_BRANCH_LIMIT}); no provider mutation was attempted.`,
    );
  }

  const checkpoint = existing
    ? await reconcileCheckpoint(
        options,
        fetchImpl,
        sleep,
        "existing exact-name checkpoint",
      )
    : await createCheckpoint(options, fetchImpl, sleep);

  // The new checkpoint is fully proven before any deletion. Only branches
  // whose deterministic workflow identity was validated above are candidates.
  for (const old of ownedBefore) {
    if (old.id === checkpoint.id) continue;
    await deleteAndReconcile(options, old, fetchImpl, sleep);
  }

  // Re-prove the retained checkpoint after cleanup so its artifact can be used
  // as exact recovery evidence by a later manual operation.
  const retained = await requestBranchOrMissing(
    options,
    checkpoint.id,
    fetchImpl,
  );
  if (!retained) {
    throw new Error(
      "The new Neon recovery checkpoint disappeared after cleanup.",
    );
  }
  assertNewCheckpointIdentity(retained, options);
  await assertNoEndpoints(options, retained.id, fetchImpl);

  return {
    checkpointId: retained.id,
    checkpointName: retained.name,
    sourceBranchId: options.productionBranchId,
    expiresAt: new Date(Date.parse(retained.expires_at))
      .toISOString()
      .replace(".000Z", "Z"),
    endpointCount: 0,
  };
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await createNeonFreeRecoveryCheckpoint(options);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(
      `[neon-free-recovery:error] ${error instanceof Error ? error.message : "Unknown failure."}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

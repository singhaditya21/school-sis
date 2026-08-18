#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

const MAX_RESPONSE_BYTES = 65_536;

function usage() {
  return `Usage: node scripts/assign-vercel-preview-alias.mjs [options]

Required:
  --deployment-id ID       Vercel deployment ID (dpl_...)
  --deployment-url URL     Exact generated HTTPS deployment origin
  --alias HOST             Deterministic preview alias hostname
  --project-id ID          Exact Vercel preview project ID (prj_...)
  --team-id ID             Exact Vercel team ID (team_...)
  --sha SHA                Full Git commit SHA
  --pr-number NUMBER       Pull-request number

Options:
  --attempts N             Verification attempts (default: 12)
  --delay-ms N             Delay between verification attempts (default: 1000)
  --request-timeout-ms N   API timeout (default: 15000)

VERCEL_TOKEN is required through the environment and is never accepted on the
command line or printed.`;
}

function positiveInteger(value, label, defaultValue) {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("deployment-url must be an absolute URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("deployment-url must be a credential-free HTTPS origin.");
  }
  if (!url.hostname.endsWith(".vercel.app")) {
    throw new Error("deployment-url must use a generated Vercel hostname.");
  }
  return url.origin;
}

export function parseArgs(argv, env = process.env) {
  const allowed = new Set([
    "deployment-id",
    "deployment-url",
    "alias",
    "project-id",
    "team-id",
    "sha",
    "pr-number",
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

  const deploymentId = values.get("deployment-id") ?? "";
  const projectId = values.get("project-id") ?? "";
  const teamId = values.get("team-id") ?? "";
  const alias = (values.get("alias") ?? "").toLowerCase();
  const expectedSha = (values.get("sha") ?? "").toLowerCase();
  const prNumber = values.get("pr-number") ?? "";
  const token = env.VERCEL_TOKEN ?? "";

  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) {
    throw new Error("deployment-id must be a canonical Vercel deployment ID.");
  }
  if (!/^prj_[A-Za-z0-9]+$/.test(projectId)) {
    throw new Error("project-id must be a canonical Vercel project ID.");
  }
  if (!/^team_[A-Za-z0-9]+$/.test(teamId)) {
    throw new Error("team-id must be a canonical Vercel team ID.");
  }
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
      alias,
    ) ||
    !alias.endsWith(".vercel.app")
  ) {
    throw new Error("alias must be a canonical .vercel.app hostname.");
  }
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("sha must be a full 40-character Git commit SHA.");
  }
  if (!/^[1-9][0-9]*$/.test(prNumber)) {
    throw new Error("pr-number must be a positive integer.");
  }
  if (token.length < 16) {
    throw new Error("VERCEL_TOKEN is required through the environment.");
  }

  return {
    help: false,
    deploymentId,
    deploymentUrl: normalizeOrigin(values.get("deployment-url") ?? ""),
    alias,
    projectId,
    teamId,
    expectedSha,
    prNumber,
    token,
    attempts: positiveInteger(values.get("attempts"), "attempts", 12),
    delayMs: positiveInteger(values.get("delay-ms"), "delay-ms", 1000),
    requestTimeoutMs: positiveInteger(
      values.get("request-timeout-ms"),
      "request-timeout-ms",
      15_000,
    ),
  };
}

async function readJson(response, label) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${label} did not return JSON.`);
  }
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} exceeded 64 KiB.`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
}

export function validateDeployment(payload, expected) {
  const problems = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["deployment response is not an object"];
  }
  if ((payload.id ?? payload.uid) !== expected.deploymentId) {
    problems.push("deployment ID does not match");
  }
  if (payload.projectId !== expected.projectId) {
    problems.push("deployment project does not match");
  }
  if (payload.target === "production") {
    problems.push("deployment unexpectedly targets production");
  }
  if ((payload.readyState ?? payload.state) !== "READY") {
    problems.push("deployment is not READY");
  }
  let actualOrigin = "";
  try {
    actualOrigin = normalizeOrigin(
      String(payload.url ?? "").startsWith("https://")
        ? payload.url
        : `https://${payload.url ?? ""}`,
    );
  } catch {
    problems.push("deployment URL is invalid");
  }
  if (actualOrigin && actualOrigin !== expected.deploymentUrl) {
    problems.push("deployment URL does not match");
  }
  if (payload.meta?.githubCommitSha !== expected.expectedSha) {
    problems.push("deployment commit metadata does not match");
  }
  if (String(payload.meta?.githubPrId ?? "") !== expected.prNumber) {
    problems.push("deployment pull-request metadata does not match");
  }
  if (payload.meta?.schoolSisPreview !== "1") {
    problems.push("deployment preview marker is missing");
  }
  return problems;
}

export function validateAlias(payload, expected) {
  const problems = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["alias response is not an object"];
  }
  if (String(payload.alias ?? "").toLowerCase() !== expected.alias) {
    problems.push("alias hostname does not match");
  }
  if (payload.deploymentId !== expected.deploymentId) {
    problems.push("alias deployment does not match");
  }
  if (payload.projectId !== expected.projectId) {
    problems.push("alias project does not match");
  }
  return problems;
}

function apiUrl(pathname, teamId) {
  const url = new URL(pathname, "https://api.vercel.com");
  url.searchParams.set("teamId", teamId);
  return url.href;
}

async function inspectDeployment(options, fetchImpl) {
  const response = await fetchImpl(
    apiUrl(`/v13/deployments/${options.deploymentId}`, options.teamId),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.token}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(options.requestTimeoutMs),
    },
  );
  if (response.status !== 200) {
    throw new Error(
      `Vercel deployment inspection returned HTTP ${response.status}.`,
    );
  }
  return readJson(response, "Vercel deployment inspection");
}

async function inspectAlias(options, fetchImpl) {
  const response = await fetchImpl(
    apiUrl(`/v4/aliases/${encodeURIComponent(options.alias)}`, options.teamId),
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${options.token}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(options.requestTimeoutMs),
    },
  );
  if (response.status !== 200) {
    throw new Error(
      `Vercel alias inspection returned HTTP ${response.status}.`,
    );
  }
  return readJson(response, "Vercel alias inspection");
}

export async function assignPreviewAlias(
  options,
  {
    fetchImpl = fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  const before = await inspectDeployment(options, fetchImpl);
  const preflightProblems = validateDeployment(before, options);
  if (preflightProblems.length > 0) {
    throw new Error(
      `Refusing to alias an unverified deployment: ${preflightProblems.join("; ")}.`,
    );
  }

  let assignmentStatus = "transport-error";
  try {
    const response = await fetchImpl(
      apiUrl(`/v2/deployments/${options.deploymentId}/aliases`, options.teamId),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alias: options.alias }),
        redirect: "error",
        signal: AbortSignal.timeout(options.requestTimeoutMs),
      },
    );
    assignmentStatus = `HTTP ${response.status}`;
  } catch {
    // POST is not retried. A follow-up GET determines whether it committed.
  }

  let lastProblems = ["alias record does not match"];
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      const alias = await inspectAlias(options, fetchImpl);
      lastProblems = validateAlias(alias, options);
      if (lastProblems.length === 0) {
        return {
          alias: options.alias,
          deploymentId: options.deploymentId,
        };
      }
    } catch {
      lastProblems = ["deployment verification request failed safely"];
    }
    if (attempt < options.attempts) await sleep(options.delayMs);
  }
  throw new Error(
    `Vercel alias assignment was not proven after ${assignmentStatus}: ${lastProblems.join("; ")}.`,
  );
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await assignPreviewAlias(options);
    console.log(
      `Verified ${result.alias} on isolated preview deployment ${result.deploymentId}.`,
    );
  } catch (error) {
    console.error(
      `[vercel-alias:error] ${error instanceof Error ? error.message : "Unknown failure."}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}

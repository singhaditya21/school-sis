#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";

function usage() {
  return `Usage: node scripts/verify-deployment.mjs [options]

Required (flag or matching environment variable):
  --base-url URL               DEPLOYMENT_URL
  --sha 40_HEX_SHA             EXPECTED_GIT_SHA

Options:
  --attempts N                 VERIFY_ATTEMPTS (default: 12)
  --delay-ms N                 VERIFY_DELAY_MS (default: 5000)
  --request-timeout-ms N       VERIFY_REQUEST_TIMEOUT_MS (default: 15000)
  --require-bypass true|false  REQUIRE_VERCEL_BYPASS (default: false)
  --region REGION              EXPECTED_VERCEL_REGION (for example sin1)
  --allow-http true|false      VERIFY_ALLOW_HTTP (default: false; tests/local only)

Required environment-only attestation inputs:
  EXPECTED_TENANT_CONTEXT_KEY_ID
  EXPECTED_TENANT_CONTEXT_AUDIENCE

METRICS_TOKEN is required through the environment. When require-bypass is true,
VERCEL_AUTOMATION_BYPASS_SECRET is also required. Secrets are never accepted on
the command line or printed.`;
}

function positiveInteger(value, label, defaultValue) {
  const parsed = Number(value ?? defaultValue);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function booleanValue(value, label, defaultValue = false) {
  if (value === undefined || value === null || value === "")
    return defaultValue;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

export function normalizeBaseUrl(value, allowHttp = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("base-url must be an absolute URL.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "base-url must not contain credentials, a query string, or a fragment.",
    );
  }
  if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
    throw new Error("base-url must use HTTPS.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error(
      "base-url must point to the deployment origin, without a path.",
    );
  }
  return url.origin;
}

export function parseArgs(argv, env = process.env) {
  const values = new Map();
  const allowedOptions = new Set([
    "base-url",
    "sha",
    "attempts",
    "delay-ms",
    "request-timeout-ms",
    "require-bypass",
    "region",
    "allow-http",
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

  const allowHttp = booleanValue(
    values.get("allow-http") ?? env.VERIFY_ALLOW_HTTP,
    "allow-http",
  );
  const expectedSha = (
    values.get("sha") ??
    env.EXPECTED_GIT_SHA ??
    ""
  ).toLowerCase();
  const metricsToken = env.METRICS_TOKEN;
  const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const requireBypass = booleanValue(
    values.get("require-bypass") ?? env.REQUIRE_VERCEL_BYPASS,
    "require-bypass",
  );
  const expectedTenantContextKeyId = env.EXPECTED_TENANT_CONTEXT_KEY_ID ?? "";
  const expectedTenantContextAudience =
    env.EXPECTED_TENANT_CONTEXT_AUDIENCE ?? "";
  const expectedRegion =
    values.get("region") ?? env.EXPECTED_VERCEL_REGION ?? "";

  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("sha must be a full 40-character Git commit SHA.");
  }
  if (!metricsToken || metricsToken.length < 32) {
    throw new Error(
      "METRICS_TOKEN is required and must contain at least 32 characters.",
    );
  }
  if (requireBypass && (!bypassSecret || bypassSecret.length < 16)) {
    throw new Error(
      "VERCEL_AUTOMATION_BYPASS_SECRET is required and must contain at least 16 characters.",
    );
  }
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(expectedTenantContextKeyId)) {
    throw new Error(
      "EXPECTED_TENANT_CONTEXT_KEY_ID must identify the deployed signing key.",
    );
  }
  if (!/^[a-z0-9][a-z0-9:._-]{2,191}$/.test(expectedTenantContextAudience)) {
    throw new Error(
      "EXPECTED_TENANT_CONTEXT_AUDIENCE must identify the deployed database audience.",
    );
  }
  if (!/^[a-z]{3}[1-9][0-9]*$/.test(expectedRegion)) {
    throw new Error(
      "region/EXPECTED_VERCEL_REGION must identify the exact Vercel function region.",
    );
  }

  return {
    help: false,
    baseUrl: normalizeBaseUrl(
      values.get("base-url") ?? env.DEPLOYMENT_URL ?? "",
      allowHttp,
    ),
    expectedSha,
    metricsToken,
    bypassSecret,
    requireBypass,
    expectedTenantContextAudience,
    expectedTenantContextKeyId,
    expectedRegion,
    attempts: positiveInteger(
      values.get("attempts") ?? env.VERIFY_ATTEMPTS,
      "attempts",
      12,
    ),
    delayMs: positiveInteger(
      values.get("delay-ms") ?? env.VERIFY_DELAY_MS,
      "delay-ms",
      5000,
    ),
    requestTimeoutMs: positiveInteger(
      values.get("request-timeout-ms") ?? env.VERIFY_REQUEST_TIMEOUT_MS,
      "request-timeout-ms",
      15000,
    ),
  };
}

function commitMatches(value, expectedSha) {
  return typeof value === "string" && value.toLowerCase() === expectedSha;
}

export function validateHealthPayload(payload, expectedSha, expectedRegion) {
  const problems = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["health response is not a JSON object"];
  }
  if (payload.status !== "ok") problems.push("health status is not ok");
  if (payload.service !== "school-sis-web")
    problems.push("health service identity is invalid");
  if (!commitMatches(payload.commit, expectedSha))
    problems.push("health commit does not match the release SHA");
  if (expectedRegion && payload.region !== expectedRegion)
    problems.push("health region does not match the expected Vercel region");
  if (!payload.timestamp || !Number.isFinite(Date.parse(payload.timestamp))) {
    problems.push("health timestamp is missing or invalid");
  }
  return problems;
}

export function validateReadyPayload(
  payload,
  expectedSha,
  expectedTenantContext,
) {
  const problems = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["readiness response is not a JSON object"];
  }
  if (payload.status !== "ready")
    problems.push("readiness status is not strictly ready");
  if (!commitMatches(payload.commit, expectedSha))
    problems.push("readiness commit does not match the release SHA");
  if (payload.database?.status !== "healthy")
    problems.push("database readiness is not healthy");
  if (payload.integrationConfiguration?.status !== "healthy")
    problems.push("integration-configuration readiness is not healthy");
  if (payload.integrationConfiguration?.enforced !== true)
    problems.push(
      "production integration-configuration audit was not enforced",
    );
  if (payload.integrationConfiguration?.mockConnectionCount !== 0)
    problems.push("production mock integration connections remain configured");
  if (payload.migrations?.status !== "healthy")
    problems.push("migration readiness is not healthy");
  if (payload.migrations?.reason !== "current")
    problems.push("migration ledger is not current");
  if (payload.platformDatabase?.status !== "healthy")
    problems.push("platform database readiness is not healthy");
  if (payload.platformDatabase?.role !== "school_sis_platform")
    problems.push("platform database role is not the pinned platform identity");
  if (payload.platformDatabase?.bypassVerified !== true)
    problems.push("platform database bypass was not verified");
  if (payload.rateLimit?.status !== "healthy")
    problems.push("rate-limit readiness is not healthy");
  if (payload.tenantContext?.status !== "healthy")
    problems.push("tenant-context readiness is not healthy");
  if (payload.tenantContext?.role !== "school_sis_runtime")
    problems.push("tenant database role is not the pinned runtime identity");
  if (payload.tenantContext?.bypassVerified !== false)
    problems.push("tenant database unexpectedly permits RLS bypass");
  if (payload.tenantContext?.keyId !== expectedTenantContext.keyId)
    problems.push("tenant-context key ID does not match the release");
  if (payload.tenantContext?.audience !== expectedTenantContext.audience)
    problems.push("tenant-context audience does not match the release");
  if (
    !payload.generatedAt ||
    !Number.isFinite(Date.parse(payload.generatedAt))
  ) {
    problems.push("readiness timestamp is missing or invalid");
  }
  return problems;
}

async function responseJson(response, label) {
  if (response.status !== 200)
    throw new Error(`${label} returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${label} did not return JSON`);
  }
  const body = await response.text();
  if (body.length > 65_536)
    throw new Error(`${label} response exceeded 64 KiB`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
}

async function fetchProbe(url, headers, timeoutMs, fetchImpl, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    return await responseJson(response, label);
  } catch (error) {
    if (error?.name === "AbortError")
      throw new Error(`${label} request timed out`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtmlProbe(url, headers, timeoutMs, fetchImpl, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status !== 200) {
      throw new Error(`${label} returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error(`${label} did not return HTML`);
    }
    const body = await response.text();
    if (
      body.length < 100 ||
      body.length > 2_000_000 ||
      !/<html[\s>]/i.test(body)
    ) {
      throw new Error(`${label} returned an invalid HTML document`);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} request timed out`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isExactVercelAuthCallback(value, protectedUrl) {
  let callback;
  try {
    callback = new URL(value);
  } catch {
    return false;
  }
  return (
    callback.protocol === "https:" &&
    callback.hostname === "vercel.com" &&
    callback.pathname === "/sso-api" &&
    callback.searchParams.get("url") === protectedUrl
  );
}

export async function verifyVercelProtection(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "school-sis-deployment-protection-verifier",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const location = response.headers.get("location") ?? "";
    const server = response.headers.get("server") ?? "";
    const vercelId = response.headers.get("x-vercel-id") ?? "";
    const commonVercelHeaders =
      server.toLowerCase() === "vercel" && vercelId.length > 0;
    const protectedByRedirect =
      [302, 303, 307, 308].includes(response.status) &&
      commonVercelHeaders &&
      isExactVercelAuthCallback(location, url);
    let protectedByJson = false;
    if (response.status === 401 && commonVercelHeaders) {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.toLowerCase().includes("application/json")) {
        const body = await response.text();
        if (body.length <= 65_536) {
          try {
            const payload = JSON.parse(body);
            protectedByJson =
              payload?.error?.code === "401" &&
              payload.error.message === "Protected deployment" &&
              payload?.protection?.vercel_auth_enabled === true &&
              isExactVercelAuthCallback(
                payload.protection.vercel_auth_callback,
                url,
              );
          } catch {
            protectedByJson = false;
          }
        }
      }
    }
    if (!protectedByRedirect && !protectedByJson) {
      throw new Error(
        "deployment URL is publicly reachable or did not return the expected Vercel Authentication challenge",
      );
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("deployment protection probe timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyDeployment(options, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const sleep =
    dependencies.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  if (typeof fetchImpl !== "function")
    throw new Error("A fetch implementation is required.");

  const commonHeaders = {
    Accept: "application/json",
    "Cache-Control": "no-cache",
    "User-Agent": "school-sis-deployment-verifier",
  };
  if (options.bypassSecret) {
    commonHeaders["x-vercel-protection-bypass"] = options.bypassSecret;
  }

  let lastFailure = "verification did not run";
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      if (options.requireBypass) {
        await verifyVercelProtection(
          `${options.baseUrl}/api/health`,
          options.requestTimeoutMs,
          fetchImpl,
        );
      }
      const health = await fetchProbe(
        `${options.baseUrl}/api/health`,
        commonHeaders,
        options.requestTimeoutMs,
        fetchImpl,
        "health endpoint",
      );
      const healthProblems = validateHealthPayload(
        health,
        options.expectedSha,
        options.expectedRegion,
      );
      if (healthProblems.length > 0) throw new Error(healthProblems.join("; "));

      const ready = await fetchProbe(
        `${options.baseUrl}/api/ready`,
        { ...commonHeaders, Authorization: `Bearer ${options.metricsToken}` },
        options.requestTimeoutMs,
        fetchImpl,
        "readiness endpoint",
      );
      const readyProblems = validateReadyPayload(ready, options.expectedSha, {
        audience: options.expectedTenantContextAudience,
        keyId: options.expectedTenantContextKeyId,
      });
      if (readyProblems.length > 0) throw new Error(readyProblems.join("; "));

      await fetchHtmlProbe(
        `${options.baseUrl}/login`,
        commonHeaders,
        options.requestTimeoutMs,
        fetchImpl,
        "login surface",
      );

      return {
        attempts: attempt,
        baseUrl: options.baseUrl,
        sha: options.expectedSha,
        region: health.region,
        tenantContextAudience: ready.tenantContext.audience,
        tenantContextKeyId: ready.tenantContext.keyId,
      };
    } catch (error) {
      lastFailure =
        error instanceof Error ? error.message : "unknown verification error";
      if (attempt === options.attempts) break;
      console.log(
        `Deployment verification attempt ${attempt}/${options.attempts} failed: ${lastFailure}.`,
      );
      await sleep(options.delayMs);
    }
  }

  throw new Error(
    `Deployment verification failed after ${options.attempts} attempts: ${lastFailure}.`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  const result = await verifyDeployment(options);
  console.log(
    `Verified deployment ${result.sha.slice(0, 12)} after ${result.attempts} attempt(s).`,
  );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `verified_sha=${result.sha}\n`,
      { encoding: "utf8" },
    );
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `verified_tenant_context_key_id=${result.tenantContextKeyId}\n` +
        `verified_tenant_context_audience=${result.tenantContextAudience}\n`,
      { encoding: "utf8" },
    );
  }
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(
      `Deployment verification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  });
}

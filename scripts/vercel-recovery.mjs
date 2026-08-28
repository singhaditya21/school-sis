#!/usr/bin/env node

/**
 * Vercel production recovery mechanics, as one testable unit.
 *
 * Everything here runs only when a release has already gone wrong: capture a
 * rollback target, revert to it, prove the revert landed, refuse to delete
 * whatever production is serving, and state what production serves. That is
 * code which, by construction, never executes on a good day — so it accumulates
 * defects that first run during an incident, when they are most expensive.
 *
 * This repository has paid for that twice in one day. A gate that could not
 * refuse a deletion, a rollback that routed through the same broken scope
 * lookup that caused the failure, a "never fails the job" diagnostic that died
 * on its first jq. Each was found by reading, not by running.
 *
 * So the point of this file is not tidiness. It exists so that
 * .github/workflows/recovery-rehearsal.yml can drive the SAME code against the
 * isolated preview project, where promoting and reverting cost nothing — and
 * the production release calls exactly these functions with production
 * arguments. A rehearsal that exercised a copy would prove nothing at all.
 *
 *   node scripts/vercel-recovery.mjs capture --team T --project P --production-url URL
 *   node scripts/vercel-recovery.mjs rollback --team T --project P --production-url URL --deployment D
 *   node scripts/vercel-recovery.mjs verify-rollback --team T --production-url URL --deployment D
 *   node scripts/vercel-recovery.mjs guard-delete --team T --project P --production-url URL \
 *     --deployment D --sha SHA --run-id RUN
 *   node scripts/vercel-recovery.mjs report --team T --production-url URL [--candidate D] [--prior D] [--sha SHA]
 *
 * The token comes from VERCEL_TOKEN. Never pass it on the command line: argv is
 * visible to every process on the runner.
 */

const API = "https://api.vercel.com";

/** Statuses worth trying again. A 4xx is an answer, not a hiccup. */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const COMMANDS = new Set([
  "capture",
  "wait-live",
  "rollback",
  "verify-rollback",
  "guard-delete",
  "report",
]);

function usage() {
  return [
    "usage: vercel-recovery.mjs <command> [options]",
    "",
    "commands:",
    "  capture         identify what production serves, as a rollback target",
    "  wait-live       poll until production serves a given deployment",
    "  rollback        revert production to a captured deployment and prove it landed",
    "  verify-rollback assert production serves the captured deployment",
    "  guard-delete    delete a candidate, never the deployment production serves",
    "  report          state what production serves; never fails",
    "",
    "the API token is read from VERCEL_TOKEN, never from argv",
  ].join("\n");
}

export function parseArgs(argv, env = process.env) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) {
    throw new Error(`Unknown command ${command ?? "(none)"}.\n${usage()}`);
  }

  const values = new Map();
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument ${arg}.`);
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Option --${key} needs a value.`);
    }
    values.set(key, next);
    i += 1;
  }

  const token = env.VERCEL_TOKEN ?? "";
  if (!token) throw new Error("VERCEL_TOKEN is required.");

  const productionUrl = values.get("production-url") ?? "";
  let productionHost = "";
  if (productionUrl) {
    try {
      productionHost = new URL(productionUrl).hostname;
    } catch {
      // Deliberately not rethrowing the original: a URL parse error carries the
      // offending string on err.input, and this value has held credentials in
      // other parts of this repository.
      throw new Error("--production-url is not a valid URL.");
    }
  }
  if (!productionHost) throw new Error("--production-url is required.");

  const positive = (key, fallback) => {
    const raw = values.get(key);
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`--${key} must be a positive integer.`);
    }
    return parsed;
  };

  return {
    command,
    token,
    team: values.get("team") ?? "",
    project: values.get("project") ?? "",
    productionUrl,
    productionHost,
    deployment: values.get("deployment") ?? "",
    candidate: values.get("candidate") ?? "",
    prior: values.get("prior") ?? "",
    sha: values.get("sha") ?? "",
    runId: values.get("run-id") ?? "",
    attempts: positive("attempts", 30),
    delayMs: positive("delay-ms", 10_000),
    retries: positive("retries", 3),
  };
}

// ─── Transport ──────────────────────────────────────────────────────────────

function url(options, path) {
  const separator = path.includes("?") ? "&" : "?";
  return options.team ? `${API}${path}${separator}teamId=${options.team}` : `${API}${path}`;
}

async function readText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Truncate only for DISPLAY.
 *
 * The first version truncated on read and then parsed the truncation, so every
 * real Vercel deployment payload — thousands of characters — was reported as
 * "a 200 whose body is not JSON". Unit tests missed it because every stubbed
 * body was a few dozen bytes; the rehearsal caught it on its first run against
 * the real API, which is the entire argument for having one.
 */
const snippet = (text) => text.slice(0, 400);

/**
 * One request, retried only on statuses that can differ next time.
 *
 * `mutating` exists so a caller must think about it. A POST here is a rollback
 * to a SPECIFIC deployment id, which is idempotent — replaying it converges on
 * the same state, and the poll afterwards confirms it — so retrying a 429 is
 * safe and losing production to a rate limit is not.
 */
async function request(options, path, init, fetchImpl) {
  let lastError = "";
  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url(options, path), {
        ...init,
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: "application/json",
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt > options.retries) return { ok: false, status: 0, body: lastError };
      continue;
    }

    if (response.ok) {
      const text = await readText(response);

      // A successful mutation need not return a body. The rollback POST answers
      // 201 with nothing at all, and treating that as unparseable reported a
      // rollback that had in fact landed as "Vercel refused the rollback (HTTP
      // 201)". Only a NON-empty body that fails to parse is a problem.
      if (text.trim() === "") {
        return { ok: true, status: response.status, json: null, body: "" };
      }

      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        // A 200 whose body is not JSON is a real thing — an edge interstitial,
        // a proxy error page. Report it as such rather than throwing.
        return { ok: false, status: response.status, body: snippet(text), notJson: true };
      }
      return { ok: true, status: response.status, json, body: snippet(text) };
    }

    const body = snippet(await readText(response));
    if (!RETRYABLE.has(response.status) || attempt > options.retries) {
      return { ok: false, status: response.status, body };
    }
    lastError = body;
  }
  return { ok: false, status: 0, body: lastError };
}

const getDeployment = (options, idOrHost, fetchImpl) =>
  request(options, `/v13/deployments/${encodeURIComponent(idOrHost)}`, undefined, fetchImpl);

// ─── Shared assertions ──────────────────────────────────────────────────────

/**
 * Is this deployment one this project may roll back to?
 *
 * The creation-time `alias` list is deliberately not consulted. Candidates
 * deploy with --skip-domain, so that list holds only the project-scoped
 * hostname Vercel assigns itself and never the canonical production host.
 * Asserting the host into it made the first successful release poison every
 * release after it.
 */
function deploymentProblems(deployment, options) {
  const problems = [];
  const id = deployment?.id ?? "";
  if (!/^dpl_[A-Za-z0-9]+$/.test(id)) {
    problems.push(`id ${id || "<none>"} is not a dpl_ identifier`);
  }
  if (options.project && deployment?.projectId !== options.project) {
    problems.push(`belongs to project ${deployment?.projectId ?? "<none>"}, not ${options.project}`);
  }
  if (deployment?.target !== "production") {
    problems.push(`target is ${deployment?.target ?? "<none>"}, expected production`);
  }
  if (deployment?.readyState !== "READY") {
    problems.push(`readyState is ${deployment?.readyState ?? "<none>"}, expected READY`);
  }
  return problems;
}

// ─── Commands ───────────────────────────────────────────────────────────────

export async function capture(options, fetchImpl, log = console) {
  const result = await getDeployment(options, options.productionHost, fetchImpl);
  if (!result.ok) {
    throw new Error(
      `Could not resolve ${options.productionHost} (HTTP ${result.status}): ${result.body}`,
    );
  }
  if (!result.json) {
    throw new Error(
      `${options.productionHost} answered ${result.status} with no deployment body.`,
    );
  }

  const deployment = result.json;
  log.log(`${options.productionHost} currently serves:`);
  log.log(`  deployment : ${deployment.id ?? "<none>"}`);
  log.log(`  url        : ${deployment.url ?? "<none>"}`);
  log.log(`  project    : ${deployment.projectId ?? "<none>"}`);
  log.log(`  target     : ${deployment.target ?? "<none>"}`);
  log.log(`  readyState : ${deployment.readyState ?? "<none>"}`);
  log.log(`  aliases    : ${(deployment.alias ?? []).join(", ") || "<none assigned at creation>"}`);

  const problems = deploymentProblems(deployment, options);
  if (!deployment.url) problems.push("reported no url to roll back to");
  if (problems.length > 0) {
    throw new Error(
      `Refusing to start without a usable rollback target:\n  - ${problems.join("\n  - ")}`,
    );
  }
  return { priorId: deployment.id, priorUrl: deployment.url };
}

export async function rollback(options, fetchImpl, sleep, log = console) {
  if (!options.deployment) throw new Error("--deployment is required.");
  if (!options.project) throw new Error("--project is required.");

  // The ownership check `getProjectByDeployment` used to perform inside the CLI,
  // kept here without the GET /v2/user scope lookup that made the CLI unusable
  // as a recovery mechanism: it failed for the same reason as the promotion it
  // was meant to recover from.
  const target = await getDeployment(options, options.deployment, fetchImpl);
  if (!target.ok) {
    throw new Error(
      `Could not read the rollback target ${options.deployment} (HTTP ${target.status}): ${target.body}`,
    );
  }
  const problems = deploymentProblems(target.json, options);
  if (problems.length > 0) {
    throw new Error(
      `Refusing to roll back to ${options.deployment}:\n  - ${problems.join("\n  - ")}`,
    );
  }

  const posted = await request(
    options,
    `/v9/projects/${options.project}/rollback/${options.deployment}`,
    { method: "POST", body: "{}" },
    fetchImpl,
  );
  if (!posted.ok) {
    throw new Error(
      `Vercel refused the rollback (HTTP ${posted.status}): ${posted.body}`,
    );
  }
  log.log(`Vercel accepted the rollback request (HTTP ${posted.status}).`);

  return waitForLive(options, fetchImpl, sleep, log, "Rollback was accepted but");
}

/**
 * Poll until the production host serves the expected deployment.
 *
 * Vercel assigns the production alias asynchronously: `vercel deploy --prod`
 * returns an id while the host still serves the previous deployment, and a
 * rollback is accepted before it takes effect. Asking the host directly is the
 * only question that matters, and avoids the CLI status endpoint, which routes
 * back through the scope lookup this file exists to sidestep.
 */
export async function waitForLive(options, fetchImpl, sleep, log = console, prefix = "") {
  if (!options.deployment) throw new Error("--deployment is required.");

  let targetState = "<unknown>";
  let servedId = "<unknown>";

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const live = await getDeployment(options, options.productionHost, fetchImpl);
    if (live.ok && live.json) servedId = live.json.id ?? "<none>";
    if (live.ok && live.json?.id === options.deployment) {
      log.log(
        `${options.productionHost} serves ${options.deployment} (after ${attempt} check(s)).`,
      );
      return { landed: true, attempts: attempt };
    }

    // A deployment that failed to build will never take the alias. Waiting the
    // full window and then reporting only "still does not serve it" describes
    // the symptom and hides the cause.
    const target = await getDeployment(options, options.deployment, fetchImpl);
    if (target.ok && target.json) {
      targetState = target.json.readyState ?? "<none>";
      if (targetState === "ERROR" || targetState === "CANCELED") {
        throw new Error(
          `${options.deployment} is ${targetState} and will never serve ${options.productionHost}.`,
        );
      }
    }

    if (attempt < options.attempts) await sleep(options.delayMs);
  }

  throw new Error(
    `${prefix ? `${prefix} ` : ""}${options.productionHost} still does not serve ` +
      `${options.deployment} after ${options.attempts} check(s).\n` +
      `  target readyState : ${targetState}\n` +
      `  host currently serves: ${servedId}`,
  );
}

export async function verifyRollback(options, fetchImpl, log = console) {
  if (!options.deployment) throw new Error("--deployment is required.");
  const live = await getDeployment(options, options.productionHost, fetchImpl);
  if (!live.ok) {
    throw new Error(
      `Could not confirm what ${options.productionHost} serves (HTTP ${live.status}): ${live.body}`,
    );
  }
  const current = live.json?.id ?? "";
  if (current !== options.deployment) {
    throw new Error(
      `${options.productionHost} serves ${current || "<none>"}, not the captured deployment ${options.deployment}.`,
    );
  }
  log.log(`${options.productionHost} serves ${current}, as captured.`);
  return { verified: true };
}

export async function guardDelete(options, fetchImpl, log = console) {
  if (!options.deployment) throw new Error("--deployment is required.");

  // Resolve what production serves FIRST, and fail closed. A guard that cannot
  // tell whether the candidate is live must not proceed to delete it.
  const live = await getDeployment(options, options.productionHost, fetchImpl);
  if (!live.ok) {
    throw new Error(
      `Could not resolve what ${options.productionHost} serves (HTTP ${live.status}); refusing to delete anything.`,
    );
  }
  const liveId = live.json?.id ?? "";
  if (!liveId) {
    throw new Error(
      `Resolving ${options.productionHost} returned no deployment id; refusing to delete anything.`,
    );
  }
  if (liveId === options.deployment) {
    throw new Error(
      `Candidate ${options.deployment} is what production currently serves; refusing to delete it.`,
    );
  }

  const candidate = await getDeployment(options, options.deployment, fetchImpl);
  if (candidate.status === 404) {
    log.log(`Candidate ${options.deployment} no longer exists.`);
    return { deleted: false, reason: "absent" };
  }
  if (!candidate.ok) {
    throw new Error(
      `Could not verify candidate ${options.deployment} (HTTP ${candidate.status}): ${candidate.body}`,
    );
  }

  const seen = candidate.json ?? {};
  const mismatches = [];
  if (seen.id !== options.deployment) mismatches.push(`id=${seen.id ?? "<none>"}`);
  if (options.project && seen.projectId !== options.project) {
    mismatches.push(`project=${seen.projectId ?? "<none>"}`);
  }
  if (seen.target !== "production") mismatches.push(`target=${seen.target ?? "<none>"}`);
  if (options.sha && seen.meta?.githubCommitSha !== options.sha) {
    mismatches.push(`sha=${seen.meta?.githubCommitSha ?? "<none>"}`);
  }
  if (options.runId && seen.meta?.githubRunId !== options.runId) {
    mismatches.push(`run=${seen.meta?.githubRunId ?? "<none>"}`);
  }
  if (mismatches.length > 0) {
    throw new Error(
      `Refusing to delete ${options.deployment}: not a production deployment this run created (${mismatches.join(" ")}).`,
    );
  }

  const removed = await request(
    options,
    `/v13/deployments/${encodeURIComponent(options.deployment)}`,
    { method: "DELETE" },
    fetchImpl,
  );
  if (!removed.ok && removed.status !== 404) {
    throw new Error(`Candidate deletion failed (HTTP ${removed.status}): ${removed.body}`);
  }
  log.log(`Deleted candidate ${options.deployment}.`);
  return { deleted: true };
}

/**
 * State what production serves. Never throws: this is the last word in a job
 * that has usually already failed, and an exception here would restore exactly
 * the silence it exists to end.
 */
export async function report(options, fetchImpl, log = console) {
  const live = await getDeployment(options, options.productionHost, fetchImpl);
  if (!live.ok) {
    const why = live.notJson
      ? `answered ${live.status} with a body that is not JSON`
      : `could not be resolved (HTTP ${live.status})`;
    const lines = [`${options.productionHost} ${why}; production state is UNKNOWN.`];
    if (live.body) lines.push(`    ${live.body}`);
    return { known: false, lines };
  }

  const deployment = live.json ?? {};
  const id = deployment.id ?? "<none>";
  let verdict = "production is on NEITHER this release's candidate nor the captured rollback target";
  if (options.candidate && id === options.candidate) {
    verdict = "production is on THIS release's candidate";
  } else if (options.prior && id === options.prior) {
    verdict = "production is on the deployment captured before this release";
  }

  const lines = [
    `${options.productionHost} is serving:`,
    `  deployment        : ${id}`,
    `  url               : ${deployment.url ?? "<none>"}`,
    `  readyState        : ${deployment.readyState ?? "<none>"}`,
    `  commit            : ${deployment.meta?.githubCommitSha ?? "<none>"}`,
    `  this release built: ${options.candidate || "<no candidate>"}${options.sha ? ` from ${options.sha}` : ""}`,
    `  captured rollback : ${options.prior || "<none captured>"}`,
    `  => ${verdict}.`,
  ];
  return { known: true, id, verdict, lines };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const RUNNING_AS_CLI =
  process.argv[1] && process.argv[1].endsWith("vercel-recovery.mjs");

async function writeOutputs(entries) {
  if (!process.env.GITHUB_OUTPUT) return;
  const { appendFile } = await import("node:fs/promises");
  const body = Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await appendFile(process.env.GITHUB_OUTPUT, `${body}\n`);
}

async function writeSummary(text) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "capture") {
    const { priorId, priorUrl } = await capture(options, fetch);
    await writeOutputs({ prior_id: priorId, prior_url: priorUrl });
    return;
  }
  if (options.command === "rollback") {
    await rollback(options, fetch, wait);
    return;
  }
  if (options.command === "wait-live") {
    await waitForLive(options, fetch, wait);
    return;
  }
  if (options.command === "verify-rollback") {
    await verifyRollback(options, fetch);
    return;
  }
  if (options.command === "guard-delete") {
    await guardDelete(options, fetch);
    return;
  }
  if (options.command === "report") {
    // Deliberately outside the failure path: report never exits non-zero.
    const result = await report(options, fetch).catch((error) => ({
      known: false,
      lines: [`Could not report what production serves: ${error.message}`],
    }));
    const text = result.lines.join("\n");
    console.log(text);
    await writeSummary(text);
  }
}

if (RUNNING_AS_CLI) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

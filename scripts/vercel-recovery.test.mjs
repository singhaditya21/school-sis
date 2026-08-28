import assert from "node:assert/strict";
import test from "node:test";

import {
  capture,
  guardDelete,
  parseArgs,
  report,
  rollback,
  verifyRollback,
} from "./vercel-recovery.mjs";

/**
 * These cover code that only runs after a release has already failed. It has
 * historically shipped broken precisely because nothing exercised it, so the
 * assertions here are about behaviour under failure, not about the happy path.
 */

const PROJECT = "prj_test";
const HOST = "app.example.com";

const options = (overrides = {}) =>
  parseArgs(
    [
      "capture",
      "--team",
      "team_test",
      "--project",
      PROJECT,
      "--production-url",
      `https://${HOST}`,
      "--attempts",
      "3",
      "--delay-ms",
      "1",
      ...(overrides.argv ?? []),
    ],
    { VERCEL_TOKEN: "tok" },
  );

/** A fetch stub that records calls and replays scripted responses. */
function stubFetch(routes) {
  const calls = [];
  const remaining = routes.map((r) => ({ ...r }));
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET" });
      const index = remaining.findIndex(
        (r) =>
          url.includes(r.match) &&
          (r.method ?? "GET") === (init?.method ?? "GET") &&
          (r.times === undefined || r.times > 0),
      );
      if (index === -1) throw new Error(`no stub for ${init?.method ?? "GET"} ${url}`);
      const route = remaining[index];
      if (route.times !== undefined) {
        route.times -= 1;
        if (route.times === 0) remaining.splice(index, 1);
      }
      const body = typeof route.body === "string" ? route.body : JSON.stringify(route.body ?? {});
      return {
        ok: route.status >= 200 && route.status < 300,
        status: route.status,
        text: async () => body,
      };
    },
  };
}

const silent = { log() {}, error() {} };
const noSleep = async () => {};

const READY = {
  id: "dpl_prior",
  url: "prior.vercel.app",
  projectId: PROJECT,
  target: "production",
  readyState: "READY",
  // A promoted --skip-domain candidate: the project-scoped alias only, never
  // the canonical production host. This must still be a valid rollback target.
  alias: ["app-scoped-name.vercel.app"],
};

// ─── parseArgs ──────────────────────────────────────────────────────────────

test("rejects an unknown command", () => {
  assert.throws(() => parseArgs(["frobnicate"], { VERCEL_TOKEN: "t" }), /Unknown command/);
});

test("requires a token, and never accepts one on the command line", () => {
  assert.throws(() => parseArgs(["capture", "--production-url", "https://x.dev"], {}), /VERCEL_TOKEN/);
});

test("rejects a malformed production url without echoing it", () => {
  // A URL parse error carries the offending string on err.input; connection
  // strings have leaked through exactly that field in this repository before.
  const secret = "https://user:hunter2@[not a host]/";
  assert.throws(
    () => parseArgs(["capture", "--production-url", secret], { VERCEL_TOKEN: "t" }),
    (error) => error.message === "--production-url is not a valid URL." && !error.message.includes("hunter2"),
  );
});

// ─── capture ────────────────────────────────────────────────────────────────

test("captures a promoted --skip-domain deployment as the rollback target", async () => {
  const stub = stubFetch([{ match: `/v13/deployments/${HOST}`, status: 200, body: READY }]);
  const result = await capture(options(), stub.fetch, silent);
  assert.deepEqual(result, { priorId: "dpl_prior", priorUrl: "prior.vercel.app" });
});

test("refuses a rollback target from another project, and says which", async () => {
  const stub = stubFetch([
    { match: `/v13/deployments/${HOST}`, status: 200, body: { ...READY, projectId: "prj_other" } },
  ]);
  await assert.rejects(capture(options(), stub.fetch, silent), /belongs to project prj_other/);
});

test("refuses a rollback target that is not READY", async () => {
  const stub = stubFetch([
    { match: `/v13/deployments/${HOST}`, status: 200, body: { ...READY, readyState: "BUILDING" } },
  ]);
  await assert.rejects(capture(options(), stub.fetch, silent), /readyState is BUILDING/);
});

test("names the HTTP status when production cannot be resolved", async () => {
  const stub = stubFetch([{ match: `/v13/deployments/${HOST}`, status: 403, body: { error: "no" } }]);
  await assert.rejects(capture(options(), stub.fetch, silent), /HTTP 403/);
});

// ─── rollback ───────────────────────────────────────────────────────────────

test("rolls back and confirms production serves the captured deployment", async () => {
  const stub = stubFetch([
    { match: "/v13/deployments/dpl_prior", status: 200, body: READY },
    { match: "/rollback/dpl_prior", method: "POST", status: 200, body: {} },
    { match: `/v13/deployments/${HOST}`, status: 200, body: READY },
  ]);
  const result = await rollback(
    options({ argv: ["--deployment", "dpl_prior"] }),
    stub.fetch,
    noSleep,
    silent,
  );
  assert.equal(result.landed, true);
  assert.equal(stub.calls.filter((c) => c.method === "POST").length, 1);
});

test("retries the rollback through a rate limit rather than stranding production", async () => {
  const stub = stubFetch([
    { match: "/v13/deployments/dpl_prior", status: 200, body: READY },
    { match: "/rollback/dpl_prior", method: "POST", status: 429, body: {}, times: 2 },
    { match: "/rollback/dpl_prior", method: "POST", status: 200, body: {} },
    { match: `/v13/deployments/${HOST}`, status: 200, body: READY },
  ]);
  await rollback(options({ argv: ["--deployment", "dpl_prior"] }), stub.fetch, noSleep, silent);
  assert.equal(stub.calls.filter((c) => c.method === "POST").length, 3);
});

test("does not retry a rollback the API refused outright", async () => {
  const stub = stubFetch([
    { match: "/v13/deployments/dpl_prior", status: 200, body: READY },
    { match: "/rollback/dpl_prior", method: "POST", status: 403, body: { error: "forbidden" } },
  ]);
  await assert.rejects(
    rollback(options({ argv: ["--deployment", "dpl_prior"] }), stub.fetch, noSleep, silent),
    /HTTP 403/,
  );
  assert.equal(stub.calls.filter((c) => c.method === "POST").length, 1);
});

test("refuses to roll back to a deployment in another project", async () => {
  const stub = stubFetch([
    { match: "/v13/deployments/dpl_prior", status: 200, body: { ...READY, projectId: "prj_other" } },
  ]);
  await assert.rejects(
    rollback(options({ argv: ["--deployment", "dpl_prior"] }), stub.fetch, noSleep, silent),
    /Refusing to roll back/,
  );
  assert.equal(stub.calls.filter((c) => c.method === "POST").length, 0);
});

test("fails when the rollback is accepted but never lands", async () => {
  const stub = stubFetch([
    { match: "/v13/deployments/dpl_prior", status: 200, body: READY },
    { match: "/rollback/dpl_prior", method: "POST", status: 200, body: {} },
    { match: `/v13/deployments/${HOST}`, status: 200, body: { ...READY, id: "dpl_other" } },
  ]);
  await assert.rejects(
    rollback(options({ argv: ["--deployment", "dpl_prior"] }), stub.fetch, noSleep, silent),
    /still does not serve/,
  );
});

// ─── verify-rollback ────────────────────────────────────────────────────────

test("verifies the rollback landed, and reports the mismatch when it did not", async () => {
  const ok = stubFetch([{ match: `/v13/deployments/${HOST}`, status: 200, body: READY }]);
  await verifyRollback(options({ argv: ["--deployment", "dpl_prior"] }), ok.fetch, silent);

  const bad = stubFetch([
    { match: `/v13/deployments/${HOST}`, status: 200, body: { ...READY, id: "dpl_wrong" } },
  ]);
  await assert.rejects(
    verifyRollback(options({ argv: ["--deployment", "dpl_prior"] }), bad.fetch, silent),
    /serves dpl_wrong, not the captured deployment/,
  );
});

// ─── guard-delete ───────────────────────────────────────────────────────────

test("never deletes the deployment production is serving", async () => {
  const stub = stubFetch([{ match: `/v13/deployments/${HOST}`, status: 200, body: READY }]);
  await assert.rejects(
    guardDelete(options({ argv: ["--deployment", "dpl_prior"] }), stub.fetch, silent),
    /is what production currently serves; refusing to delete it/,
  );
  assert.equal(stub.calls.filter((c) => c.method === "DELETE").length, 0);
});

test("fails closed when it cannot tell what production serves", async () => {
  const stub = stubFetch([{ match: `/v13/deployments/${HOST}`, status: 500, body: {} }]);
  await assert.rejects(
    guardDelete(options({ argv: ["--deployment", "dpl_candidate"] }), stub.fetch, silent),
    /refusing to delete anything/,
  );
  assert.equal(stub.calls.filter((c) => c.method === "DELETE").length, 0);
});

test("refuses to delete a deployment this run did not create", async () => {
  const stub = stubFetch([
    { match: `/v13/deployments/${HOST}`, status: 200, body: READY },
    {
      match: "/v13/deployments/dpl_candidate",
      status: 200,
      body: {
        id: "dpl_candidate",
        projectId: PROJECT,
        target: "production",
        meta: { githubCommitSha: "abc", githubRunId: "999" },
      },
    },
  ]);
  await assert.rejects(
    guardDelete(
      options({ argv: ["--deployment", "dpl_candidate", "--sha", "abc", "--run-id", "111"] }),
      stub.fetch,
      silent,
    ),
    /not a production deployment this run created \(run=999\)/,
  );
  assert.equal(stub.calls.filter((c) => c.method === "DELETE").length, 0);
});

test("deletes a candidate this run created and production is not serving", async () => {
  const stub = stubFetch([
    { match: `/v13/deployments/${HOST}`, status: 200, body: READY },
    {
      match: "/v13/deployments/dpl_candidate",
      status: 200,
      method: "GET",
      body: {
        id: "dpl_candidate",
        projectId: PROJECT,
        target: "production",
        meta: { githubCommitSha: "abc", githubRunId: "111" },
      },
    },
    { match: "/v13/deployments/dpl_candidate", method: "DELETE", status: 200, body: {} },
  ]);
  const result = await guardDelete(
    options({ argv: ["--deployment", "dpl_candidate", "--sha", "abc", "--run-id", "111"] }),
    stub.fetch,
    silent,
  );
  assert.equal(result.deleted, true);
});

// ─── report ─────────────────────────────────────────────────────────────────

test("reports which deployment production is on", async () => {
  const stub = stubFetch([{ match: `/v13/deployments/${HOST}`, status: 200, body: READY }]);
  const result = await report(
    options({ argv: ["--candidate", "dpl_candidate", "--prior", "dpl_prior"] }),
    stub.fetch,
  );
  assert.equal(result.known, true);
  assert.match(result.verdict, /captured before this release/);
});

test("survives a 200 whose body is not JSON, and says so", async () => {
  // GitHub runs workflow steps under `bash -e`; the shell version of this died
  // at its first jq here and printed nothing at all.
  const stub = stubFetch([
    { match: `/v13/deployments/${HOST}`, status: 200, body: "<html>interstitial</html>" },
  ]);
  const result = await report(options(), stub.fetch);
  assert.equal(result.known, false);
  assert.match(result.lines.join("\n"), /not JSON; production state is UNKNOWN/);
});

test("never throws, whatever the transport does", async () => {
  const exploding = async () => {
    throw new Error("network gone");
  };
  const result = await report(options({ argv: ["--retries", "1"] }), exploding);
  assert.equal(result.known, false);
  assert.match(result.lines.join("\n"), /UNKNOWN/);
});

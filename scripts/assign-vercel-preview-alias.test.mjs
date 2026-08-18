import assert from "node:assert/strict";
import test from "node:test";

import {
  assignPreviewAlias,
  parseArgs,
  validateAlias,
  validateDeployment,
} from "./assign-vercel-preview-alias.mjs";

const SHA = "a".repeat(40);
const TOKEN = "token-" + "x".repeat(32);
const OPTIONS = {
  help: false,
  deploymentId: "dpl_123abc",
  deploymentUrl: "https://generated-preview.vercel.app",
  alias: "school-sis-preview-pr-59.vercel.app",
  projectId: "prj_123abc",
  teamId: "team_123abc",
  expectedSha: SHA,
  prNumber: "59",
  token: TOKEN,
  attempts: 2,
  delayMs: 1,
  requestTimeoutMs: 1000,
};

function deployment(overrides = {}) {
  return {
    id: OPTIONS.deploymentId,
    projectId: OPTIONS.projectId,
    target: null,
    readyState: "READY",
    url: new URL(OPTIONS.deploymentUrl).hostname,
    alias: [],
    meta: {
      githubCommitSha: SHA,
      githubPrId: "59",
      schoolSisPreview: "1",
    },
    ...overrides,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("parseArgs keeps the token environment-only and validates exact identifiers", () => {
  const parsed = parseArgs(
    [
      "--deployment-id",
      OPTIONS.deploymentId,
      "--deployment-url",
      OPTIONS.deploymentUrl,
      "--alias",
      OPTIONS.alias,
      "--project-id",
      OPTIONS.projectId,
      "--team-id",
      OPTIONS.teamId,
      "--sha",
      SHA,
      "--pr-number",
      "59",
    ],
    { VERCEL_TOKEN: TOKEN },
  );
  assert.equal(parsed.token, TOKEN);
  assert.equal(parsed.deploymentUrl, OPTIONS.deploymentUrl);
  assert.throws(
    () => parseArgs(["--token", TOKEN], { VERCEL_TOKEN: TOKEN }),
    /Unknown option --token/,
  );
});

test("validateDeployment binds project, preview target, READY state, SHA, and PR", () => {
  assert.deepEqual(validateDeployment(deployment(), OPTIONS), []);
  const problems = validateDeployment(
    deployment({
      projectId: "prj_other",
      target: "production",
      readyState: "ERROR",
      meta: {},
    }),
    OPTIONS,
  );
  assert.match(problems.join("; "), /project/);
  assert.match(problems.join("; "), /production/);
  assert.match(problems.join("; "), /READY/);
  assert.match(problems.join("; "), /commit metadata/);
  assert.match(problems.join("; "), /pull-request metadata/);
  assert.match(problems.join("; "), /preview marker/);
});

test("validateAlias requires the exact hostname, deployment, and project", () => {
  assert.deepEqual(
    validateAlias(
      {
        alias: OPTIONS.alias,
        deploymentId: OPTIONS.deploymentId,
        projectId: OPTIONS.projectId,
      },
      OPTIONS,
    ),
    [],
  );
  assert.equal(
    validateAlias(
      {
        alias: "other.vercel.app",
        deploymentId: "dpl_other",
        projectId: "prj_other",
      },
      OPTIONS,
    ).length,
    3,
  );
});

test("assignPreviewAlias uses the team-scoped REST endpoint and proves the result", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST") return jsonResponse({ alias: OPTIONS.alias });
    if (url.includes("/v4/aliases/")) {
      return jsonResponse({
        alias: OPTIONS.alias,
        deploymentId: OPTIONS.deploymentId,
        projectId: OPTIONS.projectId,
      });
    }
    return jsonResponse(deployment());
  };

  const result = await assignPreviewAlias(OPTIONS, {
    fetchImpl,
    sleep: async () => {},
  });
  assert.deepEqual(result, {
    alias: OPTIONS.alias,
    deploymentId: OPTIONS.deploymentId,
  });
  assert.equal(calls.length, 3);
  assert.match(
    calls[0].url,
    /\/v13\/deployments\/dpl_123abc\?teamId=team_123abc$/,
  );
  assert.match(
    calls[1].url,
    /\/v2\/deployments\/dpl_123abc\/aliases\?teamId=team_123abc$/,
  );
  assert.match(
    calls[2].url,
    /\/v4\/aliases\/school-sis-preview-pr-59\.vercel\.app\?teamId=team_123abc$/,
  );
  assert.equal(calls[1].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[1].init.body, JSON.stringify({ alias: OPTIONS.alias }));
});

test("assignPreviewAlias reconciles an ambiguous POST without retrying it", async () => {
  let posted = false;
  let postCount = 0;
  const fetchImpl = async (url, init) => {
    if (init.method === "POST") {
      postCount += 1;
      posted = true;
      throw new Error("connection reset after commit");
    }
    if (posted && url.includes("/v4/aliases/")) {
      return jsonResponse({
        alias: OPTIONS.alias,
        deploymentId: OPTIONS.deploymentId,
        projectId: OPTIONS.projectId,
      });
    }
    return jsonResponse(deployment());
  };
  await assignPreviewAlias(OPTIONS, { fetchImpl, sleep: async () => {} });
  assert.equal(postCount, 1);
});

test("assignPreviewAlias retries only safe GET verification failures", async () => {
  let inspectionCount = 0;
  let postCount = 0;
  const fetchImpl = async (url, init) => {
    if (init.method === "POST") {
      postCount += 1;
      return jsonResponse({ alias: OPTIONS.alias });
    }
    inspectionCount += 1;
    if (inspectionCount === 2) throw new Error("temporary GET failure");
    if (url.includes("/v4/aliases/")) {
      return jsonResponse({
        alias: OPTIONS.alias,
        deploymentId: OPTIONS.deploymentId,
        projectId: OPTIONS.projectId,
      });
    }
    return jsonResponse(deployment());
  };
  await assignPreviewAlias(OPTIONS, { fetchImpl, sleep: async () => {} });
  assert.equal(postCount, 1);
  assert.equal(inspectionCount, 3);
});

test("assignPreviewAlias refuses cross-project metadata before POST", async () => {
  let postCount = 0;
  const fetchImpl = async (_url, init) => {
    if (init.method === "POST") postCount += 1;
    return jsonResponse(deployment({ projectId: "prj_production" }));
  };
  await assert.rejects(
    assignPreviewAlias(OPTIONS, { fetchImpl, sleep: async () => {} }),
    /Refusing to alias an unverified deployment: deployment project/,
  );
  assert.equal(postCount, 0);
});

test("assignPreviewAlias fails when the alias cannot be proven", async () => {
  const fetchImpl = async (url, init) => {
    if (init.method === "POST") {
      return jsonResponse({ error: { code: "forbidden" } }, 403);
    }
    if (url.includes("/v4/aliases/")) {
      return jsonResponse({
        alias: "other.vercel.app",
        deploymentId: "dpl_other",
        projectId: "prj_other",
      });
    }
    return jsonResponse(deployment());
  };
  await assert.rejects(
    assignPreviewAlias(
      { ...OPTIONS, attempts: 1 },
      { fetchImpl, sleep: async () => {} },
    ),
    /not proven after HTTP 403: alias hostname does not match; alias deployment does not match; alias project does not match/,
  );
});

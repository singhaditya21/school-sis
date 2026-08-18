import assert from "node:assert/strict";
import test from "node:test";

import {
  parseArgs,
  verifyProductionReleaseProvenance,
} from "./verify-production-release-provenance.mjs";

const TARGET_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const OWNER = "singhaditya21";
const OPTIONS = {
  repository: `${OWNER}/school-sis`,
  sha: TARGET_SHA,
  ref: "main",
  token: "read-only-token",
};

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    async json() {
      return payload;
    },
  };
}

function mergedPull(overrides = {}) {
  const { base = {}, head = {}, user = {}, ...rest } = overrides;
  return {
    number: 57,
    state: "closed",
    merged_at: "2026-08-17T08:00:00Z",
    merge_commit_sha: TARGET_SHA,
    ...rest,
    base: {
      ref: "main",
      repo: { full_name: OPTIONS.repository },
      ...base,
    },
    head: {
      sha: HEAD_SHA,
      repo: { full_name: OPTIONS.repository },
      ...head,
    },
    user: { login: OWNER, ...user },
  };
}

function validRoute(url) {
  const path = new URL(url).pathname;
  if (path.endsWith("/branches/main")) {
    return response(200, {
      name: "main",
      protected: true,
      commit: { sha: TARGET_SHA },
    });
  }
  if (path.endsWith(`/commits/${TARGET_SHA}/pulls`)) {
    return response(200, [mergedPull()]);
  }
  if (path.endsWith(`/collaborators/${OWNER}/permission`)) {
    return response(200, {
      permission: "admin",
      role_name: "admin",
      user: { login: OWNER },
    });
  }
  if (path.endsWith("/collaborators")) {
    return response(200, [
      {
        login: OWNER,
        permissions: {
          pull: true,
          triage: true,
          push: true,
          maintain: true,
          admin: true,
        },
      },
    ]);
  }
  throw new Error(`Unexpected test request: ${url}`);
}

test("parseArgs requires a protected target identity and keeps the token in env", () => {
  const options = parseArgs([], {
    GITHUB_REPOSITORY: OPTIONS.repository,
    GITHUB_TOKEN: OPTIONS.token,
    TARGET_SHA,
  });
  assert.equal(options.ref, "main");
  assert.equal(options.sha, TARGET_SHA);
  assert.equal(options.token, OPTIONS.token);
  assert.throws(
    () => parseArgs(["--token", "secret"], {}),
    /Unknown option --token/,
  );
});

test("accepts an exact protected-main merge authored by the current solo admin without reviews", async () => {
  const calls = [];
  const result = await verifyProductionReleaseProvenance(OPTIONS, {
    fetchImpl: async (url) => {
      calls.push(new URL(url).pathname);
      return validRoute(url);
    },
  });

  assert.deepEqual(result, {
    pullRequestNumber: 57,
    pullRequestHeadSha: HEAD_SHA,
    soloReleaseOwner: OWNER,
  });
  assert.equal(calls.length, 4);
  assert.equal(
    calls.some((path) => path.endsWith("/reviews")),
    false,
  );
});

test("rejects an unprotected or stale main branch before evaluating pull requests", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const result = validRoute(url);
        if (new URL(url).pathname.endsWith("/branches/main")) {
          return response(200, {
            name: "main",
            protected: false,
            commit: { sha: TARGET_SHA },
          });
        }
        return result;
      },
    }),
    /not reported as a protected branch/,
  );

  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const result = validRoute(url);
        if (new URL(url).pathname.endsWith("/branches/main")) {
          return response(200, {
            name: "main",
            protected: true,
            commit: { sha: "c".repeat(40) },
          });
        }
        return result;
      },
    }),
    /no longer points to the requested SHA/,
  );
});

test("rejects a target that is not the unique exact merged pull request", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith(`/commits/${TARGET_SHA}/pulls`)) {
          return response(200, [
            mergedPull({ merge_commit_sha: "d".repeat(40) }),
          ]);
        }
        return validRoute(url);
      },
    }),
    /exact merge_commit_sha of exactly one merged pull request/,
  );

  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith(`/commits/${TARGET_SHA}/pulls`)) {
          return response(200, [mergedPull(), mergedPull({ number: 58 })]);
        }
        return validRoute(url);
      },
    }),
    /exact merge_commit_sha of exactly one merged pull request/,
  );
});

test("rejects a noncanonical repository owner before any API request", async () => {
  let calls = 0;
  await assert.rejects(
    verifyProductionReleaseProvenance(
      { ...OPTIONS, repository: "invalid_owner/school-sis" },
      {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("No API call is allowed for an invalid owner.");
        },
      },
    ),
    /repository owner is not a canonical GitHub login/,
  );
  assert.equal(calls, 0);
});

test("rejects a merged pull request not authored by the repository owner", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith(`/commits/${TARGET_SHA}/pulls`)) {
          return response(200, [
            mergedPull({ user: { login: "another-author" } }),
          ]);
        }
        return validRoute(url);
      },
    }),
    /must be authored by the solo repository owner/,
  );
});

test("rejects a merged pull request whose head repository is a fork", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith(`/commits/${TARGET_SHA}/pulls`)) {
          return response(200, [
            mergedPull({
              head: {
                sha: HEAD_SHA,
                repo: { full_name: `${OWNER}/school-sis-fork` },
              },
            }),
          ]);
        }
        return validRoute(url);
      },
    }),
    /exact merge_commit_sha of exactly one merged pull request/,
  );
});

test("rejects a solo release owner whose current repository permission is not exact admin", async () => {
  for (const permission of [
    { permission: "write", user: { login: OWNER } },
    { permission: "admin", user: { login: "different-owner" } },
  ]) {
    await assert.rejects(
      verifyProductionReleaseProvenance(OPTIONS, {
        fetchImpl: async (url) => {
          if (
            new URL(url).pathname.endsWith(`/collaborators/${OWNER}/permission`)
          ) {
            return response(200, permission);
          }
          return validRoute(url);
        },
      }),
      /must still have exact admin permission/,
    );
  }
});

test("rejects another push-capable collaborator", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        if (new URL(url).pathname.endsWith("/collaborators")) {
          return response(200, [
            {
              login: OWNER,
              permissions: { push: true, maintain: true, admin: true },
            },
            {
              login: "another-writer",
              permissions: { push: true, maintain: false, admin: false },
            },
          ]);
        }
        return validRoute(url);
      },
    }),
    /exactly one push-capable collaborator/,
  );
});

test("rejects malformed merged pull-request metadata", async () => {
  for (const pull of [
    mergedPull({ head: { sha: "short" } }),
    mergedPull({ merged_at: "not-a-timestamp" }),
    mergedPull({ number: 0 }),
  ]) {
    await assert.rejects(
      verifyProductionReleaseProvenance(OPTIONS, {
        fetchImpl: async (url) => {
          const path = new URL(url).pathname;
          if (path.endsWith(`/commits/${TARGET_SHA}/pulls`)) {
            return response(200, [pull]);
          }
          return validRoute(url);
        },
      }),
      /invalid (?:head SHA|merge timestamp|number)/,
    );
  }
});

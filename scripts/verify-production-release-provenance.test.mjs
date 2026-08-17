import assert from "node:assert/strict";
import test from "node:test";

import {
  latestDecisiveReviews,
  parseArgs,
  verifyProductionReleaseProvenance,
} from "./verify-production-release-provenance.mjs";

const TARGET_SHA = "a".repeat(40);
const HEAD_SHA = "b".repeat(40);
const OPTIONS = {
  repository: "singhaditya21/school-sis",
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
    return response(200, [
      {
        number: 57,
        state: "closed",
        merged_at: "2026-08-17T08:00:00Z",
        merge_commit_sha: TARGET_SHA,
        base: {
          ref: "main",
          repo: { full_name: OPTIONS.repository },
        },
        head: { sha: HEAD_SHA },
        user: { login: "author" },
      },
    ]);
  }
  if (path.endsWith("/pulls/57/reviews")) {
    return response(200, [
      {
        id: 10,
        state: "APPROVED",
        commit_id: HEAD_SHA,
        submitted_at: "2026-08-17T07:55:00Z",
        user: { login: "maintainer" },
      },
    ]);
  }
  if (path.endsWith("/collaborators/maintainer/permission")) {
    return response(200, {
      permission: "write",
      role_name: "write",
      user: { login: "maintainer" },
    });
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

test("latest decisive review must approve the exact current PR head", () => {
  const reviews = latestDecisiveReviews(
    [
      {
        id: 1,
        state: "APPROVED",
        commit_id: HEAD_SHA,
        submitted_at: "2026-08-17T07:00:00Z",
        user: { login: "maintainer" },
      },
      {
        id: 2,
        state: "COMMENTED",
        commit_id: HEAD_SHA,
        submitted_at: "2026-08-17T07:05:00Z",
        user: { login: "maintainer" },
      },
      {
        id: 3,
        state: "CHANGES_REQUESTED",
        commit_id: HEAD_SHA,
        submitted_at: "2026-08-17T07:10:00Z",
        user: { login: "maintainer" },
      },
      {
        id: 4,
        state: "APPROVED",
        commit_id: "c".repeat(40),
        submitted_at: "2026-08-17T07:20:00Z",
        user: { login: "other" },
      },
    ],
    HEAD_SHA,
  );
  assert.equal(reviews.size, 1);
  assert.equal(reviews.get("maintainer").state, "CHANGES_REQUESTED");
});

test("accepts protected main only with an exact merged PR and current writer approval", async () => {
  const calls = [];
  const result = await verifyProductionReleaseProvenance(OPTIONS, {
    fetchImpl: async (url) => {
      calls.push(url);
      return validRoute(url);
    },
  });

  assert.deepEqual(result, {
    pullRequestNumber: 57,
    pullRequestHeadSha: HEAD_SHA,
    approver: "maintainer",
  });
  assert.equal(calls.length, 4);
});

test("rejects an unprotected branch before evaluating pull requests", async () => {
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
});

test("rejects a target that is not the exact merge commit", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith(`/commits/${TARGET_SHA}/pulls`)) {
          return response(200, [
            {
              number: 57,
              state: "closed",
              merged_at: "2026-08-17T08:00:00Z",
              merge_commit_sha: "d".repeat(40),
              base: {
                ref: "main",
                repo: { full_name: OPTIONS.repository },
              },
              head: { sha: HEAD_SHA },
              user: { login: "author" },
            },
          ]);
        }
        return validRoute(url);
      },
    }),
    /exact merge_commit_sha/,
  );
});

test("rejects stale approvals and collaborators without release permission", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith("/pulls/57/reviews")) {
          return response(200, [
            {
              id: 10,
              state: "APPROVED",
              commit_id: "e".repeat(40),
              submitted_at: "2026-08-17T07:55:00Z",
              user: { login: "maintainer" },
            },
          ]);
        }
        return validRoute(url);
      },
    }),
    /No latest APPROVED review on the exact pull-request head SHA/,
  );

  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith("/collaborators/maintainer/permission")) {
          return response(200, {
            permission: "read",
            role_name: "read",
            user: { login: "maintainer" },
          });
        }
        return validRoute(url);
      },
    }),
    /current write, maintain, or admin collaborator/,
  );
});

test("rejects unresolved changes and post-merge approvals on the exact head", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        if (new URL(url).pathname.endsWith("/pulls/57/reviews")) {
          return response(200, [
            {
              id: 10,
              state: "APPROVED",
              commit_id: HEAD_SHA,
              submitted_at: "2026-08-17T07:55:00Z",
              user: { login: "maintainer" },
            },
            {
              id: 11,
              state: "CHANGES_REQUESTED",
              commit_id: HEAD_SHA,
              submitted_at: "2026-08-17T07:56:00Z",
              user: { login: "reviewer" },
            },
          ]);
        }
        return validRoute(url);
      },
    }),
    /latest CHANGES_REQUESTED review/,
  );

  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        if (new URL(url).pathname.endsWith("/pulls/57/reviews")) {
          return response(200, [
            {
              id: 10,
              state: "APPROVED",
              commit_id: HEAD_SHA,
              submitted_at: "2026-08-17T08:01:00Z",
              user: { login: "maintainer" },
            },
          ]);
        }
        return validRoute(url);
      },
    }),
    /No latest APPROVED review on the exact pull-request head SHA/,
  );
});

test("rejects a PR author's self-approval even when the author can write", async () => {
  await assert.rejects(
    verifyProductionReleaseProvenance(OPTIONS, {
      fetchImpl: async (url) => {
        const path = new URL(url).pathname;
        if (path.endsWith("/pulls/57/reviews")) {
          return response(200, [
            {
              id: 10,
              state: "APPROVED",
              commit_id: HEAD_SHA,
              submitted_at: "2026-08-17T07:55:00Z",
              user: { login: "AUTHOR" },
            },
          ]);
        }
        if (path.endsWith("/collaborators/AUTHOR/permission")) {
          throw new Error(
            "Self-approval must be rejected before permission lookup.",
          );
        }
        return validRoute(url);
      },
    }),
    /collaborator different from the pull-request author/,
  );
});

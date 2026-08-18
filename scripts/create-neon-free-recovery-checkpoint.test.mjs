import assert from "node:assert/strict";
import test from "node:test";

import {
  createNeonFreeRecoveryCheckpoint,
  parseArgs,
} from "./create-neon-free-recovery-checkpoint.mjs";

const SHA = "a".repeat(40);
const TOKEN = `neon-${"x".repeat(32)}`;
const PROJECT_ID = "wispy-leaf-40556376";
const ROOT_ID = "br-hidden-union-ao8rd4ha";
const RUN_ID = "32030507052";
const CHECKPOINT_NAME = `recovery/pre-migrate-${SHA.slice(0, 12)}-${RUN_ID}`;
const EXPIRES_AT = "2099-08-24T12:00:00Z";
const OPTIONS = {
  help: false,
  projectId: PROJECT_ID,
  productionBranchId: ROOT_ID,
  sha: SHA,
  runId: RUN_ID,
  checkpointName: CHECKPOINT_NAME,
  expiresAt: EXPIRES_AT,
  token: TOKEN,
  attempts: 2,
  delayMs: 1,
  requestTimeoutMs: 1_000,
};

function root(overrides = {}) {
  return {
    id: ROOT_ID,
    project_id: PROJECT_ID,
    name: "production",
    parent_id: null,
    default: true,
    protected: false,
    current_state: "ready",
    pending_state: null,
    ...overrides,
  };
}

function checkpoint(
  id = "br-free-recovery-new",
  name = CHECKPOINT_NAME,
  overrides = {},
) {
  return {
    id,
    project_id: PROJECT_ID,
    name,
    parent_id: ROOT_ID,
    default: false,
    protected: false,
    current_state: "ready",
    pending_state: null,
    expires_at: EXPIRES_AT,
    ...overrides,
  };
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider({
  branches = [root()],
  endpoints = {},
  ambiguousCreate = false,
  ambiguousDelete = false,
  retainDeletedBranch = false,
  checkpointReadyAfterGets = 0,
} = {}) {
  const state = {
    branches: new Map(branches.map((branch) => [branch.id, branch])),
    endpoints: new Map(
      Object.entries(endpoints).map(([id, values]) => [id, values]),
    ),
    calls: [],
    deleted: [],
    postBodies: [],
    postCount: 0,
    deleteCount: 0,
    checkpointGetCount: 0,
  };

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? "GET";
    state.calls.push({ method, url: url.href });
    const projectPrefix = `/api/v2/projects/${PROJECT_ID}`;
    assert.equal(url.pathname.startsWith(projectPrefix), true);
    const path = url.pathname.slice(projectPrefix.length);

    if (method === "POST" && path === "/branches") {
      state.postCount += 1;
      const body = JSON.parse(init.body);
      state.postBodies.push(body);
      const created = checkpoint(
        "br-free-recovery-new",
        CHECKPOINT_NAME,
        checkpointReadyAfterGets > 0
          ? { current_state: "init", pending_state: "ready" }
          : {},
      );
      state.branches.set(created.id, created);
      state.endpoints.set(created.id, []);
      if (ambiguousCreate) {
        throw new Error("connection reset after branch creation committed");
      }
      return jsonResponse({ branch: created, operations: [] }, 201);
    }

    if (method === "GET" && path === "/branches") {
      return jsonResponse({ branches: [...state.branches.values()] });
    }

    const endpointMatch = path.match(/^\/branches\/([^/]+)\/endpoints$/);
    if (method === "GET" && endpointMatch) {
      const branchId = decodeURIComponent(endpointMatch[1]);
      return jsonResponse({ endpoints: state.endpoints.get(branchId) ?? [] });
    }

    const branchMatch = path.match(/^\/branches\/([^/]+)$/);
    if (branchMatch) {
      const branchId = decodeURIComponent(branchMatch[1]);
      if (method === "GET") {
        let branch = state.branches.get(branchId);
        if (branchId === "br-free-recovery-new" && branch) {
          state.checkpointGetCount += 1;
          if (state.checkpointGetCount > checkpointReadyAfterGets) {
            branch = { ...branch, current_state: "ready", pending_state: null };
            state.branches.set(branchId, branch);
          }
        }
        return branch
          ? jsonResponse({ branch })
          : jsonResponse({ message: "not found" }, 404);
      }
      if (method === "DELETE") {
        state.deleteCount += 1;
        state.deleted.push(branchId);
        if (!retainDeletedBranch) {
          state.branches.delete(branchId);
          state.endpoints.delete(branchId);
        }
        if (ambiguousDelete) {
          throw new Error("connection reset after branch deletion committed");
        }
        return jsonResponse({ branch: { id: branchId } }, 200);
      }
    }

    throw new Error(`Unexpected ${method} ${url.href}`);
  };

  return { fetchImpl, state };
}

test("parseArgs derives the deterministic name and keeps the API key environment-only", () => {
  const parsed = parseArgs(
    [
      "--project-id",
      PROJECT_ID,
      "--production-branch-id",
      ROOT_ID,
      "--sha",
      SHA,
      "--run-id",
      RUN_ID,
      "--expires-at",
      EXPIRES_AT,
    ],
    { NEON_API_KEY: TOKEN },
  );
  assert.equal(parsed.checkpointName, CHECKPOINT_NAME);
  assert.equal(parsed.token, TOKEN);
  assert.throws(
    () => parseArgs(["--api-key", TOKEN], { NEON_API_KEY: TOKEN }),
    /Unknown option --api-key/,
  );
});

test("creates and proves a no-endpoint checkpoint before deleting only an old workflow branch", async () => {
  const old = checkpoint(
    "br-free-recovery-old",
    `recovery/pre-migrate-${"b".repeat(12)}-1234`,
    { expires_at: "2099-08-23T12:00:00Z" },
  );
  const manual = checkpoint("br-manual-backup", "manual/operator-copy");
  const preview = checkpoint("br-preview-59", "preview/pr-59");
  const fake = provider({ branches: [root(), old, manual, preview] });

  const result = await createNeonFreeRecoveryCheckpoint(OPTIONS, {
    fetchImpl: fake.fetchImpl,
    sleep: async () => {},
  });

  assert.deepEqual(result, {
    checkpointId: "br-free-recovery-new",
    checkpointName: CHECKPOINT_NAME,
    sourceBranchId: ROOT_ID,
    expiresAt: EXPIRES_AT,
    endpointCount: 0,
  });
  assert.equal(fake.state.postCount, 1);
  assert.deepEqual(fake.state.postBodies, [
    {
      branch: {
        name: CHECKPOINT_NAME,
        parent_id: ROOT_ID,
        expires_at: EXPIRES_AT,
      },
    },
  ]);
  assert.deepEqual(fake.state.deleted, [old.id]);
  assert.equal(fake.state.branches.has(manual.id), true);
  assert.equal(fake.state.branches.has(preview.id), true);
  assert.equal(fake.state.branches.has("br-free-recovery-new"), true);
  assert.equal(
    fake.state.calls.findIndex(
      (call) =>
        call.method === "GET" &&
        call.url.includes("br-free-recovery-new/endpoints"),
    ) <
      fake.state.calls.findIndex(
        (call) => call.method === "DELETE" && call.url.includes(old.id),
      ),
    true,
  );
});

test("reconciles an ambiguous create POST by exact name without retrying", async () => {
  const fake = provider({ ambiguousCreate: true });
  const result = await createNeonFreeRecoveryCheckpoint(OPTIONS, {
    fetchImpl: fake.fetchImpl,
    sleep: async () => {},
  });
  assert.equal(result.checkpointId, "br-free-recovery-new");
  assert.equal(fake.state.postCount, 1);
});

test("polls a newly created checkpoint until its state is ready", async () => {
  const fake = provider({ checkpointReadyAfterGets: 1 });
  const result = await createNeonFreeRecoveryCheckpoint(
    { ...OPTIONS, attempts: 3 },
    {
      fetchImpl: fake.fetchImpl,
      sleep: async () => {},
    },
  );
  assert.equal(result.checkpointId, "br-free-recovery-new");
  assert.equal(fake.state.postCount, 1);
  assert.equal(fake.state.checkpointGetCount >= 2, true);
});

test("reuses an already exact checkpoint without another POST", async () => {
  const existing = checkpoint();
  const fake = provider({ branches: [root(), existing] });
  const result = await createNeonFreeRecoveryCheckpoint(OPTIONS, {
    fetchImpl: fake.fetchImpl,
    sleep: async () => {},
  });
  assert.equal(result.checkpointId, existing.id);
  assert.equal(fake.state.postCount, 0);
  assert.equal(fake.state.deleteCount, 0);
});

test("rejects a protected or non-default production root before mutation", async () => {
  for (const invalidRoot of [
    root({ protected: true }),
    root({ default: false }),
    root({ parent_id: "br-parent" }),
  ]) {
    const fake = provider({ branches: [invalidRoot] });
    await assert.rejects(
      createNeonFreeRecoveryCheckpoint(OPTIONS, {
        fetchImpl: fake.fetchImpl,
        sleep: async () => {},
      }),
      /exact unprotected Free default root production branch/,
    );
    assert.equal(fake.state.postCount, 0);
    assert.equal(fake.state.deleteCount, 0);
  }
});

test("rejects a checkpoint that has a compute endpoint", async () => {
  const existing = checkpoint();
  const fake = provider({
    branches: [root(), existing],
    endpoints: { [existing.id]: [{ id: "ep-not-allowed" }] },
  });
  await assert.rejects(
    createNeonFreeRecoveryCheckpoint(OPTIONS, {
      fetchImpl: fake.fetchImpl,
      sleep: async () => {},
    }),
    /must not have a compute endpoint/,
  );
  assert.equal(fake.state.postCount, 0);
  assert.equal(fake.state.deleteCount, 0);
});

test("never deletes a workflow-looking branch whose exact identity is invalid", async () => {
  const suspicious = checkpoint(
    "br-suspicious-recovery",
    `recovery/pre-migrate-${"b".repeat(12)}-1234`,
    { parent_id: "br-somewhere-else" },
  );
  const fake = provider({ branches: [root(), suspicious] });
  await assert.rejects(
    createNeonFreeRecoveryCheckpoint(OPTIONS, {
      fetchImpl: fake.fetchImpl,
      sleep: async () => {},
    }),
    /does not have the exact workflow-owned identity/,
  );
  assert.equal(fake.state.postCount, 0);
  assert.equal(fake.state.deleteCount, 0);
});

test("reconciles an ambiguous deletion and never retries DELETE", async () => {
  const old = checkpoint(
    "br-free-recovery-old",
    `recovery/pre-migrate-${"b".repeat(12)}-1234`,
  );
  const fake = provider({ branches: [root(), old], ambiguousDelete: true });
  await createNeonFreeRecoveryCheckpoint(OPTIONS, {
    fetchImpl: fake.fetchImpl,
    sleep: async () => {},
  });
  assert.equal(fake.state.deleteCount, 1);
  assert.deepEqual(fake.state.deleted, [old.id]);
});

test("fails closed when an old checkpoint deletion cannot be proven", async () => {
  const old = checkpoint(
    "br-free-recovery-old",
    `recovery/pre-migrate-${"b".repeat(12)}-1234`,
  );
  const fake = provider({ branches: [root(), old], retainDeletedBranch: true });
  await assert.rejects(
    createNeonFreeRecoveryCheckpoint(OPTIONS, {
      fetchImpl: fake.fetchImpl,
      sleep: async () => {},
    }),
    /deletion was not proven/,
  );
  assert.equal(fake.state.deleteCount, 1);
  assert.equal(fake.state.branches.has("br-free-recovery-new"), true);
});

test("accepts only an explicit 404 as proof that a deleted branch is absent", async () => {
  const old = checkpoint(
    "br-free-recovery-old",
    `recovery/pre-migrate-${"b".repeat(12)}-1234`,
  );
  const fake = provider({ branches: [root(), old] });
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    if (
      (init.method ?? "GET") === "GET" &&
      fake.state.deleteCount > 0 &&
      url.pathname.endsWith(`/branches/${old.id}`)
    ) {
      return jsonResponse({});
    }
    return fake.fetchImpl(input, init);
  };

  await assert.rejects(
    createNeonFreeRecoveryCheckpoint(OPTIONS, {
      fetchImpl,
      sleep: async () => {},
    }),
    /malformed branch object/,
  );
  assert.equal(fake.state.deleteCount, 1);
  assert.equal(fake.state.branches.has("br-free-recovery-new"), true);
});

test("fails before POST when all ten Free branches are occupied", async () => {
  const branches = [root()];
  for (let index = 1; index < 10; index += 1) {
    branches.push(checkpoint(`br-manual-${index}`, `manual/copy-${index}`));
  }
  const fake = provider({ branches });
  await assert.rejects(
    createNeonFreeRecoveryCheckpoint(OPTIONS, {
      fetchImpl: fake.fetchImpl,
      sleep: async () => {},
    }),
    /Free branch capacity is exhausted \(10\/10\)/,
  );
  assert.equal(fake.state.postCount, 0);
  assert.equal(fake.state.deleteCount, 0);
});

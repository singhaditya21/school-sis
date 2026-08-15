import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBaseUrl,
  validateHealthPayload,
  validateReadyPayload,
  verifyDeployment,
  verifyVercelProtection,
} from "./verify-deployment.mjs";

const SHA = "a".repeat(40);

function healthPayload(overrides = {}) {
  return {
    status: "ok",
    service: "school-sis-web",
    timestamp: "2026-08-15T00:00:00.000Z",
    commit: SHA,
    ...overrides,
  };
}

function readyPayload(overrides = {}) {
  return {
    status: "ready",
    generatedAt: "2026-08-15T00:00:00.000Z",
    commit: SHA,
    database: { status: "healthy", latencyMs: 1 },
    migrations: { status: "healthy", reason: "current" },
    rateLimit: { status: "healthy" },
    ...overrides,
  };
}

test("normalizeBaseUrl rejects credentials, paths, and HTTP by default", () => {
  assert.equal(
    normalizeBaseUrl("https://example.vercel.app/"),
    "https://example.vercel.app",
  );
  assert.throws(
    () => normalizeBaseUrl("https://user@example.com"),
    /credentials/,
  );
  assert.throws(
    () => normalizeBaseUrl("https://example.com/path"),
    /without a path/,
  );
  assert.throws(() => normalizeBaseUrl("http://localhost:3000"), /HTTPS/);
  assert.equal(
    normalizeBaseUrl("http://localhost:3000", true),
    "http://localhost:3000",
  );
});

test("health validation requires service identity and an exact release SHA", () => {
  assert.deepEqual(validateHealthPayload(healthPayload(), SHA), []);
  assert.match(
    validateHealthPayload(healthPayload({ commit: "b".repeat(40) }), SHA).join(
      ";",
    ),
    /commit/,
  );
});

test("readiness validation fails closed on degraded dependencies or stale migrations", () => {
  assert.deepEqual(validateReadyPayload(readyPayload(), SHA), []);
  const problems = validateReadyPayload(
    readyPayload({
      status: "not_ready",
      migrations: { status: "unhealthy", reason: "migration_count_mismatch" },
      rateLimit: { status: "degraded" },
    }),
    SHA,
  );
  assert.equal(problems.length, 4);
  assert.match(problems.join(";"), /strictly ready/);
  assert.match(problems.join(";"), /migration readiness/);
  assert.match(problems.join(";"), /migration ledger/);
  assert.match(problems.join(";"), /rate-limit readiness/);
});

test("verifyVercelProtection requires the exact Vercel Authentication challenge", async () => {
  await verifyVercelProtection(
    "https://example.vercel.app/api/health",
    1000,
    async () =>
      new Response(null, {
        status: 302,
        headers: {
          location:
            "https://vercel.com/sso-api?url=https%3A%2F%2Fexample.vercel.app%2Fapi%2Fhealth",
          server: "Vercel",
          "x-vercel-id": "iad1::example",
        },
      }),
  );

  await assert.rejects(
    verifyVercelProtection(
      "https://example.vercel.app/api/health",
      1000,
      async () =>
        new Response(JSON.stringify(healthPayload()), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
    /publicly reachable/,
  );
  await assert.rejects(
    verifyVercelProtection(
      "https://example.vercel.app/api/health",
      1000,
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            location: "https://attacker.example/sso-api",
            server: "Vercel",
            "x-vercel-id": "iad1::example",
          },
        }),
    ),
    /expected Vercel Authentication challenge/,
  );
});

test("verifyDeployment proves protection, then sends secrets only as headers", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init.headers });
    if (!init.headers["x-vercel-protection-bypass"]) {
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://vercel.com/sso-api?url=${encodeURIComponent(url)}`,
          server: "Vercel",
          "x-vercel-id": "iad1::example",
        },
      });
    }
    if (url.endsWith("/login")) {
      return new Response(`<html><body>${"ready".repeat(30)}</body></html>`, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const payload = url.endsWith("/api/health")
      ? healthPayload()
      : readyPayload();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const result = await verifyDeployment(
    {
      baseUrl: "https://example.vercel.app",
      expectedSha: SHA,
      metricsToken: "m".repeat(32),
      bypassSecret: "b".repeat(16),
      requireBypass: true,
      attempts: 1,
      delayMs: 1,
      requestTimeoutMs: 1000,
    },
    { fetchImpl, sleep: async () => {} },
  );

  assert.equal(result.sha, SHA);
  assert.equal(seen.length, 4);
  assert.equal(seen[0].headers.Authorization, undefined);
  assert.equal(seen[0].headers["x-vercel-protection-bypass"], undefined);
  assert.equal(seen[1].headers.Authorization, undefined);
  assert.equal(seen[2].headers.Authorization, `Bearer ${"m".repeat(32)}`);
  assert.equal(seen[3].headers.Authorization, undefined);
  assert.equal(seen[1].headers["x-vercel-protection-bypass"], "b".repeat(16));
});

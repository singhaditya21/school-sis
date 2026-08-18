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
const TENANT_CONTEXT = {
  audience: "production:project:branch",
  keyId: "production-v1",
};

function healthPayload(overrides = {}) {
  return {
    status: "ok",
    service: "school-sis-web",
    timestamp: "2026-08-15T00:00:00.000Z",
    commit: SHA,
    region: "sin1",
    ...overrides,
  };
}

function readyPayload(overrides = {}) {
  return {
    status: "ready",
    generatedAt: "2026-08-15T00:00:00.000Z",
    commit: SHA,
    database: { status: "healthy", latencyMs: 1 },
    integrationConfiguration: {
      status: "healthy",
      enforced: true,
      mockConnectionCount: 0,
    },
    migrations: { status: "healthy", reason: "current" },
    platformDatabase: {
      status: "healthy",
      role: "school_sis_platform",
      bypassVerified: true,
    },
    rateLimit: { status: "healthy" },
    tenantContext: {
      status: "healthy",
      role: "school_sis_runtime",
      bypassVerified: false,
      ...TENANT_CONTEXT,
    },
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

test("health validation requires service identity, release SHA, and exact region", () => {
  assert.deepEqual(validateHealthPayload(healthPayload(), SHA, "sin1"), []);
  assert.match(
    validateHealthPayload(
      healthPayload({ commit: "b".repeat(40) }),
      SHA,
      "sin1",
    ).join(";"),
    /commit/,
  );
  assert.match(
    validateHealthPayload(healthPayload({ region: "iad1" }), SHA, "sin1").join(
      ";",
    ),
    /region/,
  );
});

test("readiness validation fails closed on degraded dependencies or stale migrations", () => {
  assert.deepEqual(
    validateReadyPayload(readyPayload(), SHA, TENANT_CONTEXT),
    [],
  );
  const problems = validateReadyPayload(
    readyPayload({
      status: "not_ready",
      migrations: { status: "unhealthy", reason: "migration_count_mismatch" },
      rateLimit: { status: "degraded" },
      platformDatabase: {
        status: "unhealthy",
        role: "school_sis_runtime",
        bypassVerified: false,
      },
      tenantContext: {
        status: "healthy",
        role: "school_sis_platform",
        bypassVerified: true,
        ...TENANT_CONTEXT,
      },
    }),
    SHA,
    TENANT_CONTEXT,
  );
  assert.equal(problems.length, 9);
  assert.match(problems.join(";"), /strictly ready/);
  assert.match(problems.join(";"), /migration readiness/);
  assert.match(problems.join(";"), /migration ledger/);
  assert.match(problems.join(";"), /rate-limit readiness/);
  assert.match(problems.join(";"), /platform database readiness/);
  assert.match(problems.join(";"), /platform database role/);
  assert.match(problems.join(";"), /platform database bypass/);
  assert.match(problems.join(";"), /tenant database role/);
  assert.match(problems.join(";"), /unexpectedly permits RLS bypass/);
});

test("readiness validation requires an enforced, mock-free integration audit", () => {
  const problems = validateReadyPayload(
    readyPayload({
      integrationConfiguration: {
        status: "unhealthy",
        enforced: false,
        mockConnectionCount: 2,
      },
    }),
    SHA,
    TENANT_CONTEXT,
  );

  assert.deepEqual(problems, [
    "integration-configuration readiness is not healthy",
    "production integration-configuration audit was not enforced",
    "production mock integration connections remain configured",
  ]);
  assert.match(
    validateReadyPayload(
      readyPayload({ integrationConfiguration: undefined }),
      SHA,
      TENANT_CONTEXT,
    ).join(";"),
    /integration-configuration readiness|audit was not enforced|mock integration connections/,
  );
});

test("verifyVercelProtection requires the exact Vercel Authentication challenge", async () => {
  const protectedUrl = "https://example.vercel.app/api/health";
  await verifyVercelProtection(
    protectedUrl,
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

  await verifyVercelProtection(
    protectedUrl,
    1000,
    async () =>
      new Response(
        JSON.stringify({
          error: { code: "401", message: "Protected deployment" },
          protection: {
            auto_vercel_auth_redirect: true,
            password_enabled: false,
            vercel_auth_enabled: true,
            vercel_auth_callback: `https://vercel.com/sso-api?url=${encodeURIComponent(protectedUrl)}&nonce=example`,
          },
        }),
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            server: "Vercel",
            "x-vercel-id": "iad1::example",
          },
        },
      ),
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
  await assert.rejects(
    verifyVercelProtection(
      protectedUrl,
      1000,
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            location:
              "https://vercel.com/sso-api?url=https%3A%2F%2Fother.vercel.app%2Fapi%2Fhealth",
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
      expectedTenantContextAudience: TENANT_CONTEXT.audience,
      expectedTenantContextKeyId: TENANT_CONTEXT.keyId,
      expectedRegion: "sin1",
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

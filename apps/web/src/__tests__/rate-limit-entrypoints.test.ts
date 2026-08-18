import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function repositorySource(relativePath: string): string {
  return fs.readFileSync(path.resolve(ROOT, "../..", relativePath), "utf8");
}

describe("strict rate-limit entrypoint policy", () => {
  it.each([
    "src/app/api/leads/route.ts",
    "src/app/api/security/csp-report/route.ts",
    "src/lib/actions/onboarding.ts",
  ])("marks public writes as strict fallback callers: %s", (file) => {
    const contents = source(file);
    expect(contents).toContain("endpointClass: 'public-write'");
    expect(contents).toContain("degradedMaxAttempts: 1");
  });

  it.each([
    "src/app/api/chat/route.ts",
    "src/app/api/copilot/route.ts",
    "src/app/api/agents/[agent]/query-async/route.ts",
  ])(
    "rate limits remaining AI ingress before provider forwarding: %s",
    (file) => {
      const contents = source(file);
      expect(contents).toContain("consumeRateLimit");
      expect(contents).toContain("endpointClass: 'ai'");
      expect(contents).toContain("degradedMaxAttempts: 1");
      expect(contents).toContain("status: 429");
    },
  );

  it("fails readiness closed on rate-limit degradation and exposes metrics", () => {
    const readiness = source("src/app/api/ready/route.ts");
    const metrics = source("src/lib/observability/metrics.ts");

    expect(readiness).toContain("getRateLimitHealth");
    expect(readiness).toContain('rateLimit.status === "healthy"');
    expect(readiness).toContain("status: ready ? 200 : 503");
    expect(metrics).toContain("initializeRateLimitMetrics");
  });

  it("ships dashboard and alert definitions for every rate-limit failure signal", () => {
    const alerts = repositorySource(
      "ops/observability/prometheus/rate-limit-alerts.yml",
    );
    const dashboard = JSON.parse(
      repositorySource("ops/observability/grafana/rate-limit-dashboard.json"),
    );
    const dashboardJson = JSON.stringify(dashboard);

    for (const metric of [
      "school_sis_rate_limit_decisions_total",
      "school_sis_rate_limit_backend_failures_total",
      "school_sis_rate_limit_backend_healthy",
      "school_sis_rate_limit_fallback_capacity_exhaustions_total",
    ]) {
      expect(alerts + dashboardJson).toContain(metric);
    }
    expect(alerts).toContain("SchoolSisRateLimitBackendDegraded");
    expect(alerts).toContain("SchoolSisRateLimitFallbackCapacityExhausted");
  });

  it("consumes the login attempt before authentication without a second failure mutation", () => {
    const contents = source("src/lib/actions/auth.ts");

    expect(contents).toContain("consumeLoginRateLimit");
    expect(contents.indexOf("consumeLoginRateLimit(email)")).toBeLessThan(
      contents.indexOf("compare(password"),
    );
    expect(contents).not.toContain("checkRateLimit");
    expect(contents).not.toContain("recordFailedAttempt");
  });
});

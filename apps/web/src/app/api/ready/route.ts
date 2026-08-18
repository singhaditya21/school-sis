import { NextResponse } from "next/server";
import { requireBearerServiceAuth } from "@/lib/auth/api";
import {
  getDatabaseHealth,
  getIntegrationConfigurationHealth,
  getMigrationHealth,
  getPlatformDatabaseHealth,
  getTenantContextHealth,
} from "@/lib/observability/snapshot";
import { getRateLimitHealth } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = requireBearerServiceAuth(request, "METRICS_TOKEN", {
    serviceName: "Readiness endpoint",
    required: process.env.NODE_ENV === "production",
  });
  if (authError) return authError;

  const [
    database,
    integrationConfiguration,
    migrations,
    platformDatabase,
    rateLimit,
    tenantContext,
  ] = await Promise.all([
    getDatabaseHealth(),
    getIntegrationConfigurationHealth(),
    getMigrationHealth(),
    getPlatformDatabaseHealth(),
    getRateLimitHealth(),
    getTenantContextHealth(),
  ]);
  const ready =
    database.status === "healthy" &&
    integrationConfiguration.status === "healthy" &&
    (process.env.NODE_ENV !== "production" ||
      (integrationConfiguration.enforced === true &&
        integrationConfiguration.mockConnectionCount === 0)) &&
    migrations.status === "healthy" &&
    platformDatabase.status === "healthy" &&
    rateLimit.status === "healthy" &&
    tenantContext.status === "healthy";
  const status = ready ? "ready" : "not_ready";

  return NextResponse.json(
    {
      status,
      generatedAt: new Date().toISOString(),
      commit:
        process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null,
      database,
      integrationConfiguration,
      migrations,
      platformDatabase,
      rateLimit,
      tenantContext,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

import { NextResponse } from "next/server";
import { requireBearerServiceAuth } from "@/lib/auth/api";
import {
  getDatabaseHealth,
  getMigrationHealth,
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

  const [database, migrations, rateLimit] = await Promise.all([
    getDatabaseHealth(),
    getMigrationHealth(),
    getRateLimitHealth(),
  ]);
  const ready =
    database.status === "healthy" &&
    migrations.status === "healthy" &&
    rateLimit.status === "healthy";
  const status = ready ? "ready" : "not_ready";

  return NextResponse.json(
    {
      status,
      generatedAt: new Date().toISOString(),
      commit:
        process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || null,
      database,
      migrations,
      rateLimit,
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

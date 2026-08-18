import {
  pool,
  RLS_BYPASS_JUSTIFICATIONS,
  runWithRlsBypass,
  runWithTenantContext,
} from "@/lib/db";
import type { QueryResult } from "pg";
import { EXPECTED_DATABASE_MIGRATIONS } from "@/generated/migration-manifest";
import {
  evaluateMigrationLedger,
  migrationCheckFailure,
  type AppliedMigration,
  type MigrationHealth,
} from "@/lib/observability/migration-health";

export type ComponentStatus = "healthy" | "degraded" | "unhealthy";

export type OperationalSnapshot = {
  status: ComponentStatus;
  generatedAt: string;
  database: {
    status: ComponentStatus;
    latencyMs: number | null;
  };
  jobs: {
    byStatus: Record<string, number>;
    deadLettered: number;
    failed: number;
    queued: number;
  };
  notifications: {
    byStatus: Record<string, number>;
    deadLettered: number;
    failed: number;
    queued: number;
  };
  incidents: {
    open: number;
    critical: number;
    bySeverity: Record<string, number>;
  };
  slo: {
    active: number;
    latestBreaches: number;
  };
};

function rowsToCountMap(
  rows: Array<{ key: string; count: number | string }>,
): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row.key, Number(row.count)]));
}

function statusFrom(
  snapshot: Omit<OperationalSnapshot, "status">,
): ComponentStatus {
  if (
    snapshot.database.status === "unhealthy" ||
    snapshot.incidents.critical > 0
  )
    return "unhealthy";
  if (
    snapshot.jobs.deadLettered > 0 ||
    snapshot.notifications.deadLettered > 0 ||
    snapshot.incidents.open > 0 ||
    snapshot.slo.latestBreaches > 0
  ) {
    return "degraded";
  }
  return "healthy";
}

export async function getDatabaseHealth(): Promise<{
  status: ComponentStatus;
  latencyMs: number | null;
}> {
  const startedAt = Date.now();
  try {
    await pool.query("SELECT 1");
    return { status: "healthy", latencyMs: Date.now() - startedAt };
  } catch {
    return { status: "unhealthy", latencyMs: null };
  }
}

const TENANT_CONTEXT_READINESS_TENANT = "00000000-0000-4000-8000-000000000000";

export type TenantContextHealth = {
  status: ComponentStatus;
  audience: string | null;
  bypassVerified: boolean;
  keyId: string | null;
  role: string | null;
};

export type PlatformDatabaseHealth = {
  status: ComponentStatus;
  role: string | null;
  bypassVerified: boolean;
};

export type IntegrationConfigurationHealth = {
  status: ComponentStatus;
  enforced: boolean;
  mockConnectionCount: number | null;
};

/**
 * Audits persisted integration configuration across every tenant. This belongs
 * in authenticated readiness, never process startup or unauthenticated
 * liveness, because reaching the database must not be a prerequisite for the
 * runtime to start and report that it is alive.
 */
export async function getIntegrationConfigurationHealth(): Promise<IntegrationConfigurationHealth> {
  if (process.env.NODE_ENV !== "production") {
    return {
      status: "healthy",
      enforced: false,
      mockConnectionCount: null,
    };
  }

  try {
    const result = await runWithRlsBypass<
      QueryResult<{ count: number | string }>
    >(RLS_BYPASS_JUSTIFICATIONS.PRODUCTION_INTEGRATION_AUDIT, () =>
      pool.query<{ count: number | string }>(
        `SELECT COUNT(*)::int AS count
           FROM integration_connections
           WHERE mode = 'MOCK' OR config ->> 'mock' = 'true'`,
      ),
    );
    const rawCount = result.rows[0]?.count;
    const mockConnectionCount =
      typeof rawCount === "number"
        ? rawCount
        : typeof rawCount === "string" && /^(?:0|[1-9]\d*)$/.test(rawCount)
          ? Number(rawCount)
          : Number.NaN;
    if (
      result.rows.length !== 1 ||
      !Number.isSafeInteger(mockConnectionCount) ||
      mockConnectionCount < 0
    ) {
      return {
        status: "unhealthy",
        enforced: true,
        mockConnectionCount: null,
      };
    }

    return {
      status: mockConnectionCount === 0 ? "healthy" : "unhealthy",
      enforced: true,
      mockConnectionCount,
    };
  } catch {
    return {
      status: "unhealthy",
      enforced: true,
      mockConnectionCount: null,
    };
  }
}

/** Proves the deployed platform credential reaches only the pinned bypass role. */
export async function getPlatformDatabaseHealth(): Promise<PlatformDatabaseHealth> {
  try {
    const result = await runWithRlsBypass<{
      rows: Array<{ bypassVerified: boolean; role: string }>;
    }>(
      RLS_BYPASS_JUSTIFICATIONS.PLATFORM_READINESS,
      () =>
        pool.query<{ bypassVerified: boolean; role: string }>(
          `SELECT
              current_user::text AS role,
              app_private.rls_bypass() AS "bypassVerified"`,
        ) as Promise<{
          rows: Array<{ bypassVerified: boolean; role: string }>;
        }>,
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      row?.role !== "school_sis_platform" ||
      row.bypassVerified !== true
    ) {
      return { status: "unhealthy", role: null, bypassVerified: false };
    }
    return {
      status: "healthy",
      role: row.role,
      bypassVerified: true,
    };
  } catch {
    return { status: "unhealthy", role: null, bypassVerified: false };
  }
}

/**
 * Proves that this exact runtime can sign a transaction-bound tenant context
 * which the connected database verifies. The synthetic UUID need not exist and
 * no tenant row is read or written.
 */
export async function getTenantContextHealth(): Promise<TenantContextHealth> {
  try {
    const result = await runWithTenantContext<{
      rows: Array<{
        audience: string;
        bypassVerified: boolean;
        keyId: string;
        role: string;
        verifiedTenantId: string | null;
      }>;
    }>(
      TENANT_CONTEXT_READINESS_TENANT,
      () =>
        pool.query<{
          audience: string;
          bypassVerified: boolean;
          keyId: string;
          role: string;
          verifiedTenantId: string | null;
        }>(
          `SELECT
              app_private.verified_tenant_id()::text AS "verifiedTenantId",
              current_user::text AS role,
              app_private.rls_bypass() AS "bypassVerified",
              current_setting('app.tenant_context_audience', true) AS audience,
              current_setting('app.tenant_context_key_id', true) AS "keyId"`,
        ) as Promise<{
          rows: Array<{
            audience: string;
            bypassVerified: boolean;
            keyId: string;
            role: string;
            verifiedTenantId: string | null;
          }>;
        }>,
    );
    const row = result.rows[0];
    if (
      result.rows.length !== 1 ||
      row?.verifiedTenantId !== TENANT_CONTEXT_READINESS_TENANT ||
      row.role !== "school_sis_runtime" ||
      row.bypassVerified !== false ||
      !row.audience ||
      !row.keyId
    ) {
      return {
        status: "unhealthy",
        audience: null,
        bypassVerified: false,
        keyId: null,
        role: null,
      };
    }
    return {
      status: "healthy",
      audience: row.audience,
      bypassVerified: false,
      keyId: row.keyId,
      role: row.role,
    };
  } catch {
    return {
      status: "unhealthy",
      audience: null,
      bypassVerified: false,
      keyId: null,
      role: null,
    };
  }
}

export async function getMigrationHealth(): Promise<MigrationHealth> {
  try {
    const tableResult = await pool.query<{ migrationTable: string | null }>(
      `SELECT to_regclass('drizzle.__drizzle_migrations')::text AS "migrationTable"`,
    );
    if (!tableResult.rows[0]?.migrationTable) {
      return evaluateMigrationLedger(EXPECTED_DATABASE_MIGRATIONS, null);
    }

    const ledger = await pool.query<{ hash: string; createdAt: string }>(
      `SELECT hash, created_at::text AS "createdAt"
       FROM drizzle.__drizzle_migrations
       ORDER BY created_at ASC, id ASC`,
    );
    return evaluateMigrationLedger(
      EXPECTED_DATABASE_MIGRATIONS,
      ledger.rows satisfies AppliedMigration[],
    );
  } catch {
    return migrationCheckFailure(EXPECTED_DATABASE_MIGRATIONS);
  }
}

export async function collectOperationalSnapshot(): Promise<OperationalSnapshot> {
  const database = await getDatabaseHealth();

  const query = async () => {
    const [
      jobsResult,
      notificationsResult,
      incidentsResult,
      sloDefinitionsResult,
      sloMeasurementsResult,
    ] = await Promise.all([
      pool.query<{ key: string; count: string }>(
        `SELECT status AS key, COUNT(*)::int AS count
         FROM background_jobs
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY status`,
      ),
      pool.query<{ key: string; count: string }>(
        `SELECT status AS key, COUNT(*)::int AS count
         FROM notification_outbox
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY status`,
      ),
      pool.query<{ key: string; count: string }>(
        `SELECT severity AS key, COUNT(*)::int AS count
         FROM sre_incidents
         WHERE status IN ('OPEN', 'ACKNOWLEDGED')
         GROUP BY severity`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM slo_definitions
         WHERE is_active = true`,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::int AS count
         FROM slo_measurements
         WHERE window_end >= NOW() - INTERVAL '24 hours'
           AND status IN ('BREACHING', 'BREACHED')`,
      ),
    ]);

    const jobsByStatus = rowsToCountMap(jobsResult.rows);
    const notificationsByStatus = rowsToCountMap(notificationsResult.rows);
    const incidentsBySeverity = rowsToCountMap(incidentsResult.rows);

    return {
      jobsByStatus,
      notificationsByStatus,
      incidentsBySeverity,
      activeSloCount: Number(sloDefinitionsResult.rows[0]?.count || 0),
      latestSloBreaches: Number(sloMeasurementsResult.rows[0]?.count || 0),
    };
  };

  const counts = await runWithRlsBypass(
    RLS_BYPASS_JUSTIFICATIONS.OPERATIONAL_SNAPSHOT,
    query,
  );
  const base = {
    generatedAt: new Date().toISOString(),
    database,
    jobs: {
      byStatus: counts.jobsByStatus,
      deadLettered: counts.jobsByStatus.DEAD_LETTER || 0,
      failed: counts.jobsByStatus.FAILED || 0,
      queued:
        (counts.jobsByStatus.QUEUED || 0) +
        (counts.jobsByStatus.SCHEDULED || 0),
    },
    notifications: {
      byStatus: counts.notificationsByStatus,
      deadLettered: counts.notificationsByStatus.DEAD_LETTER || 0,
      failed: counts.notificationsByStatus.FAILED || 0,
      queued:
        (counts.notificationsByStatus.PENDING || 0) +
        (counts.notificationsByStatus.QUEUED || 0),
    },
    incidents: {
      open: Object.values(counts.incidentsBySeverity).reduce(
        (sum, count) => sum + count,
        0,
      ),
      critical: counts.incidentsBySeverity.CRITICAL || 0,
      bySeverity: counts.incidentsBySeverity,
    },
    slo: {
      active: counts.activeSloCount,
      latestBreaches: counts.latestSloBreaches,
    },
  };

  return {
    status: statusFrom(base),
    ...base,
  };
}

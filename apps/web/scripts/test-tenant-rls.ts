import { createHmac, randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { resolveDatabaseConnectionOptions } from "../../../packages/api/src/db/ssl";

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "DATABASE_URL, DIRECT_URL, or DATABASE_URL_UNPOOLED is required for the tenant RLS integration test.",
  );
  process.exit(1);
}

const parsedConnection = new URL(connectionString);
if (
  [...parsedConnection.searchParams.keys()].some(
    (key) => key.toLowerCase() === "host",
  )
) {
  console.error(
    "Database URLs must not override the hostname through a host query parameter.",
  );
  process.exit(1);
}
const targetHost = parsedConnection.hostname.toLowerCase();
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(targetHost)) {
  console.error(
    "Tenant RLS integration tests are destructive and may run only against a local database.",
  );
  process.exit(1);
}

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const COMPANY_ID = "30000000-0000-4000-8000-000000000003";
const YEAR_A = "40000000-0000-4000-8000-000000000004";
const YEAR_B = "50000000-0000-4000-8000-000000000005";
const OBJECT_A = "60000000-0000-4000-8000-000000000006";
const OBJECT_A_OTHER = "70000000-0000-4000-8000-000000000007";
const OBJECT_B = "80000000-0000-4000-8000-000000000008";
const FIELD_A = "90000000-0000-4000-8000-000000000009";
const FIELD_A_OTHER = "a0000000-0000-4000-8000-00000000000a";
const FIELD_B = "b0000000-0000-4000-8000-00000000000b";
const RECORD_A = "c0000000-0000-4000-8000-00000000000c";
const TEST_ROLE = "school_sis_runtime";
const PLATFORM_ROLE = "school_sis_platform";
const SIGNING_KEY_ID =
  process.env.TENANT_CONTEXT_SIGNING_KEY_ID || "local-ci-v1";
const SIGNING_AUDIENCE =
  process.env.TENANT_CONTEXT_AUDIENCE || "ci:local:database";
const SIGNING_SECRET =
  process.env.TENANT_CONTEXT_SIGNING_SECRET ||
  "localCI_0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

interface SignedContext {
  audience: string;
  expiresAt: string;
  keyId: string;
  nonce: string;
  signature: string;
  tenantId: string;
  transactionId: string;
}

async function signContext(
  client: PoolClient,
  tenantId: string,
  overrides: Partial<Omit<SignedContext, "signature">> = {},
): Promise<SignedContext> {
  const identity = await client.query<{
    database_epoch_seconds: string;
    transaction_id: string;
  }>(
    "SELECT floor(extract(epoch FROM clock_timestamp()))::bigint::text AS database_epoch_seconds, pg_current_xact_id()::text AS transaction_id",
  );
  const transactionId =
    overrides.transactionId || identity.rows[0]?.transaction_id;
  const databaseEpoch = Number(identity.rows[0]?.database_epoch_seconds);
  assert(
    transactionId && /^[1-9][0-9]{0,19}$/.test(transactionId),
    "Missing transaction ID.",
  );
  assert(Number.isSafeInteger(databaseEpoch), "Missing database clock.");
  const context = {
    audience: overrides.audience || SIGNING_AUDIENCE,
    expiresAt: overrides.expiresAt || String(databaseEpoch + 300),
    keyId: overrides.keyId || SIGNING_KEY_ID,
    nonce: overrides.nonce || randomBytes(16).toString("hex"),
    tenantId: (overrides.tenantId || tenantId).toLowerCase(),
    transactionId,
  };
  const payload = [
    "school-sis:tenant-context:v1",
    context.audience,
    context.keyId,
    context.transactionId,
    context.tenantId,
    context.expiresAt,
    context.nonce,
  ].join("\n");
  return {
    ...context,
    signature: createHmac("sha256", SIGNING_SECRET)
      .update(payload)
      .digest("hex"),
  };
}

async function installContext(
  client: PoolClient,
  context: SignedContext,
): Promise<void> {
  await client.query(
    "SELECT set_config('app.current_tenant', $1, true), set_config('app.tenant_context_audience', $2, true), set_config('app.tenant_context_key_id', $3, true), set_config('app.tenant_context_expires_at', $4, true), set_config('app.tenant_context_nonce', $5, true), set_config('app.tenant_context_signature', $6, true), set_config('app.bypass_rls', 'off', true)",
    [
      context.tenantId,
      context.audience,
      context.keyId,
      context.expiresAt,
      context.nonce,
      context.signature,
    ],
  );
}

async function setTenant(
  client: PoolClient,
  tenantId: string,
): Promise<SignedContext> {
  const context = await signContext(client, tenantId);
  await installContext(client, context);
  return context;
}

async function main(): Promise<void> {
  const pool = new Pool({
    ...resolveDatabaseConnectionOptions(connectionString),
  });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");

    const coverage = await client.query<{
      table_name: string;
      row_security: boolean;
      force_row_security: boolean;
      policy_count: string;
    }>(`
            WITH expected_tables AS (
                SELECT DISTINCT table_name
                FROM information_schema.columns
                WHERE table_schema = 'public' AND column_name = 'tenant_id'
                UNION
                SELECT unnest(ARRAY[
                    'companies', 'tenants', 'grade_subjects', 'fee_components', 'stops',
                    'exam_schedules', 'field_permissions', 'metadata_fields', 'metadata_layouts',
                    'metadata_values', 'grading_rubrics', 'hq_groups', 'group_policies',
                    'platform_broadcasts', 'marketing_leads', 'platform_audit_logs',
                    'rate_limit_buckets'
                ])
            )
            SELECT
                expected.table_name,
                classes.relrowsecurity AS row_security,
                classes.relforcerowsecurity AS force_row_security,
                COUNT(policies.policyname)::text AS policy_count
            FROM expected_tables expected
            LEFT JOIN pg_namespace namespaces ON namespaces.nspname = 'public'
            LEFT JOIN pg_class classes
                ON classes.relnamespace = namespaces.oid AND classes.relname = expected.table_name
            LEFT JOIN pg_policies policies
                ON policies.schemaname = 'public' AND policies.tablename = expected.table_name
            GROUP BY expected.table_name, classes.relrowsecurity, classes.relforcerowsecurity
            ORDER BY expected.table_name
        `);
    const uncovered = coverage.rows.filter(
      (row) =>
        !row.row_security ||
        !row.force_row_security ||
        Number(row.policy_count) < 1,
    );
    assert(
      uncovered.length === 0,
      `RLS coverage gaps: ${JSON.stringify(uncovered)}`,
    );

    await client.query(`
            DO $block$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TEST_ROLE}') THEN
                    CREATE ROLE ${TEST_ROLE} NOLOGIN;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PLATFORM_ROLE}') THEN
                    CREATE ROLE ${PLATFORM_ROLE} NOLOGIN;
                END IF;
            END
            $block$;
        `);
    await client.query(
      `GRANT USAGE ON SCHEMA public, app_private TO ${TEST_ROLE}, ${PLATFORM_ROLE}`,
    );
    await client.query(`
            GRANT SELECT, INSERT, UPDATE, DELETE ON
                public.tenants,
                public.academic_years,
                public.metadata_objects,
                public.metadata_fields,
                public.metadata_records,
                public.metadata_values
            TO ${TEST_ROLE}, ${PLATFORM_ROLE}
        `);
    await client.query(
      `GRANT EXECUTE ON FUNCTION
          app_private.current_tenant_id(),
          app_private.verified_tenant_id(),
          app_private.has_tenant_context(),
          app_private.tenant_context_enforcement_phase(),
          app_private.rls_bypass()
       TO ${TEST_ROLE}, ${PLATFORM_ROLE}`,
    );

    await client.query(
      `INSERT INTO companies (id, name) VALUES ($1, 'RLS Integration Company') ON CONFLICT (id) DO NOTHING`,
      [COMPANY_ID],
    );
    await client.query(
      `INSERT INTO tenants (id, company_id, name, code)
             VALUES ($1, $3, 'Tenant A', 'RLS_TEST_A'), ($2, $3, 'Tenant B', 'RLS_TEST_B')
             ON CONFLICT (id) DO NOTHING`,
      [TENANT_A, TENANT_B, COMPANY_ID],
    );
    await client.query(
      `INSERT INTO academic_years (id, tenant_id, name, start_date, end_date)
             VALUES
                ($1, $3, 'Tenant A Year', '2026-01-01', '2026-12-31'),
                ($2, $4, 'Tenant B Year', '2026-01-01', '2026-12-31')
             ON CONFLICT (id) DO NOTHING`,
      [YEAR_A, YEAR_B, TENANT_A, TENANT_B],
    );
    await client.query(
      `INSERT INTO metadata_objects (id, tenant_id, name, api_name, table_name, is_custom)
             VALUES
                ($1, $4, 'Tenant A Object', 'rls_test_a', 'rls_test_a', true),
                ($2, $4, 'Tenant A Other Object', 'rls_test_a_other', 'rls_test_a_other', true),
                ($3, $5, 'Tenant B Object', 'rls_test_b', 'rls_test_b', true)
             ON CONFLICT (id) DO NOTHING`,
      [OBJECT_A, OBJECT_A_OTHER, OBJECT_B, TENANT_A, TENANT_B],
    );
    await client.query(
      `INSERT INTO metadata_fields (id, object_id, label, api_name, data_type)
             VALUES
                ($1, $4, 'Tenant A Field', 'rls_test_a_field', 'TEXT'),
                ($2, $5, 'Tenant A Other Field', 'rls_test_a_other_field', 'TEXT'),
                ($3, $6, 'Tenant B Field', 'rls_test_b_field', 'TEXT')
             ON CONFLICT (id) DO NOTHING`,
      [FIELD_A, FIELD_A_OTHER, FIELD_B, OBJECT_A, OBJECT_A_OTHER, OBJECT_B],
    );
    await client.query(
      `INSERT INTO metadata_records (id, tenant_id, object_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING`,
      [RECORD_A, TENANT_A, OBJECT_A],
    );

    // Phase 1 is the deliberate zero-downtime bridge for the already-live
    // unsigned runtime. It is restricted to the one exact tenant role.
    await client.query(
      "UPDATE app_private.tenant_context_rollout_state SET enforcement_phase = 1 WHERE singleton = true",
    );
    await client.query(`SET ROLE ${TEST_ROLE}`);
    await client.query(
      "SELECT set_config('app.current_tenant', $1, true), set_config('app.tenant_context_audience', '', true), set_config('app.tenant_context_key_id', '', true), set_config('app.tenant_context_expires_at', '', true), set_config('app.tenant_context_nonce', '', true), set_config('app.tenant_context_signature', '', true), set_config('app.bypass_rls', 'off', true)",
      [TENANT_A],
    );
    const phaseOneTenant = await client.query<{ tenant_id: string | null }>(
      "SELECT app_private.current_tenant_id()::text AS tenant_id",
    );
    assert(
      phaseOneTenant.rows[0]?.tenant_id === TENANT_A,
      "Phase 1 must preserve unsigned access for the exact legacy runtime role.",
    );
    const phaseOneRows = await client.query<{ id: string }>(
      "SELECT id FROM academic_years WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[YEAR_A, YEAR_B]],
    );
    assert(
      phaseOneRows.rows.length === 1 && phaseOneRows.rows[0]?.id === YEAR_A,
      "Phase 1 unsigned runtime context must remain tenant-scoped.",
    );
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const phaseOneBypass = await client.query<{ bypass: boolean }>(
      "SELECT app_private.rls_bypass() AS bypass",
    );
    assert(
      phaseOneBypass.rows[0]?.bypass === true,
      "Phase 1 must preserve the exact legacy runtime bypass during rollout.",
    );
    const phaseOneBypassRows = await client.query<{ id: string }>(
      "SELECT id FROM academic_years WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[YEAR_A, YEAR_B]],
    );
    assert(
      phaseOneBypassRows.rows.length === 2,
      "Phase 1 legacy runtime bypass must remain rollback-compatible.",
    );

    await client.query("RESET ROLE");
    await client.query(`SET ROLE ${PLATFORM_ROLE}`);
    await client.query(
      "SELECT set_config('app.current_tenant', $1, true), set_config('app.tenant_context_audience', '', true), set_config('app.tenant_context_key_id', '', true), set_config('app.tenant_context_expires_at', '', true), set_config('app.tenant_context_nonce', '', true), set_config('app.tenant_context_signature', '', true), set_config('app.bypass_rls', 'off', true)",
      [TENANT_A],
    );
    const phaseOnePlatformTenant = await client.query<{
      tenant_id: string | null;
    }>("SELECT app_private.current_tenant_id()::text AS tenant_id");
    assert(
      phaseOnePlatformTenant.rows[0]?.tenant_id === null,
      "Phase 1 unsigned tenant fallback must not extend to the platform role.",
    );
    await client.query("RESET ROLE");
    await client.query(
      "UPDATE app_private.tenant_context_rollout_state SET enforcement_phase = 2 WHERE singleton = true",
    );
    await client.query(`SET ROLE ${TEST_ROLE}`);
    await client.query(
      "SELECT set_config('app.current_tenant', $1, true), set_config('app.tenant_context_audience', '', true), set_config('app.tenant_context_key_id', '', true), set_config('app.tenant_context_expires_at', '', true), set_config('app.tenant_context_nonce', '', true), set_config('app.tenant_context_signature', '', true), set_config('app.bypass_rls', 'off', true)",
      [TENANT_B],
    );
    const strictUnsignedTenant = await client.query<{
      tenant_id: string | null;
    }>("SELECT app_private.current_tenant_id()::text AS tenant_id");
    assert(
      strictUnsignedTenant.rows[0]?.tenant_id === null,
      "Phase 2 must reject an unsigned victim-tenant GUC.",
    );
    const strictUnsignedRows = await client.query(
      "SELECT id FROM academic_years WHERE id = $1",
      [YEAR_B],
    );
    assert(
      strictUnsignedRows.rowCount === 0,
      "A raw victim-tenant GUC must expose zero rows in phase 2.",
    );

    const validContext = await setTenant(client, TENANT_A);
    const verifiedContext = await client.query<{
      tenant_id: string | null;
    }>("SELECT app_private.verified_tenant_id()::text AS tenant_id");
    assert(
      verifiedContext.rows[0]?.tenant_id === TENANT_A,
      "The exact Node HMAC vector must be accepted by PostgreSQL.",
    );

    const invalidContexts: Array<[string, SignedContext]> = [
      ["tenant", { ...validContext, tenantId: TENANT_B }],
      ["audience", { ...validContext, audience: "ci:other:database" }],
      ["key ID", { ...validContext, keyId: "forged-v2" }],
      [
        "expiry",
        {
          ...validContext,
          expiresAt: String(Number(validContext.expiresAt) + 1),
        },
      ],
      ["nonce", { ...validContext, nonce: "f".repeat(32) }],
      [
        "signature",
        {
          ...validContext,
          signature: `${validContext.signature.slice(0, 63)}${
            validContext.signature.endsWith("0") ? "1" : "0"
          }`,
        },
      ],
      [
        "transaction ID",
        await signContext(client, TENANT_A, {
          transactionId: String(BigInt(validContext.transactionId) + 1n),
        }),
      ],
      [
        "cross-audience signed context",
        await signContext(client, TENANT_A, {
          audience: "ci:other:database",
        }),
      ],
    ];
    for (const [field, context] of invalidContexts) {
      await installContext(client, context);
      const rejected = await client.query<{ tenant_id: string | null }>(
        "SELECT app_private.verified_tenant_id()::text AS tenant_id",
      );
      assert(
        rejected.rows[0]?.tenant_id === null,
        `A forged ${field} must invalidate the signed tenant context.`,
      );
      const victimRows = await client.query(
        "SELECT id FROM academic_years WHERE id = $1",
        [YEAR_B],
      );
      assert(
        victimRows.rowCount === 0,
        `A forged ${field} must not expose a victim tenant row.`,
      );
    }
    await installContext(client, validContext);

    let privateStorageDenied = false;
    await client.query("SAVEPOINT private_storage_access");
    try {
      await client.query(
        "SELECT key_id FROM app_private.tenant_context_signing_keys UNION ALL SELECT promoted_key_id FROM app_private.tenant_context_rollout_state",
      );
      await client.query("RELEASE SAVEPOINT private_storage_access");
    } catch (error) {
      privateStorageDenied = (error as { code?: string }).code === "42501";
      await client.query("ROLLBACK TO SAVEPOINT private_storage_access");
      await client.query("RELEASE SAVEPOINT private_storage_access");
    }
    assert(
      privateStorageDenied,
      "The runtime role must not read tenant-context keys or rollout evidence.",
    );

    const visibleRows = await client.query<{ id: string }>(
      "SELECT id FROM academic_years ORDER BY id",
    );
    assert(
      visibleRows.rows.length === 1 && visibleRows.rows[0].id === YEAR_A,
      "Tenant A must see only its own row.",
    );

    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const forgedRuntimeBypass = await client.query<{ bypass: boolean }>(
      "SELECT app_private.rls_bypass() AS bypass",
    );
    assert(
      forgedRuntimeBypass.rows[0]?.bypass === false,
      "The tenant runtime role must not self-enable the RLS bypass GUC.",
    );
    const forgedRuntimeRows = await client.query<{ id: string }>(
      "SELECT id FROM academic_years ORDER BY id",
    );
    assert(
      forgedRuntimeRows.rows.length === 1 &&
        forgedRuntimeRows.rows[0].id === YEAR_A,
      "A forged bypass GUC must not widen tenant-runtime visibility.",
    );
    await client.query("SELECT set_config('app.bypass_rls', 'off', true)");

    const crossTenantRead = await client.query(
      "SELECT id FROM academic_years WHERE id = $1",
      [YEAR_B],
    );
    assert(
      crossTenantRead.rowCount === 0,
      "Cross-tenant reads must return zero rows.",
    );

    const crossTenantUpdate = await client.query(
      "UPDATE academic_years SET name = 'tampered' WHERE id = $1",
      [YEAR_B],
    );
    assert(
      crossTenantUpdate.rowCount === 0,
      "Cross-tenant updates must affect zero rows.",
    );

    const crossTenantDelete = await client.query(
      "DELETE FROM academic_years WHERE id = $1",
      [YEAR_B],
    );
    assert(
      crossTenantDelete.rowCount === 0,
      "Cross-tenant deletes must affect zero rows.",
    );

    let rejectedCrossTenantInsert = false;
    await client.query("SAVEPOINT cross_tenant_insert");
    try {
      await client.query(
        `INSERT INTO academic_years (tenant_id, name, start_date, end_date)
                 VALUES ($1, 'forbidden', '2026-01-01', '2026-12-31')`,
        [TENANT_B],
      );
      await client.query("RELEASE SAVEPOINT cross_tenant_insert");
    } catch (error) {
      rejectedCrossTenantInsert = (error as { code?: string }).code === "42501";
      await client.query("ROLLBACK TO SAVEPOINT cross_tenant_insert");
      await client.query("RELEASE SAVEPOINT cross_tenant_insert");
    }
    assert(
      rejectedCrossTenantInsert,
      "Cross-tenant inserts must be rejected by RLS.",
    );

    await client.query(
      `INSERT INTO academic_years (tenant_id, name, start_date, end_date)
             VALUES ($1, 'allowed', '2026-01-01', '2026-12-31')`,
      [TENANT_A],
    );

    let rejectedForeignObjectRecord = false;
    await client.query("SAVEPOINT foreign_metadata_object");
    try {
      await client.query(
        "INSERT INTO metadata_records (tenant_id, object_id) VALUES ($1, $2)",
        [TENANT_A, OBJECT_B],
      );
      await client.query("RELEASE SAVEPOINT foreign_metadata_object");
    } catch (error) {
      rejectedForeignObjectRecord =
        (error as { code?: string }).code === "42501";
      await client.query("ROLLBACK TO SAVEPOINT foreign_metadata_object");
      await client.query("RELEASE SAVEPOINT foreign_metadata_object");
    }
    assert(
      rejectedForeignObjectRecord,
      "A tenant record must not reference another tenant metadata object.",
    );

    let rejectedCrossObjectField = false;
    await client.query("SAVEPOINT cross_object_metadata_field");
    try {
      await client.query(
        `INSERT INTO metadata_values (record_id, field_id, value_string)
                 VALUES ($1, $2, 'forbidden')`,
        [RECORD_A, FIELD_A_OTHER],
      );
      await client.query("RELEASE SAVEPOINT cross_object_metadata_field");
    } catch (error) {
      rejectedCrossObjectField = (error as { code?: string }).code === "42501";
      await client.query("ROLLBACK TO SAVEPOINT cross_object_metadata_field");
      await client.query("RELEASE SAVEPOINT cross_object_metadata_field");
    }
    assert(
      rejectedCrossObjectField,
      "A metadata value field must belong to the record metadata object.",
    );

    await client.query(
      `INSERT INTO metadata_values (record_id, field_id, value_string)
             VALUES ($1, $2, 'allowed')`,
      [RECORD_A, FIELD_A],
    );

    await client.query("SELECT set_config('app.current_tenant', '', true)");
    const noContextRows = await client.query("SELECT id FROM academic_years");
    assert(
      noContextRows.rowCount === 0,
      "A non-platform session without tenant context must see zero rows.",
    );

    await client.query("RESET ROLE");
    await client.query(`SET ROLE ${PLATFORM_ROLE}`);
    await client.query(
      "SELECT set_config('app.current_tenant', '', true), set_config('app.bypass_rls', 'off', true)",
    );
    const unscopedPlatformRows = await client.query(
      "SELECT id FROM academic_years",
    );
    assert(
      unscopedPlatformRows.rowCount === 0,
      "The platform role must not bypass RLS without the reviewed context GUC.",
    );
    await client.query("SELECT set_config('app.bypass_rls', 'on', true)");
    const platformBypass = await client.query<{ bypass: boolean }>(
      "SELECT app_private.rls_bypass() AS bypass",
    );
    assert(
      platformBypass.rows[0]?.bypass === true,
      "The exact platform role must bypass RLS only after the context GUC is enabled.",
    );
    const platformRows = await client.query<{ id: string }>(
      "SELECT id FROM academic_years WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[YEAR_A, YEAR_B]],
    );
    assert(
      platformRows.rows.length === 2,
      "The reviewed platform context must see records across tenants.",
    );
    await client.query("RESET ROLE");
    await client.query("ROLLBACK");
    console.info(
      `Tenant RLS integration test passed across ${coverage.rows.length} protected tables.`,
    );
  } catch (error) {
    try {
      await client.query("RESET ROLE");
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Tenant RLS integration test failed:", error);
  process.exitCode = 1;
});

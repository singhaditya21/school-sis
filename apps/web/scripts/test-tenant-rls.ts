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
const TEST_ROLE = "school_sis_rls_test";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function setTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query(
    "SELECT set_config('app.current_tenant', $1, true), set_config('app.bypass_rls', 'off', true)",
    [tenantId],
  );
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
            END
            $block$;
        `);
    await client.query(
      `GRANT USAGE ON SCHEMA public, app_private TO ${TEST_ROLE}`,
    );
    await client.query(`
            GRANT SELECT, INSERT, UPDATE, DELETE ON
                public.tenants,
                public.academic_years,
                public.metadata_objects,
                public.metadata_fields,
                public.metadata_records,
                public.metadata_values
            TO ${TEST_ROLE}
        `);

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

    await client.query(`SET ROLE ${TEST_ROLE}`);
    await setTenant(client, TENANT_A);

    const visibleRows = await client.query<{ id: string }>(
      "SELECT id FROM academic_years ORDER BY id",
    );
    assert(
      visibleRows.rows.length === 1 && visibleRows.rows[0].id === YEAR_A,
      "Tenant A must see only its own row.",
    );

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

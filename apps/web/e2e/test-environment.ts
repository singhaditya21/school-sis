import fs from "fs";
import path from "path";
import { Client } from "pg";

const FALLBACK_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/school_sis";
const FALLBACK_SEED_USER_PASSWORD = "school-sis-e2e-seed-password";
const SAFE_IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const LOCAL_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "::1",
]);
const DATABASE_IDENTITY_QUERY_PARAMETERS = new Set([
  "database",
  "db",
  "host",
  "hostaddr",
  "options",
  "password",
  "port",
  "user",
]);
const TEST_ROLE_LOCK_KEY = "school-sis:e2e:application-roles:v1";
export const PLAYWRIGHT_RUNTIME_ROLE = "school_sis_runtime";
export const PLAYWRIGHT_PLATFORM_ROLE = "school_sis_platform";
const TEST_APPLICATION_ROLES = [
  {
    name: PLAYWRIGHT_RUNTIME_ROLE,
    password: "school-sis-e2e-runtime-local-v1",
  },
  {
    name: PLAYWRIGHT_PLATFORM_ROLE,
    password: "school-sis-e2e-platform-local-v1",
  },
] as const;
const TENANT_CONTEXT_AUDIENCE = "ci:local:database";
const TENANT_CONTEXT_SIGNING_KEY_ID = "local-ci-v1";
const TENANT_CONTEXT_SIGNING_SECRET =
  "localCI_0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

export type TestEnvironment = {
  databaseName: string;
  databaseUrl: string;
  platformDatabaseUrl: string;
  directUrl: string;
  adminDatabaseUrl: string;
  envFilePath: string;
};

function sanitizeDatabaseName(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const withPrefix = /^[a-z_]/.test(sanitized)
    ? sanitized
    : `test_${sanitized}`;
  return withPrefix.slice(0, 63) || "school_sis_test";
}

function defaultDatabaseName(baseName: string): string {
  if (process.env.TEST_DATABASE_NAME) return process.env.TEST_DATABASE_NAME;
  if (!process.env.CI) return baseName;

  const parts = [
    baseName,
    process.env.GITHUB_RUN_ID,
    process.env.GITHUB_RUN_ATTEMPT,
    process.env.TEST_DATABASE_SUFFIX,
  ].filter(Boolean);
  return parts.join("_");
}

function assertSafeDatabaseName(databaseName: string): void {
  if (!SAFE_IDENTIFIER_RE.test(databaseName)) {
    throw new Error(`Unsafe test database name: ${databaseName}`);
  }
}

function withDatabaseName(
  connectionString: string,
  databaseName: string,
): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function withAdminDatabase(connectionString: string): string {
  const url = new URL(connectionString);
  url.pathname = "/postgres";
  return url.toString();
}

function withCredentials(
  connectionString: string,
  username: string,
  password: string,
): string {
  const url = new URL(connectionString);
  url.username = username;
  url.password = password;
  return url.toString();
}

function assertLocalOwnerConnection(connectionString: string): void {
  const url = new URL(connectionString);
  for (const parameter of url.searchParams.keys()) {
    if (DATABASE_IDENTITY_QUERY_PARAMETERS.has(parameter.toLowerCase())) {
      throw new Error(
        `Playwright owner URLs cannot override connection identity with the ${parameter} query parameter.`,
      );
    }
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !LOCAL_DATABASE_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      "Playwright database recreation requires a local PostgreSQL owner DIRECT_URL.",
    );
  }
  if (TEST_APPLICATION_ROLES.some((role) => url.username === role.name)) {
    throw new Error(
      "Playwright DIRECT_URL must use the database owner, not an application role.",
    );
  }
}

function quoteIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER_RE.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL role identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function ensureTestApplicationRoles(client: Client): Promise<void> {
  // PostgreSQL roles are cluster-global. All isolated Playwright databases use
  // the same stable test credentials, and this lock serializes create/alter
  // operations so concurrent suites cannot rotate each other's passwords.
  await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [
    TEST_ROLE_LOCK_KEY,
  ]);
  try {
    for (const role of TEST_APPLICATION_ROLES) {
      const quotedRole = quoteIdentifier(role.name);
      const quotedPassword = quoteLiteral(role.password);
      await client.query(`
                DO $create_test_role$
                BEGIN
                    CREATE ROLE ${quotedRole};
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END
                $create_test_role$
            `);
      await client.query(`
                ALTER ROLE ${quotedRole}
                WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
                     NOREPLICATION NOBYPASSRLS CONNECTION LIMIT -1
                     PASSWORD ${quotedPassword} VALID UNTIL 'infinity'
            `);
      await client.query(`ALTER ROLE ${quotedRole} RESET ALL`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
      TEST_ROLE_LOCK_KEY,
    ]);
  }
}

export function ensurePlaywrightTestEnvironment(options: {
  envFileName: string;
  defaultDatabaseName: string;
}): TestEnvironment {
  const databaseName = sanitizeDatabaseName(
    defaultDatabaseName(options.defaultDatabaseName),
  );
  assertSafeDatabaseName(databaseName);

  const baseOwnerUrl =
    process.env.DIRECT_URL || process.env.DATABASE_URL || FALLBACK_DATABASE_URL;
  assertLocalOwnerConnection(baseOwnerUrl);
  const directUrl = withDatabaseName(baseOwnerUrl, databaseName);
  const adminDatabaseUrl = withAdminDatabase(baseOwnerUrl);
  const databaseUrl = withCredentials(
    directUrl,
    TEST_APPLICATION_ROLES[0].name,
    TEST_APPLICATION_ROLES[0].password,
  );
  const platformDatabaseUrl = withCredentials(
    directUrl,
    TEST_APPLICATION_ROLES[1].name,
    TEST_APPLICATION_ROLES[1].password,
  );
  const envFilePath = path.resolve(__dirname, "..", options.envFileName);

  const envLines = [
    `DATABASE_URL="${databaseUrl}"`,
    `PLATFORM_DATABASE_URL="${platformDatabaseUrl}"`,
    `DIRECT_URL="${directUrl}"`,
    `DEPLOYMENT_RUNTIME_ROLE="${TEST_APPLICATION_ROLES[0].name}"`,
    `DEPLOYMENT_PLATFORM_ROLE="${TEST_APPLICATION_ROLES[1].name}"`,
    'SESSION_SECRET="test-session-secret-32-characters"',
    'NEXTAUTH_SECRET="test-nextauth-secret-32-characters"',
    'ENCRYPTION_KEY="test-encryption-key-32-characters"',
    'PII_ENCRYPTION_KEY="test-pii-encryption-key-32-characters"',
    `TENANT_CONTEXT_AUDIENCE="${TENANT_CONTEXT_AUDIENCE}"`,
    `TENANT_CONTEXT_SIGNING_KEY_ID="${TENANT_CONTEXT_SIGNING_KEY_ID}"`,
    `TENANT_CONTEXT_SIGNING_SECRET="${TENANT_CONTEXT_SIGNING_SECRET}"`,
    'JOB_QUEUE_MODE="database"',
    // Playwright runs the production server. Keep optional providers
    // unconfigured so the production mock guard remains meaningful.
    'RATE_LIMIT_BACKEND="postgres"',
    'CSP_ENFORCE="true"',
    "",
  ];

  fs.writeFileSync(envFilePath, envLines.join("\n"));
  process.env.DATABASE_URL = databaseUrl;
  process.env.PLATFORM_DATABASE_URL = platformDatabaseUrl;
  process.env.DIRECT_URL = directUrl;
  process.env.DEPLOYMENT_RUNTIME_ROLE = TEST_APPLICATION_ROLES[0].name;
  process.env.DEPLOYMENT_PLATFORM_ROLE = TEST_APPLICATION_ROLES[1].name;
  process.env.TENANT_CONTEXT_AUDIENCE = TENANT_CONTEXT_AUDIENCE;
  process.env.TENANT_CONTEXT_SIGNING_KEY_ID = TENANT_CONTEXT_SIGNING_KEY_ID;
  process.env.TENANT_CONTEXT_SIGNING_SECRET = TENANT_CONTEXT_SIGNING_SECRET;
  process.env.SEED_USER_PASSWORD ||= FALLBACK_SEED_USER_PASSWORD;

  return {
    databaseName,
    databaseUrl,
    platformDatabaseUrl,
    directUrl,
    adminDatabaseUrl,
    envFilePath,
  };
}

export async function recreateDatabase(
  environment: TestEnvironment,
): Promise<void> {
  assertLocalOwnerConnection(environment.adminDatabaseUrl);
  const client = new Client({ connectionString: environment.adminDatabaseUrl });
  await client.connect();
  try {
    await ensureTestApplicationRoles(client);
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [environment.databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${environment.databaseName}"`);
    await client.query(`CREATE DATABASE "${environment.databaseName}"`);
  } finally {
    await client.end();
  }
}

export async function enableVectorExtension(
  environment: TestEnvironment,
): Promise<void> {
  const client = new Client({ connectionString: environment.directUrl });
  await client.connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  } finally {
    await client.end();
  }
}

export async function dropDatabase(
  environment: TestEnvironment,
): Promise<void> {
  assertLocalOwnerConnection(environment.adminDatabaseUrl);
  const client = new Client({ connectionString: environment.adminDatabaseUrl });
  await client.connect();
  try {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [environment.databaseName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${environment.databaseName}"`);
  } finally {
    await client.end();
  }
}

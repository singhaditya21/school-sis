import {
  formatDeploymentContractIssue,
  parseDeploymentTarget,
  validateDeploymentContract,
} from "../../scripts/deployment-contract";

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL:
      "postgresql://school_sis_runtime:runtime-pass-8Nw7zQ2k@ep-blue-pooler.ap-south-1.aws.neon.tech/school_sis?sslmode=verify-full&channel_binding=require",
    PLATFORM_DATABASE_URL:
      "postgresql://school_sis_platform:platform-pass-3Lm8qR1x@ep-blue-pooler.ap-south-1.aws.neon.tech/school_sis?sslmode=verify-full&channel_binding=require",
    DIRECT_URL:
      "postgresql://migrator:migrator-pass-4Qp9vT6m@ep-blue.ap-south-1.aws.neon.tech/school_sis?sslmode=verify-full&channel_binding=require",
    DEPLOYMENT_RUNTIME_ROLE: "school_sis_runtime",
    DEPLOYMENT_PLATFORM_ROLE: "school_sis_platform",
    DEPLOYMENT_MIGRATION_ROLE: "migrator",
    DATABASE_SSL_MODE: "verify-full",
    SESSION_SECRET: "session-8nR4zQ2vK7mP9xT6cW3jH5sL1fD0aB",
    PII_ENCRYPTION_KEY: "pii-6qT1vN8mR3xP7kW9cH2jF5sL4dA0bZ",
    METRICS_TOKEN: "metrics-5mP9xT2vK7qR4nW8cH3jF6sL1dA0bZ",
    JOB_DISPATCH_SECRET: "jobs-7vK2qR9mP4xT6nW1cH8jF3sL5dA0bZ",
    TENANT_CONTEXT_AUDIENCE: "production:project:branch",
    TENANT_CONTEXT_SIGNING_KEY_ID: "production-v1",
    TENANT_CONTEXT_SIGNING_SECRET:
      "8Nw7zQ2kLm4P6vR9xT1cF3hJ5sD0aB7eG2uY4iO6pWq",
    NEXT_PUBLIC_APP_URL: "https://school-sis-web.vercel.app",
    TENANT_BASE_HOSTS: "school-sis-web.vercel.app,portal.school.edu",
    RATE_LIMIT_BACKEND: "postgres",
    JOB_QUEUE_MODE: "database",
    INTEGRATIONS_MODE: "live",
    CSP_ENFORCE: "true",
  };
}

function issueVariables(
  env: NodeJS.ProcessEnv,
  target: "preview" | "production" = "production",
) {
  return validateDeploymentContract(env, target).issues.map(
    (issue) => issue.variable,
  );
}

describe("deployment environment contract", () => {
  it("accepts a production environment with separate pooled and direct Neon URLs", () => {
    const result = validateDeploymentContract(validEnvironment(), "production");

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        target: "production",
        directDatabaseVariable: "DIRECT_URL",
        issues: [],
      }),
    );
  });

  it("uses DATABASE_URL_UNPOOLED when DIRECT_URL is absent", () => {
    const env = validEnvironment();
    env.DATABASE_URL_UNPOOLED = env.DIRECT_URL;
    delete env.DIRECT_URL;

    const result = validateDeploymentContract(env, "preview");

    expect(result.ok).toBe(true);
    expect(result.directDatabaseVariable).toBe("DATABASE_URL_UNPOOLED");
  });

  it("fails closed when a direct migration URL is missing", () => {
    const env = validEnvironment();
    delete env.DIRECT_URL;

    const result = validateDeploymentContract(env, "production");

    expect(result.ok).toBe(false);
    expect(issueVariables(env)).toContain(
      "DIRECT_URL or DATABASE_URL_UNPOOLED",
    );
  });

  it("requires a distinct, exact platform role on the same pooled database", () => {
    const missing = validEnvironment();
    delete missing.PLATFORM_DATABASE_URL;
    expect(issueVariables(missing)).toContain("PLATFORM_DATABASE_URL");

    const tenantCredential = validEnvironment();
    tenantCredential.PLATFORM_DATABASE_URL = tenantCredential.DATABASE_URL;
    expect(issueVariables(tenantCredential)).toContain(
      "PLATFORM_DATABASE_URL and DEPLOYMENT_PLATFORM_ROLE",
    );
    expect(issueVariables(tenantCredential)).toContain(
      "DATABASE_URL and PLATFORM_DATABASE_URL",
    );

    const wrongRole = validEnvironment();
    wrongRole.DEPLOYMENT_PLATFORM_ROLE = "other_platform";
    expect(issueVariables(wrongRole)).toContain("DEPLOYMENT_PLATFORM_ROLE");

    const wrongBranch = validEnvironment();
    wrongBranch.PLATFORM_DATABASE_URL =
      wrongBranch.PLATFORM_DATABASE_URL?.replace(
        "ep-blue-pooler.",
        "ep-other-pooler.",
      );
    expect(issueVariables(wrongBranch)).toContain(
      "DATABASE_URL and PLATFORM_DATABASE_URL",
    );
  });

  it("requires nonempty pairwise-distinct decoded database passwords", () => {
    const sharedRuntimeAndPlatform = validEnvironment();
    sharedRuntimeAndPlatform.PLATFORM_DATABASE_URL =
      sharedRuntimeAndPlatform.PLATFORM_DATABASE_URL?.replace(
        "platform-pass-3Lm8qR1x",
        "runtime-pass-8Nw7zQ2k",
      );
    expect(issueVariables(sharedRuntimeAndPlatform)).toContain(
      "DATABASE_URL, PLATFORM_DATABASE_URL, and direct database URL",
    );

    const sharedRuntimeAndMigration = validEnvironment();
    sharedRuntimeAndMigration.DIRECT_URL =
      sharedRuntimeAndMigration.DIRECT_URL?.replace(
        "migrator-pass-4Qp9vT6m",
        "runtime-pass-8Nw7zQ2k",
      );
    expect(issueVariables(sharedRuntimeAndMigration)).toContain(
      "DATABASE_URL, PLATFORM_DATABASE_URL, and direct database URL",
    );

    const runtimeOnly = validEnvironment();
    delete runtimeOnly.DIRECT_URL;
    runtimeOnly.PLATFORM_DATABASE_URL =
      runtimeOnly.PLATFORM_DATABASE_URL?.replace(
        "platform-pass-3Lm8qR1x",
        "runtime-pass-8Nw7zQ2k",
      );
    expect(
      validateDeploymentContract(runtimeOnly, "production", {
        runtimeOnly: true,
      }).issues.map((issue) => issue.variable),
    ).toContain("DATABASE_URL and PLATFORM_DATABASE_URL");
  });

  it("keeps production migration credentials out of runtime-only builds", () => {
    const isolatedRuntime = validEnvironment();
    delete isolatedRuntime.DIRECT_URL;
    expect(
      validateDeploymentContract(isolatedRuntime, "production", {
        runtimeOnly: true,
      }).ok,
    ).toBe(true);

    const exposedMigrationCredential = validEnvironment();
    expect(
      validateDeploymentContract(exposedMigrationCredential, "production", {
        runtimeOnly: true,
      }).issues.map((issue) => issue.variable),
    ).toContain("DIRECT_URL");
  });

  it("requires a versioned 256-bit base64url tenant-context credential", () => {
    const missing = validEnvironment();
    delete missing.TENANT_CONTEXT_AUDIENCE;
    delete missing.TENANT_CONTEXT_SIGNING_KEY_ID;
    delete missing.TENANT_CONTEXT_SIGNING_SECRET;
    expect(issueVariables(missing)).toEqual(
      expect.arrayContaining([
        "TENANT_CONTEXT_AUDIENCE",
        "TENANT_CONTEXT_SIGNING_KEY_ID",
        "TENANT_CONTEXT_SIGNING_SECRET",
      ]),
    );

    const malformed = validEnvironment();
    malformed.TENANT_CONTEXT_AUDIENCE = "Production Audience";
    malformed.TENANT_CONTEXT_SIGNING_KEY_ID = "Production Key";
    malformed.TENANT_CONTEXT_SIGNING_SECRET = "+".repeat(64);
    expect(issueVariables(malformed)).toEqual(
      expect.arrayContaining([
        "TENANT_CONTEXT_AUDIENCE",
        "TENANT_CONTEXT_SIGNING_KEY_ID",
        "TENANT_CONTEXT_SIGNING_SECRET",
      ]),
    );
  });

  it("rejects incomplete, reused, malformed, and contradictory previous keys", () => {
    const incomplete = validEnvironment();
    incomplete.TENANT_CONTEXT_PREVIOUS_KEY_ID = "production-v0";
    expect(issueVariables(incomplete)).toContain(
      "TENANT_CONTEXT_PREVIOUS_KEY_ID and TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET",
    );

    const reused = validEnvironment();
    reused.TENANT_CONTEXT_PREVIOUS_KEY_ID =
      reused.TENANT_CONTEXT_SIGNING_KEY_ID;
    reused.TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET =
      reused.TENANT_CONTEXT_SIGNING_SECRET;
    expect(issueVariables(reused)).toEqual(
      expect.arrayContaining([
        "TENANT_CONTEXT_PREVIOUS_KEY_ID",
        "TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET",
      ]),
    );

    const malformed = validEnvironment();
    malformed.TENANT_CONTEXT_PREVIOUS_KEY_ID = "Previous Key";
    malformed.TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET = "+".repeat(64);
    malformed.TENANT_CONTEXT_RETIRE_PREVIOUS_KEY = "false";
    expect(issueVariables(malformed)).toEqual(
      expect.arrayContaining([
        "TENANT_CONTEXT_PREVIOUS_KEY_ID",
        "TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET",
        "TENANT_CONTEXT_RETIRE_PREVIOUS_KEY",
      ]),
    );

    const contradictory = validEnvironment();
    contradictory.TENANT_CONTEXT_PREVIOUS_KEY_ID = "production-v0";
    contradictory.TENANT_CONTEXT_PREVIOUS_SIGNING_SECRET =
      "previous_2kLm4P6vR9xT1cF3hJ5sD0aB7eG8uY4iO6pWq";
    contradictory.TENANT_CONTEXT_RETIRE_PREVIOUS_KEY = "true";
    expect(issueVariables(contradictory)).toContain(
      "TENANT_CONTEXT_RETIRE_PREVIOUS_KEY",
    );
  });

  it("rejects non-pooled runtime URLs and branch-mismatched direct URLs", () => {
    const directRuntime = validEnvironment();
    directRuntime.DATABASE_URL = directRuntime.DIRECT_URL;
    expect(issueVariables(directRuntime)).toContain("DATABASE_URL");

    const mismatchedBranch = validEnvironment();
    mismatchedBranch.DIRECT_URL =
      "postgresql://migrator:migrator-pass-4Qp9vT6m@ep-green.ap-south-1.aws.neon.tech/school_sis?sslmode=verify-full";
    expect(issueVariables(mismatchedBranch)).toContain(
      "DATABASE_URL and direct database URL",
    );
  });

  it("rejects PostgreSQL connection identity and session query overrides", () => {
    const runtimeOverride = validEnvironment();
    runtimeOverride.DATABASE_URL = `${runtimeOverride.DATABASE_URL}&HOST=attacker.example&user=owner`;
    expect(issueVariables(runtimeOverride)).toContain("DATABASE_URL");

    const directOverride = validEnvironment();
    directOverride.DIRECT_URL = `${directOverride.DIRECT_URL}&options=-c%20role%3Downer`;
    expect(issueVariables(directOverride)).toContain("DIRECT_URL");
  });

  it("rejects downgraded URL TLS, channel binding, and nonstandard ports", () => {
    const tlsDowngrade = validEnvironment();
    tlsDowngrade.DIRECT_URL = tlsDowngrade.DIRECT_URL?.replace(
      "sslmode=verify-full&channel_binding=require",
      "sslmode=require&channel_binding=disable",
    );
    expect(issueVariables(tlsDowngrade)).toContain("DIRECT_URL");

    const portOverride = validEnvironment();
    portOverride.DIRECT_URL = portOverride.DIRECT_URL?.replace(
      ".neon.tech/",
      ".neon.tech:6432/",
    );
    expect(issueVariables(portOverride)).toContain("DIRECT_URL");
  });

  it("rejects conflicting direct URL aliases", () => {
    const env = validEnvironment();
    env.DATABASE_URL_UNPOOLED =
      "postgresql://migrator:migrator-pass-4Qp9vT6m@ep-green.ap-south-1.aws.neon.tech/school_sis?sslmode=verify-full";

    expect(issueVariables(env)).toContain(
      "DIRECT_URL and DATABASE_URL_UNPOOLED",
    );
  });

  it("requires distinct URLs to use the configured runtime and migration roles", () => {
    const sharedRole = validEnvironment();
    sharedRole.DEPLOYMENT_MIGRATION_ROLE = "school_sis_runtime";
    expect(issueVariables(sharedRole)).toEqual(
      expect.arrayContaining([
        "DEPLOYMENT_RUNTIME_ROLE, DEPLOYMENT_PLATFORM_ROLE, and DEPLOYMENT_MIGRATION_ROLE",
        "direct database URL and DEPLOYMENT_MIGRATION_ROLE",
      ]),
    );

    const wrongRuntimeRole = validEnvironment();
    wrongRuntimeRole.DEPLOYMENT_RUNTIME_ROLE = "app_runtime";
    expect(issueVariables(wrongRuntimeRole)).toContain(
      "DATABASE_URL and DEPLOYMENT_RUNTIME_ROLE",
    );

    const uppercaseRole = validEnvironment();
    uppercaseRole.DEPLOYMENT_RUNTIME_ROLE = "School_Runtime";
    expect(issueVariables(uppercaseRole)).toContain("DEPLOYMENT_RUNTIME_ROLE");
  });

  it("requires verify-full TLS and production-safe runtime settings", () => {
    const env = validEnvironment();
    env.DATABASE_SSL_MODE = "require";
    env.RATE_LIMIT_BACKEND = "memory";
    env.JOB_QUEUE_MODE = "graphile";
    env.CSP_ENFORCE = "false";
    env.ENABLE_INTEGRATION_MOCKS = "true";
    env.INTEGRATIONS_MODE = "mock";

    expect(issueVariables(env)).toEqual(
      expect.arrayContaining([
        "DATABASE_SSL_MODE",
        "RATE_LIMIT_BACKEND",
        "JOB_QUEUE_MODE",
        "CSP_ENFORCE",
        "ENABLE_INTEGRATION_MOCKS",
        "INTEGRATIONS_MODE",
      ]),
    );
  });

  it("requires explicit live integrations and CSP enforcement", () => {
    const env = validEnvironment();
    delete env.INTEGRATIONS_MODE;
    delete env.CSP_ENFORCE;

    expect(issueVariables(env)).toEqual(
      expect.arrayContaining(["INTEGRATIONS_MODE", "CSP_ENFORCE"]),
    );
  });

  it("requires the app host in the tenant allowlist", () => {
    const env = validEnvironment();
    env.TENANT_BASE_HOSTS = "portal.school.edu";

    expect(issueVariables(env)).toContain("TENANT_BASE_HOSTS");
  });

  it("requires canonical application and tenant origins", () => {
    const applicationPath = validEnvironment();
    applicationPath.NEXT_PUBLIC_APP_URL =
      "https://school-sis-web.vercel.app/login?from=preview";
    expect(issueVariables(applicationPath)).toContain("NEXT_PUBLIC_APP_URL");

    const malformedTenantHost = validEnvironment();
    malformedTenantHost.TENANT_BASE_HOSTS =
      "school-sis-web.vercel.app,portal.school.edu:443";
    expect(issueVariables(malformedTenantHost)).toContain("TENANT_BASE_HOSTS");
  });

  it("allows Stripe test keys only for preview deployments", () => {
    const env = validEnvironment();
    env.PAYMENT_PROVIDER = "stripe";
    env.STRIPE_SECRET_KEY = ["sk", "test", "synthetic-fixture"].join("_");
    env.STRIPE_WEBHOOK_SECRET = ["whsec", "synthetic-fixture"].join("_");

    expect(validateDeploymentContract(env, "preview").ok).toBe(true);
    expect(issueVariables(env, "production")).toContain("STRIPE_SECRET_KEY");
  });

  it("reports only variable names and remediation, never secret values", () => {
    const env = validEnvironment();
    const exposedValue = "replace-with-real-secret-value-123456789";
    env.SESSION_SECRET = exposedValue;
    env.DATABASE_URL =
      "postgresql://runtime:replace-with-db-password@ep-blue-pooler.ap-south-1.aws.neon.tech/school_sis";

    const output = validateDeploymentContract(env, "production")
      .issues.map(formatDeploymentContractIssue)
      .join("\n");

    expect(output).toContain("SESSION_SECRET");
    expect(output).toContain("DATABASE_URL");
    expect(output).not.toContain(exposedValue);
    expect(output).not.toContain("replace-with-db-password");
    expect(output).not.toContain(env.DATABASE_URL);
  });

  it("parses only supported deployment targets", () => {
    expect(parseDeploymentTarget(" preview ")).toBe("preview");
    expect(parseDeploymentTarget("PRODUCTION")).toBe("production");
    expect(parseDeploymentTarget("development")).toBeNull();
    expect(parseDeploymentTarget(undefined)).toBeNull();
  });
});

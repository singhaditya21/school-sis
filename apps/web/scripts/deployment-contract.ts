export type DeploymentTarget = "preview" | "production";

export type DeploymentContractIssue = {
  variable: string;
  message: string;
};

export type DeploymentContractResult = {
  target: DeploymentTarget;
  ok: boolean;
  issues: DeploymentContractIssue[];
  directDatabaseVariable: "DIRECT_URL" | "DATABASE_URL_UNPOOLED" | null;
};

export type DeploymentContractOptions = {
  runtimeOnly?: boolean;
};

type ParsedDatabaseUrl = {
  hostname: string;
  database: string;
  username: string;
};

const SECRET_MIN_LENGTH = 32;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const SAFE_POSTGRES_IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const FORBIDDEN_DATABASE_QUERY_PARAMETERS = new Set([
  "database",
  "db",
  "host",
  "options",
  "password",
  "port",
  "ssl",
  "sslcert",
  "sslkey",
  "sslnegotiation",
  "sslpassword",
  "sslrootcert",
  "user",
  "uselibpqcompat",
]);
const MOCK_BOOLEAN_VARIABLES = [
  "ENABLE_INTEGRATION_MOCKS",
  "ENABLE_MOCK_API",
  "ENABLE_MOCK_LTI",
] as const;
const MOCK_PROVIDER_VARIABLES = [
  "EMAIL_PROVIDER",
  "SMS_PROVIDER",
  "WHATSAPP_PROVIDER",
  "PUSH_PROVIDER",
] as const;
const OPTIONAL_SECRET_VARIABLES = [
  "AGENT_API_TOKEN",
  "AGENT_WEBHOOK_SECRET",
  "CEREBRAS_API_KEY",
  "CRON_SECRET",
  "FIREBASE_PRIVATE_KEY",
  "MSG91_AUTH_KEY",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "SMTP_PASS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "TWILIO_AUTH_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

function normalized(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

function looksLikePlaceholder(value: string): boolean {
  const candidate = normalized(value);
  if (!candidate) return true;

  return (
    [
      "change-me",
      "change_me",
      "changeme",
      "dummy",
      "generate-a-",
      "mock-secret",
      "placeholder",
      "replace-with",
      "replace_with",
      "test-secret",
      "your-secret",
      "your_secret",
      "xxxxx",
    ].some((token) => candidate.includes(token)) ||
    candidate.includes("${") ||
    candidate.includes("<") ||
    candidate.includes(">") ||
    /^x{16,}$/i.test(candidate) ||
    /^0{16,}$/.test(candidate)
  );
}

function isPlaceholderHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    LOCAL_HOSTS.has(host) ||
    host === "example.com" ||
    host === "example.org" ||
    host === "example.net" ||
    host.endsWith(".example") ||
    host.endsWith(".invalid")
  );
}

function addIssue(
  issues: DeploymentContractIssue[],
  variable: string,
  message: string,
): void {
  issues.push({ variable, message });
}

function requireValue(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
  variable: string,
): string | null {
  const value = env[variable]?.trim();
  if (!value) {
    addIssue(
      issues,
      variable,
      "must be configured for this deployment target.",
    );
    return null;
  }
  return value;
}

function validateSecretValue(
  issues: DeploymentContractIssue[],
  variable: string,
  value: string | undefined,
  minLength = SECRET_MIN_LENGTH,
): boolean {
  if (!value || value.length < minLength) {
    addIssue(
      issues,
      variable,
      `must be configured with at least ${minLength} characters.`,
    );
    return false;
  }
  if (looksLikePlaceholder(value)) {
    addIssue(
      issues,
      variable,
      "must not contain a placeholder, mock, or development value.",
    );
    return false;
  }
  return true;
}

function requireSecret(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
  variable: string,
  minLength = SECRET_MIN_LENGTH,
): void {
  validateSecretValue(issues, variable, env[variable], minLength);
}

function requireOneSecret(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
  variables: string[],
): void {
  const configured = variables.find((variable) =>
    Boolean(env[variable]?.trim()),
  );
  if (!configured) {
    addIssue(
      issues,
      variables.join(" or "),
      `one of ${variables.join(", ")} must be configured with at least ${SECRET_MIN_LENGTH} characters.`,
    );
    return;
  }
  validateSecretValue(issues, configured, env[configured]);
}

function parseDatabaseUrl(
  issues: DeploymentContractIssue[],
  variable: string,
  value: string | undefined,
  expectedConnection: "pooled" | "direct",
): ParsedDatabaseUrl | null {
  if (!value) {
    addIssue(
      issues,
      variable,
      "must be configured with a Neon Postgres connection URL.",
    );
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    addIssue(issues, variable, "must be a valid Postgres URL.");
    return null;
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    addIssue(
      issues,
      variable,
      "must use the postgres:// or postgresql:// protocol.",
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  const queryParameters = [...parsed.searchParams.entries()];
  const forbiddenParameters = queryParameters
    .map(([key]) => key.toLowerCase())
    .filter((key) => FORBIDDEN_DATABASE_QUERY_PARAMETERS.has(key));
  if (forbiddenParameters.length > 0) {
    addIssue(
      issues,
      variable,
      `must not override connection identity, session, or TLS settings through query parameters (${[...new Set(forbiddenParameters)].join(", ")}).`,
    );
  }
  const sslModes = queryParameters
    .filter(([key]) => key.toLowerCase() === "sslmode")
    .map(([, mode]) => mode.toLowerCase());
  if (sslModes.length > 1 || sslModes.some((mode) => mode !== "verify-full")) {
    addIssue(issues, variable, "may only specify sslmode=verify-full.");
  }
  const channelBindings = queryParameters
    .filter(([key]) => key.toLowerCase() === "channel_binding")
    .map(([, mode]) => mode.toLowerCase());
  if (
    channelBindings.length > 1 ||
    channelBindings.some((mode) => mode !== "require")
  ) {
    addIssue(issues, variable, "may only specify channel_binding=require.");
  }
  if (parsed.port && parsed.port !== "5432") {
    addIssue(issues, variable, "must use Neon PostgreSQL port 5432.");
  }
  if (!hostname.endsWith(".neon.tech")) {
    addIssue(
      issues,
      variable,
      "must use a Neon hostname ending in .neon.tech.",
    );
  }

  const pooled = hostname.includes("-pooler.");
  if (expectedConnection === "pooled" && !pooled) {
    addIssue(issues, variable, "must use the pooled Neon runtime hostname.");
  }
  if (expectedConnection === "direct" && pooled) {
    addIssue(
      issues,
      variable,
      "must use the direct Neon hostname, not the pooler.",
    );
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!parsed.username || !parsed.password || !database) {
    addIssue(
      issues,
      variable,
      "must include a database user, password, and database name.",
    );
  } else if (looksLikePlaceholder(parsed.password)) {
    addIssue(
      issues,
      variable,
      "must not contain placeholder database credentials.",
    );
  } else if (!SAFE_POSTGRES_IDENTIFIER.test(database)) {
    addIssue(
      issues,
      variable,
      "must use a lowercase PostgreSQL database identifier.",
    );
  }

  return {
    hostname,
    database,
    username: decodeURIComponent(parsed.username),
  };
}

function directHostForPooled(hostname: string): string {
  return hostname.replace("-pooler.", ".");
}

function sameDatabase(
  left: ParsedDatabaseUrl,
  right: ParsedDatabaseUrl,
): boolean {
  return left.hostname === right.hostname && left.database === right.database;
}

function validateApplicationUrl(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
): string | null {
  const value = requireValue(env, issues, "NEXT_PUBLIC_APP_URL");
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      addIssue(issues, "NEXT_PUBLIC_APP_URL", "must use https://.");
    }
    if (isPlaceholderHost(parsed.hostname)) {
      addIssue(
        issues,
        "NEXT_PUBLIC_APP_URL",
        "must use a non-local, non-placeholder hostname.",
      );
    }
    if (parsed.username || parsed.password) {
      addIssue(
        issues,
        "NEXT_PUBLIC_APP_URL",
        "must not contain URL credentials.",
      );
    }
    if (
      (parsed.pathname !== "/" && parsed.pathname !== "") ||
      parsed.search ||
      parsed.hash ||
      parsed.port
    ) {
      addIssue(
        issues,
        "NEXT_PUBLIC_APP_URL",
        "must be an HTTPS origin without a path, query, fragment, or custom port.",
      );
    }
    return parsed.hostname.toLowerCase();
  } catch {
    addIssue(issues, "NEXT_PUBLIC_APP_URL", "must be a valid absolute URL.");
    return null;
  }
}

function validateTenantHosts(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
  applicationHost: string | null,
): void {
  const value = requireValue(env, issues, "TENANT_BASE_HOSTS");
  if (!value) return;

  const hosts = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (hosts.length === 0) {
    addIssue(
      issues,
      "TENANT_BASE_HOSTS",
      "must contain at least one hostname.",
    );
    return;
  }

  for (const host of hosts) {
    if (
      host.includes("://") ||
      host.includes("/") ||
      host.includes("*") ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        host,
      ) ||
      isPlaceholderHost(host)
    ) {
      addIssue(
        issues,
        "TENANT_BASE_HOSTS",
        "must contain only non-local production hostnames without protocols, paths, or wildcards.",
      );
      break;
    }
  }

  if (applicationHost && !hosts.includes(applicationHost)) {
    addIssue(
      issues,
      "TENANT_BASE_HOSTS",
      "must include the NEXT_PUBLIC_APP_URL hostname.",
    );
  }
}

function validateRateLimiting(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
): void {
  const backend = normalized(env.RATE_LIMIT_BACKEND);
  if (backend !== "postgres" && backend !== "redis") {
    addIssue(
      issues,
      "RATE_LIMIT_BACKEND",
      "must be explicitly set to postgres or redis.",
    );
  }
  if (normalized(env.DISABLE_RATE_LIMIT) === "true") {
    addIssue(
      issues,
      "DISABLE_RATE_LIMIT",
      "must not be true in a deployed environment.",
    );
  }
  if (backend === "redis") {
    const redisUrl = requireValue(env, issues, "UPSTASH_REDIS_REST_URL");
    if (redisUrl) {
      try {
        if (new URL(redisUrl).protocol !== "https:") {
          addIssue(issues, "UPSTASH_REDIS_REST_URL", "must use https://.");
        }
      } catch {
        addIssue(
          issues,
          "UPSTASH_REDIS_REST_URL",
          "must be a valid absolute URL.",
        );
      }
    }
    requireSecret(env, issues, "UPSTASH_REDIS_REST_TOKEN", 16);
  }
}

function validateMockModes(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
): void {
  for (const variable of MOCK_BOOLEAN_VARIABLES) {
    if (normalized(env[variable]) === "true") {
      addIssue(
        issues,
        variable,
        "must not enable mock behavior in a deployed environment.",
      );
    }
  }
  if (normalized(env.INTEGRATIONS_MODE) !== "live") {
    addIssue(
      issues,
      "INTEGRATIONS_MODE",
      "must be explicitly set to live in a deployed environment.",
    );
  }
  if (normalized(env.NEXT_PUBLIC_API_MOCKING) === "enabled") {
    addIssue(
      issues,
      "NEXT_PUBLIC_API_MOCKING",
      "must not enable API mocking in a deployed environment.",
    );
  }
  for (const variable of MOCK_PROVIDER_VARIABLES) {
    if (normalized(env[variable]) === "mock") {
      addIssue(
        issues,
        variable,
        "must not select a mock provider in a deployed environment.",
      );
    }
  }
  if (normalized(env.CSP_ENFORCE) !== "true") {
    addIssue(
      issues,
      "CSP_ENFORCE",
      "must be explicitly set to true in a deployed environment.",
    );
  }
}

function validatePaymentProvider(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
  target: DeploymentTarget,
): void {
  const provider = normalized(env.PAYMENT_PROVIDER);
  if (!provider || provider === "none") return;

  if (provider === "stripe") {
    requireSecret(env, issues, "STRIPE_SECRET_KEY", 16);
    requireSecret(env, issues, "STRIPE_WEBHOOK_SECRET", 16);
    if (
      target === "production" &&
      env.STRIPE_SECRET_KEY &&
      !env.STRIPE_SECRET_KEY.startsWith("sk_live_")
    ) {
      addIssue(
        issues,
        "STRIPE_SECRET_KEY",
        "must use a live Stripe key in production.",
      );
    }
    return;
  }

  if (provider === "razorpay") {
    requireSecret(env, issues, "RAZORPAY_KEY_ID", 8);
    requireSecret(env, issues, "RAZORPAY_KEY_SECRET", 16);
    requireSecret(env, issues, "RAZORPAY_WEBHOOK_SECRET", 16);
    if (
      target === "production" &&
      env.RAZORPAY_KEY_ID &&
      !env.RAZORPAY_KEY_ID.startsWith("rzp_live_")
    ) {
      addIssue(
        issues,
        "RAZORPAY_KEY_ID",
        "must use a live Razorpay key in production.",
      );
    }
    return;
  }

  addIssue(
    issues,
    "PAYMENT_PROVIDER",
    "must be unset, none, stripe, or razorpay.",
  );
}

function validateConfiguredProviders(
  env: NodeJS.ProcessEnv,
  issues: DeploymentContractIssue[],
): void {
  const emailProvider = normalized(env.EMAIL_PROVIDER);
  if (emailProvider === "resend") {
    requireSecret(env, issues, "RESEND_API_KEY", 16);
  } else if (emailProvider === "smtp") {
    requireValue(env, issues, "SMTP_HOST");
    requireValue(env, issues, "SMTP_USER");
    requireSecret(env, issues, "SMTP_PASS", 16);
  } else if (emailProvider) {
    addIssue(issues, "EMAIL_PROVIDER", "must be unset, resend, or smtp.");
  }

  const smsProvider = normalized(env.SMS_PROVIDER);
  if (smsProvider === "msg91") {
    requireSecret(env, issues, "MSG91_AUTH_KEY", 16);
  } else if (smsProvider === "twilio") {
    requireSecret(env, issues, "TWILIO_ACCOUNT_SID", 16);
    requireSecret(env, issues, "TWILIO_AUTH_TOKEN", 16);
    requireValue(env, issues, "TWILIO_FROM_NUMBER");
  } else if (smsProvider) {
    addIssue(issues, "SMS_PROVIDER", "must be unset, msg91, or twilio.");
  }

  const pushProvider = normalized(env.PUSH_PROVIDER);
  if (pushProvider === "firebase") {
    requireValue(env, issues, "FIREBASE_PROJECT_ID");
    requireValue(env, issues, "FIREBASE_CLIENT_EMAIL");
    requireSecret(env, issues, "FIREBASE_PRIVATE_KEY", 16);
  } else if (pushProvider) {
    addIssue(issues, "PUSH_PROVIDER", "must be unset or firebase.");
  }
}

export function parseDeploymentTarget(
  value: string | undefined,
): DeploymentTarget | null {
  const target = normalized(value);
  return target === "preview" || target === "production" ? target : null;
}

export function validateDeploymentContract(
  env: NodeJS.ProcessEnv,
  target: DeploymentTarget,
  options: DeploymentContractOptions = {},
): DeploymentContractResult {
  const issues: DeploymentContractIssue[] = [];

  const runtimeDatabase = parseDatabaseUrl(
    issues,
    "DATABASE_URL",
    env.DATABASE_URL,
    "pooled",
  );

  const directDatabaseVariable = env.DIRECT_URL?.trim()
    ? "DIRECT_URL"
    : env.DATABASE_URL_UNPOOLED?.trim()
      ? "DATABASE_URL_UNPOOLED"
      : null;
  if (options.runtimeOnly && directDatabaseVariable) {
    addIssue(
      issues,
      directDatabaseVariable,
      "must not be exposed to a runtime-only production build.",
    );
  }
  const directDatabase = options.runtimeOnly
    ? null
    : parseDatabaseUrl(
        issues,
        directDatabaseVariable || "DIRECT_URL or DATABASE_URL_UNPOOLED",
        directDatabaseVariable ? env[directDatabaseVariable] : undefined,
        "direct",
      );

  const runtimeRole = requireValue(env, issues, "DEPLOYMENT_RUNTIME_ROLE");
  const migrationRole = requireValue(env, issues, "DEPLOYMENT_MIGRATION_ROLE");
  for (const [variable, role] of [
    ["DEPLOYMENT_RUNTIME_ROLE", runtimeRole],
    ["DEPLOYMENT_MIGRATION_ROLE", migrationRole],
  ] as const) {
    if (role && !SAFE_POSTGRES_IDENTIFIER.test(role)) {
      addIssue(
        issues,
        variable,
        "must be a lowercase PostgreSQL role identifier containing only letters, digits, and underscores.",
      );
    }
  }
  if (runtimeRole && migrationRole && runtimeRole === migrationRole) {
    addIssue(
      issues,
      "DEPLOYMENT_RUNTIME_ROLE and DEPLOYMENT_MIGRATION_ROLE",
      "must be distinct least-privilege runtime and DDL-owner roles.",
    );
  }
  if (
    runtimeDatabase &&
    runtimeRole &&
    runtimeDatabase.username !== runtimeRole
  ) {
    addIssue(
      issues,
      "DATABASE_URL and DEPLOYMENT_RUNTIME_ROLE",
      "must use the configured runtime role.",
    );
  }
  if (
    directDatabase &&
    migrationRole &&
    directDatabase.username !== migrationRole
  ) {
    addIssue(
      issues,
      "direct database URL and DEPLOYMENT_MIGRATION_ROLE",
      "must use the configured migration role.",
    );
  }

  if (runtimeDatabase && directDatabase) {
    const expectedDirectHost = directHostForPooled(runtimeDatabase.hostname);
    if (
      expectedDirectHost !== directDatabase.hostname ||
      runtimeDatabase.database !== directDatabase.database
    ) {
      addIssue(
        issues,
        "DATABASE_URL and direct database URL",
        "must identify the pooled and direct endpoints for the same Neon branch and database.",
      );
    }
  }

  if (
    !options.runtimeOnly &&
    env.DIRECT_URL?.trim() &&
    env.DATABASE_URL_UNPOOLED?.trim()
  ) {
    const unpooledDatabase = parseDatabaseUrl(
      issues,
      "DATABASE_URL_UNPOOLED",
      env.DATABASE_URL_UNPOOLED,
      "direct",
    );
    if (
      directDatabase &&
      unpooledDatabase &&
      !sameDatabase(directDatabase, unpooledDatabase)
    ) {
      addIssue(
        issues,
        "DIRECT_URL and DATABASE_URL_UNPOOLED",
        "must identify the same direct Neon branch and database when both are set.",
      );
    }
  }

  if (env.DATABASE_SSL_MODE !== "verify-full") {
    addIssue(issues, "DATABASE_SSL_MODE", "must be set to verify-full.");
  }

  requireSecret(env, issues, "SESSION_SECRET");
  requireOneSecret(env, issues, ["PII_ENCRYPTION_KEY", "ENCRYPTION_KEY"]);
  requireSecret(env, issues, "METRICS_TOKEN");
  requireSecret(env, issues, "JOB_DISPATCH_SECRET");

  const applicationHost = validateApplicationUrl(env, issues);
  validateTenantHosts(env, issues, applicationHost);
  validateRateLimiting(env, issues);
  validateMockModes(env, issues);
  validatePaymentProvider(env, issues, target);
  validateConfiguredProviders(env, issues);

  if (normalized(env.JOB_QUEUE_MODE) !== "database") {
    addIssue(issues, "JOB_QUEUE_MODE", "must be explicitly set to database.");
  }

  for (const variable of OPTIONAL_SECRET_VARIABLES) {
    const value = env[variable];
    if (value && looksLikePlaceholder(value)) {
      addIssue(
        issues,
        variable,
        "must not contain a placeholder, mock, or development value.",
      );
    }
  }

  return {
    target,
    ok: issues.length === 0,
    issues,
    directDatabaseVariable,
  };
}

export function formatDeploymentContractIssue(
  issue: DeploymentContractIssue,
): string {
  return `[deploy:error] ${issue.variable}: ${issue.message}`;
}

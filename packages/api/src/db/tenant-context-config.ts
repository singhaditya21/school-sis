export const LOCAL_TENANT_CONTEXT_KEY_ID = "local-ci-v1";
export const LOCAL_TENANT_CONTEXT_AUDIENCE = "ci:local:database";
export const LOCAL_TENANT_CONTEXT_SECRET =
  "localCI_0123456789abcdefghijklmnopqrstuvwxyzABCDEF";

type TenantContextProcessEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    | "DATABASE_URL"
    | "NODE_ENV"
    | "TENANT_CONTEXT_AUDIENCE"
    | "TENANT_CONTEXT_SIGNING_KEY_ID"
    | "TENANT_CONTEXT_SIGNING_SECRET"
  >
>;

export type TenantContextSigningEnvironment = Pick<
  TenantContextProcessEnvironment,
  | "TENANT_CONTEXT_AUDIENCE"
  | "TENANT_CONTEXT_SIGNING_KEY_ID"
  | "TENANT_CONTEXT_SIGNING_SECRET"
>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const CONNECTION_IDENTITY_OVERRIDES = new Set([
  "database",
  "db",
  "host",
  "hostaddr",
  "options",
  "password",
  "port",
  "user",
]);

function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) &&
      [...parsed.searchParams.keys()].every(
        (key) => !CONNECTION_IDENTITY_OVERRIDES.has(key.toLowerCase()),
      )
    );
  } catch {
    return false;
  }
}

/**
 * Supplies the well-known development key only when every signing value is
 * absent, NODE_ENV is not production, and DATABASE_URL is strictly local.
 * Partial configuration and every remote runtime remain fail-closed.
 */
export function resolveTenantContextSigningEnvironment(
  environment: TenantContextProcessEnvironment,
): TenantContextSigningEnvironment {
  const configured = {
    TENANT_CONTEXT_AUDIENCE: environment.TENANT_CONTEXT_AUDIENCE,
    TENANT_CONTEXT_SIGNING_KEY_ID: environment.TENANT_CONTEXT_SIGNING_KEY_ID,
    TENANT_CONTEXT_SIGNING_SECRET: environment.TENANT_CONTEXT_SIGNING_SECRET,
  };
  const hasAnyConfiguredValue = Object.values(configured).some(
    (value) => value !== undefined,
  );
  if (
    !hasAnyConfiguredValue &&
    environment.NODE_ENV !== "production" &&
    isLocalDatabaseUrl(environment.DATABASE_URL)
  ) {
    return {
      TENANT_CONTEXT_AUDIENCE: LOCAL_TENANT_CONTEXT_AUDIENCE,
      TENANT_CONTEXT_SIGNING_KEY_ID: LOCAL_TENANT_CONTEXT_KEY_ID,
      TENANT_CONTEXT_SIGNING_SECRET: LOCAL_TENANT_CONTEXT_SECRET,
    };
  }
  return configured;
}

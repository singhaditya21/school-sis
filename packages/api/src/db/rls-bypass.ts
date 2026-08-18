const justificationBrand: unique symbol = Symbol("rls-bypass-justification");

export type RlsBypassJustification = Readonly<{
  id: string;
  reason: string;
  [justificationBrand]: true;
}>;

function defineJustification(
  id: string,
  reason: string,
): RlsBypassJustification {
  if (!/^[a-z][a-z0-9.-]+$/.test(id) || reason.trim().length < 30) {
    throw new Error(`Invalid RLS bypass justification: ${id}`);
  }
  const value = { id, reason } as RlsBypassJustification;
  Object.defineProperty(value, justificationBrand, { value: true });
  return Object.freeze(value);
}

/**
 * Reviewed inventory of operations that must begin without a tenant context or
 * intentionally aggregate platform-owned data. The branded values make bypass
 * selection compile-time mandatory and keep the rationale searchable in one place.
 */
export const RLS_BYPASS_JUSTIFICATIONS = {
  PLATFORM_SESSION: defineJustification(
    "auth.platform-session",
    "A verified PLATFORM_ADMIN session must administer records across tenant boundaries.",
  ),
  PASSWORD_LOGIN: defineJustification(
    "auth.password-login",
    "Password login must locate the user and tenant before a tenant context can be established.",
  ),
  ENTERPRISE_IDENTITY_LOOKUP: defineJustification(
    "auth.enterprise-identity",
    "Enterprise SSO must resolve an identity-to-tenant mapping before tenant context exists.",
  ),
  TENANT_PROVISIONING: defineJustification(
    "onboarding.tenant-provisioning",
    "Public onboarding creates the company, tenant, and first administrator before that tenant exists.",
  ),
  PUBLIC_LEAD_CAPTURE: defineJustification(
    "marketing.public-lead",
    "Public lead intake writes platform-owned marketing data that is not associated with a tenant.",
  ),
  RATE_LIMIT_BUCKETS: defineJustification(
    "security.rate-limit-buckets",
    "Rate-limit buckets are platform-owned operational state keyed across public and tenant endpoints.",
  ),
  INTEGRATION_API_KEY_AUTH: defineJustification(
    "integration.api-key-auth",
    "Integration API-key lookup must identify the tenant before entering its database context.",
  ),
  PRODUCTION_INTEGRATION_AUDIT: defineJustification(
    "integration.production-audit",
    "Authenticated production readiness must scan every tenant for forbidden mock integration configuration.",
  ),
  NOTIFICATION_SWEEP: defineJustification(
    "worker.notification-sweep",
    "The scheduler must discover due notification identifiers across tenants before per-tenant delivery.",
  ),
  PLATFORM_METRICS: defineJustification(
    "observability.platform-metrics",
    "Platform metrics aggregate operational counts across all tenant and platform records.",
  ),
  PLATFORM_EVENT_WRITE: defineJustification(
    "observability.platform-event",
    "An event without a tenant identifier is platform-owned observability data.",
  ),
  PLATFORM_INCIDENT_WRITE: defineJustification(
    "observability.platform-incident",
    "An incident without a tenant identifier is platform-owned SRE data.",
  ),
  OPERATIONAL_SNAPSHOT: defineJustification(
    "observability.operational-snapshot",
    "The protected operator snapshot aggregates jobs, notifications, incidents, and SLOs across tenants.",
  ),
  PLATFORM_READINESS: defineJustification(
    "observability.platform-readiness",
    "The authenticated readiness probe must verify the dedicated platform database role and reviewed bypass path.",
  ),
  PLATFORM_JOB_PERSISTENCE: defineJustification(
    "worker.platform-job-persistence",
    "A platform-scoped background job has no tenant and must be persisted in the shared queue.",
  ),
  JOB_DISPATCH: defineJustification(
    "worker.cross-tenant-dispatch",
    "The trusted dispatcher claims and records lifecycle state for jobs across tenant queues.",
  ),
  PROVIDER_PAYMENT_LOOKUP: defineJustification(
    "payments.provider-order-lookup",
    "A verified payment-provider callback must map its provider order identifier to a tenant.",
  ),
  PROVIDER_EVENT_LEDGER: defineJustification(
    "payments.provider-event-ledger",
    "Verified provider webhook events use a global idempotency ledger before tenant routing.",
  ),
  STRIPE_SUBSCRIPTION_UPDATE: defineJustification(
    "payments.stripe-subscription",
    "A verified Stripe webhook updates platform company billing state by provider subscription identifier.",
  ),
  PLATFORM_OPERATOR_CONSOLE: defineJustification(
    "operations.platform-console",
    "A verified platform operator requested an explicitly cross-tenant operational console view.",
  ),
  PLATFORM_INCIDENT_READ: defineJustification(
    "operations.platform-incident-read",
    "A verified platform operator requested incidents across all tenant and platform scopes.",
  ),
  PLATFORM_INCIDENT_UPDATE: defineJustification(
    "operations.platform-incident-update",
    "A verified platform operator is changing platform-managed incident lifecycle state.",
  ),
  PLATFORM_JOB_INSPECTION: defineJustification(
    "operations.platform-job-inspection",
    "A verified platform operator is inspecting a job and linked records across tenant scopes.",
  ),
  TEST_CONTEXT_NESTING: defineJustification(
    "test.context-nesting",
    "The database context unit test verifies bypass nesting and outer tenant restoration.",
  ),
} as const;

export function assertRlsBypassJustification(
  value: RlsBypassJustification,
): void {
  if (!value || value[justificationBrand] !== true) {
    throw new Error("RLS bypass requires a reviewed justification.");
  }
}

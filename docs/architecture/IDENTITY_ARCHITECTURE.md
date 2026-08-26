# Identity Architecture

School SIS uses Iron Session as the product session boundary. All login paths now establish the same session shape: user, tenant, role, provider, issue time, expiry, MFA state, company context, active modules, and optional impersonation metadata.

## Implemented Controls

- **Unified session lifecycle:** password, SSO, platform restore, and impersonation sessions are created through `establishSession()`.
- **Session expiry:** application middleware and `getSession()` reject expired sessions before route or database access.
- **MFA policy:** privileged roles require MFA in production, or in any environment when `REQUIRE_MFA_ENROLLMENT=true`.
- **Fail-closed SSO:** generic OIDC code exchange maps only to an existing active user and tenant. Duplicate emails across tenants are rejected unless `SSO_TENANT_ID` scopes the provider.
- **SSO state:** SSO initiation stores a short-lived state token in the encrypted session and callback processing verifies it.
- **Support impersonation:** impersonation stores actor ID, actor tenant, actor email, start time, expiry, and target identity explicitly. The legacy `impersonating:<id>` token marker remains only for compatibility.
- **SCIM-style provisioning:** `/api/scim/v2/Users` and `/api/scim/v2/Users/:id` support tenant-scoped user list, create, read, patch, and deprovision operations.
- **Service authentication:** SCIM requires `Authorization: Bearer <SCIM_BEARER_TOKEN>` and `X-Tenant-Id`; tenant IDs are validated before DB context is entered.

## Environment Variables

- `SESSION_TTL_MINUTES`: optional tenant-user session TTL. Default: 720 minutes.
- `PLATFORM_SESSION_TTL_MINUTES`: optional platform-admin session TTL. Default: 480 minutes.
- `IMPERSONATION_TTL_MINUTES`: optional support impersonation TTL. Default: 60 minutes.
- `REQUIRE_MFA_ENROLLMENT`: set to `true` outside production if privileged-role MFA enrollment should be enforced locally.
- `SCIM_BEARER_TOKEN`: required for SCIM endpoints, minimum 32 characters.
- `SSO_AUTHORIZATION_URL`, `SSO_TOKEN_URL`, `SSO_USERINFO_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`: generic OIDC provider configuration.
- `SSO_SCOPES`: optional OIDC scope string. Default: `openid email profile`.
- `SSO_REDIRECT_URI`: optional callback URI used during token exchange when the caller does not pass one.
- `SSO_TENANT_ID`: optional tenant scope for providers where email addresses may not be globally unique.
- `SSO_ASSUME_MFA`: set to `true` only when the identity provider enforces MFA for the connected app.
- Provider-specific overrides can use `SSO_<PROVIDER>_<NAME>`, for example `SSO_GOOGLE_CLIENT_ID`.

## Remaining Hardening

- Add a first-party UI flow for SSO callback routing if customer SSO is exposed directly in the product UI.
- Add admin screens for SCIM token rotation and per-tenant provider configuration instead of global environment variables.
- Add audit-log events for SCIM create/update/deactivate once the audit schema is standardized across all tenants.

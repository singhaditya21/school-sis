# Fine-Grained Authorization Architecture

School SIS now has a central authorization contract in `packages/api/src/authorization`. The web RBAC helper delegates to this contract, so existing calls such as `hasPermission(role, 'fees:read')` keep working while newer code can call `evaluateAccess()` with tenant, owner, assignment, class, department, field, and approval context.

## Permission Model

Permissions use `resource:action[:scope]`.

- `platform`: platform operator access across tenants.
- `tenant`: access inside the active tenant.
- `department`: access limited to the actor department.
- `class`: teacher access limited to assigned class rosters.
- `assigned`: actor access limited to an assigned task, appointment, timetable item, or workload.
- `own`: parent, guardian, or student access limited to owned records.

`PLATFORM_ADMIN` receives platform-scoped wildcard access. `SUPER_ADMIN` receives tenant-scoped wildcard access, which is intentionally not enough for platform APIs when `requiredScope: 'platform'` is passed to the evaluator.

## Runtime Surfaces

- `apps/web/src/lib/rbac/permissions.ts` remains the compatibility facade for existing imports.
- `hasPermission()` is still a boolean role check for legacy guards.
- `evaluateAccess()` is the required path for high-risk mutations and reads where resource ownership or field-level sensitivity matters.
- `assertAuthorized()` throws on denied decisions and can be used inside services and server actions.
- `findRoutePolicy()` publishes route-to-permission metadata for route middleware hardening.

## Field Policies

Sensitive fields are described centrally for resources such as `students`, `guardians`, `staff_profiles`, `payments`, `invoices`, and `integrations`. The evaluator denies a request when the caller asks for fields outside the role's read or write allowance.

This is the expected pattern for API reads:

1. Authenticate the user.
2. Resolve the resource tenant and ownership context.
3. Call `evaluateAccess()` with `resource`, `operation`, and requested `fields`.
4. Redact or reject based on `deniedFields`.

## Approval Policies

High-risk actions now have explicit approval policy metadata:

- fee waivers and invoice cancellations
- refunds
- student transfers and archival
- exam result publishing
- user role changes
- PII exports
- metadata publication
- AI agent approval review

The evaluator returns `approvalRequired` when the caller is allowed to initiate the action but the action needs a workflow approval before completion.

## Adoption Path

Existing guards are now backed by the central policy, but not every service passes full resource context yet. The next implementation pass should upgrade sensitive paths from boolean guards to `evaluateAccess()`:

- finance mutations and provider webhook reconciliation
- student profile reads and updates
- teacher gradebook and attendance writes
- parent/student self-service endpoints
- exports and report downloads
- metadata publication
- integration API key and webhook management

The long-term target is: session auth establishes actor context, database RLS enforces tenant context, `evaluateAccess()` enforces resource ownership and field policy, and approval workflows govern irreversible or money-moving actions.

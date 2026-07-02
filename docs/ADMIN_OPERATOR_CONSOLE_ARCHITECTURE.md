# Admin / Operator Console Architecture

School SIS now has a control-plane architecture for platform and tenant operators. The console is modeled as a typed catalog, live snapshot builder, guarded action registry, runbook catalog, and durable operator audit schema.

## Implemented Controls

- **Console catalog:** `TENANTS`, `JOBS`, `NOTIFICATIONS`, `PAYMENTS`, `INTEGRATIONS`, `APPROVALS`, `INCIDENTS`, `OBSERVABILITY`, `SECURITY`, and `DATA_PLATFORM` tiles are defined in one shared contract.
- **Live snapshot API:** `GET /api/operator/console` returns a no-store operator snapshot for the current session.
- **Tenant-safe visibility:** platform admins can request platform-wide snapshots; tenant admins receive tenant-scoped snapshots and filtered tiles/signals.
- **Authorization guard:** operator actions reuse the fine-grained authorization evaluator and require audit reasons for risky mutations.
- **Runbooks:** every tile has linked runbooks for the main failure modes.
- **Durable tables:** `operator_console_snapshots`, `operator_console_runbooks`, and `operator_console_action_logs` support snapshot persistence, custom runbooks, and audited operator actions.
- **RLS:** operator tables use forced row-level security; platform rows require bypass and tenant rows require tenant context.
- **Route policy:** `/operator` and `/api/operator` are registered as tenant operator boundaries.

## Console Domains

| Domain | Primary Sources | Operator Outcome |
| --- | --- | --- |
| Tenant Health | `tenants`, `observability_events`, `sre_incidents` | Platform-wide tenant triage |
| Jobs | `background_jobs`, `background_job_attempts` | Retry or cancel failed jobs |
| Notifications | `notification_outbox`, `notification_delivery_events` | Replay failed communications |
| Payments | `payment_orders`, `payment_provider_events`, `payment_audit_logs` | Reconcile money movement |
| Integrations | `integration_connections`, `integration_api_keys`, `integration_audit_logs` | Retry partner delivery and rotate keys |
| Approvals | `workflow_approval_requests`, `workflow_approval_reviews` | Escalate overdue approvals |
| Incidents | `sre_incidents`, `observability_events` | Acknowledge and resolve incidents |
| Observability | `slo_definitions`, `slo_measurements`, `observability_events` | Detect SLO burn and telemetry risk |
| Security | `audit_logs`, `observability_events`, `integration_api_keys` | Track findings and secret rotation |
| Data Platform | `metadata_objects`, `metadata_fields`, `metadata_migration_jobs` | Catch metadata and migration drift |

## Action Model

Operator actions are not free-form commands. Each action has:

- an action type,
- required permission and scope,
- target scope,
- audit action,
- optional approval policy,
- reason requirement.

Current actions include incident acknowledgement/resolution, job retry, notification replay, webhook retry, payment reconciliation, approval review, API key rotation, tenant suspension, and runbook open.

## Remaining Product Work

- Build the actual `/operator` UI over the API contract.
- Persist scheduled snapshots from a background job for history and trend charts.
- Add operator action execution endpoints that write `operator_console_action_logs` before invoking domain-specific workers.
- Add alert routing from critical signals to email/SMS/on-call channels.
- Add MTTA/MTTR and action-success dashboards.

# Workflow Approval Engine Architecture

School SIS now has a reusable workflow approval engine under `packages/api/src/workflows/approvals`. It builds on the fine-grained authorization approval policies and turns them into executable approval requests with SLA windows, expiry windows, escalation roles, review events, and tenant-scoped persistence.

## Core Model

The engine has four persisted records:

- `workflow_approval_requests`: the approval case, policy, resource, required roles, SLA, expiry, status, and counters.
- `workflow_approval_reviews`: immutable reviewer decisions with role, reason, delegation metadata, and timestamp.
- `workflow_approval_events`: append-only audit timeline for request, approval, rejection, escalation, cancellation, and expiry.
- `workflow_approval_delegations`: temporary reviewer delegation from one user/role to another user/role.

Every table is tenant-scoped and protected by RLS in `apps/web/drizzle/0011_workflow_approval_engine.sql`.

## State Model

Requests start as `PENDING`.

- `APPROVED`: enough eligible approvers approved the request.
- `REJECTED`: any eligible approver rejected the request.
- `ESCALATED`: SLA due time passed and escalation roles were added.
- `CANCELLED`: requester or operator cancelled before completion.
- `EXPIRED`: expiry time passed before completion.

Terminal states are `APPROVED`, `REJECTED`, `CANCELLED`, and `EXPIRED`.

## Policy Source

The workflow policy catalog is derived from `AUTHORIZATION_APPROVAL_POLICIES`.

Each workflow policy adds:

- SLA hours
- expiry hours
- escalation approver roles
- requester self-approval rule
- notification channels

Examples:

- payment refunds: 4-hour SLA, 48-hour expiry, escalates to `SUPER_ADMIN` and `PLATFORM_ADMIN`
- PII exports: 2-hour SLA, 24-hour expiry, escalates to `SUPER_ADMIN` and `PLATFORM_ADMIN`
- student transfers: 12-hour SLA, 96-hour expiry, escalates to school leadership

## Runtime Contract

Use the pure engine for state transitions:

- `createWorkflowApprovalRequest()`
- `reviewWorkflowApprovalRequest()`
- `escalateWorkflowApprovalRequest()`
- `expireWorkflowApprovalRequest()`
- `cancelWorkflowApprovalRequest()`
- `toWorkflowApprovalQueueItem()`
- `canActorReviewWorkflowApproval()`

The pure engine does not touch the database. Persistence is handled by `packages/api/src/workflows/approvals/repository.ts`, which:

- creates idempotent tenant-scoped approval requests,
- writes request/review/event rows,
- verifies approval policy, tenant, resource, and payload hash before approval reuse,
- blocks self-approval and ineligible reviewer roles through the engine,
- returns payload-free summaries for API callers.

## Adopted Surfaces

Generic API:

- `GET /api/workflow-approvals`: list approval summaries visible to the requester or eligible approver role.
- `POST /api/workflow-approvals`: create an idempotent approval request from session-derived tenant and actor context.
- `POST /api/workflow-approvals/:id/review`: approve or reject a persisted approval request.

Generic UI:

- `/approvals`: tenant-scoped workflow approval queue for pending, escalated, approved, rejected, and all approval states.
- Review actions write to the generic workflow review endpoint and no longer depend on the legacy agent-only approval API.

Enforced gates:

- BI sensitive export validation now creates or requires an approved `data.export_pii` workflow request.
- CBSE results CSV export requires `reports:export`, an audit reason, and an approved `data.export_pii` request.
- UDISE+ CSV export requires `reports:export`, an audit reason, and an approved `data.export_pii` request.
- Metadata custom field publication creates or requires an approved `metadata.publish` request before the schema version is changed.
- Finance invoice waivers execute through `POST /api/finance/invoices/:invoiceId/waive` only after an approved `fees.invoice.waive` request matches the current tenant, invoice, reason, status, and amount snapshot.
- Finance invoice cancellations execute through `POST /api/finance/invoices/:invoiceId/cancel` only after an approved `fees.invoice.cancel` request matches the current tenant, invoice, reason, status, and amount snapshot.
- Full payment refunds execute through `POST /api/finance/payments/:paymentId/refund` only after an approved `payments.refund` request matches the current tenant, payment, reason, invoice state, and refund amount. The current implementation is an internal ledger refund; provider-native refund calls remain a separate provider integration hardening step.

## Adoption Path

High-risk modules should adopt the engine in this order:

1. payment refunds, invoice waivers, invoice cancellations
2. role changes and privileged identity changes
3. student transfers and archival
4. exam result publication
5. AI agent actions

Already adopted:

- PII exports and compliance exports
- Metadata publication
- Generic approval queue UI
- Finance invoice waiver, invoice cancellation, and full-payment refund execution

Still pending:

- provider-native refund execution for Stripe/Razorpay after ledger refund approval
- identity role-change execution after approval
- student lifecycle mutation execution after approval
- exam result publication execution after approval
- AI agent action migration from the agent-service-specific queue

## Operating Requirements

- A scheduled job should expire overdue requests and escalate SLA breaches.
- Notifications should be emitted from approval events, not directly from modules.
- Approval completion must be consumed idempotently by the originating module.
- Money movement and irreversible lifecycle changes should execute only after `APPROVED`.

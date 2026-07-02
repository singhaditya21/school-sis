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

Use the pure engine for all modules:

- `createWorkflowApprovalRequest()`
- `reviewWorkflowApprovalRequest()`
- `escalateWorkflowApprovalRequest()`
- `expireWorkflowApprovalRequest()`
- `cancelWorkflowApprovalRequest()`
- `toWorkflowApprovalQueueItem()`
- `canActorReviewWorkflowApproval()`

The pure engine does not touch the database. API routes, server actions, and background jobs should load persisted requests, call the engine, and persist the returned request/review/event changes in one transaction.

## Adoption Path

High-risk modules should adopt the engine in this order:

1. payment refunds, invoice waivers, invoice cancellations
2. role changes and privileged identity changes
3. PII exports and compliance exports
4. metadata publication
5. student transfers and archival
6. exam result publication
7. AI agent actions

The current agent approval page can be migrated from the agent-service-only queue to this generic engine once agent actions write `workflow_approval_requests`.

## Operating Requirements

- A scheduled job should expire overdue requests and escalate SLA breaches.
- Notifications should be emitted from approval events, not directly from modules.
- Approval completion must be consumed idempotently by the originating module.
- Money movement and irreversible lifecycle changes should execute only after `APPROVED`.

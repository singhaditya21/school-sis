# AI / Agent Architecture

## Implemented Controls

- Browser clients no longer call the Python agent service directly.
- Next.js exposes tenant-authenticated proxy routes under `/api/agents/*`.
- Agent human-in-the-loop approvals now use the generic workflow approval engine through compatibility routes at `/api/agents/approvals` and `/api/agents/approvals/:id/review`.
- The web gateway forwards only trusted session context to agents:
  - `Authorization: Bearer ${AGENT_API_TOKEN}`
  - `X-Tenant-Id`
  - `X-User-Id`
  - `X-User-Role`
- FastAPI agent routes bind body/path tenant IDs to `X-Tenant-Id`.
- Approval review is bound to the session user and reviewer role through `workflow_approval_reviews`; callers cannot review as another user.
- Async jobs are stored with tenant/user ownership and polling rejects cross-tenant/job access.
- Public agent responses strip reasoning artifacts and redact tool arguments/results.
- RAG search and embedding upsert set PostgreSQL tenant context before DB access.
- Agent audit logs set tenant context; new approval queue writes are stored in `workflow_approval_requests`.
- Student and invoice indexing now use the same `embeddings` table that RAG search reads.
- Incremental indexing for single students and invoices is implemented.
- Postgres has RLS-protected `embeddings`, `agent_audit_logs`, legacy `agent_approvals`, and generic `workflow_approval_*` tables.
- Student/invoice database triggers emit indexing notifications on tenant-scoped changes.

## Runtime Requirements

Web app:

- `AGENT_SERVICE_URL`: private URL of the Python FastAPI agent service.
- `AGENT_API_TOKEN`: shared service token, at least 32 characters, matching `AGENT_API_TOKEN` in the agent service.

Agent service:

- `AGENT_API_TOKEN`: shared service token.
- `AGENT_DATABASE_URL`: Postgres connection string.
- `AGENT_REDIS_URL`: Redis for async job queue, job ownership, rate limiting, and token tracking.
- `AGENT_LLM_API_KEY`: chat model provider key.
- `AGENT_NVIDIA_API_KEY`: embedding provider key.
- `AGENT_ALLOWED_ORIGINS`: production web origins.
- `AGENT_ENVIRONMENT=production`.

## Remaining Hardening

- Deploy the Python agent service to a private service boundary, not a public browser-facing URL.
- Add a dedicated agent worker process for ARQ jobs.
- Add a replay-safe webhook/indexing event table if LISTEN/NOTIFY loss cannot be tolerated.
- Add role-aware agent/tool permissions beyond tenant membership.
- Add dashboards for agent audit logs, token usage, indexing lag, and failed jobs.
- Remove or archive legacy Python `agent_approvals` writes once every agent action creates `agents.approval.review` workflow approvals directly.

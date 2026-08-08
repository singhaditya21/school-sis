# AI / Copilot Safety Architecture

Last reviewed: 2026-08-07

## Deployed surface

The repository ships one native model path: the tenant-authenticated report copilot at
`POST /api/copilot`. The `/api/chat` and `/api/agents/:agent/query-async` routes are
authenticated compatibility gateways to an independently deployed agent service. That
Python service is not present in this repository and is hard-gated: credentials alone
cannot enable it. Activation requires a reviewed code change that records the external
service version, the SHA-256 of a passing eval artifact, all required red-team
categories, and the specifically approved agent ids.

Agent approval compatibility routes are local and persist requests in the generic
workflow-approval engine. They do not invoke a model.

The dynamic gateway accepts only the six agent ids exposed by the UI; arbitrary
path-selected agents/tools are rejected before forwarding. With no approved external
release currently checked in, the transport rejects every forwarding attempt before
network access.

## Request controls

Every model ingress performs controls in this order:

1. authenticated role and tenant binding;
2. strict distributed rate-limit consumption (`endpointClass: ai`), with a bounded
   one-request in-process fallback if Redis/Postgres is unavailable;
3. tenant-field rejection and request-shape limits;
4. prompt normalization and deterministic prompt-injection/secret/cross-tenant/tool
   abuse rejection;
5. atomic per-tenant and per-user monthly token and cost reservation;
6. provider invocation; and
7. idempotent usage settlement in `ai_token_logs` and `ai_budget_usage`.

Budget storage is tenant-RLS protected. Both scope reservations occur in one
transaction. A request is denied before provider invocation if either ceiling cannot
cover its conservative maximum token and cost estimate. Failed or aborted provider
calls remain conservatively charged because a provider may have processed tokens
before the failure became observable.

## Report-copilot grounding

The report copilot queries only published metadata for the authenticated tenant and
only fields readable by the caller's role. Only identifier-shaped API names enter the
model context. The tenant id never enters the prompt.

The `generateReportAst` tool is read-only. Its output is accepted only when the base
object and every aggregation/filter field exist in the same tenant catalog. It cannot
execute SQL or mutate a record. Unknown objects and fields are returned to the model
as grounding failures rather than accepted configurations.

## Provider fallback policy

The native copilot makes one primary request with SDK retries disabled. It switches to
the configured OpenAI-compatible fallback only when the primary fails before response
streaming with a timeout/network error, HTTP 408/425/429, or HTTP 5xx. It never sends
the prompt to a fallback after authentication, authorization, configuration, safety,
or other HTTP 4xx failures. A mid-stream failure is not replayed.

Fallback configuration is all-or-nothing and should use a different failure domain.
If no fallback is configured, primary failure is surfaced as unavailable. See
[AI provider failure runbook](./runbooks/AI_PROVIDER_FAILURE.md).

## Release evidence

`pnpm test:ai-evals` runs deterministic release cases for prompt injection, tenant
leakage, hallucination/groundedness, unsafe tool use, retrieval grounding, budget
enforcement, provider degradation, and rate-limit outage behavior. CI fails on any
case failure and uploads `apps/web/artifacts/ai-evals/results.json` with the CI evidence
artifact. Unit tests carry the larger red-team corpus and provider/budget boundaries.
The suite also verifies that the unversioned external agent/tool surface remains
release-gated; it must supply its own passing artifact before a later reviewed release
can activate it.

No eval makes a live provider call or treats a mock response as production success.
Provider credentials, pricing, and a staged failure drill are deployment evidence and
remain operator responsibilities.

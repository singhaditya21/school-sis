# AI Safety and Budget Governance

Last reviewed: 2026-08-07

## Control matrix

| Risk | Enforced control | Release evidence |
|---|---|---|
| Prompt injection / secret extraction | Normalization plus blocked override, prompt-exfiltration, secret, cross-tenant, unsafe-tool, delimiter, and encoded-payload patterns | `ai-safety.test.ts`, eval cases `PI-*` |
| Tenant leakage | Tenant-context DB query, caller-role field filtering, tenant-id defense-in-depth filtering, no tenant id in prompt | `ai-safety.test.ts`, `TL-001`, live RLS integration |
| Hallucinated report schema | Object/field allowlist validation at tool execution | `HG-001`, `RG-001` |
| Unsafe tool use | Single read-only report-AST tool; no SQL/mutation tool; field/object grounding | `UT-001` and red-team unit cases |
| Runaway spend | Atomic monthly tenant and user token/cost reservations before provider call | `ai-budget.test.ts`, `BG-001`, `ai_budget_usage` migration |
| Provider outage | One retryable, pre-stream fallback; no fallback on auth/config/safety/client errors | `ai-provider-fallback.test.ts`, `PD-001` |
| Rate-limit backend outage | AI endpoint class uses stricter bounded memory fallback and never bypasses limiting | rate-limit suite, `RL-001` |

## Budget semantics

The following server-only variables set hard monthly ceilings:

- `AI_TENANT_MONTHLY_TOKEN_BUDGET` and `AI_TENANT_MONTHLY_COST_USD`
- `AI_USER_MONTHLY_TOKEN_BUDGET` and `AI_USER_MONTHLY_COST_USD`
- `AI_MAX_OUTPUT_TOKENS`

Defaults are listed in `apps/web/.env.example`. The user ceilings must not exceed the
tenant ceilings. Invalid settings fail closed. Provider prices are configured in USD
per million tokens; budget counters store integer micro-USD to avoid floating-point
comparison races.

Before a call, the application reserves a conservative UTF-8 upper bound for prompt
tokens, the full output allowance, and the most expensive configured provider price.
After a successful native copilot stream it settles actual provider usage. An upstream
agent gateway, failed call, missing usage response, or aborted stream retains the
conservative charge. Settlement is idempotent by request status.

Budget exhaustion returns HTTP 429 with `AI_BUDGET_EXCEEDED` and the exhausted scope.
Operators should raise a ceiling only after checking the tenant/user usage and abuse
signals; never bypass the reservation in application code.

## Eval artifact contract

The artifact is machine-readable JSON with a schema version, timestamp, summary, and
case results. It deliberately excludes prompts, tenant identifiers, model responses,
and credentials. CI uploads it even when a later validation step fails. A release is
not acceptable when `summary.failed` is non-zero or the artifact is absent.

# AI Provider Failure Runbook

Last reviewed: 2026-08-07

## Expected behavior

- Network/timeout, HTTP 408/425/429, and HTTP 5xx failures before streaming may make
  one attempt against the explicitly configured fallback.
- HTTP 4xx authentication, authorization, configuration, validation, and safety
  failures do not fallback.
- Mid-stream failures do not replay because doing so can duplicate spend or tool calls.
- Rate-limit storage degradation still permits at most the stricter bounded fallback
  allowance; it never disables AI limiting.
- Budget reservations fail closed if Postgres is unavailable.

## Triage

1. Confirm the incident is provider availability, not an `AI_BUDGET_EXCEEDED`,
   `AI_PROMPT_REJECTED`, or rate-limit response.
2. Inspect structured `ai.provider_fallback` and `ai.copilot_failed` events. Do not log
   prompts, provider response bodies, tokens, or credentials.
3. Check the primary provider status and account/quota outside the application.
4. Verify the fallback uses a different failure domain and that all three fallback
   variables (key, base URL, model) are present.
5. Inspect `ai_token_logs` by request status and provider, and compare the monthly
   `ai_budget_usage` counters before changing limits.

## Mitigation

- For a retryable primary incident, keep the fallback enabled and monitor error/cost
  rate. Do not broaden the retryable error list to include authentication or safety.
- If both providers are unhealthy, remove provider capability from the affected
  deployment or notify users of temporary unavailability. Core SIS workflows remain
  available without AI.
- If fallback cost threatens a budget, reduce `AI_MAX_OUTPUT_TOKENS` or disable AI;
  do not bypass tenant/user ceilings.
- Rotate a rejected/expired key through the normal secret manager. Never place it in
  an issue, log, command history, or repository file.

## Recovery and drill

1. Restore primary configuration and confirm a benign, tenant-grounded report request.
2. In staging, point the primary to a controlled HTTP 503 endpoint and confirm exactly
   one fallback event and a successful fallback request.
3. Repeat with controlled HTTP 401 and confirm the fallback receives no request.
4. Disable the shared rate-limit backend and confirm the first bounded AI request is
   handled and the next is denied.
5. Set a low user budget and confirm a request is denied before provider invocation.
6. Run `pnpm test:ai-evals`; retain the resulting CI artifact with the release.
7. Record drill time, operator, deployment, provider ids (not secrets), and findings in
   the incident/change record.

# AI Copilot Architecture

> **Architectural note:** The legacy external Python FastAPI agent service (`services/agents`, `AGENT_SERVICE_URL`, `AGENT_REDIS_URL`) was removed in `88793cdf` / `e2791939`. All AI capabilities run natively inside the TypeScript Next.js application (`apps/web/src/lib/ai/` and `apps/web/src/app/api/copilot/route.ts`).

ScholarMind provides a **bounded, human-in-the-loop Copilot** for school staff and administrators. It summarizes records the signed-in user is already authorized to read and routes every proposed state change through the workflow approval engine — it never mutates records autonomously.

---

## 1. Security & Governance Controls

- **Session-bound RBAC & RLS:** `/api/copilot` authenticates the caller's Iron Session (`requireAuth`) and executes read tools strictly inside `runWithTenantContext` so PostgreSQL `FORCE ROW LEVEL SECURITY` and role permissions apply to every query.
- **Human-in-the-loop mutations (`apps/web/src/lib/ai/tools/mutations.ts`):** Write-oriented tools do not mutate domain tables directly. They create persisted `workflow_approval_requests` (`packages/api/src/workflows/approvals`) reviewed by eligible humans at `/approvals` (or `/api/workflow-approvals/:id/review`).
- **Per-tenant token & cost budgets (`ai_token_logs`):** Token consumption is metered per tenant and enforced against workspace quotas (`HQ → AI Governance`), with atomic rate limiting on AI endpoints that degrades stricter on backend outage.
- **Honest degradation (`apps/web/src/lib/ai/provider.ts`):** When no LLM API key or local endpoint is configured, the copilot explicitly reports that no model provider is configured rather than fabricating answers or falling back to mock text.
- **Evaluation & red-team coverage:** Prompt-injection resistance, tool-boundary enforcement, approval creation, and provider fallback are tested in `apps/web/src/lib/ai/__tests__/ai-spine.test.ts` and `apps/web/src/lib/ai/__tests__/ai-runtime-eval.test.ts`.
- **Public-claims gate:** Marketing copy in `apps/website` is checked by `pnpm audit:claims` (`scripts/check-website-claims.mjs`) so public pages never claim autonomous AI agents.

---

## 2. Ordered Provider Chain (100% Free-Tier Friendly)

`apps/web/src/lib/ai/provider.ts` resolves OpenAI-compatible providers in priority order and automatically falls back across configured providers on transient rate-limit/timeout errors (only when no tool side effects ran in the failed turn):

| Priority | Provider | Env Variables | Cost / Free-Tier Option |
|---:|---|---|---|
| 1 | **Cerebras** | `CEREBRAS_API_KEY` (`CEREBRAS_MODEL` default `llama3.1-8b`) | **₹0 / $0** free developer tier |
| 2 | **Groq** | `GROQ_API_KEY` (`GROQ_MODEL` default `llama-3.3-70b-versatile`) | **₹0 / $0** free developer tier |
| 3 | **Google Gemini** | `GEMINI_API_KEY` (`GEMINI_MODEL` default `gemini-2.5-flash`) | **₹0 / $0** Google AI Studio free tier |
| 4 | **OpenAI** | `OPENAI_API_KEY` (`OPENAI_MODEL` default `gpt-4o-mini`) | Paid API (optional) |
| 5 | **Ollama (Self-Hosted)** | `OLLAMA_BASE_URL` (`OLLAMA_MODEL` default `llama3.2`) | **₹0 / $0** local/self-hosted open-weight models, zero external API key |

Leave all five unset to run a lean deployment with Copilot cleanly disabled.

---

## 3. Embeddings & Semantic Search

- PostgreSQL 16 `pgvector` backs the RLS-protected `embeddings` table (`0000_init_baseline.sql` and `packages/api/src/db/migrations/tenant-rls.sql`).
- Every vector read and write executes inside a signed tenant transaction context so cross-tenant similarity queries are impossible at the database layer.

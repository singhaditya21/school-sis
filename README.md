# ScholarMind — V6 Enterprise Architecture

Welcome to the **ScholarMind Administration Portal**, a multi-tenant, SaaS-based School Information System (SIS) infused with a deeply integrated 26-agent cognitive AI fleet. 

This repository enforces the **V6 PRD Enterprise Standard**, which radically restructures the platform into a centralized cloud deployment utilizing Drizzle ORM, Next.js Server Components, PostgreSQL Vector searching, and a dedicated AI swarm operated via Cerebras (`llama3.1-70b`).

---

## 🏛️ System Architecture

The ScholarMind framework operates on a hybrid monolith/microservice architecture split distinctly between the Presentation/Core API Layer (Next.js) and the Cognitive Execution Layer (Python FastAPI).

### 1. Presentation & Core API Layer (`/apps/web`)
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase PostgreSQL (via Pooler)
- **ORM**: Drizzle ORM — Fully typed, zero-abstraction relational querying.
- **Styling**: Tailwind CSS & Tremor React components for rich dashboards.
- **Identity**: NextAuth/IronSession tracking multi-tenant boundaries (`tenantId`) explicitly for every query.

### 2. Cognitive AI Subsystem (`/services/agents`)
- **Framework**: Python FastAPI
- **LLM Engine**: Cerebras Inference (`llama3.1-70b`)
- **Memory**: Redis (Arq) for background queue management and cost-tracking.
- **Embeddings**: `pgvector` stored back in the Supabase instance for instant RAG retreival.
- **Agent Framework**: Custom lightweight framework derived from LangChain principles, built for extreme latency optimization and strict tool execution oversight.

---

## 🧩 Modularity & Domains

The V6 release implements strict structural domain boundaries based on the `institutionType` flag inherent to each Tenant.

- **K-12 Foundation**: Timetables, Homework, Digital Diaries, Guardian Portal, Transport.
- **Higher Education Ecosystem**: Course registration, Academic Advising, Research Grants, Placements.
- **Group HQ / Core Operations**: Global Fee orchestration, Staff HR, Analytics, Enterprise Evidence Trusts.

---

## 🤖 The 26-Agent Swarm

At the heart of the V6 transition is the Autonomous Agent Swarm. Instead of a single chatbot, ScholarMind delegates logic to 26 highly specialized, domain-isolated Python agents.

| Agent | Domain | Role Description |
|---|---|---|
| **Synthesis Agent** | Cross-Module | Acts as the "Headmaster", distributing queries to child agents and synthesizing results. |
| **Fee Agent** | Treasury | Pre-computes default risks, analyzes grade-wise payment trends. |
| **Risk Agent** | Core Ops | A hybrid correlation agent detecting overlapping signs of student decline (e.g., fee defaults + attendance drops). |
| **Crisis Agent** | Executive | Manages high-priority physical or institutional workflow emergencies. |
| **Neuro Agent** | Wellness | Assesses welfare indicators securely using anonymized sentiment processing. |

### HITL Safety Guardrails (Human-In-The-Loop)
Agents possess a specialized `requires_human_approval` Tool flag. If the Swarm attempts to execute a high-risk system mutation (like modifying a Grade or Revoking a Certificate), it is physically blocked. Instead, it places the payload in the `agent_approvals` PostgreSQL queue and requests human signoff via the UI.

---

## 🔐 Enterprise Governance

ScholarMind V6 aggressively enforces the **Section 8.2 Persona Matrix**:

1. **`GROUP_EXECUTIVE`**: Has overarching command-center access but limited edit capability across subsidiary campuses.
2. **`SUPER_ADMIN`**: Tenant-level absolute authority.
3. **`FINANCE_LEAD`**: Treasury, Overdue Invoices, Multi-currency splits.
4. **`REGISTRAR`**: The only role permitted to perform Verifiable Credential issuance. 
5. **`TRUST_OFFICER`**: Dedicated access to the Procurement & Platform Audit Trail dashboards for SOC2 compliance logging.
6. **`STUDENT_SUCCESS_COUNSELOR`**: Isolated access for sensitive interventions blocking general teacher prying.

*(Review `/apps/web/src/lib/rbac/permissions.ts` for the direct authorization schemas).*

---

## 🛠️ Quick Links

- [Setup Guide](./docs/SETUP_GUIDE.md) — For developer onboarding and environment mapping.
- [Database Security Checks](./docs/SECURITY_REPORT.md) — RLS policies and SQL injection testing details.
- [Historical PRDs](./docs/PRDs/) — Review the evolution from V3 to V6. 
- [Audit Artifacts](./audits/reports/) — The latest TRIVY, Npm, and SemGrep sweeps for SOC2 artifacts.

---
*Generated mathematically aligned to the PRD V6 Standard implementation.*

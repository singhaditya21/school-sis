# ScholarMind V6 — Comprehensive Architecture & Deployment Specification

This specification document outlines the current service topology, deployment models, multi-campus hierarchy, and security control systems for ScholarMind V6.

---

## 1. Global Topology & Service Architecture

ScholarMind V6 currently ships as a Next.js application backed by Postgres and configured external providers. The hosting platform sends HTTPS traffic directly to the application; the repository does not build or deploy a separate API gateway.

```mermaid
graph TD
    UserClient([Client Browser]) -->|HTTPS| Web[Next.js App: apps/web]
    Web -->|Pages / Server Actions / Route Handlers| Core[Application Core: apps/web + packages/api]
    Core -->|SQL Query / Drizzle| Postgres[(Neon Postgres + pgvector)]
    Core -->|Durable Dispatch| JobQueue[(Postgres Job Queue)]
    Core -->|Authenticated HTTPS| Providers[Configured Payment / Messaging / AI Providers]
```

### 1.1 Current Runtime Layers

1. **Presentation & Core API Layer (`/apps/web`)**:
   - **Framework**: Next.js 16 (App Router).
   - **Database ORM**: Drizzle ORM (fully typed mapping).
   - **Authentication**: Iron Session tracking tenant scope (`tenantId`), user identity, role, and revocable authorization version.
   - **Responsibility**: Serving responsive web views, authenticating browser/API callers, applying CSP and security headers, rate limiting protected entrypoints, and executing server-side transactional mutations.
   
2. **Domain & Data Access Layer (`/packages/api`)**:
   - **Framework**: TypeScript and Drizzle ORM.
   - **Responsibility**: Providing the typed schema, tenant-aware database access, and domain services consumed by the web runtime.

3. **Job & Provider Integration Layer (`/apps/web/src/lib`)**:
   - **Responsibility**: Persisting durable jobs and calling explicitly configured payment, messaging, storage, and AI providers. Provider-specific authentication and callback verification remain inside the application boundary.

4. **Data & Storage Layer**:
   - **Neon Postgres**: Primary transactional and relational store.
   - **pgvector**: Cosine and Euclidean vector distance database extension.
   - **Redis or Postgres**: Shared atomic rate-limit state, selected explicitly by production configuration.

### 1.2 Production Edge Decision

The experimental Go reverse proxy under `services/gateway` was removed on 2026-07-18. It had no runtime, build, CI, or deployment integration and is not part of the production security model. The managed hosting edge terminates transport, while `apps/web` owns identity, tenant authorization, endpoint-level request validation, CSP/security headers, callback verification, and rate limiting.

Any future repository-owned edge service is a new architecture decision. It must not be exposed until it has authenticated routes, allowlisted CORS, bounded request bodies and route timeouts, upstream readiness checks, structured observability, automated tests, and an enforced CI/deployment gate.

---

## 2. Tenancy, Regional Hosting & Deployment Matrix

To satisfy institutional policies, local regulations, and performance requirements, ScholarMind V6 specifies five distinct hosting models:

| Deployment Model | Target Segment | Data Residency Posture | Operational Configuration |
| :--- | :--- | :--- | :--- |
| **Shared Multi-Tenant SaaS** | Single Schools, Coaching Centers, Standard Colleges | Logical tenant isolation via `tenantId` columns. Single pooled Neon database instance. | Shared Vercel/Neon resources. Automatic scaling. Updates pushed immediately. |
| **Regional SaaS** | Large school groups spanning multiple states or nations | Regional data clusters (e.g., EU-only, India-only) using dedicated Neon regional databases. | Common product codebase. Updates regionalized. |
| **Dedicated Single-Tenant** | Large Research Universities, Premium Education Systems | Physical isolation. Dedicated database instances and isolated Kubernetes runtimes. | Customer-managed maintenance windows. Staged release testing. |
| **Private / Sovereign Cloud** | Public education networks, defense-contracted campuses | Deployments inside sovereign environments (e.g. GovCloud). High change control. | Complete offline/restricted networking. Air-gapped builds. |
| **Air-gapped Edge Nodes** | Low-connectivity rural schools, crisis zones | Local SQLite database replicating to Neon when connection is available. | Offline LLM capability. Low-latency edge computing. |

---

## 3. The Multi-Campus Hierarchy & Policy Model

ScholarMind V6 models complex education networks using a strict four-level hierarchical inheritance tree:

```mermaid
graph TD
    Group[Level 1: Group / Trust HQ] -->|Global Policy Inheritance| Campus1[Level 2: Campus / Center A]
    Group -->|Global Policy Inheritance| Campus2[Level 2: Campus / Center B]
    Campus1 --> Dept1[Level 3: Department / Section A]
    Campus1 --> Dept2[Level 3: Department / Section B]
    Dept1 --> Learner[Level 4: Learner / Guardian / Sponsor]
```

### 3.1 Policy Inheritance Rules
1. **Financial Policies**: HQ defines fee plans, payment gateway routers, and refund boundaries. Individual campuses configure payment options within those boundaries.
2. **Academic Standards**: Global grading systems (e.g. CBSE, IB, UGC credit structures) are configured at Level 1. Campuses inherit curricula and can adjust only elective offerings.
3. **Data Isolation boundaries**: Multi-tenant boundaries (`tenantId`) isolate transactional databases. Users at Level 1 (`GROUP_EXECUTIVE`) can read aggregated dashboards across all Level 2 nodes, but cannot modify Level 4 records without explicit delegatory tokens.

---

## 4. Cross-Campus Transfer & Mobility Specification

### Scenario: Automatic Student Campus Transfer
When a student relocates between two campuses within the same group, the transfer pipeline must move records safely and reconcile financial differences.

```gherkin
Given a Student "Arjun Patel" registered at Campus A (Tenant ID "tenant-a")
And Arjun has an unpaid invoice balance of ₹15,000
When the Campus Principal executes "transfer_student" to Campus B (Tenant ID "tenant-b")
Then the transfer pipeline MUST:
  1. Create a matching student record at Campus B.
  2. Copy historic attendance rate (88.5%) and academic transcripts.
  3. Transfer the unpaid invoice balance of ₹15,000 to the Campus B accounting ledger.
  4. Deactivate the student profile at Campus A (status set to "TRANSFERRED").
  5. Commit all updates within a single database transaction boundary.
```

---

## 5. Security controls & Multi-Tenant Sandboxing

Every incoming command, API request, and background job execution must pass through multi-tenant validation sandboxes.

### 5.1 Sandbox Rules
- **Data Access Isolation**: Every SQL query generated by the Next.js API router or Python tool registry must include an explicit `WHERE tenant_id = ?` clause utilizing the trusted tenant ID parsed from the user's secure cookie session.
- **Prompt Injection Sanitation**: Natural language queries routed to the agent swarm must be scanned for prompt injection attacks (such as instructions to ignore safety rules or output API keys) before being passed to the LLM.
- **Dynamic Rate Limiting**: Redis tracks queries per minute per user. If a user exceeds their tier limits, requests are dropped with a HTTP 429 Too Many Requests response.

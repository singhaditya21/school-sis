# Graph Report - /Users/adityasingh/Personal/School-sis/services/agents/src  (2026-04-20)

## Corpus Check
- 61 files · ~24,568 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 589 nodes · 1897 edges · 28 communities detected
- Extraction: 34% EXTRACTED · 66% INFERRED · 0% AMBIGUOUS · INFERRED: 1255 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]

## God Nodes (most connected - your core abstractions)
1. `RAGPipeline` - 93 edges
2. `Tool` - 69 edges
3. `ToolParameter` - 68 edges
4. `_run_query()` - 57 edges
5. `Agent` - 51 edges
6. `AgentContext` - 43 edges
7. `ApprovalRequest` - 39 edges
8. `FeeAgent` - 38 edges
9. `SynthesisAgent` - 37 edges
10. `AcademAgent` - 36 edges

## Surprising Connections (you probably didn't know these)
- `Tool definition and registry for agent tool calling.` --uses--> `ApprovalRequest`  [INFERRED]
  /Users/adityasingh/Personal/School-sis/services/agents/src/core/tool.py → /Users/adityasingh/Personal/School-sis/services/agents/src/core/approvals.py
- `Single parameter of a tool.` --uses--> `ApprovalRequest`  [INFERRED]
  /Users/adityasingh/Personal/School-sis/services/agents/src/core/tool.py → /Users/adityasingh/Personal/School-sis/services/agents/src/core/approvals.py
- `A callable tool that an agent can invoke.` --uses--> `ApprovalRequest`  [INFERRED]
  /Users/adityasingh/Personal/School-sis/services/agents/src/core/tool.py → /Users/adityasingh/Personal/School-sis/services/agents/src/core/approvals.py
- `startup()` --calls--> `init_agents()`  [INFERRED]
  /Users/adityasingh/Personal/School-sis/services/agents/src/worker.py → /Users/adityasingh/Personal/School-sis/services/agents/src/api/routes.py
- `process_agent_query()` --calls--> `get_agent()`  [INFERRED]
  /Users/adityasingh/Personal/School-sis/services/agents/src/worker.py → /Users/adityasingh/Personal/School-sis/services/agents/src/api/routes.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (109): compare_performance(), get_at_risk_students(), get_student_academics(), query_results(), Academic-domain tool implementations.  Schema: exams, exam_schedules, student_re, Compare student performance across subjects within a grade., Find students failing in multiple subjects., Get exam results with optional filters. (+101 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (55): AcademAgent, AdmitAgent, Agent, AgentContext, AttendAgent, BaseModel, CommAgent, FeeAgent (+47 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (94): ABC, audit_logs(), auto_email_defaulters(), broadcast_emergency(), generate_accreditation_report(), get_career_recommendation(), get_enrollment_trends(), get_iep_summary() (+86 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (36): BaseAgent, BatchAgent, BatchAgent — Orchestrates multiple agent queries in a single request.  Wave 1 ag, ComplianceAgent, ComplianceAgent — Audit trail analysis and compliance reporting.  Wave 1 agent (, Audit trail analysis and compliance reporting., get_consent_status(), Compliance tools — Audit log and consent queries for ComplianceAgent. (+28 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (19): AcademAgent — academic performance tracking and analysis., AdmitAgent — admission pipeline intelligence., Agent, AttendAgent — attendance pattern analysis and anomaly detection., CommAgent — communication channel orchestration and analytics., FeeAgent — the first production agent, managing fee intelligence., Financial intelligence agent for the ScholarMind platform.      Capabilities:, Stub implementations for the remaining Phase 2-5 agents. (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (37): IndexingListener, PostgreSQL LISTEN/NOTIFY Event Listener for Real-Time Indexing.  This background, :param indexer_pipeline: Instance of `src.indexing.pipeline.IndexingPipeline`, Start the background listener loop., Stop the background listener., Continuously loop listening for pg_notify events., Parse payload and delegate to indexer., lifespan() (+29 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (0): 

### Community 7 - "Community 7"
Cohesion: 0.22
Nodes (7): get_embedding(), main(), Trigger a full reindex of all data for a tenant., Fallback main execution for manual script running., Fetch 768-dim embeddings from the local llama.cpp Nomic Embed server., Index students into pgvector., Index invoices into pgvector.

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (3): BaseSettings, Application configuration loaded from environment variables., Settings

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (3): Shared database query utilities for agent tools., Execute a query and return rows as dicts with proper serialisation., _run_query()

### Community 10 - "Community 10"
Cohesion: 1.0
Nodes (1): NeuroAgent tools — re-exports from domain_tools.

### Community 11 - "Community 11"
Cohesion: 1.0
Nodes (1): ResearchAgent tools — re-exports from domain_tools.

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (1): CampusAgent tools — re-exports from domain_tools.

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (1): AdvisorAgent tools — re-exports from domain_tools.

### Community 14 - "Community 14"
Cohesion: 1.0
Nodes (1): SafeguardAgent tools — re-exports from domain_tools.

### Community 15 - "Community 15"
Cohesion: 1.0
Nodes (1): PlacementAgent tools — re-exports from domain_tools.

### Community 16 - "Community 16"
Cohesion: 1.0
Nodes (1): AccredAgent tools — re-exports from domain_tools.

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (1): HealthAgent tools — re-exports from domain_tools.

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (1): CollectionsAgent tools — re-exports from domain_tools.

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (1): CrisisAgent tools — re-exports from domain_tools.

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (1): AlumniAgent tools — re-exports from domain_tools.

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (1): WorkforceAgent tools — re-exports from domain_tools.

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (1): IntlAgent tools — re-exports from domain_tools.

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **113 isolated node(s):** `Application configuration loaded from environment variables.`, `NeuroAgent tools — re-exports from domain_tools.`, `Compliance tools — Audit log and consent queries for ComplianceAgent.`, `Search audit logs with optional filters.`, `Check overall DPDPA consent status for the school.` (+108 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 10`** (2 nodes): `NeuroAgent tools — re-exports from domain_tools.`, `neuro_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (2 nodes): `ResearchAgent tools — re-exports from domain_tools.`, `research_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (2 nodes): `CampusAgent tools — re-exports from domain_tools.`, `campus_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (2 nodes): `AdvisorAgent tools — re-exports from domain_tools.`, `advisor_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (2 nodes): `SafeguardAgent tools — re-exports from domain_tools.`, `safeguard_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (2 nodes): `PlacementAgent tools — re-exports from domain_tools.`, `placement_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (2 nodes): `AccredAgent tools — re-exports from domain_tools.`, `accred_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (2 nodes): `HealthAgent tools — re-exports from domain_tools.`, `health_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `CollectionsAgent tools — re-exports from domain_tools.`, `collections_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `CrisisAgent tools — re-exports from domain_tools.`, `crisis_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `AlumniAgent tools — re-exports from domain_tools.`, `alumni_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `workforce_tools.py`, `WorkforceAgent tools — re-exports from domain_tools.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `IntlAgent tools — re-exports from domain_tools.`, `intl_tools.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `__init__.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `_run_query()` connect `Community 0` to `Community 2`, `Community 3`?**
  _High betweenness centrality (0.208) - this node is a cross-community bridge._
- **Why does `ApprovalRequest` connect `Community 2` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `RAGPipeline` connect `Community 2` to `Community 1`, `Community 4`, `Community 5`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Are the 85 inferred relationships involving `RAGPipeline` (e.g. with `WorkerSettings` and `Initialise agents when the worker boots, exactly like the API.`) actually correct?**
  _`RAGPipeline` has 85 INFERRED edges - model-reasoned connections that need verification._
- **Are the 66 inferred relationships involving `Tool` (e.g. with `ApprovalRequest` and `AcademAgent`) actually correct?**
  _`Tool` has 66 INFERRED edges - model-reasoned connections that need verification._
- **Are the 66 inferred relationships involving `ToolParameter` (e.g. with `ApprovalRequest` and `AcademAgent`) actually correct?**
  _`ToolParameter` has 66 INFERRED edges - model-reasoned connections that need verification._
- **Are the 50 inferred relationships involving `_run_query()` (e.g. with `search_audit_logs()` and `get_consent_status()`) actually correct?**
  _`_run_query()` has 50 INFERRED edges - model-reasoned connections that need verification._
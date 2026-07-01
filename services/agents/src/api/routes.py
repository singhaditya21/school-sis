"""FastAPI routes for agent interactions and indexing management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.agents.fee_agent import FeeAgent
from src.agents.attend_agent import AttendAgent
from src.agents.academ_agent import AcademAgent
from src.agents.admit_agent import AdmitAgent
from src.agents.comm_agent import CommAgent
from src.agents.schedul_agent import SchedulAgent
from src.agents.transport_agent import TransportAgent
from src.agents.risk_agent import RiskAgent
from src.agents.synthesis_agent import SynthesisAgent
from src.agents.future_agents import (
    InsightAgent, CampusAgent, BatchAgent, WorkforceAgent, CollectionsAgent,
    AdvisorAgent, ResearchAgent, PlacementAgent, AccredAgent, IntlAgent,
    CrisisAgent, NeuroAgent, ComplianceAgent, SafeguardAgent, AlumniAgent,
    HealthAgent, LibraryAgent
)
from src.core.agent import AgentContext
from src.core.rag import RAGPipeline
from src.core.security import (
    AgentPrincipal,
    redact_tool_calls,
    require_agent_auth,
    require_agent_principal,
    require_principal_tenant_match,
    require_principal_user_match,
    sanitize_model_output,
)
from src.indexing.pipeline import IndexingPipeline

router = APIRouter(prefix="/api/v1", tags=["agents"], dependencies=[Depends(require_agent_auth)])

# Module-level state — initialised at startup
_rag: RAGPipeline | None = None
_agents: dict[str, object] = {}
_indexer: IndexingPipeline | None = None


def init_agents(rag: RAGPipeline) -> None:
    """Initialise all agents and the indexing pipeline with a shared RAG pipeline."""
    global _rag, _agents, _indexer
    _rag = rag
    
    # Phase 1 Agents (Core)
    _agents["fee"] = FeeAgent(rag=rag)
    _agents["attend"] = AttendAgent(rag=rag)
    _agents["academ"] = AcademAgent(rag=rag)
    _agents["admit"] = AdmitAgent(rag=rag)
    _agents["comm"] = CommAgent(rag=rag)
    _agents["schedule"] = SchedulAgent(rag=rag)
    _agents["transport"] = TransportAgent(rag=rag)
    _agents["risk"] = RiskAgent(rag=rag)
    
    # Phase 2 Agents
    _agents["synthesis"] = SynthesisAgent(rag=rag)
    _agents["insight"] = InsightAgent(rag=rag)
    _agents["campus"] = CampusAgent(rag=rag)
    _agents["batch"] = BatchAgent(rag=rag)
    _agents["workforce"] = WorkforceAgent(rag=rag)
    _agents["collections"] = CollectionsAgent(rag=rag)
    
    # Phase 3 Agents
    _agents["advisor"] = AdvisorAgent(rag=rag)
    _agents["research"] = ResearchAgent(rag=rag)
    _agents["placement"] = PlacementAgent(rag=rag)
    _agents["accred"] = AccredAgent(rag=rag)
    
    # Phase 4 Agents
    _agents["intl"] = IntlAgent(rag=rag)
    _agents["crisis"] = CrisisAgent(rag=rag)
    _agents["neuro"] = NeuroAgent(rag=rag)
    _agents["compliance"] = ComplianceAgent(rag=rag)
    _agents["safeguard"] = SafeguardAgent(rag=rag)
    
    # Phase 5 Agents
    _agents["alumni"] = AlumniAgent(rag=rag)
    _agents["health"] = HealthAgent(rag=rag)
    _agents["library"] = LibraryAgent(rag=rag)

    _indexer = IndexingPipeline(rag=rag)


def get_agent(name: str):
    """Get an agent by name."""
    agent = _agents.get(name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{name}' not found. Available: {list(_agents.keys())}")
    return agent


# ─── Agent Query ────────────────────────────────────────

class QueryRequest(BaseModel):
    """Request body for agent queries."""
    query: str
    tenant_id: UUID
    user_id: UUID | None = None


class QueryResponse(BaseModel):
    """Structured response from an agent query."""
    answer: str
    agent_name: str
    sources: list[dict] = []
    tool_calls_made: list[dict] = []
    tokens_used: int = 0
    latency_ms: int = 0


def public_query_response(response) -> QueryResponse:
    """Build a public agent response without internal reasoning or tool payloads."""
    return QueryResponse(
        answer=sanitize_model_output(response.answer),
        agent_name=response.agent_name,
        sources=response.sources,
        tool_calls_made=redact_tool_calls(response.tool_calls_made),
        tokens_used=response.tokens_used,
        latency_ms=response.latency_ms,
    )


@router.post("/agents/{agent_name}/query", response_model=QueryResponse)
async def query_agent(
    agent_name: str,
    request: QueryRequest,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """Send a natural language query to a specific agent.

    The agent will:
    1. Search relevant embeddings via pgvector
    2. Build a prompt with retrieved context
    3. Send to Qwen 7B via llama.cpp for reasoning
    4. Execute any tool calls the LLM requests
    5. Return a structured answer with sources and audit trail
    """
    from src.core.security import sanitize_prompt, check_rate_limit, track_token_usage, check_subscription_tier

    require_principal_tenant_match(principal, request.tenant_id)
    trusted_user_id = require_principal_user_match(principal, request.user_id)

    # 1. Prompt Injection Defense
    sanitize_prompt(request.query)

    # 2. SaaS Paywall Check (Block CORE users from AI tools)
    await check_subscription_tier(request.tenant_id)

    # 3. Rate Limiting
    await check_rate_limit(request.tenant_id, request.user_id)

    agent = get_agent(agent_name)

    context = AgentContext(
        tenant_id=request.tenant_id,
        user_id=trusted_user_id,
        query=request.query,
    )

    response = await agent.query(context)

    # 3. Cost/Token Tracking
    await track_token_usage(request.tenant_id, agent_name, response.tokens_used)

    return public_query_response(response)


class AsyncJobResponse(BaseModel):
    """Response containing a job tracking ID for polling."""
    job_id: str
    status: str = "queued"


@router.post("/agents/{agent_name}/query_async", response_model=AsyncJobResponse)
async def query_agent_async(
    agent_name: str,
    request: QueryRequest,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """
    Queue an agent query for background processing to avoid frontend timeouts.
    Client receives a job_id and polls `/agents/jobs/{job_id}`.
    """
    from src.core.security import sanitize_prompt, check_rate_limit, check_subscription_tier
    from src.core.queue import get_redis_pool

    require_principal_tenant_match(principal, request.tenant_id)
    trusted_user_id = require_principal_user_match(principal, request.user_id)

    sanitize_prompt(request.query)
    await check_subscription_tier(request.tenant_id)
    await check_rate_limit(request.tenant_id, trusted_user_id)
    
    # Validate the agent exists
    get_agent(agent_name)

    # Put the context building into a dict
    ctx_dict = {
        "tenant_id": str(request.tenant_id),
        "user_id": str(trusted_user_id) if trusted_user_id else None,
        "query": request.query
    }

    try:
        redis = await get_redis_pool()
        job = await redis.enqueue_job("process_agent_query", agent_name, ctx_dict)
        if not job:
            raise HTTPException(status_code=500, detail="Failed to enqueue background job.")
        await redis.set(
            f"agent_job_owner:{job.job_id}",
            __import__("json").dumps({
                "tenant_id": str(request.tenant_id),
                "user_id": str(trusted_user_id) if trusted_user_id else None,
                "agent_name": agent_name,
            }),
            ex=86400,
        )
        return AsyncJobResponse(job_id=job.job_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Redis connection failed: {str(e)}")


@router.get("/agents/jobs/{job_id}")
async def get_job_status(
    job_id: str,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """Poll the status and result of a background agent query."""
    from src.core.queue import get_redis_pool
    from arq.jobs import Job, JobStatus
    import json

    try:
        redis = await get_redis_pool()
        owner_raw = await redis.get(f"agent_job_owner:{job_id}")
        if not owner_raw:
            raise HTTPException(status_code=404, detail="Job not found or expired")
        owner = json.loads(owner_raw)
        if owner.get("tenant_id") != str(principal.tenant_id):
            raise HTTPException(status_code=403, detail="Job does not belong to this tenant")
        if owner.get("user_id") and principal.user_id and owner["user_id"] != str(principal.user_id):
            raise HTTPException(status_code=403, detail="Job does not belong to this user")

        job = Job(job_id, redis)
        status = await job.status()
        
        if status == JobStatus.not_found:
            raise HTTPException(status_code=404, detail="Job not found or expired")
            
        elif status == JobStatus.complete:
            result = await job.result(timeout=0)
            return {"status": "complete", "result": result}
            
        return {"status": status.value, "job_id": job_id}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Queue error: {str(e)}")


@router.get("/agents")
async def list_agents(principal: AgentPrincipal = Depends(require_agent_principal)):
    """List all available agents without exposing internal tool schemas."""
    result = []
    for name, agent in _agents.items():
        result.append({
            "name": name,
            "collections": agent.collections(),
            "tool_count": len(agent.tools.list_tools()),
        })
    return result


# ─── Indexing Management ────────────────────────────────

class IndexRequest(BaseModel):
    tenant_id: UUID


class IndexResponse(BaseModel):
    tenant_id: str
    students_indexed: int = 0
    invoices_indexed: int = 0
    grade_collections_indexed: int = 0
    total_embeddings: int = 0


@router.post("/indexing/full-reindex", response_model=IndexResponse)
async def full_reindex(
    request: IndexRequest,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """Trigger a full reindex of all data for a tenant.

    This indexes all students, invoices, and grade collections into pgvector.
    Each record is converted to a natural language representation before embedding.
    """
    if not _indexer:
        raise HTTPException(status_code=503, detail="Indexing pipeline not initialized")

    require_principal_tenant_match(principal, request.tenant_id)

    result = await _indexer.full_reindex(request.tenant_id)
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return IndexResponse(**result)



class SingleIndexRequest(BaseModel):
    tenant_id: UUID
    entity_id: UUID


@router.post("/indexing/student")
async def index_student(
    request: SingleIndexRequest,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """Incrementally index a single student (after create/update)."""
    if not _indexer:
        raise HTTPException(status_code=503, detail="Indexing pipeline not initialized")
    require_principal_tenant_match(principal, request.tenant_id)
    await _indexer.index_single_student(request.tenant_id, request.entity_id)
    return {"status": "indexed", "entity_type": "student", "entity_id": str(request.entity_id)}


@router.post("/indexing/invoice")
async def index_invoice(
    request: SingleIndexRequest,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """Incrementally index a single invoice (after payment/create/update)."""
    if not _indexer:
        raise HTTPException(status_code=503, detail="Indexing pipeline not initialized")
    require_principal_tenant_match(principal, request.tenant_id)
    await _indexer.index_single_invoice(request.tenant_id, request.entity_id)
    return {"status": "indexed", "entity_type": "invoice", "entity_id": str(request.entity_id)}


# ─── Approval Management ────────────────────────────────

from src.core.approvals import list_approvals, review_approval


@router.get("/approvals/{tenant_id}")
async def get_pending_approvals(
    tenant_id: UUID,
    limit: int = 50,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """List pending actions recommended by agents that require human review."""
    require_principal_tenant_match(principal, tenant_id)
    approvals = await list_approvals(tenant_id, status="PENDING", limit=limit)
    return approvals


class ReviewRequest(BaseModel):
    action: str  # APPROVED or REJECTED
    user_id: UUID


@router.post("/approvals/{tenant_id}/{approval_id}/review")
async def process_approval(
    tenant_id: UUID,
    approval_id: UUID,
    request: ReviewRequest,
    principal: AgentPrincipal = Depends(require_agent_principal),
):
    """Approve or reject a queued agent action. If approved, the action should ideally be executed here."""
    require_principal_tenant_match(principal, tenant_id)
    reviewer_id = require_principal_user_match(principal, request.user_id)
    if not reviewer_id:
        raise HTTPException(status_code=400, detail="X-User-Id header is required for approval review.")
    result = await review_approval(
        tenant_id=tenant_id,
        approval_id=approval_id,
        action=request.action,
        user_id=reviewer_id,
    )
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    # NOTE: In a full implementation, if result['status'] == 'APPROVED',
    # we would execute `result['proposed_action']` using the agent tool registry here.

    return result


# ─── Health ─────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    agents_loaded: int
    agent_names: list[str]
    indexer_ready: bool


@router.get("/health", response_model=HealthResponse)
async def agents_health():
    """Health check for the agent service."""
    return HealthResponse(
        status="healthy" if _agents else "no_agents",
        agents_loaded=len(_agents),
        agent_names=list(_agents.keys()),
        indexer_ready=_indexer is not None,
    )

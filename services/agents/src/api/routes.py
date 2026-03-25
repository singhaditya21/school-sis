"""FastAPI routes for agent interactions and indexing management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
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
from src.indexing.pipeline import IndexingPipeline

router = APIRouter(prefix="/api/v1", tags=["agents"])

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


@router.post("/agents/{agent_name}/query", response_model=QueryResponse)
async def query_agent(agent_name: str, request: QueryRequest):
    """Send a natural language query to a specific agent.

    The agent will:
    1. Search relevant embeddings via pgvector
    2. Build a prompt with retrieved context
    3. Send to Qwen 7B via llama.cpp for reasoning
    4. Execute any tool calls the LLM requests
    5. Return a structured answer with sources and audit trail
    """
    from src.core.security import sanitize_prompt, check_rate_limit, track_token_usage, check_subscription_tier

    # 1. Prompt Injection Defense
    sanitize_prompt(request.query)

    # 2. SaaS Paywall Check (Block CORE users from AI tools)
    await check_subscription_tier(request.tenant_id)

    # 3. Rate Limiting
    await check_rate_limit(request.tenant_id, request.user_id)

    agent = get_agent(agent_name)

    context = AgentContext(
        tenant_id=request.tenant_id,
        user_id=request.user_id,
        query=request.query,
    )

    response = await agent.query(context)

    # 3. Cost/Token Tracking
    await track_token_usage(request.tenant_id, agent_name, response.tokens_used)

    return QueryResponse(
        answer=response.answer,
        agent_name=response.agent_name,
        sources=response.sources,
        tool_calls_made=response.tool_calls_made,
        tokens_used=response.tokens_used,
        latency_ms=response.latency_ms,
    )


@router.get("/agents")
async def list_agents():
    """List all available agents with their tool registries."""
    result = []
    for name, agent in _agents.items():
        tools = [
            {"name": t.name, "description": t.description}
            for t in agent.tools.list_tools()
        ]
        result.append({"name": name, "tools": tools, "collections": agent.collections()})
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
async def full_reindex(request: IndexRequest):
    """Trigger a full reindex of all data for a tenant.

    This indexes all students, invoices, and grade collections into pgvector.
    Each record is converted to a natural language representation before embedding.
    """
    if not _indexer:
        raise HTTPException(status_code=503, detail="Indexing pipeline not initialized")

    result = await _indexer.full_reindex(request.tenant_id)
    return IndexResponse(**result)


class SingleIndexRequest(BaseModel):
    tenant_id: UUID
    entity_id: UUID


@router.post("/indexing/student")
async def index_student(request: SingleIndexRequest):
    """Incrementally index a single student (after create/update)."""
    if not _indexer:
        raise HTTPException(status_code=503, detail="Indexing pipeline not initialized")
    await _indexer.index_single_student(request.tenant_id, request.entity_id)
    return {"status": "indexed", "entity_type": "student", "entity_id": str(request.entity_id)}


@router.post("/indexing/invoice")
async def index_invoice(request: SingleIndexRequest):
    """Incrementally index a single invoice (after payment/create/update)."""
    if not _indexer:
        raise HTTPException(status_code=503, detail="Indexing pipeline not initialized")
    await _indexer.index_single_invoice(request.tenant_id, request.entity_id)
    return {"status": "indexed", "entity_type": "invoice", "entity_id": str(request.entity_id)}


# ─── Approval Management ────────────────────────────────

from src.core.approvals import list_approvals, review_approval


@router.get("/approvals/{tenant_id}")
async def get_pending_approvals(tenant_id: UUID, limit: int = 50):
    """List pending actions recommended by agents that require human review."""
    approvals = await list_approvals(tenant_id, status="PENDING", limit=limit)
    return approvals


class ReviewRequest(BaseModel):
    action: str  # APPROVED or REJECTED
    user_id: UUID


@router.post("/approvals/{tenant_id}/{approval_id}/review")
async def process_approval(tenant_id: UUID, approval_id: UUID, request: ReviewRequest):
    """Approve or reject a queued agent action. If approved, the action should ideally be executed here."""
    result = await review_approval(
        tenant_id=tenant_id,
        approval_id=approval_id,
        action=request.action,
        user_id=request.user_id,
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

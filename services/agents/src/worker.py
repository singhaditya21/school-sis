import asyncio
import structlog
from typing import Dict, Any

from src.core.queue import redis_settings
from src.core.rag import RAGPipeline
from src.core.agent import AgentContext
from src.api.routes import init_agents, get_agent

logger = structlog.get_logger()

async def startup(ctx):
    """Initialise agents when the worker boots, exactly like the API."""
    logger.info("worker_startup_initializing_agents")
    rag = RAGPipeline()
    init_agents(rag)
    ctx["rag"] = rag
    logger.info("worker_startup_complete")

async def shutdown(ctx):
    """Cleanup resources."""
    logger.info("worker_shutdown")
    if "rag" in ctx:
        await ctx["rag"].close()


async def process_agent_query(ctx, agent_name: str, serialized_context: Dict[str, Any]) -> Dict[str, Any]:
    """
    Background job to run an agent query.
    Takes a serialized context and returns a dict mapping to QueryResponse.
    """
    logger.info("worker_processing_job", agent_name=agent_name, job_id=ctx.get("job_id"))
    
    agent = get_agent(agent_name)
    
    # Rehydrate context from dict
    agent_ctx = AgentContext(
        tenant_id=serialized_context["tenant_id"],
        user_id=serialized_context.get("user_id"),
        query=serialized_context["query"]
    )
    
    try:
        response = await agent.query(agent_ctx)
        logger.info("worker_job_complete", agent_name=agent_name, job_id=ctx.get("job_id"))
        return {
            "answer": response.answer,
            "agent_name": response.agent_name,
            "sources": response.sources,
            "tool_calls_made": response.tool_calls_made,
            "tokens_used": response.tokens_used,
            "latency_ms": response.latency_ms,
            "status": "completed"
        }
    except Exception as e:
        logger.error("worker_job_failed", agent_name=agent_name, error=str(e), job_id=ctx.get("job_id"))
        return {
            "answer": f"An infrastructure error occurred during background processing: {str(e)}",
            "agent_name": agent_name,
            "status": "failed"
        }


# Configuration for the ARQ worker command
class WorkerSettings:
    functions = [process_agent_query]
    redis_settings = redis_settings
    on_startup = startup
    on_shutdown = shutdown
    job_timeout = 300 # 5 minutes timeout for heavy LLM analysis
    keep_result = 86400 # Keep job context around for 24h

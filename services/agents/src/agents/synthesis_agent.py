"""SynthesisAgent — The Agent Coordination Bus.

The SynthesisAgent sits above all other agents. It does NOT own
a specific domain collection (like fees or attendance). Instead,
it has tools to query other agents, correlate their findings,
and produce school-wide executive summaries.
"""

from __future__ import annotations

import json
from uuid import UUID

import structlog

from src.core.agent import Agent, AgentContext
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter

logger = structlog.get_logger()


async def ask_another_agent(
    tenant_id: str,
    target_agent: str,
    query: str,
    user_id: str | None = None,
) -> dict:
    """Send a query to another agent and get its analysis."""
    from src.api.routes import get_agent

    try:
        agent = get_agent(target_agent)
    except Exception as e:
        return {"error": f"Agent '{target_agent}' not found. {str(e)}"}

    context = AgentContext(
        tenant_id=UUID(tenant_id),
        user_id=UUID(user_id) if user_id else None,
        query=query,
    )

    try:
        # We must prevent infinite loops if SynthesisAgent asks itself or RiskAgent asks SynthesisAgent
        if target_agent in ("synthesis", "synthesis_agent"):
            return {"error": "SynthesisAgent cannot query itself."}

        response = await agent.query(context)
        return {
            "agent_name": target_agent,
            "answer": response.answer,
            "tool_calls": len(response.tool_calls_made),
            "sources": len(response.sources),
        }
    except Exception as e:
        logger.error("cross_agent_query_failed", error=str(e), target=target_agent)
        return {"error": str(e)}


async def get_domain_summary(
    tenant_id: str,
    domain: str,
) -> dict:
    """Get a rapid summary of a specific domain without full LLM reasoning."""
    # This acts as a fast-path for gathering morning briefing data
    # without paying the token cost of 5 full agent reasoning passes
    from src.tools.fee_tools import get_collection_summary
    from src.tools.attendance_tools import get_daily_report
    from src.tools.admission_tools import get_pipeline_overview
    from src.tools.risk_tools import correlate_signals

    try:
        if domain == "fees":
            return await get_collection_summary(tenant_id=tenant_id)
        elif domain == "attendance":
            return await get_daily_report(tenant_id=tenant_id)
        elif domain == "admissions":
            return await get_pipeline_overview(tenant_id=tenant_id)
        elif domain == "risk":
            return await correlate_signals(tenant_id=tenant_id)
        else:
            return {"error": f"Unknown domain: {domain}. Supported: fees, attendance, admissions, risk."}
    except Exception as e:
        return {"error": str(e)}


class SynthesisAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="synthesis_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are SynthesisAgent, the Principal's executive intelligence agent for ScholarMind.

## Your Role
You sit above all other domain agents (FeeAgent, AttendAgent, AcademAgent, etc.).
Your job is to correlate intelligence across the entire school to produce executive briefings,
detect multi-domain patterns, and answer high-level strategic questions.

## Your Capabilities
You can gather intelligence in two ways:
1. FAST PATH: Use `get_domain_summary` to pull hard numbers (e.g., today's attendance rate, total fees collected).
2. REASONING PATH: Use `ask_another_agent` to send a complex natural language question to a specialist agent (e.g., ask FeeAgent "Why are grade 10 collections dropping?").

## Your Rules
1. For simple metrics, use `get_domain_summary` first — it is faster.
2. For "why" questions or deep analysis, use `ask_another_agent`.
3. When writing a morning briefing, ALWAYS check the `risk` domain to surface crises immediately.
4. When synthesising answers from multiple agents, cross-reference their findings (e.g., "FeeAgent notes a drop in collections, which correlates with AttendAgent flagging a 5% drop in attendance").
5. Keep executive summaries highly skimmable: use bolding, bullet points, and clear headlines.

## Available Agents for deep queries
- fee_agent
- attend_agent
- academ_agent
- admit_agent
- comm_agent
- schedul_agent
- transport_agent
- risk_agent
"""

    def collections(self) -> list[str]:
        # SynthesisAgent reads no collections directly; it relies on other agents or fast-path tools
        return []

    def _register_tools(self) -> None:
        self.tools.register(Tool(
            name="ask_another_agent",
            description="Send a natural language query to a specialist agent (fee_agent, attend_agent, etc.) to leverage its deep domain reasoning.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
                ToolParameter(name="target_agent", type="string", description="Name of the agent (e.g., 'fee_agent')", required=True),
                ToolParameter(name="query", type="string", description="The natural language question to ask the agent", required=True),
            ],
            handler=ask_another_agent,
        ))

        self.tools.register(Tool(
            name="get_domain_summary",
            description="Get fast, raw metrics for a domain (fees, attendance, admissions, risk) without full LLM reasoning.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
                ToolParameter(name="domain", type="string", description="Domain name (fees, attendance, admissions, risk)", required=True),
            ],
            handler=get_domain_summary,
        ))

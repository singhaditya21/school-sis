"""AdmitAgent — admission pipeline intelligence."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.admission_tools import (
    get_pipeline_overview, query_leads, check_documents, get_source_analysis,
)


class AdmitAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="admit_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are AdmitAgent, the admissions intelligence agent for ScholarMind.

## Your Role
You manage admission pipeline analytics — lead tracking, conversion analysis, document completeness checking, and source effectiveness evaluation. You help admission counselors prioritise high-potential leads and identify pipeline bottlenecks.

## Your Rules
1. ALWAYS use tools for real pipeline data. Never fabricate conversion rates.
2. Track conversion rates by source to recommend marketing budget allocation.
3. Flag leads stuck at a stage for >7 days as "stale" requiring follow-up.
4. Document completeness is critical — always highlight pending verifications.
5. NEVER advance a lead to a new stage — you analyse and recommend only.

## Response Format
- **Summary**: Pipeline health headline
- **Analysis**: Stage-by-stage breakdown, source comparison, bottleneck identification
- **Action Items**: Specific leads or applications needing attention
"""

    def collections(self) -> list[str]:
        return ["admission_leads"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(name="get_pipeline_overview", description="Admission funnel overview — count of leads at each pipeline stage with conversion rate.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
        ], handler=get_pipeline_overview))
        self.tools.register(Tool(name="query_leads", description="Query admission leads filtered by stage, source, or applying-for grade.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="stage", type="string", description="Pipeline stage filter", required=False),
            ToolParameter(name="source", type="string", description="Lead source filter", required=False),
            ToolParameter(name="grade", type="string", description="Applying for grade", required=False),
        ], handler=query_leads))
        self.tools.register(Tool(name="check_documents", description="Check document submission and verification status for applications.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="application_id", type="string", description="Specific application UUID", required=False),
        ], handler=check_documents))
        self.tools.register(Tool(name="get_source_analysis", description="Analyse which lead sources have the best conversion rates.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
        ], handler=get_source_analysis))

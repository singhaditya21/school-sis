"""FeeAgent — the first production agent, managing fee intelligence."""

from __future__ import annotations

from src.core.agent import Agent, AgentContext
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.fee_tools import (
    query_overdue_invoices,
    get_collection_summary,
    get_student_fee_history,
    get_grade_wise_collection,
    get_payment_trends,
)


class FeeAgent(Agent):
    """
    Financial intelligence agent for the ScholarMind platform.

    Capabilities:
    - Analyse overdue invoices and predict payment likelihood
    - Surface collection rate trends by grade, term, and time period
    - Identify at-risk defaulters before they become critical
    - Generate cashflow forecasts based on historical patterns
    - Recommend optimal reminder timing and channels
    """

    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="fee_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are FeeAgent, the financial intelligence agent for ScholarMind — an AI-first education management platform.

## Your Role
You are a financial analyst specialising in school fee collections. You help administrators understand fee collection patterns, identify defaulters early, and make data-driven decisions about fee management.

## Your Capabilities
- Query overdue invoices with filters (grade, amount, days overdue)
- Analyse collection rates by grade, section, and time period
- Review individual student fee histories
- Generate insights about payment patterns and trends

## Your Rules
1. ALWAYS use your tools to fetch real data before answering. Never fabricate numbers.
2. ALWAYS cite the source of your data (which tool call provided it).
3. If you cannot find enough data to answer, say so clearly.
4. Present financial figures with proper formatting (currency symbols, commas).
5. When identifying risks, explain the reasoning and suggest specific actions.
6. NEVER approve or process payments — you can only analyse and recommend.
7. Be concise but thorough. Use tables when comparing multiple items.

## Response Format
Structure your responses with:
- **Summary**: 1-2 sentence headline finding
- **Analysis**: Detailed breakdown with data
- **Recommendations**: Actionable next steps (if applicable)
"""

    def collections(self) -> list[str]:
        return ["fee_records", "student_profiles"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(
            name="query_overdue_invoices",
            description="Get all overdue invoices, optionally filtered by grade, minimum amount, or minimum days overdue. Returns invoice details including student name, amount, and days overdue.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="The tenant UUID", required=True),
                ToolParameter(name="grade_id", type="string", description="Filter by grade UUID", required=False),
                ToolParameter(name="min_amount", type="number", description="Minimum overdue amount in INR", required=False),
                ToolParameter(name="days_overdue", type="integer", description="Minimum days past due date", required=False),
            ],
            handler=query_overdue_invoices,
        ))

        self.tools.register(Tool(
            name="get_collection_summary",
            description="Get fee collection summary showing total billed, collected, pending, and collection rate. Can filter by date range.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="The tenant UUID", required=True),
                ToolParameter(name="start_date", type="string", description="Start date (YYYY-MM-DD)", required=False),
                ToolParameter(name="end_date", type="string", description="End date (YYYY-MM-DD)", required=False),
            ],
            handler=get_collection_summary,
        ))

        self.tools.register(Tool(
            name="get_student_fee_history",
            description="Get complete fee history for a specific student — all invoices, payments, concessions, and outstanding balance.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="The tenant UUID", required=True),
                ToolParameter(name="student_id", type="string", description="The student UUID", required=True),
            ],
            handler=get_student_fee_history,
        ))

        self.tools.register(Tool(
            name="get_grade_wise_collection",
            description="Get collection rates broken down by grade/class. Shows which grades have the highest and lowest collection rates.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="The tenant UUID", required=True),
            ],
            handler=get_grade_wise_collection,
        ))

        self.tools.register(Tool(
            name="get_payment_trends",
            description="Get payment collection trends over time — daily, weekly, or monthly. Shows amount collected, payment count, and unique students per period.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="The tenant UUID", required=True),
                ToolParameter(name="period", type="string", description="Trend period: 'daily', 'weekly', or 'monthly'", required=False, enum=["daily", "weekly", "monthly"]),
            ],
            handler=get_payment_trends,
        ))

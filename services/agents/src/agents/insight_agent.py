"""InsightAgent — School KPI dashboards and performance analytics.

Wave 1 agent (low effort, high ROI). Provides real-time KPI metrics
and school health indicators via SQL queries.
"""

from __future__ import annotations
from src.core.agent import BaseAgent


class InsightAgent(BaseAgent):
    """Provides school-wide KPI analytics and performance insights."""

    name = "InsightAgent"
    description = "School KPI dashboards, performance tracking, and trend analysis"
    system_prompt = """You are InsightAgent, an expert school analytics advisor.
You analyze school-wide Key Performance Indicators (KPIs) to provide actionable insights.

CAPABILITIES:
- Overall school health metrics (enrollment, retention, academic performance)
- Trend analysis across terms/years
- Benchmarking against historical data
- Identifying areas of concern or improvement

RULES:
- ALWAYS use tools to fetch real data. Never fabricate numbers.
- Present data in clear tables when appropriate.
- Highlight concerning trends with specific recommendations.
- Compare current metrics to previous periods when available.
"""

    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_school_kpis",
                "description": "Get comprehensive KPI metrics for the school",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string", "description": "School tenant ID"},
                    },
                    "required": ["tenant_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_enrollment_trends",
                "description": "Get student enrollment trends over academic years",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string", "description": "School tenant ID"},
                        "years": {"type": "integer", "description": "Number of years to look back", "default": 3},
                    },
                    "required": ["tenant_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_grade_performance_summary",
                "description": "Get academic performance summary by grade",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string", "description": "School tenant ID"},
                    },
                    "required": ["tenant_id"],
                },
            },
        },
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.insight_tools import get_school_kpis, get_enrollment_trends, get_grade_performance_summary

        if tool_name == "get_school_kpis":
            return await get_school_kpis(**args)
        elif tool_name == "get_enrollment_trends":
            return await get_enrollment_trends(**args)
        elif tool_name == "get_grade_performance_summary":
            return await get_grade_performance_summary(**args)
        return {"error": f"Unknown tool: {tool_name}"}

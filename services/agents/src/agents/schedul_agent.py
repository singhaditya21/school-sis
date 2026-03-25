"""SchedulAgent — timetable intelligence and conflict detection."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.schedule_tools import (
    get_timetable, check_conflicts, get_teacher_workload, get_substitutions,
)


class SchedulAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="schedul_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are SchedulAgent, the timetable and scheduling intelligence agent for ScholarMind.

## Your Role
You detect timetable conflicts, analyse teacher workloads, track substitutions, and provide scheduling intelligence. You help administrators identify double-bookings, overloaded teachers, and substitution patterns.

## Your Rules
1. ALWAYS use tools for real timetable data. Never fabricate schedules.
2. Teacher double-bookings and room clashes are CRITICAL — always flag immediately.
3. Teachers with >30% more periods than average are "overloaded" — flag for redistribution.
4. Track substitution patterns — frequent substitutions for the same teacher indicate a staffing gap.
5. NEVER modify timetables directly — you detect issues and recommend fixes only.

## Response Format
- **Summary**: Scheduling health headline
- **Conflicts**: Any double-bookings or room clashes (CRITICAL)
- **Workload Analysis**: Teacher load distribution
- **Recommendations**: Specific rebalancing or substitution suggestions
"""

    def collections(self) -> list[str]:
        return ["timetable_state"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(name="get_timetable", description="View timetable entries. Filter by section, teacher, or day of week.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="section_id", type="string", description="Section UUID filter", required=False),
            ToolParameter(name="teacher_id", type="string", description="Teacher UUID filter", required=False),
            ToolParameter(name="day", type="string", description="Day filter (MONDAY-SATURDAY)", required=False),
        ], handler=get_timetable))
        self.tools.register(Tool(name="check_conflicts", description="Detect timetable conflicts — teacher double-bookings and room clashes.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
        ], handler=check_conflicts))
        self.tools.register(Tool(name="get_teacher_workload", description="Analyse teacher workload — periods per week, sections taught, overloaded detection.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="teacher_id", type="string", description="Specific teacher UUID", required=False),
        ], handler=get_teacher_workload))
        self.tools.register(Tool(name="get_substitutions", description="Get recent substitution assignments with original/substitute teacher and reason.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="date", type="string", description="Specific date YYYY-MM-DD", required=False),
            ToolParameter(name="days", type="integer", description="Look-back days (default 7)", required=False),
        ], handler=get_substitutions))

"""AttendAgent — attendance pattern analysis and anomaly detection."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.attendance_tools import (
    query_attendance, flag_anomalies, get_student_attendance, get_daily_report,
)


class AttendAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="attend_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are AttendAgent, the attendance intelligence agent for ScholarMind.

## Your Role
You analyse attendance data to detect patterns, flag chronic absenteeism, identify sudden drops, and surface anomalies that require intervention. You help administrators and teachers act before attendance problems become critical.

## Your Rules
1. ALWAYS use tools to fetch real attendance data. Never estimate or fabricate figures.
2. Flag students below 85% attendance. Below 75% is CRITICAL.
3. Consecutive absences of 3+ days require immediate attention — always highlight these.
4. When comparing sections, note statistical significance (small sections may skew rates).
5. Consider holidays and excused absences separately from unexcused.
6. Recommend specific actions: parent meetings, counselor referrals, home visits.

## Response Format
- **Summary**: Headline finding (e.g., "12 students below 75% attendance in the last 30 days")
- **Analysis**: Data breakdown with section/grade comparisons
- **Alerts**: Students requiring immediate attention
- **Recommendations**: Specific actions with priority levels
"""

    def collections(self) -> list[str]:
        return ["attendance_patterns", "student_profiles"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(
            name="query_attendance",
            description="Get attendance summary by grade/section with present, absent, late counts and attendance rate. Supports date range filtering.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
                ToolParameter(name="grade_id", type="string", description="Filter by grade UUID", required=False),
                ToolParameter(name="section_id", type="string", description="Filter by section UUID", required=False),
                ToolParameter(name="start_date", type="string", description="Start date YYYY-MM-DD", required=False),
                ToolParameter(name="end_date", type="string", description="End date YYYY-MM-DD", required=False),
            ],
            handler=query_attendance,
        ))
        self.tools.register(Tool(
            name="flag_anomalies",
            description="Identify students with attendance below a threshold in recent N days. Returns student details with guardian contact info.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
                ToolParameter(name="threshold_percent", type="number", description="Attendance threshold (default 85)", required=False),
                ToolParameter(name="days", type="integer", description="Look-back period in days (default 30)", required=False),
            ],
            handler=flag_anomalies,
        ))
        self.tools.register(Tool(
            name="get_student_attendance",
            description="Get detailed attendance history for a specific student including consecutive absence streaks.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
                ToolParameter(name="student_id", type="string", description="Student UUID", required=True),
                ToolParameter(name="days", type="integer", description="Look-back days (default 90)", required=False),
            ],
            handler=get_student_attendance,
        ))
        self.tools.register(Tool(
            name="get_daily_report",
            description="Get school-wide attendance report for a specific date (defaults to today). Shows per-section rates.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
                ToolParameter(name="date", type="string", description="Date YYYY-MM-DD (default today)", required=False),
            ],
            handler=get_daily_report,
        ))

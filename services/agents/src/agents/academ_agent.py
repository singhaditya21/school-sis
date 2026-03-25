"""AcademAgent — academic performance tracking and analysis."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.academic_tools import (
    query_results, get_student_academics, compare_performance, get_at_risk_students,
)


class AcademAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="academ_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are AcademAgent, the academic intelligence agent for ScholarMind.

## Your Role
You analyse exam results, track subject mastery, compare performance across grades and subjects, and identify academically at-risk students. You help teachers and administrators understand academic patterns and take targeted action.

## Your Rules
1. ALWAYS use tools for real data. Never fabricate marks or percentages.
2. When comparing subjects, identify the weakest and strongest — recommend targeted interventions.
3. Students failing in 2+ subjects are "at risk" — always flag them explicitly.
4. Use percentages for fair comparison (max marks vary across exams).
5. NEVER modify grades or approve results — you analyse and recommend only.

## Response Format
- **Summary**: Headline finding
- **Analysis**: Subject-wise or grade-wise breakdown with data tables
- **At-Risk Students**: Students needing immediate academic support
- **Recommendations**: Specific interventions (remedial classes, parent meetings, tutor assignment)
"""

    def collections(self) -> list[str]:
        return ["academic_records", "student_profiles"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(name="query_results", description="Get exam results with pass rates, averages, and highest/lowest marks. Filter by exam, grade, or subject.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="exam_id", type="string", description="Filter by exam UUID", required=False),
            ToolParameter(name="grade_id", type="string", description="Filter by grade UUID", required=False),
            ToolParameter(name="subject_id", type="string", description="Filter by subject UUID", required=False),
        ], handler=query_results))
        self.tools.register(Tool(name="get_student_academics", description="Get complete academic profile for a student — all exams, subject-wise averages, and trend data.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="student_id", type="string", description="Student UUID", required=True),
        ], handler=get_student_academics))
        self.tools.register(Tool(name="compare_performance", description="Compare student performance across subjects within a grade. Identifies weakest and strongest subjects.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="grade_id", type="string", description="Grade UUID", required=True),
            ToolParameter(name="exam_id", type="string", description="Filter by exam UUID", required=False),
        ], handler=compare_performance))
        self.tools.register(Tool(name="get_at_risk_students", description="Find students failing in multiple subjects. Configurable fail threshold.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="grade_id", type="string", description="Filter by grade UUID", required=False),
            ToolParameter(name="fail_threshold", type="integer", description="Min failing subjects (default 2)", required=False),
        ], handler=get_at_risk_students))

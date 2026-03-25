"""RiskAgent — cross-module student welfare risk scoring."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.risk_tools import get_student_risk_score, correlate_signals


class RiskAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="risk_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are RiskAgent, the student welfare risk intelligence agent for ScholarMind.

## Your Role
You are the ONLY agent that reads across all domains — fees, attendance, and academics — to produce composite risk scores. You identify students who are at risk across multiple dimensions simultaneously, which individual domain agents cannot detect.

## Risk Signal Definitions
- **Fee Risk**: Any overdue invoices, or 3+ outstanding invoices
- **Attendance Risk**: Below 85% attendance rate in 90 days, or below 75% (CRITICAL)
- **Academic Risk**: Failing in 2+ subjects in recent exams

## Your Rules
1. ALWAYS use tools — cross-module risk scoring requires real data from all three domains.
2. A student with 2+ risk signals requires IMMEDIATE attention — flag for counselor referral.
3. A student with ALL THREE signals (fee + attendance + academic) is in CRISIS — escalate to principal.
4. Correlate signals: attendance drops often precede academic decline. Fee defaults may indicate family crisis.
5. NEVER make welfare assumptions — present data and recommend professional follow-up.
6. Student welfare data is HIGHLY SENSITIVE — never expose in bulk or without proper authorization context.

## Response Format
- **Summary**: School-wide risk overview headline
- **Crisis Students**: Students with 3/3 risk signals (highest priority)
- **High Risk**: Students with 2/3 risk signals
- **Signal Correlation**: Patterns across the student body (e.g., "14% of students with fee defaults also have attendance below 85%")
- **Recommendations**: Specific interventions by priority
"""

    def collections(self) -> list[str]:
        return ["student_profiles", "fee_records", "attendance_patterns", "academic_records"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(
            name="get_student_risk_score",
            description="Calculate composite risk scores by correlating fee overdue, attendance rate, and academic failures. Returns students with N+ risk signals.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
                ToolParameter(name="student_id", type="string", description="Specific student UUID", required=False),
                ToolParameter(name="grade_id", type="string", description="Filter by grade UUID", required=False),
                ToolParameter(name="min_risk_signals", type="integer", description="Min signals to flag (default 2)", required=False),
            ],
            handler=get_student_risk_score,
        ))
        self.tools.register(Tool(
            name="correlate_signals",
            description="School-wide risk dashboard — how many students have each type of risk and the overlaps between them.",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ],
            handler=correlate_signals,
        ))

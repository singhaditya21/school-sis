"""Wave 2–4 AI Agents — All remaining domain agents.

Each agent class follows the BaseAgent pattern with:
- name, description, system_prompt
- tools list (function definitions)
- execute_tool method
"""

from __future__ import annotations
from src.core.agent import BaseAgent


# ═══════════════════════════════════════════════════════════
# WAVE 2 — Revenue & Operations Agents
# ═══════════════════════════════════════════════════════════

class CollectionsAgent(BaseAgent):
    name = "CollectionsAgent"
    description = "Fee collection follow-up, defaulter analysis, and payment reminder orchestration"
    system_prompt = """You are CollectionsAgent, a fee recovery specialist.
You identify defaulters, prioritize follow-ups, and generate collection reports.

CAPABILITIES:
- Defaulter list with aging analysis (30/60/90 days)
- Payment reminder scheduling
- Collection trend analysis
- Concession and waiver tracking

RULES:
- READ-ONLY: You CANNOT write to payment tables.
- Sort defaulters by amount due (highest first).
- Include guardian contact info for follow-up.
- Flag students at risk of disenrollment.
"""
    tools = [
        {"type": "function", "function": {"name": "get_defaulters_aging", "description": "Get fee defaulters with aging buckets (30/60/90 days)", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
        {"type": "function", "function": {"name": "get_collection_trends", "description": "Monthly collection trends", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "months": {"type": "integer", "default": 6}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.collections_tools import get_defaulters_aging, get_collection_trends
        return await {"get_defaulters_aging": get_defaulters_aging, "get_collection_trends": get_collection_trends}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class WorkforceAgent(BaseAgent):
    name = "WorkforceAgent"
    description = "Staff attendance, leave tracking, payroll insights, and HR analytics"
    system_prompt = """You are WorkforceAgent, a human resources analytics assistant.
You track staff attendance, analyze leave patterns, and provide payroll insights.

CAPABILITIES:
- Staff attendance analysis
- Leave balance and pattern detection
- Payroll summary and anomaly detection
- Teacher workload analysis (periods per week)

RULES:
- Always protect employee PII.
- Flag unusual patterns (excessive absences, overtime).
- Present data in summary tables.
"""
    tools = [
        {"type": "function", "function": {"name": "get_staff_attendance", "description": "Staff attendance summary", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "month": {"type": "string"}}, "required": ["tenant_id"]}}},
        {"type": "function", "function": {"name": "get_leave_analysis", "description": "Leave pattern analysis", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.workforce_tools import get_staff_attendance, get_leave_analysis
        return await {"get_staff_attendance": get_staff_attendance, "get_leave_analysis": get_leave_analysis}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class CampusAgent(BaseAgent):
    name = "CampusAgent"
    description = "Campus facility management, maintenance tracking, and infrastructure analytics"
    system_prompt = """You are CampusAgent, a facilities management assistant.
You track maintenance requests, room utilization, and campus infrastructure.

CAPABILITIES:
- Room and facility utilization rates
- Maintenance request tracking
- Inventory status for campus assets
- Visitor log analysis

RULES:
- Prioritize safety-critical maintenance issues.
- Track cost of maintenance per facility.
"""
    tools = [
        {"type": "function", "function": {"name": "get_facility_utilization", "description": "Room/facility usage rates", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
        {"type": "function", "function": {"name": "get_visitor_stats", "description": "Visitor log summary", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "days": {"type": "integer", "default": 30}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.campus_tools import get_facility_utilization, get_visitor_stats
        return await {"get_facility_utilization": get_facility_utilization, "get_visitor_stats": get_visitor_stats}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class PlacementAgent(BaseAgent):
    name = "PlacementAgent"
    description = "University admission tracking, competitive exam readiness, and placement analytics"
    system_prompt = """You are PlacementAgent, a career guidance and placement analytics assistant.
You track university admissions, competitive exam preparation, and alumni career outcomes.

CAPABILITIES:
- University admission statistics
- Competitive exam (JEE/NEET/CUET) readiness analysis
- Subject-wise strength/weakness for exam prep
- Alumni career outcome tracking

RULES:
- Base predictions on historical data, not speculation.
- Provide actionable study recommendations.
"""
    tools = [
        {"type": "function", "function": {"name": "get_exam_readiness", "description": "Competitive exam readiness by student", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "exam_type": {"type": "string", "enum": ["JEE", "NEET", "CUET"]}}, "required": ["tenant_id", "exam_type"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.placement_tools import get_exam_readiness
        return await {"get_exam_readiness": get_exam_readiness}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


# ═══════════════════════════════════════════════════════════
# WAVE 3 — Differentiation Agents
# ═══════════════════════════════════════════════════════════

class CrisisAgent(BaseAgent):
    name = "CrisisAgent"
    description = "Emergency broadcast management and crisis response coordination"
    system_prompt = """You are CrisisAgent, an emergency response coordinator.
You manage emergency broadcasts, evacuation protocols, and crisis communication.

CAPABILITIES:
- Emergency broadcast to all parents/staff
- Crisis event logging and timeline
- Evacuation checklist verification
- Post-incident report generation

RULES:
- ALL emergency actions require HUMAN-IN-THE-LOOP APPROVAL.
- Never auto-send emergency broadcasts.
- Log every action with timestamp.
- Prioritize student safety above all.
"""
    tools = [
        {"type": "function", "function": {"name": "draft_emergency_broadcast", "description": "Draft an emergency broadcast message (requires approval)", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "severity": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]}, "message": {"type": "string"}}, "required": ["tenant_id", "severity", "message"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.crisis_tools import draft_emergency_broadcast
        return await {"draft_emergency_broadcast": draft_emergency_broadcast}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class HealthAgent(BaseAgent):
    name = "HealthAgent"
    description = "Student health records, medical alerts, and wellness analytics"
    system_prompt = """You are HealthAgent, a student health management assistant.
You track medical records, allergies, and health trends.

CAPABILITIES:
- Student medical record lookup
- Allergy and medication alerts
- Health screening schedule tracking
- Vaccination record management

RULES:
- HIPAA-AWARE: Minimize PII exposure in responses.
- Always flag critical allergies prominently.
- Never disclose health info to unauthorized roles.
"""
    tools = [
        {"type": "function", "function": {"name": "get_health_alerts", "description": "Get students with critical health alerts", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.health_tools import get_health_alerts
        return await {"get_health_alerts": get_health_alerts}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class AlumniAgent(BaseAgent):
    name = "AlumniAgent"
    description = "Alumni engagement, donation tracking, and network analytics"
    system_prompt = """You are AlumniAgent, an alumni relations assistant.
You track alumni engagement, donations, and career outcomes.

CAPABILITIES:
- Alumni directory search
- Donation and fundraising analytics
- Event attendance tracking
- Career outcome statistics

RULES:
- Respect alumni privacy preferences.
- Highlight top donors and active alumni.
"""
    tools = [
        {"type": "function", "function": {"name": "get_alumni_stats", "description": "Alumni network statistics and donation summary", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.alumni_tools import get_alumni_stats
        return await {"get_alumni_stats": get_alumni_stats}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class AccredAgent(BaseAgent):
    name = "AccredAgent"
    description = "Board accreditation compliance, CBSE/ICSE reporting, and regulatory readiness"
    system_prompt = """You are AccredAgent, an accreditation and compliance specialist.
You track board requirements, generate regulatory reports, and monitor compliance status.

CAPABILITIES:
- CBSE/ICSE/State Board compliance checklist
- Teacher qualification verification
- Infrastructure standard compliance
- NAAC/NIRF readiness (higher ed)

RULES:
- Reference specific board circulars when citing requirements.
- Flag non-compliance items with urgency levels.
"""
    tools = [
        {"type": "function", "function": {"name": "get_compliance_status", "description": "Board-specific compliance checklist status", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "board": {"type": "string", "enum": ["CBSE", "ICSE", "STATE"]}}, "required": ["tenant_id", "board"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.accred_tools import get_compliance_status
        return await {"get_compliance_status": get_compliance_status}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class IntlAgent(BaseAgent):
    name = "IntlAgent"
    description = "International student support, visa tracking, and cross-border compliance"
    system_prompt = """You are IntlAgent, an international education specialist.
You manage international student records, visa compliance, and cross-border data requirements.

CAPABILITIES:
- International student enrollment tracking
- Visa/permit expiry alerts
- Currency conversion for international fees
- GDPR compliance for EU students

RULES:
- Track document expiry dates proactively.
- Flag students with expiring visas (30-day warning).
- Handle multi-currency fee calculations.
"""
    tools = [
        {"type": "function", "function": {"name": "get_intl_students", "description": "International student summary with visa status", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.intl_tools import get_intl_students
        return await {"get_intl_students": get_intl_students}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


# ═══════════════════════════════════════════════════════════
# WAVE 4 — Advanced AI Agents
# ═══════════════════════════════════════════════════════════

class SafeguardAgent(BaseAgent):
    name = "SafeguardAgent"
    description = "Child safety monitoring, behavioral pattern detection, and safeguarding alerts"
    system_prompt = """You are SafeguardAgent, a child protection specialist.
You monitor behavioral patterns and flag potential safeguarding concerns.

CAPABILITIES:
- Attendance anomaly detection (frequent unexplained absences)
- Academic performance sudden drops
- Behavioral incident correlation
- Cross-signal risk scoring

RULES:
- HIGHEST SENSITIVITY: All findings are confidential.
- False positives are acceptable; false negatives are not.
- Always recommend professional assessment, never diagnose.
- Output guardrails: strip identifying details in shared reports.
"""
    tools = [
        {"type": "function", "function": {"name": "get_safeguarding_alerts", "description": "Students with safeguarding risk signals", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.safeguard_tools import get_safeguarding_alerts
        return await {"get_safeguarding_alerts": get_safeguarding_alerts}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class AdvisorAgent(BaseAgent):
    name = "AdvisorAgent"
    description = "Personalized academic advising, course recommendations, and learning path optimization"
    system_prompt = """You are AdvisorAgent, a personalized academic advisor.
You analyze student performance to provide tailored learning recommendations.

CAPABILITIES:
- Subject-wise performance analysis
- Stream/elective recommendation (Science/Commerce/Arts)
- Weakness identification with targeted study plans
- Peer comparison (anonymized)

RULES:
- Base recommendations on data, not assumptions.
- Consider both academic and extracurricular strengths.
- Provide specific, actionable recommendations.
"""
    tools = [
        {"type": "function", "function": {"name": "get_student_profile_analysis", "description": "Comprehensive student performance analysis for advising", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "student_id": {"type": "string"}}, "required": ["tenant_id", "student_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.advisor_tools import get_student_profile_analysis
        return await {"get_student_profile_analysis": get_student_profile_analysis}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class NeuroAgent(BaseAgent):
    name = "NeuroAgent"
    description = "Learning style detection, neurodiversity support, and adaptive learning recommendations"
    system_prompt = """You are NeuroAgent, a neurodiversity and inclusive education specialist.
You identify diverse learning patterns and recommend accommodations.

CAPABILITIES:
- Learning style pattern detection from assessment data
- Accommodation recommendations (extra time, visual aids, etc.)
- IEP (Individualized Education Plan) tracking
- Progress monitoring for students with special needs

RULES:
- Use person-first language (\"student with dyslexia\", not \"dyslexic student\").
- Never diagnose — recommend professional assessment.
- All recommendations must be evidence-based.
- Highest data confidentiality.
"""
    tools = [
        {"type": "function", "function": {"name": "get_learning_patterns", "description": "Analyze assessment patterns to identify learning styles", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}, "student_id": {"type": "string"}}, "required": ["tenant_id", "student_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.neuro_tools import get_learning_patterns
        return await {"get_learning_patterns": get_learning_patterns}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)


class ResearchAgent(BaseAgent):
    name = "ResearchAgent"
    description = "Educational research, pedagogy analytics, and teaching effectiveness measurement"
    system_prompt = """You are ResearchAgent, an educational research and analytics specialist.
You analyze teaching effectiveness, curriculum outcomes, and pedagogical patterns.

CAPABILITIES:
- Teaching effectiveness metrics (student outcome correlation)
- Curriculum coverage analysis
- Assessment quality metrics (difficulty distribution, discrimination index)
- Cross-school benchmarking (anonymized)

RULES:
- Statistical rigor: report confidence intervals where applicable.
- Never use research findings to identify or penalize teachers.
- Separate correlation from causation.
"""
    tools = [
        {"type": "function", "function": {"name": "get_teaching_effectiveness", "description": "Teaching effectiveness analysis by subject/teacher", "parameters": {"type": "object", "properties": {"tenant_id": {"type": "string"}}, "required": ["tenant_id"]}}},
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.research_tools import get_teaching_effectiveness
        return await {"get_teaching_effectiveness": get_teaching_effectiveness}.get(tool_name, lambda **a: {"error": f"Unknown: {tool_name}"})(**args)

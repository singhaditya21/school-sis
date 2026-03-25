"""ComplianceAgent — Audit trail analysis and compliance reporting.

Wave 1 agent (low effort). Queries the audit_logs table and generates
compliance-ready reports.
"""

from __future__ import annotations
from src.core.agent import BaseAgent


class ComplianceAgent(BaseAgent):
    """Audit trail analysis and compliance reporting."""

    name = "ComplianceAgent"
    description = "Audit log analysis, compliance reports, and data access tracking"
    system_prompt = """You are ComplianceAgent, a data governance and compliance specialist.
You analyze audit logs to ensure regulatory compliance and detect anomalies.

CAPABILITIES:
- Audit log search and filtering
- User activity reports
- Data access pattern analysis
- Compliance status checks (DPDPA, consent tracking)

RULES:
- ALWAYS use tools to fetch real audit data. Never invent logs.
- Flag suspicious patterns (bulk data exports, off-hours access, repeated failures).
- Present findings in chronological order with clear timestamps.
- Recommend corrective actions when issues are found.
"""

    tools = [
        {
            "type": "function",
            "function": {
                "name": "search_audit_logs",
                "description": "Search audit logs with filters",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string"},
                        "user_id": {"type": "string", "description": "Filter by specific user"},
                        "action": {"type": "string", "description": "Filter by action type (CREATE, UPDATE, DELETE, LOGIN, EXPORT)"},
                        "days": {"type": "integer", "description": "Look back N days", "default": 7},
                    },
                    "required": ["tenant_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_consent_status",
                "description": "Check consent records for DPDPA compliance",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string"},
                    },
                    "required": ["tenant_id"],
                },
            },
        },
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.compliance_tools import search_audit_logs, get_consent_status

        if tool_name == "search_audit_logs":
            return await search_audit_logs(**args)
        elif tool_name == "get_consent_status":
            return await get_consent_status(**args)
        return {"error": f"Unknown tool: {tool_name}"}

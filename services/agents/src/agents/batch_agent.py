"""BatchAgent — Orchestrates multiple agent queries in a single request.

Wave 1 agent. Allows running bulk operations like
"send attendance summary for all grades" or "generate fee reminders for all defaulters".
"""

from __future__ import annotations
from src.core.agent import BaseAgent


class BatchAgent(BaseAgent):
    name = "BatchAgent"
    description = "Batch operations orchestrator — runs bulk queries across multiple agents"
    system_prompt = """You are BatchAgent, a bulk operations coordinator.
You orchestrate multiple agent queries into a single batch operation.

CAPABILITIES:
- Run the same query across multiple grades/sections
- Aggregate results from multiple agents
- Generate bulk reports (attendance summaries, fee defaulter lists)

RULES:
- Break batch operations into individual agent calls.
- Report progress: "Processing grade 5... grade 6... done."
- Aggregate results into a single summary table.
- Limit batch size to 50 items to prevent timeout.
"""

    tools = [
        {
            "type": "function",
            "function": {
                "name": "batch_attendance_summary",
                "description": "Generate attendance summary for all grades on a specific date",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string"},
                        "date": {"type": "string", "description": "Date in YYYY-MM-DD format", "default": "today"},
                    },
                    "required": ["tenant_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "batch_fee_defaulters",
                "description": "List all fee defaulters across all grades",
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
        from src.tools.batch_tools import batch_attendance_summary, batch_fee_defaulters

        if tool_name == "batch_attendance_summary":
            return await batch_attendance_summary(**args)
        elif tool_name == "batch_fee_defaulters":
            return await batch_fee_defaulters(**args)
        return {"error": f"Unknown tool: {tool_name}"}

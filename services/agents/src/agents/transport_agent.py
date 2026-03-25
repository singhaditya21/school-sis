"""TransportAgent — transport route and vehicle intelligence."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.transport_tools import (
    get_route_overview, get_vehicle_compliance, get_student_transport_info,
)


class TransportAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="transport_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are TransportAgent, the transport intelligence agent for ScholarMind.

## Your Role
You analyse transport routes, vehicle compliance, capacity utilisation, and student assignments. You help transport managers optimise routes, flag compliance issues, and ensure student safety.

## Your Rules
1. ALWAYS use tools for real transport data. Never fabricate route details.
2. Expired insurance or fitness certificates are CRITICAL safety issues — flag immediately.
3. Routes above 100% capacity are overloaded — recommend splitting or larger vehicle.
4. Vehicles without GPS tracking should be flagged for installation.
5. NEVER modify routes or assignments — you analyse and recommend only.

## Response Format
- **Summary**: Transport fleet status headline
- **Compliance Alerts**: Expired documents, missing GPS (CRITICAL)
- **Capacity Analysis**: Utilisation rates, overloaded routes
- **Recommendations**: Route optimisation, compliance actions
"""

    def collections(self) -> list[str]:
        return ["transport_data"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(name="get_route_overview", description="Overview of all transport routes with vehicle, student count, and utilisation percentage.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
        ], handler=get_route_overview))
        self.tools.register(Tool(name="get_vehicle_compliance", description="Check vehicle compliance — insurance, fitness certificate expiry, GPS tracking status.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
        ], handler=get_vehicle_compliance))
        self.tools.register(Tool(name="get_student_transport_info", description="Get student-route-stop assignments with driver details.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="student_id", type="string", description="Specific student UUID", required=False),
            ToolParameter(name="route_id", type="string", description="Specific route UUID", required=False),
        ], handler=get_student_transport_info))

"""CommAgent — communication channel orchestration and analytics."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
from src.tools.comm_tools import get_message_stats, check_consent, get_failed_messages


class CommAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="comm_agent", rag=rag, **kwargs)

    def system_prompt(self) -> str:
        return """You are CommAgent, the communications intelligence agent for ScholarMind.

## Your Role
You analyse messaging effectiveness across channels (SMS, Email, WhatsApp, Push), monitor delivery and read rates, enforce consent compliance, and troubleshoot failed deliveries. You help administrators optimise communication strategies.

## Your Rules
1. ALWAYS check consent before recommending any outreach.
2. Report delivery rates and read rates separately — high delivery with low read indicates content problems.
3. Flag channels with >5% failure rate as needing investigation.
4. NEVER send messages directly — you analyse and recommend channel strategies only.
5. GDPR/consent compliance is non-negotiable — always verify opt-in status.

## Response Format
- **Summary**: Channel health headline
- **Analysis**: Delivery rates, read rates, channel comparison
- **Issues**: Failed deliveries, consent gaps
- **Recommendations**: Channel optimisation suggestions
"""

    def collections(self) -> list[str]:
        return ["communications"]

    def _register_tools(self) -> None:
        self.tools.register(Tool(name="get_message_stats", description="Messaging statistics — total sent, delivery rate, read rate per channel.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="channel", type="string", description="Filter by channel (SMS, EMAIL, WHATSAPP)", required=False),
            ToolParameter(name="days", type="integer", description="Look-back days (default 30)", required=False),
        ], handler=get_message_stats))
        self.tools.register(Tool(name="check_consent", description="Check communication consent/opt-in status for users across channels.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="user_id", type="string", description="Specific user UUID", required=False),
            ToolParameter(name="channel", type="string", description="Channel filter", required=False),
        ], handler=check_consent))
        self.tools.register(Tool(name="get_failed_messages", description="Get recent failed message deliveries with error details for troubleshooting.", parameters=[
            ToolParameter(name="tenant_id", type="string", description="Tenant UUID", required=True),
            ToolParameter(name="days", type="integer", description="Look-back days (default 7)", required=False),
        ], handler=get_failed_messages))

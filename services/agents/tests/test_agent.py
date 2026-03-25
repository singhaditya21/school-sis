"""Tests for the core agent framework — tool registry, representations, and agent initialisation."""

import json
import pytest
from unittest.mock import AsyncMock, patch
from uuid import uuid4

# Add parent to path
import sys
sys.path.insert(0, ".")

from src.core.tool import Tool, ToolParameter, ToolRegistry
from src.core.agent import AgentContext, AgentResponse
from src.agents.fee_agent import FeeAgent
from src.core.rag import RAGPipeline
from src.indexing.representations import (
    build_student_representation,
    build_invoice_representation,
    build_grade_collection_representation,
)


# ─── Tool Registry Tests ─────────────────────────────────


class TestToolRegistry:
    """Test tool registration, schema generation, and execution."""

    def setup_method(self):
        self.registry = ToolRegistry()

    def test_register_tool(self):
        async def dummy_handler(**kwargs):
            return {"result": "ok"}

        tool = Tool(
            name="test_tool",
            description="A test tool",
            parameters=[
                ToolParameter(name="input", type="string", description="Test input"),
            ],
            handler=dummy_handler,
        )
        self.registry.register(tool)
        assert self.registry.get("test_tool") is not None
        assert len(self.registry.list_tools()) == 1

    def test_unknown_tool_returns_none(self):
        assert self.registry.get("nonexistent") is None

    def test_openai_schema_generation(self):
        async def dummy(**kwargs):
            return {}

        tool = Tool(
            name="query_fees",
            description="Query fees data",
            parameters=[
                ToolParameter(name="tenant_id", type="string", description="Tenant", required=True),
                ToolParameter(name="grade", type="string", description="Grade filter", required=False),
            ],
            handler=dummy,
        )
        self.registry.register(tool)

        schemas = self.registry.to_openai_tools()
        assert len(schemas) == 1
        schema = schemas[0]

        assert schema["type"] == "function"
        assert schema["function"]["name"] == "query_fees"
        assert "tenant_id" in schema["function"]["parameters"]["properties"]
        assert "grade" in schema["function"]["parameters"]["properties"]
        assert schema["function"]["parameters"]["required"] == ["tenant_id"]

    @pytest.mark.asyncio
    async def test_execute_tool(self):
        async def add_numbers(a: int, b: int):
            return {"sum": a + b}

        tool = Tool(
            name="add",
            description="Add numbers",
            parameters=[
                ToolParameter(name="a", type="integer", description="First"),
                ToolParameter(name="b", type="integer", description="Second"),
            ],
            handler=add_numbers,
        )
        self.registry.register(tool)

        result = await self.registry.execute("add", {"a": 3, "b": 5})
        assert result == {"sum": 8}

    @pytest.mark.asyncio
    async def test_execute_unknown_tool(self):
        result = await self.registry.execute("nonexistent", "{}")
        assert "error" in result

    @pytest.mark.asyncio
    async def test_execute_with_json_string_args(self):
        async def greet(name: str):
            return {"greeting": f"Hello {name}"}

        tool = Tool(
            name="greet",
            description="Greet",
            parameters=[ToolParameter(name="name", type="string", description="Name")],
            handler=greet,
        )
        self.registry.register(tool)

        result = await self.registry.execute("greet", '{"name": "Aditya"}')
        assert result == {"greeting": "Hello Aditya"}


# ─── FeeAgent Initialisation Tests ────────────────────────


class TestFeeAgent:
    """Test FeeAgent initialisation and tool configuration."""

    def setup_method(self):
        self.rag = RAGPipeline()
        self.agent = FeeAgent(rag=self.rag)

    def test_agent_name(self):
        assert self.agent.name == "fee_agent"

    def test_has_all_tools(self):
        tool_names = [t.name for t in self.agent.tools.list_tools()]
        assert "query_overdue_invoices" in tool_names
        assert "get_collection_summary" in tool_names
        assert "get_student_fee_history" in tool_names
        assert "get_grade_wise_collection" in tool_names
        assert "get_payment_trends" in tool_names
        assert len(tool_names) == 5

    def test_collections(self):
        assert self.agent.collections() == ["fee_records", "student_profiles"]

    def test_system_prompt_not_empty(self):
        prompt = self.agent.system_prompt()
        assert len(prompt) > 100
        assert "FeeAgent" in prompt
        assert "NEVER" in prompt  # Guardrails present

    def test_tool_schemas_valid(self):
        schemas = self.agent.tools.to_openai_tools()
        assert len(schemas) == 5
        for schema in schemas:
            assert schema["type"] == "function"
            assert "name" in schema["function"]
            assert "parameters" in schema["function"]


# ─── Text Representation Tests ───────────────────────────


class TestRepresentations:
    """Test that text representations are semantically rich and correct."""

    def test_student_representation(self):
        student = {
            "first_name": "Arjun",
            "last_name": "Patel",
            "admission_number": "ADM-2025-001",
            "grade_name": "Grade 8",
            "section_name": "A",
            "gender": "MALE",
            "date_of_birth": "2012-05-15",
            "status": "ACTIVE",
            "guardian_name": "Rajesh Patel",
            "guardian_relation": "FATHER",
            "guardian_phone": "+919876543210",
            "total_due": 15000.50,
            "attendance_rate": 88.5,
        }
        text = build_student_representation(student)
        assert "Arjun Patel" in text
        assert "ADM-2025-001" in text
        assert "Grade 8" in text
        assert "Section A" in text
        assert "₹15,000.50" in text
        assert "88.5%" in text
        assert "Rajesh Patel" in text

    def test_student_with_low_attendance(self):
        student = {
            "first_name": "Priya",
            "last_name": "Sharma",
            "admission_number": "ADM-2025-002",
            "attendance_rate": 72.0,
        }
        text = build_student_representation(student)
        assert "below threshold" in text

    def test_invoice_representation(self):
        invoice = {
            "invoice_number": "INV-2025-001",
            "student_name": "Rahul Kumar",
            "grade_name": "Grade 10",
            "total_amount": 50000,
            "paid_amount": 25000,
            "status": "PARTIAL",
            "due_date": "2025-12-15",
            "fee_plan_name": "Annual 2025-26",
        }
        text = build_invoice_representation(invoice)
        assert "INV-2025-001" in text
        assert "Rahul Kumar" in text
        assert "₹50,000.00" in text
        assert "₹25,000.00" in text
        assert "PARTIAL" in text

    def test_overdue_invoice_representation(self):
        invoice = {
            "invoice_number": "INV-2025-003",
            "student_name": "Test Student",
            "total_amount": 10000,
            "paid_amount": 0,
            "status": "OVERDUE",
            "due_date": "2025-11-01",
            "days_overdue": 45,
        }
        text = build_invoice_representation(invoice)
        assert "Overdue by 45 days" in text

    def test_grade_collection_representation(self):
        grade = {
            "grade_name": "Grade 5",
            "student_count": 45,
            "invoice_count": 90,
            "total_billed": 450000,
            "total_collected": 380000,
            "collection_rate_percent": 84.44,
            "overdue_count": 8,
        }
        text = build_grade_collection_representation(grade)
        assert "Grade 5" in text
        assert "45 students" in text
        assert "84.44%" in text
        assert "8 overdue" in text


# ─── Agent Context Tests ─────────────────────────────────


class TestAgentContext:
    def test_context_creation(self):
        ctx = AgentContext(
            tenant_id=uuid4(),
            query="What is the collection rate for Grade 10?",
        )
        assert ctx.query == "What is the collection rate for Grade 10?"
        assert ctx.user_id is None
        assert ctx.conversation_id is not None

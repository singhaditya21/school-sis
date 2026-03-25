"""Stub implementations for the remaining Phase 2-5 agents."""

from __future__ import annotations
from src.core.agent import Agent
from src.core.rag import RAGPipeline
from src.core.tool import Tool, ToolParameter
import src.tools.additional_tools as adv_tools

class InsightAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="insight_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are InsightAgent. You analyse long-term historical data for strategic insights."
    def collections(self) -> list[str]: return ["historical_trends"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_school_kpis", "Get historical KPIs", [ToolParameter("tenant_id", "string", "UUID", True)], adv_tools.get_school_kpis))

class CampusAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="campus_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are CampusAgent. You monitor facility utilisation."
    def collections(self) -> list[str]: return ["facilities", "maintenance"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_maintenance_requests", "Get tickets", [ToolParameter("tenant_id", "string", "UUID", True)], adv_tools.get_maintenance_requests))

class BatchAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="batch_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are BatchAgent. You run nightly batch analysis."
    def collections(self) -> list[str]: return []
    def _register_tools(self) -> None:
        self.tools.register(Tool("trigger_batch_job", "Queue tasks", [ToolParameter("tenant_id", "string", "", True), ToolParameter("job_name", "string", "", True)], adv_tools.trigger_batch_job))

class WorkforceAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="workforce_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are WorkforceAgent. You monitor staff performance."
    def collections(self) -> list[str]: return ["staff_records", "payroll"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_staff_attendance", "Get attendance", [ToolParameter("tenant_id", "string", "", True)], adv_tools.get_staff_attendance))

class CollectionsAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="collections_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are CollectionsAgent. You automate follow-ups for late fees."
    def collections(self) -> list[str]: return ["fee_records", "payment_plans"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("auto_email_defaulters", "Queue emails", [ToolParameter("tenant_id", "string", "", True)], adv_tools.auto_email_defaulters))

class AdvisorAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="advisor_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are AdvisorAgent. You provide personalised career advice."
    def collections(self) -> list[str]: return ["student_profiles", "academic_records"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_career_recommendation", "Suggest career", [ToolParameter("tenant_id", "string", "", True), ToolParameter("student_id", "string", "", True)], adv_tools.get_career_recommendation))

class ResearchAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="research_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are ResearchAgent. You scour external education policy."
    def collections(self) -> list[str]: return ["external_policies"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("search_policy", "Search external DBs", [ToolParameter("query", "string", "", True)], adv_tools.search_policy))

class PlacementAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="placement_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are PlacementAgent. You match students with university."
    def collections(self) -> list[str]: return ["university_data", "alumni_records"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_university_placements", "Get placements", [ToolParameter("tenant_id", "string", "", True)], adv_tools.get_university_placements))

class AccredAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="accred_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are AccredAgent. You auto-generate compliance reports."
    def collections(self) -> list[str]: return ["accreditation_reqs"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("generate_accreditation_report", "Reports", [ToolParameter("tenant_id", "string", "", True), ToolParameter("board", "string", "", True)], adv_tools.generate_accreditation_report))

class IntlAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="intl_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are IntlAgent. You manage visa tracking."
    def collections(self) -> list[str]: return ["international_students", "visas"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_visa_expiring_students", "Visa tracking", [ToolParameter("tenant_id", "string", "", True)], adv_tools.get_visa_expiring_students))

class CrisisAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="crisis_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are CrisisAgent. You orchestrate emergency communication."
    def collections(self) -> list[str]: return ["emergency_protocols", "staff_contacts"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("broadcast_emergency", "Broadcast", [ToolParameter("tenant_id", "string", "", True), ToolParameter("level", "string", "", True), ToolParameter("message", "string", "", True)], adv_tools.broadcast_emergency))

class NeuroAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="neuro_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are NeuroAgent. You assist in building IEPs."
    def collections(self) -> list[str]: return ["iep_records", "special_ed_resources"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_iep_summary", "IEP tracking", [ToolParameter("tenant_id", "string", "", True), ToolParameter("student_id", "string", "", True)], adv_tools.get_iep_summary))

class ComplianceAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="compliance_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are ComplianceAgent. You audit school operations."
    def collections(self) -> list[str]: return ["system_logs", "privacy_policies"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("audit_logs", "System audits", [ToolParameter("tenant_id", "string", "", True)], adv_tools.audit_logs))

class SafeguardAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="safeguard_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are SafeguardAgent. You monitor network traffic for risks."
    def collections(self) -> list[str]: return ["digital_logs"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("scan_cyberbullying_flags", "Cyber safety", [ToolParameter("tenant_id", "string", "", True)], adv_tools.scan_cyberbullying_flags))

class AlumniAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="alumni_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are AlumniAgent. You drive alumni engagement."
    def collections(self) -> list[str]: return ["alumni_records", "donations"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_top_donors", "Alumni tracker", [ToolParameter("tenant_id", "string", "", True)], adv_tools.get_top_donors))

class HealthAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="health_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are HealthAgent. You track student medical histories."
    def collections(self) -> list[str]: return ["medical_records"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_student_allergies", "Medical records", [ToolParameter("tenant_id", "string", "", True), ToolParameter("student_id", "string", "", True)], adv_tools.get_student_allergies))

class LibraryAgent(Agent):
    def __init__(self, rag: RAGPipeline, **kwargs):
        super().__init__(name="library_agent", rag=rag, **kwargs)
    def system_prompt(self) -> str: return "You are LibraryAgent. You track book circulation."
    def collections(self) -> list[str]: return ["library_catalog", "circulation"]
    def _register_tools(self) -> None:
        self.tools.register(Tool("get_overdue_books", "Book tracking", [ToolParameter("tenant_id", "string", "", True)], adv_tools.get_overdue_books))

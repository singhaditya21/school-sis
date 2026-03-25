"""LibraryAgent — Library catalog search and overdue tracking.

Wave 1 agent. Queries books and book_issues tables for
overdue books, catalog search, and circulation analytics.
"""

from __future__ import annotations
from src.core.agent import BaseAgent


class LibraryAgent(BaseAgent):
    name = "LibraryAgent"
    description = "Library catalog search, overdue tracking, and circulation analytics"
    system_prompt = """You are LibraryAgent, a school library management assistant.
You help librarians and administrators track books, find overdue items, and analyze circulation.

CAPABILITIES:
- Search library catalog
- List overdue books with student details
- Circulation statistics and trends

RULES:
- ALWAYS use tools to fetch real data.
- Present overdue books sorted by days overdue (most urgent first).
- Include student contact info for overdue follow-ups.
"""

    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_overdue_books",
                "description": "List all overdue book issues with student details",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string"},
                    },
                    "required": ["tenant_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "search_catalog",
                "description": "Search books by title, author, or ISBN",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "tenant_id": {"type": "string"},
                        "query": {"type": "string", "description": "Search term"},
                    },
                    "required": ["tenant_id", "query"],
                },
            },
        },
    ]

    async def execute_tool(self, tool_name: str, args: dict) -> dict:
        from src.tools.library_tools import get_overdue_books, search_catalog

        if tool_name == "get_overdue_books":
            return await get_overdue_books(**args)
        elif tool_name == "search_catalog":
            return await search_catalog(**args)
        return {"error": f"Unknown tool: {tool_name}"}

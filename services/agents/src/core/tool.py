"""Tool definition and registry for agent tool calling."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

import structlog

logger = structlog.get_logger()


@dataclass
class ToolParameter:
    """Single parameter of a tool."""
    name: str
    type: str  # "string", "number", "integer", "boolean", "array", "object"
    description: str
    required: bool = True
    enum: list[str] | None = None


@dataclass
class Tool:
    """A callable tool that an agent can invoke."""
    name: str
    description: str
    parameters: list[ToolParameter]
    handler: Callable[..., Awaitable[Any]]

    def to_openai_schema(self) -> dict:
        """Convert to OpenAI function calling schema for Qwen."""
        properties = {}
        required = []
        for param in self.parameters:
            prop: dict[str, Any] = {
                "type": param.type,
                "description": param.description,
            }
            if param.enum:
                prop["enum"] = param.enum
            properties[param.name] = prop
            if param.required:
                required.append(param.name)

        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            },
        }


class ToolRegistry:
    """Registry of tools available to agents."""

    def __init__(self):
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        """Register a tool."""
        self._tools[tool.name] = tool
        logger.info("tool_registered", tool_name=tool.name)

    def get(self, name: str) -> Tool | None:
        """Get a tool by name."""
        return self._tools.get(name)

    def list_tools(self) -> list[Tool]:
        """List all registered tools."""
        return list(self._tools.values())

    def to_openai_tools(self) -> list[dict]:
        """Convert all tools to OpenAI function calling schema."""
        return [tool.to_openai_schema() for tool in self._tools.values()]

    async def execute(self, name: str, arguments: str | dict) -> Any:
        """Execute a tool by name with the given arguments."""
        tool = self._tools.get(name)
        if not tool:
            return {"error": f"Unknown tool: {name}"}

        try:
            if isinstance(arguments, str):
                args = json.loads(arguments)
            else:
                args = arguments

            result = await tool.handler(**args)
            logger.info(
                "tool_executed",
                tool_name=name,
                success=True,
            )
            return result
        except Exception as e:
            logger.error(
                "tool_execution_failed",
                tool_name=name,
                error=str(e),
            )
            return {"error": f"Tool execution failed: {str(e)}"}

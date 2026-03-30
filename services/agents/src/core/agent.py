"""Base Agent class — the foundation for all 26 domain agents."""

from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from uuid import UUID, uuid4

import httpx
import structlog
from openai import AsyncOpenAI

from src.config import settings
from src.core.tool import ToolRegistry
from src.core.rag import RAGPipeline, RetrievalResult

logger = structlog.get_logger()


@dataclass
class AgentContext:
    """Context for a single agent invocation."""
    tenant_id: UUID
    user_id: UUID | None = None
    query: str = ""
    conversation_id: UUID = field(default_factory=uuid4)


@dataclass
class AgentResponse:
    """Structured response from an agent."""
    answer: str
    sources: list[dict] = field(default_factory=list)
    tool_calls_made: list[dict] = field(default_factory=list)
    tokens_used: int = 0
    latency_ms: int = 0
    agent_name: str = ""


class Agent(ABC):
    """
    Base class for all ScholarMind agents.

    Each agent has:
    - A system prompt defining its role and guardrails
    - A tool registry with domain-specific tools
    - A RAG pipeline for semantic retrieval
    - An executor loop that reasons, calls tools, and produces answers
    """

    def __init__(
        self,
        name: str,
        rag: RAGPipeline,
    ):
        self.name = name
        self.tools = ToolRegistry()
        self.rag = rag
        self._llm_client = AsyncOpenAI(
            api_key=settings.nvidia_api_key,
            base_url=settings.nvidia_base_url,
        )

        # Register domain-specific tools
        self._register_tools()

    @abstractmethod
    def system_prompt(self) -> str:
        """Return the system prompt for this agent."""
        ...

    @abstractmethod
    def _register_tools(self) -> None:
        """Register domain-specific tools in self.tools."""
        ...

    @abstractmethod
    def collections(self) -> list[str]:
        """Return the embedding collections this agent searches."""
        ...

    async def query(self, context: AgentContext) -> AgentResponse:
        """
        Main entry point: process a natural language query.

        The executor loop:
        1. Retrieve relevant context via RAG
        2. Build prompt with system + context + query
        3. Call LLM (Qwen 7B via inference engine)
        4. If tool calls: execute tools, feed results back, repeat
        5. Return final answer with sources and audit trail
        """
        start_time = time.monotonic()
        tool_calls_log: list[dict] = []
        sources: list[dict] = []
        total_tokens = 0

        # Step 1: RAG retrieval
        rag_context = []
        for collection in self.collections():
            results = await self.rag.search(
                query=context.query,
                tenant_id=context.tenant_id,
                collection=collection,
                top_k=5,
            )
            rag_context.extend(results)
            sources.extend([
                {
                    "collection": collection,
                    "entity_type": r.entity_type,
                    "entity_id": str(r.entity_id),
                    "similarity": round(r.similarity, 3),
                }
                for r in results
            ])

        # Step 2: Build messages
        context_text = self._format_rag_context(rag_context)
        messages = [
            {"role": "system", "content": self.system_prompt()},
            {
                "role": "user",
                "content": f"## Relevant Data\n{context_text}\n\n## Question\n{context.query}",
            },
        ]

        # Step 3-4: LLM reasoning loop
        tools_schema = self.tools.to_openai_tools() if self.tools.list_tools() else None

        for iteration in range(settings.max_tool_calls):
            llm_response = await self._call_llm(messages, tools_schema)
            total_tokens += llm_response.get("usage", {}).get("total_tokens", 0)

            choice = llm_response["choices"][0]
            message = choice["message"]
            finish_reason = choice.get("finish_reason", "stop")

            # If the model wants to call tools
            if message.get("tool_calls"):
                messages.append(message)

                for tool_call in message["tool_calls"]:
                    func = tool_call["function"]
                    tool_name = func["name"]
                    tool_args = func["arguments"]

                    logger.info(
                        "agent_tool_call",
                        agent=self.name,
                        tool=tool_name,
                        iteration=iteration,
                    )

                    result = await self.tools.execute(tool_name, tool_args, context)
                    result_str = json.dumps(result, default=str)

                    tool_calls_log.append({
                        "tool": tool_name,
                        "arguments": tool_args if isinstance(tool_args, dict) else json.loads(tool_args),
                        "result_preview": result_str[:500],
                        "iteration": iteration,
                    })

                    messages.append({
                        "role": "tool",
                        "content": result_str,
                        "tool_call_id": tool_call.get("id", f"call_{iteration}"),
                    })
            else:
                # Final answer — no more tool calls
                answer = message.get("content", "I was unable to generate a response.")
                elapsed_ms = int((time.monotonic() - start_time) * 1000)

                response = AgentResponse(
                    answer=answer,
                    sources=sources,
                    tool_calls_made=tool_calls_log,
                    tokens_used=total_tokens,
                    latency_ms=elapsed_ms,
                    agent_name=self.name,
                )

                # Audit log
                await self._audit_log(context, response)

                logger.info(
                    "agent_query_complete",
                    agent=self.name,
                    tokens=total_tokens,
                    tool_calls=len(tool_calls_log),
                    latency_ms=elapsed_ms,
                )

                return response

        # Fallback if max iterations reached
        elapsed_ms = int((time.monotonic() - start_time) * 1000)
        return AgentResponse(
            answer="I reached the maximum number of reasoning steps. Please try a more specific question.",
            sources=sources,
            tool_calls_made=tool_calls_log,
            tokens_used=total_tokens,
            latency_ms=elapsed_ms,
            agent_name=self.name,
        )

    async def _call_llm(
        self, messages: list[dict], tools: list[dict] | None
    ) -> dict:
        """Call the NVIDIA NIM chat completions endpoint."""
        kwargs = {
            "model": settings.llm_model,
            "messages": messages,
            "temperature": settings.default_temperature,
            "max_tokens": settings.max_tokens,
            "extra_body": {"chat_template_kwargs": {"enable_thinking": True, "clear_thinking": False}}
        }
        if tools:
            kwargs["tools"] = tools

        response = await self._llm_client.chat.completions.create(**kwargs)
        resp_dict = response.model_dump()
        
        # glm4.7 exposes reasoning. Let's merge it so the UI displays the agent's internal thought process.
        choice = resp_dict["choices"][0]
        msg = choice.get("message", {})
        reasoning = msg.get("reasoning_content")
        if reasoning and msg.get("content"):
            msg["content"] = f"**[Agent Internal Reasoning]**\n<details><summary>Click to view thought process</summary>\n\n```text\n{reasoning}\n```\n</details>\n\n{msg.get('content')}"
        elif reasoning and not msg.get("content"):
            msg["content"] = f"**[Agent Internal Reasoning]**\n{reasoning}"
            
        return resp_dict

    def _format_rag_context(self, results: list[RetrievalResult]) -> str:
        """Format RAG results into a text block for the LLM prompt."""
        if not results:
            return "No relevant data found in the knowledge base."

        parts = []
        for r in results:
            parts.append(
                f"[{r.entity_type} | similarity: {r.similarity:.2f}]\n{r.text_content}"
            )
        return "\n\n---\n\n".join(parts)

    async def _audit_log(self, context: AgentContext, response: AgentResponse) -> None:
        """Log the agent interaction to the audit table."""
        try:
            import psycopg
            async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO agent_audit_logs
                            (tenant_id, agent_name, query, response, tool_calls, tokens_used, latency_ms)
                        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
                        """,
                        (
                            str(context.tenant_id), self.name, context.query,
                            response.answer,
                            json.dumps(response.tool_calls_made, default=str),
                            response.tokens_used, response.latency_ms,
                        ),
                    )
                await conn.commit()
        except Exception as e:
            logger.warning("audit_log_failed", error=str(e))

    async def close(self):
        """Cleanup resources."""
        await self._llm_client.close()

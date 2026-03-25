"""RAG retrieval layer using pgvector for semantic search."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import httpx
import psycopg
import structlog

from src.config import settings

logger = structlog.get_logger()


@dataclass
class RetrievalResult:
    """A single retrieval result from pgvector."""
    entity_type: str
    entity_id: UUID
    text_content: str
    similarity: float
    metadata: dict


class RAGPipeline:
    """Retrieval-Augmented Generation pipeline backed by pgvector."""

    def __init__(self, db_url: str | None = None, inference_url: str | None = None):
        self.db_url = db_url or settings.database_url
        self.inference_url = inference_url or settings.inference_url
        self._http_client = httpx.AsyncClient(timeout=60.0)

    async def embed_text(self, text: str) -> list[float]:
        """Generate embedding for a text using the inference engine."""
        response = await self._http_client.post(
            f"{self.inference_url}/v1/embeddings",
            json={"input": text},
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts."""
        response = await self._http_client.post(
            f"{self.inference_url}/v1/embeddings",
            json={"input": texts},
        )
        response.raise_for_status()
        data = response.json()
        return [item["embedding"] for item in data["data"]]

    async def search(
        self,
        query: str,
        tenant_id: UUID,
        collection: str,
        top_k: int = 5,
        min_similarity: float = 0.3,
    ) -> list[RetrievalResult]:
        """Semantic search over a collection for a given tenant."""
        query_embedding = await self.embed_text(query)

        async with await psycopg.AsyncConnection.connect(self.db_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    SELECT
                        entity_type, entity_id, text_content, metadata,
                        1 - (embedding <=> %s::vector) AS similarity
                    FROM embeddings
                    WHERE tenant_id = %s
                      AND collection = %s
                      AND 1 - (embedding <=> %s::vector) >= %s
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                    """,
                    (
                        str(query_embedding), str(tenant_id), collection,
                        str(query_embedding), min_similarity,
                        str(query_embedding), top_k,
                    ),
                )

                results = []
                async for row in cur:
                    results.append(RetrievalResult(
                        entity_type=row[0],
                        entity_id=row[1],
                        text_content=row[2],
                        metadata=row[3] or {},
                        similarity=float(row[4]),
                    ))

                logger.info(
                    "rag_search_complete",
                    collection=collection,
                    query_preview=query[:80],
                    results_count=len(results),
                )
                return results

    async def upsert_embedding(
        self,
        tenant_id: UUID,
        collection: str,
        entity_type: str,
        entity_id: UUID,
        text_content: str,
        metadata: dict | None = None,
    ) -> None:
        """Insert or update an embedding in pgvector."""
        embedding = await self.embed_text(text_content)

        async with await psycopg.AsyncConnection.connect(self.db_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO embeddings
                        (tenant_id, collection, entity_type, entity_id,
                         text_content, embedding, metadata, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s::vector, %s::jsonb, NOW())
                    ON CONFLICT (tenant_id, collection, entity_id)
                    DO UPDATE SET
                        text_content = EXCLUDED.text_content,
                        embedding = EXCLUDED.embedding,
                        metadata = EXCLUDED.metadata,
                        updated_at = NOW()
                    """,
                    (
                        str(tenant_id), collection, entity_type, str(entity_id),
                        text_content, str(embedding),
                        __import__("json").dumps(metadata or {}),
                    ),
                )
            await conn.commit()

        logger.info(
            "embedding_upserted",
            collection=collection,
            entity_type=entity_type,
            entity_id=str(entity_id),
        )

    async def close(self):
        """Cleanup HTTP client."""
        await self._http_client.aclose()

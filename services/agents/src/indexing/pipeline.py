import asyncio
import os
import aiohttp
import psycopg
import structlog
from typing import List, Dict, Any

# Assuming standard environment variables for configuration
DATABASE_URL = os.getenv("AGENT_DATABASE_URL", "postgresql://school_admin:school_sis_dev_2026@localhost:5432/school_sis")
EMBEDDING_API_URL = os.getenv("EMBED_SERVER_URL", "http://localhost:9002/v1/embeddings")

logger = structlog.get_logger()

async def get_embedding(session: aiohttp.ClientSession, text: str) -> List[float]:
    """Fetch 768-dim embeddings from the local llama.cpp Nomic Embed server."""
    try:
        async with session.post(
            EMBEDDING_API_URL, 
            json={"input": text, "model": "nomic-embed-text-v1.5"},
            timeout=10
        ) as response:
            if response.status != 200:
                logger.error("embedding_api_error", status=response.status, text_preview=text[:50])
                return []
            
            data = await response.json()
            if "data" in data and len(data["data"]) > 0:
                return data["data"][0]["embedding"]
            return []
    except Exception as e:
        logger.error("embedding_request_failed", error=str(e))
        return []

class IndexingPipeline:
    def __init__(self, rag=None):
        self.rag = rag

    async def process_students(self, conn: psycopg.AsyncConnection, session: aiohttp.ClientSession, tenant_id: str = None):
        """Index students into pgvector."""
        logger.info("indexing_students_started", tenant_id=tenant_id)
        rows_updated = 0
        
        async with conn.cursor() as cur:
            # Fetch students missing embeddings or update all
            await cur.execute("""
                SELECT s.id, s.first_name, s.last_name, s.admission_number, s.status,
                       g.name as grade_name, sec.name as section_name
                FROM students s
                LEFT JOIN grades g ON s.grade_id = g.id
                LEFT JOIN sections sec ON s.section_id = sec.id
                WHERE s.embedding IS NULL
            """)
            
            students = await cur.fetchall()
            logger.info("students_fetched", count=len(students))
            
            for row in students:
                student_id, first_name, last_name, adm_num, status, grade, section = row
                
                # Construct a rich text representation for semantic search
                text_representation = f"Student: {first_name} {last_name}. Admission Number: {adm_num}. " \
                                      f"Class: {grade} Section {section}. Status: {status}."
                
                embedding = await get_embedding(session, text_representation)
                
                if embedding:
                    # Upsert vector representation into the embedding column
                    await cur.execute(
                        "UPDATE students SET embedding = %s WHERE id = %s",
                        (f"[{','.join(map(str, embedding))}]", student_id)
                    )
                    rows_updated += 1
                    
            await conn.commit()
        logger.info("indexing_students_completed", rows_updated=rows_updated)
        return rows_updated

    async def process_invoices(self, conn: psycopg.AsyncConnection, session: aiohttp.ClientSession, tenant_id: str = None):
        """Index invoices into pgvector."""
        logger.info("indexing_invoices_started", tenant_id=tenant_id)
        rows_updated = 0
        
        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT i.id, i.invoice_number, i.status, i.total_amount, i.paid_amount, i.due_date,
                       i.description, s.first_name, s.last_name
                FROM invoices i
                JOIN students s ON i.student_id = s.id
                WHERE i.embedding IS NULL
            """)
            
            invoices = await cur.fetchall()
            logger.info("invoices_fetched", count=len(invoices))
            
            for row in invoices:
                inv_id, inv_num, status, total, paid, due, desc, first_name, last_name = row
                
                text_representation = f"Invoice {inv_num} for Student {first_name} {last_name}. " \
                                      f"Amount: {total}, Paid: {paid}. Status: {status}. " \
                                      f"Due Date: {due}. Description: {desc or 'Standard Fee'}."
                
                embedding = await get_embedding(session, text_representation)
                
                if embedding:
                    await cur.execute(
                        "UPDATE invoices SET embedding = %s WHERE id = %s",
                        (f"[{','.join(map(str, embedding))}]", inv_id)
                    )
                    rows_updated += 1
                    
            await conn.commit()
        logger.info("indexing_invoices_completed", rows_updated=rows_updated)
        return rows_updated

    async def full_reindex(self, tenant_id):
        """Trigger a full reindex of all data for a tenant."""
        try:
            async with await psycopg.AsyncConnection.connect(DATABASE_URL) as conn:
                async with conn.cursor() as cur:
                    await cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                    await conn.commit()
                
                async with aiohttp.ClientSession() as session:
                    stud_count = await self.process_students(conn, session, str(tenant_id))
                    inv_count = await self.process_invoices(conn, session, str(tenant_id))
                    
            return {
                "tenant_id": str(tenant_id),
                "students_indexed": stud_count,
                "invoices_indexed": inv_count,
                "grade_collections_indexed": 0,
                "total_embeddings": stud_count + inv_count
            }
        except Exception as e:
            logger.error("pipeline_fatal_error", error=str(e))
            return {"error": str(e)}

    async def index_single_student(self, tenant_id, entity_id):
        pass

    async def index_single_invoice(self, tenant_id, entity_id):
        pass

async def main():
    """Fallback main execution for manual script running."""
    pipeline = IndexingPipeline()
    await pipeline.full_reindex("00000000-0000-0000-0000-000000000001")

if __name__ == "__main__":
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer()
        ]
    )
    asyncio.run(main())

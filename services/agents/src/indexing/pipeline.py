"""Tenant-scoped indexing pipeline for the shared pgvector embedding store."""

from __future__ import annotations

from typing import Any
from uuid import UUID

import psycopg
import structlog

from src.config import settings
from src.core.db import set_rls_bypass, set_tenant_context
from src.indexing.representations import build_invoice_representation, build_student_representation

logger = structlog.get_logger()


class IndexingPipeline:
    """Indexes SIS entities into the same embeddings table used by RAG search."""

    def __init__(self, rag=None):
        self.rag = rag
        self.db_url = settings.database_url

    async def _ensure_schema(self, conn: psycopg.AsyncConnection) -> None:
        """Create agent embedding tables when running against a fresh database."""
        await set_rls_bypass(conn)
        async with conn.cursor() as cur:
            await cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS embeddings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    tenant_id UUID NOT NULL,
                    collection VARCHAR(50) NOT NULL,
                    entity_type VARCHAR(50) NOT NULL,
                    entity_id UUID NOT NULL,
                    text_content TEXT NOT NULL,
                    embedding vector(1024) NOT NULL,
                    metadata JSONB DEFAULT '{}',
                    indexed_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(tenant_id, collection, entity_id)
                );
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_collection
                ON embeddings(tenant_id, collection);
            """)
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_embeddings_vector
                ON embeddings USING hnsw (embedding vector_cosine_ops);
            """)
        await conn.commit()

    async def process_students(
        self,
        conn: psycopg.AsyncConnection,
        tenant_id: UUID,
        entity_id: UUID | None = None,
    ) -> int:
        """Index student profile records for one tenant."""
        if not self.rag:
            raise RuntimeError("RAG pipeline is required for indexing.")

        logger.info("indexing_students_started", tenant_id=str(tenant_id), entity_id=str(entity_id) if entity_id else None)
        await set_tenant_context(conn, tenant_id)

        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT
                    s.id,
                    s.first_name,
                    s.last_name,
                    s.admission_number,
                    s.gender,
                    s.date_of_birth,
                    s.status,
                    s.medical_notes,
                    g.name AS grade_name,
                    sec.name AS section_name,
                    guardian.guardian_name,
                    guardian.guardian_relation,
                    guardian.guardian_phone,
                    COALESCE(fees.total_due, 0)::numeric AS total_due,
                    attendance.attendance_rate
                FROM students s
                LEFT JOIN grades g
                    ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
                LEFT JOIN sections sec
                    ON sec.id = s.section_id AND sec.tenant_id = s.tenant_id
                LEFT JOIN LATERAL (
                    SELECT
                        concat_ws(' ', gu.first_name, gu.last_name) AS guardian_name,
                        gu.relation AS guardian_relation,
                        gu.phone AS guardian_phone
                    FROM guardians gu
                    WHERE gu.tenant_id = s.tenant_id AND gu.student_id = s.id
                    ORDER BY gu.is_primary DESC, gu.created_at ASC
                    LIMIT 1
                ) guardian ON true
                LEFT JOIN LATERAL (
                    SELECT SUM(i.total_amount - i.paid_amount) AS total_due
                    FROM invoices i
                    WHERE i.tenant_id = s.tenant_id
                      AND i.student_id = s.id
                      AND i.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
                ) fees ON true
                LEFT JOIN LATERAL (
                    SELECT ROUND(
                        COUNT(*) FILTER (WHERE ar.status = 'PRESENT')::numeric
                        / NULLIF(COUNT(*), 0) * 100,
                        1
                    )::float AS attendance_rate
                    FROM attendance_records ar
                    WHERE ar.tenant_id = s.tenant_id
                      AND ar.student_id = s.id
                      AND ar.date >= CURRENT_DATE - INTERVAL '90 days'
                ) attendance ON true
                WHERE s.tenant_id = %s
                  AND (%s::uuid IS NULL OR s.id = %s)
                """,
                (str(tenant_id), str(entity_id) if entity_id else None, str(entity_id) if entity_id else None),
            )
            rows = await cur.fetchall()

        rows_updated = 0
        for row in rows:
            student = self._student_row_to_dict(row)
            text = build_student_representation(student)
            await self.rag.upsert_embedding(
                tenant_id=tenant_id,
                collection="student_profiles",
                entity_type="student",
                entity_id=row[0],
                text_content=text,
                metadata={
                    "admission_number": student.get("admission_number"),
                    "status": student.get("status"),
                    "grade": student.get("grade_name"),
                    "section": student.get("section_name"),
                },
            )
            rows_updated += 1

        logger.info("indexing_students_completed", tenant_id=str(tenant_id), rows_updated=rows_updated)
        return rows_updated

    async def process_invoices(
        self,
        conn: psycopg.AsyncConnection,
        tenant_id: UUID,
        entity_id: UUID | None = None,
    ) -> int:
        """Index invoice records for one tenant."""
        if not self.rag:
            raise RuntimeError("RAG pipeline is required for indexing.")

        logger.info("indexing_invoices_started", tenant_id=str(tenant_id), entity_id=str(entity_id) if entity_id else None)
        await set_tenant_context(conn, tenant_id)

        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT
                    i.id,
                    i.invoice_number,
                    i.status,
                    i.total_amount,
                    i.paid_amount,
                    i.due_date,
                    i.description,
                    concat_ws(' ', s.first_name, s.last_name) AS student_name,
                    g.name AS grade_name,
                    fp.name AS fee_plan_name,
                    CASE
                        WHEN i.due_date < CURRENT_DATE
                         AND i.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
                        THEN CURRENT_DATE - i.due_date
                        ELSE 0
                    END AS days_overdue
                FROM invoices i
                JOIN students s
                    ON s.id = i.student_id AND s.tenant_id = i.tenant_id
                LEFT JOIN grades g
                    ON g.id = s.grade_id AND g.tenant_id = s.tenant_id
                LEFT JOIN fee_plans fp
                    ON fp.id = i.fee_plan_id AND fp.tenant_id = i.tenant_id
                WHERE i.tenant_id = %s
                  AND (%s::uuid IS NULL OR i.id = %s)
                """,
                (str(tenant_id), str(entity_id) if entity_id else None, str(entity_id) if entity_id else None),
            )
            rows = await cur.fetchall()

        rows_updated = 0
        for row in rows:
            invoice = self._invoice_row_to_dict(row)
            text = build_invoice_representation(invoice)
            await self.rag.upsert_embedding(
                tenant_id=tenant_id,
                collection="fee_records",
                entity_type="invoice",
                entity_id=row[0],
                text_content=text,
                metadata={
                    "invoice_number": invoice.get("invoice_number"),
                    "status": invoice.get("status"),
                    "due_date": str(invoice.get("due_date")) if invoice.get("due_date") else None,
                },
            )
            rows_updated += 1

        logger.info("indexing_invoices_completed", tenant_id=str(tenant_id), rows_updated=rows_updated)
        return rows_updated

    async def full_reindex(self, tenant_id: UUID) -> dict[str, Any]:
        """Rebuild all agent embeddings for one tenant."""
        if not self.db_url:
            return {"error": "AGENT_DATABASE_URL is required for indexing."}

        try:
            async with await psycopg.AsyncConnection.connect(self.db_url) as conn:
                await self._ensure_schema(conn)
                stud_count = await self.process_students(conn, tenant_id)
                inv_count = await self.process_invoices(conn, tenant_id)

            return {
                "tenant_id": str(tenant_id),
                "students_indexed": stud_count,
                "invoices_indexed": inv_count,
                "grade_collections_indexed": 0,
                "total_embeddings": stud_count + inv_count,
            }
        except Exception as e:
            logger.error("pipeline_fatal_error", tenant_id=str(tenant_id), error=str(e))
            return {"error": str(e)}

    async def index_single_student(self, tenant_id: UUID, entity_id: UUID) -> int:
        """Incrementally index one tenant-owned student."""
        if not self.db_url:
            raise RuntimeError("AGENT_DATABASE_URL is required for indexing.")
        async with await psycopg.AsyncConnection.connect(self.db_url) as conn:
            return await self.process_students(conn, tenant_id, entity_id)

    async def index_single_invoice(self, tenant_id: UUID, entity_id: UUID) -> int:
        """Incrementally index one tenant-owned invoice."""
        if not self.db_url:
            raise RuntimeError("AGENT_DATABASE_URL is required for indexing.")
        async with await psycopg.AsyncConnection.connect(self.db_url) as conn:
            return await self.process_invoices(conn, tenant_id, entity_id)

    @staticmethod
    def _student_row_to_dict(row) -> dict[str, Any]:
        return {
            "first_name": row[1],
            "last_name": row[2],
            "admission_number": row[3],
            "gender": row[4],
            "date_of_birth": row[5],
            "status": row[6],
            "medical_notes": row[7],
            "grade_name": row[8],
            "section_name": row[9],
            "guardian_name": row[10],
            "guardian_relation": row[11],
            "guardian_phone": row[12],
            "total_due": row[13],
            "attendance_rate": row[14],
        }

    @staticmethod
    def _invoice_row_to_dict(row) -> dict[str, Any]:
        return {
            "invoice_number": row[1],
            "status": row[2],
            "total_amount": row[3],
            "paid_amount": row[4],
            "due_date": row[5],
            "description": row[6],
            "student_name": row[7],
            "grade_name": row[8],
            "fee_plan_name": row[9],
            "days_overdue": row[10],
        }

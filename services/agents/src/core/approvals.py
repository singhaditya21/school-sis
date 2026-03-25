"""Agent Approvals Queue Management.

Handles queueing, retrieving, approving, and rejecting actions
proposed by agents that require human oversight.
"""

from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

import psycopg
from pydantic import BaseModel
import structlog

from src.config import settings

logger = structlog.get_logger()


class ApprovalRequest(BaseModel):
    tenant_id: UUID
    agent_name: str
    title: str
    description: str
    proposed_action: dict
    priority: str = "NORMAL"
    created_by_user_id: UUID | None = None


async def create_approval(request: ApprovalRequest) -> dict:
    """Queue a new approval request."""
    query = """
        INSERT INTO agent_approvals (
            tenant_id, agent_name, title, description,
            proposed_action, priority, created_by_user_id
        ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        RETURNING id, status, created_at
    """
    params = [
        request.tenant_id, request.agent_name, request.title,
        request.description, json.dumps(request.proposed_action),
        request.priority, request.created_by_user_id
    ]

    try:
        async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, params)
                row = await cur.fetchone()
                await conn.commit()

                if row:
                    return {
                        "id": str(row[0]),
                        "status": row[1],
                        "created_at": row[2].isoformat()
                    }
                return {"error": "Failed to create approval"}
    except Exception as e:
        logger.error("create_approval_failed", error=str(e), tenant_id=str(request.tenant_id))
        return {"error": str(e)}


async def list_approvals(tenant_id: UUID, status: str = "PENDING", limit: int = 50) -> list[dict]:
    """List approvals by status."""
    query = """
        SELECT
            id, agent_name, title, description, proposed_action,
            status, priority, created_at, expires_at
        FROM agent_approvals
        WHERE tenant_id = %s AND status = %s
        ORDER BY
            CASE priority
                WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2
                WHEN 'NORMAL' THEN 3 WHEN 'LOW' THEN 4
            END,
            created_at DESC
        LIMIT %s
    """
    try:
        async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, [tenant_id, status, limit])
                rows = []
                async for row in cur:
                    rows.append({
                        "id": str(row[0]),
                        "agent_name": row[1],
                        "title": row[2],
                        "description": row[3],
                        "proposed_action": row[4], # jsonb returns dict
                        "status": row[5],
                        "priority": row[6],
                        "created_at": row[7].isoformat() if row[7] else None,
                        "expires_at": row[8].isoformat() if row[8] else None,
                    })
                return rows
    except Exception as e:
        logger.error("list_approvals_failed", error=str(e), tenant_id=str(tenant_id))
        return []


async def get_approval(tenant_id: UUID, approval_id: UUID) -> dict | None:
    """Get a single approval by ID."""
    query = """
        SELECT
            id, agent_name, title, description, proposed_action,
            status, priority, created_by_user_id, reviewed_by_user_id,
            reviewed_at, expires_at, created_at
        FROM agent_approvals
        WHERE id = %s AND tenant_id = %s
    """
    try:
        async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, [approval_id, tenant_id])
                row = await cur.fetchone()
                if row:
                    return {
                        "id": str(row[0]),
                        "agent_name": row[1],
                        "title": row[2],
                        "description": row[3],
                        "proposed_action": row[4],
                        "status": row[5],
                        "priority": row[6],
                        "created_by_user_id": str(row[7]) if row[7] else None,
                        "reviewed_by_user_id": str(row[8]) if row[8] else None,
                        "reviewed_at": row[9].isoformat() if row[9] else None,
                        "expires_at": row[10].isoformat() if row[10] else None,
                        "created_at": row[11].isoformat() if row[11] else None,
                    }
                return None
    except Exception as e:
        logger.error("get_approval_failed", error=str(e), approval_id=str(approval_id))
        return None


async def review_approval(
    tenant_id: UUID,
    approval_id: UUID,
    action: str,
    user_id: UUID
) -> dict:
    """Approve or reject a queued action."""
    if action not in ("APPROVED", "REJECTED"):
        return {"error": "Invalid action. Must be APPROVED or REJECTED."}

    query = """
        UPDATE agent_approvals
        SET status = %s, reviewed_by_user_id = %s, reviewed_at = NOW()
        WHERE id = %s AND tenant_id = %s AND status = 'PENDING'
        RETURNING id, status, proposed_action
    """
    try:
        async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, [action, user_id, approval_id, tenant_id])
                row = await cur.fetchone()
                await conn.commit()

                if row:
                    return {
                        "id": str(row[0]),
                        "status": row[1],
                        "proposed_action": row[2]
                    }
                return {"error": "Approval not found or not in PENDING status."}
    except Exception as e:
        logger.error("review_approval_failed", error=str(e), approval_id=str(approval_id))
        return {"error": str(e)}

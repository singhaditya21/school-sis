"""Shared database query utilities for agent tools."""

from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import psycopg
import structlog
from src.config import settings

logger = structlog.get_logger(__name__)


async def _run_query(query: str, params: list) -> list[dict]:
    """Execute a query and return rows as dicts with proper serialisation."""
    try:
        async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, params)
                if cur.description is None:
                    return []
                columns = [desc[0] for desc in cur.description]
                rows = []
                async for row in cur:
                    row_dict = {}
                    for col, val in zip(columns, row):
                        if isinstance(val, Decimal):
                            row_dict[col] = float(val)
                        elif isinstance(val, (date, datetime)):
                            row_dict[col] = val.isoformat()
                        elif isinstance(val, UUID):
                            row_dict[col] = str(val)
                        else:
                            row_dict[col] = val
                    rows.append(row_dict)
                return rows
    except Exception as e:
        logger.error("query_failed", error=str(e), query_preview=query[:120])
        raise

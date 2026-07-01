"""Database context helpers for tenant-scoped agent queries."""

from __future__ import annotations

from uuid import UUID

import psycopg


async def set_tenant_context(conn: psycopg.AsyncConnection, tenant_id: UUID | str) -> None:
    """Set the tenant RLS context for the current PostgreSQL transaction."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT set_config('app.current_tenant', %s, true), set_config('app.bypass_rls', 'off', true)",
            (str(tenant_id),),
        )


async def set_rls_bypass(conn: psycopg.AsyncConnection) -> None:
    """Set a temporary bypass context for service-maintenance DDL only."""
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT set_config('app.current_tenant', '', true), set_config('app.bypass_rls', 'on', true)",
        )

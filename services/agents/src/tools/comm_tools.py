"""Communication-domain tool implementations.

Schema: messages, consents
"""

from __future__ import annotations
from src.tools.fee_tools import _run_query


async def get_message_stats(
    tenant_id: str,
    channel: str | None = None,
    days: int = 30,
) -> dict:
    """Get messaging statistics — delivery rates, channel breakdown."""
    channel_filter = ""
    params: list = [tenant_id, days]
    if channel:
        channel_filter = "AND channel = %s"
        params.append(channel)

    query = f"""
        SELECT
            channel,
            COUNT(*) AS total_sent,
            COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
            COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
            COUNT(*) FILTER (WHERE status = 'READ') AS read_count,
            ROUND(
                COUNT(*) FILTER (WHERE status = 'DELIVERED') * 100.0 / NULLIF(COUNT(*), 0), 2
            ) AS delivery_rate,
            ROUND(
                COUNT(*) FILTER (WHERE status = 'READ') * 100.0 / NULLIF(
                    COUNT(*) FILTER (WHERE status = 'DELIVERED'), 0
                ), 2
            ) AS read_rate
        FROM messages
        WHERE tenant_id = %s
          AND created_at >= CURRENT_DATE - INTERVAL '%s days'
          {channel_filter}
        GROUP BY channel
        ORDER BY total_sent DESC
    """
    try:
        rows = await _run_query(query, params)
        return {"channels": rows, "period_days": days}
    except Exception as e:
        return {"error": str(e), "channels": []}


async def check_consent(
    tenant_id: str,
    user_id: str | None = None,
    channel: str | None = None,
) -> dict:
    """Check communication consent status for users."""
    conditions = ["c.tenant_id = %s"]
    params: list = [tenant_id]
    if user_id:
        conditions.append("c.user_id = %s")
        params.append(user_id)
    if channel:
        conditions.append("c.channel = %s")
        params.append(channel)

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            u.first_name || ' ' || u.last_name AS user_name,
            u.email, c.channel, c.is_opted_in,
            c.opt_in_at, c.opt_out_at
        FROM consents c
        JOIN users u ON c.user_id = u.id
        WHERE {where}
        ORDER BY u.last_name, c.channel
    """
    try:
        rows = await _run_query(query, params)
        opted_in = sum(1 for r in rows if r.get("is_opted_in"))
        return {
            "consents": rows,
            "total": len(rows),
            "opted_in": opted_in,
            "opted_out": len(rows) - opted_in,
        }
    except Exception as e:
        return {"error": str(e), "consents": []}


async def get_failed_messages(
    tenant_id: str,
    days: int = 7,
) -> dict:
    """Get recent failed message deliveries for troubleshooting."""
    query = """
        SELECT
            m.id AS message_id, m.channel,
            m.recipient_phone, m.recipient_email,
            m.subject, LEFT(m.body, 100) AS body_preview,
            m.status, m.error_message,
            m.created_at, m.sent_at,
            u.first_name || ' ' || u.last_name AS sent_by_name
        FROM messages m
        LEFT JOIN users u ON m.sent_by = u.id
        WHERE m.tenant_id = %s
          AND m.status = 'FAILED'
          AND m.created_at >= CURRENT_DATE - INTERVAL '%s days'
        ORDER BY m.created_at DESC
        LIMIT 50
    """
    try:
        rows = await _run_query(query, [tenant_id, days])
        return {"failed_count": len(rows), "messages": rows}
    except Exception as e:
        return {"error": str(e), "messages": []}

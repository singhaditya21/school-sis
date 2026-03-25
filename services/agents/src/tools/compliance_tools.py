"""Compliance tools — Audit log and consent queries for ComplianceAgent."""

from __future__ import annotations
from src.tools.db import _run_query


VALID_ACTIONS = {'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT', 'VIEW'}


async def search_audit_logs(
    tenant_id: str,
    user_id: str | None = None,
    action: str | None = None,
    days: int = 7,
) -> dict:
    """Search audit logs with optional filters."""
    if days < 1 or days > 365:
        days = 7

    conditions = ["al.tenant_id = %s", "al.created_at >= NOW() - INTERVAL '%s days'"]
    params: list = [tenant_id, days]

    if user_id:
        conditions.append("al.user_id = %s")
        params.append(user_id)

    if action and action.upper() in VALID_ACTIONS:
        conditions.append("al.action = %s")
        params.append(action.upper())

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            al.id, al.action, al.entity_type, al.entity_id,
            al.changes, al.ip_address,
            al.created_at,
            u.email AS user_email, u.first_name, u.last_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE {where}
        ORDER BY al.created_at DESC
        LIMIT 100
    """

    try:
        rows = await _run_query(query, params)
        return {
            "total_entries": len(rows),
            "filters": {"days": days, "user_id": user_id, "action": action},
            "logs": rows,
        }
    except Exception as e:
        return {"error": str(e), "logs": []}


async def get_consent_status(tenant_id: str) -> dict:
    """Check overall DPDPA consent status for the school."""
    query = """
        SELECT
            COUNT(DISTINCT cr.user_id) AS total_consents,
            COUNT(DISTINCT cr.user_id) FILTER (WHERE cr.is_active = true) AS active_consents,
            COUNT(DISTINCT cr.user_id) FILTER (WHERE cr.is_active = false) AS revoked_consents,
            COUNT(DISTINCT u.id) AS total_users,
            COUNT(DISTINCT u.id) - COUNT(DISTINCT cr.user_id) AS users_without_consent
        FROM users u
        LEFT JOIN consent_records cr ON cr.user_id = u.id AND cr.tenant_id = %s
        WHERE u.tenant_id = %s AND u.is_active = true
    """

    try:
        rows = await _run_query(query, [tenant_id, tenant_id])
        if rows:
            r = rows[0]
            total = r['total_users'] or 1
            compliance_pct = round((r['active_consents'] / total) * 100, 1)
            return {
                "total_users": r['total_users'],
                "with_active_consent": r['active_consents'],
                "without_consent": r['users_without_consent'],
                "revoked": r['revoked_consents'],
                "compliance_percentage": compliance_pct,
                "dpdpa_compliant": compliance_pct >= 100,
            }
        return {"error": "No data found"}
    except Exception as e:
        return {"error": str(e)}

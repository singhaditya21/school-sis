"""Fee-domain tool implementations — production-ready queries against the real schema.

Schema reference:
- students(id, tenant_id, first_name, last_name, admission_number, grade_id, section_id, status)
- grades(id, tenant_id, name, numeric_value, display_order)
- sections(id, tenant_id, grade_id, academic_year_id, name, capacity)
- invoices(id, tenant_id, student_id, fee_plan_id, invoice_number, total_amount, paid_amount, due_date, status, description)
- payments(id, tenant_id, invoice_id, student_id, amount, method, status, paid_at)
- fee_plans(id, tenant_id, academic_year_id, name, description, is_active)
- concessions(id, tenant_id, student_id, fee_plan_id, type, value, reason, is_active)
- guardians(id, tenant_id, student_id, relation, first_name, last_name, phone, email, is_primary)
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import psycopg
import structlog

from src.config import settings

logger = structlog.get_logger()


def _serialise(obj):
    """JSON serialiser for Decimal, date, datetime, UUID."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


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
        logger.error("query_failed", error=str(e), query_preview=query[:100])
        raise


async def query_overdue_invoices(
    tenant_id: str,
    grade_id: str | None = None,
    min_amount: float | None = None,
    days_overdue: int | None = None,
) -> dict:
    """Get all overdue invoices with student and grade details."""
    conditions = ["i.tenant_id = %s", "i.status = 'OVERDUE'"]
    params: list = [tenant_id]

    if grade_id:
        conditions.append("s.grade_id = %s")
        params.append(grade_id)

    if min_amount is not None:
        conditions.append("(i.total_amount - i.paid_amount) >= %s")
        params.append(min_amount)

    if days_overdue is not None:
        conditions.append("i.due_date <= CURRENT_DATE - INTERVAL '%s days'")
        params.append(days_overdue)

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            i.id AS invoice_id,
            i.invoice_number,
            s.first_name || ' ' || s.last_name AS student_name,
            s.admission_number,
            g.name AS grade_name,
            sec.name AS section_name,
            i.total_amount,
            i.paid_amount,
            (i.total_amount - i.paid_amount) AS outstanding,
            i.due_date,
            (CURRENT_DATE - i.due_date) AS days_overdue,
            i.description,
            gd.first_name || ' ' || gd.last_name AS guardian_name,
            gd.phone AS guardian_phone
        FROM invoices i
        JOIN students s ON i.student_id = s.id
        JOIN grades g ON s.grade_id = g.id
        JOIN sections sec ON s.section_id = sec.id
        LEFT JOIN guardians gd ON gd.student_id = s.id AND gd.is_primary = true
        WHERE {where}
        ORDER BY (i.total_amount - i.paid_amount) DESC
        LIMIT 50
    """

    try:
        rows = await _run_query(query, params)
        total_outstanding = sum(r.get("outstanding", 0) for r in rows)
        return {
            "overdue_count": len(rows),
            "total_outstanding": total_outstanding,
            "invoices": rows,
        }
    except Exception as e:
        return {"error": str(e), "overdue_count": 0, "invoices": []}


async def get_collection_summary(
    tenant_id: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Get aggregated fee collection summary with status breakdown."""
    date_filter = ""
    params: list = [tenant_id]

    if start_date:
        date_filter += " AND i.created_at >= %s::date"
        params.append(start_date)
    if end_date:
        date_filter += " AND i.created_at <= %s::date"
        params.append(end_date)

    query = f"""
        SELECT
            COUNT(*) AS total_invoices,
            COUNT(*) FILTER (WHERE status = 'PAID') AS paid_count,
            COUNT(*) FILTER (WHERE status = 'PARTIAL') AS partial_count,
            COUNT(*) FILTER (WHERE status = 'OVERDUE') AS overdue_count,
            COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_count,
            COALESCE(SUM(total_amount), 0) AS total_billed,
            COALESCE(SUM(paid_amount), 0) AS total_collected,
            COALESCE(SUM(total_amount - paid_amount), 0) AS total_pending,
            CASE
                WHEN SUM(total_amount) > 0
                THEN ROUND(SUM(paid_amount) / SUM(total_amount) * 100, 2)
                ELSE 0
            END AS collection_rate_percent
        FROM invoices i
        WHERE i.tenant_id = %s {date_filter}
    """

    try:
        rows = await _run_query(query, params)
        return rows[0] if rows else {"error": "No data found"}
    except Exception as e:
        return {"error": str(e)}


async def get_student_fee_history(
    tenant_id: str,
    student_id: str,
) -> dict:
    """Get complete fee history with payments for a specific student."""
    # Get student info
    student_query = """
        SELECT s.first_name || ' ' || s.last_name AS name,
               s.admission_number, g.name AS grade, sec.name AS section
        FROM students s
        JOIN grades g ON s.grade_id = g.id
        JOIN sections sec ON s.section_id = sec.id
        WHERE s.id = %s AND s.tenant_id = %s
    """
    student_rows = await _run_query(student_query, [student_id, tenant_id])

    # Get invoices
    invoice_query = """
        SELECT
            i.id AS invoice_id, i.invoice_number, i.description,
            i.total_amount, i.paid_amount,
            (i.total_amount - i.paid_amount) AS outstanding,
            i.status, i.due_date, i.created_at,
            fp.name AS fee_plan_name
        FROM invoices i
        JOIN fee_plans fp ON i.fee_plan_id = fp.id
        WHERE i.student_id = %s AND i.tenant_id = %s
        ORDER BY i.due_date DESC
    """
    invoices = await _run_query(invoice_query, [student_id, tenant_id])

    # Get payments
    payment_query = """
        SELECT
            p.amount, p.method, p.status, p.paid_at,
            p.transaction_id, i.invoice_number
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        WHERE p.student_id = %s AND p.tenant_id = %s
        ORDER BY p.paid_at DESC
    """
    payments = await _run_query(payment_query, [student_id, tenant_id])

    # Get active concessions
    concession_query = """
        SELECT c.type, c.value, c.reason, fp.name AS fee_plan_name
        FROM concessions c
        JOIN fee_plans fp ON c.fee_plan_id = fp.id
        WHERE c.student_id = %s AND c.tenant_id = %s AND c.is_active = true
    """
    concessions = await _run_query(concession_query, [student_id, tenant_id])

    total_billed = sum(inv.get("total_amount", 0) for inv in invoices)
    total_paid = sum(inv.get("paid_amount", 0) for inv in invoices)

    return {
        "student": student_rows[0] if student_rows else {},
        "total_billed": total_billed,
        "total_paid": total_paid,
        "outstanding_balance": total_billed - total_paid,
        "invoices": invoices,
        "payments": payments,
        "active_concessions": concessions,
    }


async def get_grade_wise_collection(
    tenant_id: str,
) -> dict:
    """Get collection rates broken down by grade."""
    query = """
        SELECT
            g.name AS grade_name,
            g.display_order,
            COUNT(DISTINCT s.id) AS student_count,
            COUNT(DISTINCT i.id) AS invoice_count,
            COALESCE(SUM(i.total_amount), 0) AS total_billed,
            COALESCE(SUM(i.paid_amount), 0) AS total_collected,
            COALESCE(SUM(i.total_amount - i.paid_amount), 0) AS total_pending,
            COUNT(*) FILTER (WHERE i.status = 'OVERDUE') AS overdue_count,
            CASE
                WHEN SUM(i.total_amount) > 0
                THEN ROUND(SUM(i.paid_amount) / SUM(i.total_amount) * 100, 2)
                ELSE 0
            END AS collection_rate_percent
        FROM grades g
        LEFT JOIN students s ON s.grade_id = g.id AND s.tenant_id = %s AND s.status = 'ACTIVE'
        LEFT JOIN invoices i ON i.student_id = s.id AND i.tenant_id = %s
        WHERE g.tenant_id = %s
        GROUP BY g.id, g.name, g.display_order
        ORDER BY g.display_order
    """

    try:
        rows = await _run_query(query, [tenant_id, tenant_id, tenant_id])
        overall_billed = sum(r.get("total_billed", 0) for r in rows)
        overall_collected = sum(r.get("total_collected", 0) for r in rows)
        overall_rate = round(overall_collected / overall_billed * 100, 2) if overall_billed > 0 else 0

        worst_grade = min(rows, key=lambda r: r.get("collection_rate_percent", 100)) if rows else None
        best_grade = max(rows, key=lambda r: r.get("collection_rate_percent", 0)) if rows else None

        return {
            "grades": rows,
            "total_grades": len(rows),
            "overall_collection_rate": overall_rate,
            "worst_performing_grade": worst_grade.get("grade_name") if worst_grade else None,
            "best_performing_grade": best_grade.get("grade_name") if best_grade else None,
        }
    except Exception as e:
        return {"error": str(e), "grades": []}


async def get_payment_trends(
    tenant_id: str,
    period: str = "monthly",
) -> dict:
    """Get payment collection trends over time."""
    # SECURITY: Strict whitelist — never interpolate user/LLM input into SQL
    VALID_PERIODS = {
        "daily": ("day", 30),
        "weekly": ("week", 84),     # 12 weeks in days
        "monthly": ("month", 365),  # 12 months in days
    }

    if period not in VALID_PERIODS:
        period = "monthly"

    date_trunc, lookback_days = VALID_PERIODS[period]

    # date_trunc is now guaranteed to be one of: "day", "week", "month"
    # These are SQL identifiers, not values, so we can safely embed them.
    # lookback_days is parameterized via %s.
    query = f"""
        SELECT
            DATE_TRUNC('{date_trunc}', p.paid_at) AS period_start,
            COUNT(*) AS payment_count,
            SUM(p.amount) AS total_amount,
            COUNT(DISTINCT p.student_id) AS unique_students,
            jsonb_object_agg(
                COALESCE(p.method::text, 'UNKNOWN'),
                COALESCE(method_amounts.total, 0)
            ) FILTER (WHERE method_amounts.total IS NOT NULL) AS method_breakdown
        FROM payments p
        LEFT JOIN LATERAL (
            SELECT SUM(amount) AS total
            FROM payments p2
            WHERE p2.tenant_id = p.tenant_id
              AND p2.method = p.method
              AND DATE_TRUNC('{date_trunc}', p2.paid_at) = DATE_TRUNC('{date_trunc}', p.paid_at)
        ) method_amounts ON true
        WHERE p.tenant_id = %s
          AND p.status = 'COMPLETED'
          AND p.paid_at >= NOW() - INTERVAL '%s days'
        GROUP BY DATE_TRUNC('{date_trunc}', p.paid_at)
        ORDER BY period_start DESC
    """

    try:
        rows = await _run_query(query, [tenant_id, lookback_days])
        return {
            "period": period,
            "data_points": len(rows),
            "trends": rows,
        }
    except Exception as e:
        return {"error": str(e), "trends": []}

"""Batch tools — Bulk queries for BatchAgent."""

from __future__ import annotations
from src.tools.db import _run_query


async def batch_attendance_summary(tenant_id: str, date: str = "today") -> dict:
    date_clause = "CURRENT_DATE" if date == "today" else f"'{date}'::date"
    query = f"""
        SELECT
            g.name AS grade,
            COUNT(*) AS total_students,
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT') AS present,
            COUNT(*) FILTER (WHERE ar.status = 'ABSENT') AS absent,
            COUNT(*) FILTER (WHERE ar.status = 'LATE') AS late,
            ROUND(COUNT(*) FILTER (WHERE ar.status = 'PRESENT')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS attendance_pct
        FROM grades g
        JOIN sections sec ON sec.grade_id = g.id AND sec.tenant_id = %s
        JOIN students s ON s.section_id = sec.id AND s.tenant_id = %s AND s.status = 'ACTIVE'
        LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.date = {date_clause}
        WHERE g.tenant_id = %s
        GROUP BY g.name, g.display_order
        ORDER BY g.display_order ASC
    """
    try:
        rows = await _run_query(query, [tenant_id, tenant_id, tenant_id])
        total_present = sum(r.get('present', 0) for r in rows)
        total_students = sum(r.get('total_students', 0) for r in rows)
        return {
            "date": date,
            "grades": rows,
            "school_total": total_students,
            "school_present": total_present,
            "school_attendance_pct": round(total_present / max(total_students, 1) * 100, 1),
        }
    except Exception as e:
        return {"error": str(e)}


async def batch_fee_defaulters(tenant_id: str) -> dict:
    query = """
        SELECT
            g.name AS grade, sec.name AS section,
            s.first_name || ' ' || s.last_name AS student_name,
            s.admission_number,
            SUM(i.total_amount - i.paid_amount) AS total_due,
            COUNT(i.id) AS overdue_invoices,
            MIN(i.due_date) AS earliest_due
        FROM invoices i
        JOIN students s ON s.id = i.student_id AND s.tenant_id = %s
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE i.tenant_id = %s AND i.status = 'OVERDUE'
        GROUP BY g.name, g.display_order, sec.name, s.first_name, s.last_name, s.admission_number
        HAVING SUM(i.total_amount - i.paid_amount) > 0
        ORDER BY SUM(i.total_amount - i.paid_amount) DESC
        LIMIT 50
    """
    try:
        rows = await _run_query(query, [tenant_id, tenant_id])
        total_due = sum(float(r.get('total_due', 0)) for r in rows)
        return {
            "defaulters": rows,
            "total_defaulters": len(rows),
            "total_amount_due": total_due,
        }
    except Exception as e:
        return {"error": str(e)}

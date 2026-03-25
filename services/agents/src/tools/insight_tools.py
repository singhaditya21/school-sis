"""Insight tools — KPI queries for InsightAgent.

Production-ready SQL queries against the real schema for
school-wide analytics and performance metrics.
"""

from __future__ import annotations
from src.tools.db import _run_query


async def get_school_kpis(tenant_id: str) -> dict:
    """Get comprehensive school KPI metrics."""
    query = """
        SELECT
            (SELECT COUNT(*) FROM students WHERE tenant_id = %s AND status = 'ACTIVE') AS total_students,
            (SELECT COUNT(*) FROM users WHERE tenant_id = %s AND role = 'TEACHER' AND is_active = true) AS total_teachers,
            (SELECT COUNT(*) FROM grades WHERE tenant_id = %s) AS total_grades,
            (SELECT COUNT(*) FROM sections WHERE tenant_id = %s) AS total_sections,
            (SELECT COALESCE(SUM(paid_amount), 0) FROM invoices WHERE tenant_id = %s AND status = 'PAID') AS total_revenue,
            (SELECT COALESCE(SUM(total_amount - paid_amount), 0) FROM invoices WHERE tenant_id = %s AND status IN ('OVERDUE', 'SENT')) AS outstanding_fees,
            (SELECT COUNT(*) FROM admission_leads WHERE tenant_id = %s AND status = 'NEW') AS pending_admissions,
            (SELECT ROUND(
                COUNT(*) FILTER (WHERE status = 'PRESENT')::numeric /
                NULLIF(COUNT(*), 0) * 100, 1
            ) FROM attendance_records WHERE tenant_id = %s AND date = CURRENT_DATE) AS today_attendance_pct
    """
    params = [tenant_id] * 8

    try:
        rows = await _run_query(query, params)
        if rows:
            r = rows[0]
            student_teacher_ratio = round(r['total_students'] / max(r['total_teachers'], 1), 1)
            return {
                "total_students": r['total_students'],
                "total_teachers": r['total_teachers'],
                "student_teacher_ratio": student_teacher_ratio,
                "total_grades": r['total_grades'],
                "total_sections": r['total_sections'],
                "total_revenue": float(r['total_revenue']),
                "outstanding_fees": float(r['outstanding_fees']),
                "pending_admissions": r['pending_admissions'],
                "today_attendance_pct": float(r['today_attendance_pct'] or 0),
            }
        return {"error": "No data found"}
    except Exception as e:
        return {"error": str(e)}


async def get_enrollment_trends(tenant_id: str, years: int = 3) -> dict:
    """Get enrollment trends by academic year."""
    query = """
        SELECT
            ay.name AS academic_year,
            COUNT(DISTINCT s.id) AS student_count,
            COUNT(DISTINCT s.id) FILTER (WHERE s.gender = 'MALE') AS male_count,
            COUNT(DISTINCT s.id) FILTER (WHERE s.gender = 'FEMALE') AS female_count
        FROM academic_years ay
        LEFT JOIN sections sec ON sec.academic_year_id = ay.id AND sec.tenant_id = %s
        LEFT JOIN students s ON s.section_id = sec.id AND s.tenant_id = %s AND s.status = 'ACTIVE'
        WHERE ay.tenant_id = %s
        GROUP BY ay.name, ay.start_date
        ORDER BY ay.start_date DESC
        LIMIT %s
    """

    try:
        rows = await _run_query(query, [tenant_id, tenant_id, tenant_id, years])
        return {"trends": rows, "years_analyzed": len(rows)}
    except Exception as e:
        return {"error": str(e), "trends": []}


async def get_grade_performance_summary(tenant_id: str) -> dict:
    """Get academic performance summary by grade."""
    query = """
        SELECT
            g.name AS grade,
            COUNT(DISTINCT er.student_id) AS students_assessed,
            ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS avg_percentage,
            ROUND(MIN(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS min_percentage,
            ROUND(MAX(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS max_percentage
        FROM grades g
        LEFT JOIN sections sec ON sec.grade_id = g.id AND sec.tenant_id = %s
        LEFT JOIN students s ON s.section_id = sec.id AND s.tenant_id = %s
        LEFT JOIN exam_results er ON er.student_id = s.id
        WHERE g.tenant_id = %s
        GROUP BY g.name, g.display_order
        ORDER BY g.display_order ASC
    """

    try:
        rows = await _run_query(query, [tenant_id, tenant_id, tenant_id])
        return {"grades": rows, "total_grades": len(rows)}
    except Exception as e:
        return {"error": str(e), "grades": []}

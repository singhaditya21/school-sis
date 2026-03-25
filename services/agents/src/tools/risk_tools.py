"""Cross-module risk scoring tool implementations.

RiskAgent reads from ALL collections but writes to none.
It correlates signals across fee, attendance, and academic domains.
"""

from __future__ import annotations
from src.tools.fee_tools import _run_query


async def get_student_risk_score(
    tenant_id: str,
    student_id: str | None = None,
    grade_id: str | None = None,
    min_risk_signals: int = 2,
) -> dict:
    """Calculate composite risk scores by correlating fee, attendance, and academic signals."""
    grade_filter = ""
    student_filter = ""
    params: list = [tenant_id, tenant_id, tenant_id]

    if student_id:
        student_filter = "AND s.id = %s"
        params.append(student_id)
    if grade_id:
        grade_filter = "AND s.grade_id = %s"
        params.append(grade_id)

    query = f"""
        WITH fee_risk AS (
            SELECT student_id,
                   SUM(total_amount - paid_amount) AS total_overdue,
                   COUNT(*) AS overdue_invoices
            FROM invoices
            WHERE tenant_id = %s AND status = 'OVERDUE'
            GROUP BY student_id
        ),
        attend_risk AS (
            SELECT student_id,
                   ROUND(
                       COUNT(*) FILTER (WHERE status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0), 2
                   ) AS attendance_rate,
                   COUNT(*) FILTER (WHERE status = 'ABSENT') AS total_absences
            FROM attendance_records
            WHERE tenant_id = %s
              AND date >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY student_id
        ),
        academic_risk AS (
            SELECT sr.student_id,
                   COUNT(DISTINCT sub.id) FILTER (
                       WHERE sr.marks_obtained < es.passing_marks AND sr.is_absent = false
                   ) AS failing_subjects,
                   ROUND(AVG(sr.marks_obtained * 100.0 / NULLIF(es.max_marks, 0))
                         FILTER (WHERE sr.is_absent = false), 2) AS avg_percentage
            FROM student_results sr
            JOIN exam_schedules es ON sr.exam_schedule_id = es.id
            JOIN subjects sub ON es.subject_id = sub.id
            WHERE sr.tenant_id = %s
              AND es.exam_date >= CURRENT_DATE - INTERVAL '180 days'
            GROUP BY sr.student_id
        )
        SELECT
            s.id AS student_id,
            s.first_name || ' ' || s.last_name AS student_name,
            s.admission_number,
            g.name AS grade_name, sec.name AS section_name,
            COALESCE(fr.total_overdue, 0) AS fee_overdue,
            COALESCE(fr.overdue_invoices, 0) AS overdue_invoice_count,
            COALESCE(attr.attendance_rate, 100) AS attendance_rate,
            COALESCE(attr.total_absences, 0) AS total_absences,
            COALESCE(ar.failing_subjects, 0) AS failing_subjects,
            COALESCE(ar.avg_percentage, 0) AS avg_percentage,
            -- Risk signals
            (CASE WHEN COALESCE(fr.total_overdue, 0) > 0 THEN 1 ELSE 0 END
             + CASE WHEN COALESCE(attr.attendance_rate, 100) < 85 THEN 1 ELSE 0 END
             + CASE WHEN COALESCE(ar.failing_subjects, 0) >= 2 THEN 1 ELSE 0 END
             + CASE WHEN COALESCE(attr.attendance_rate, 100) < 75 THEN 1 ELSE 0 END
             + CASE WHEN COALESCE(fr.overdue_invoices, 0) >= 3 THEN 1 ELSE 0 END
            ) AS risk_signals
        FROM students s
        JOIN grades g ON s.grade_id = g.id
        JOIN sections sec ON s.section_id = sec.id
        LEFT JOIN fee_risk fr ON fr.student_id = s.id
        LEFT JOIN attend_risk attr ON attr.student_id = s.id
        LEFT JOIN academic_risk ar ON ar.student_id = s.id
        WHERE s.tenant_id = %s AND s.status = 'ACTIVE'
          {student_filter} {grade_filter}
        HAVING (
            CASE WHEN COALESCE(fr.total_overdue, 0) > 0 THEN 1 ELSE 0 END
            + CASE WHEN COALESCE(attr.attendance_rate, 100) < 85 THEN 1 ELSE 0 END
            + CASE WHEN COALESCE(ar.failing_subjects, 0) >= 2 THEN 1 ELSE 0 END
            + CASE WHEN COALESCE(attr.attendance_rate, 100) < 75 THEN 1 ELSE 0 END
            + CASE WHEN COALESCE(fr.overdue_invoices, 0) >= 3 THEN 1 ELSE 0 END
        ) >= %s
        ORDER BY risk_signals DESC, fee_overdue DESC
        LIMIT 50
    """
    params.extend([tenant_id])
    params.append(min_risk_signals)

    try:
        rows = await _run_query(query, params)
        return {
            "at_risk_count": len(rows),
            "min_signals_threshold": min_risk_signals,
            "students": rows,
        }
    except Exception as e:
        return {"error": str(e), "students": []}


async def correlate_signals(
    tenant_id: str,
) -> dict:
    """Get school-wide risk dashboard — how many students have each type of risk."""
    query = """
        WITH risks AS (
            SELECT s.id,
                CASE WHEN EXISTS (
                    SELECT 1 FROM invoices WHERE student_id = s.id AND status = 'OVERDUE'
                ) THEN true ELSE false END AS has_fee_risk,
                CASE WHEN EXISTS (
                    SELECT 1 FROM (
                        SELECT student_id,
                            COUNT(*) FILTER (WHERE status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0) AS rate
                        FROM attendance_records
                        WHERE tenant_id = %s AND date >= CURRENT_DATE - INTERVAL '90 days'
                        GROUP BY student_id
                    ) att WHERE att.student_id = s.id AND att.rate < 85
                ) THEN true ELSE false END AS has_attend_risk,
                CASE WHEN EXISTS (
                    SELECT 1 FROM (
                        SELECT sr.student_id,
                            COUNT(DISTINCT es.subject_id) FILTER (WHERE sr.marks_obtained < es.passing_marks) AS fails
                        FROM student_results sr
                        JOIN exam_schedules es ON sr.exam_schedule_id = es.id
                        WHERE sr.tenant_id = %s
                        GROUP BY sr.student_id
                        HAVING COUNT(DISTINCT es.subject_id) FILTER (WHERE sr.marks_obtained < es.passing_marks) >= 2
                    ) ac WHERE ac.student_id = s.id
                ) THEN true ELSE false END AS has_academic_risk
            FROM students s
            WHERE s.tenant_id = %s AND s.status = 'ACTIVE'
        )
        SELECT
            COUNT(*) AS total_active_students,
            COUNT(*) FILTER (WHERE has_fee_risk) AS fee_risk_count,
            COUNT(*) FILTER (WHERE has_attend_risk) AS attend_risk_count,
            COUNT(*) FILTER (WHERE has_academic_risk) AS academic_risk_count,
            COUNT(*) FILTER (WHERE has_fee_risk AND has_attend_risk) AS fee_plus_attend,
            COUNT(*) FILTER (WHERE has_fee_risk AND has_academic_risk) AS fee_plus_academic,
            COUNT(*) FILTER (WHERE has_attend_risk AND has_academic_risk) AS attend_plus_academic,
            COUNT(*) FILTER (WHERE has_fee_risk AND has_attend_risk AND has_academic_risk) AS all_three_risks
        FROM risks
    """
    try:
        rows = await _run_query(query, [tenant_id, tenant_id, tenant_id])
        return rows[0] if rows else {"error": "No data"}
    except Exception as e:
        return {"error": str(e)}

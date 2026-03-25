"""Attendance-domain tool implementations.

Schema: attendance_records(id, tenant_id, student_id, section_id, date, status, marked_by, remarks, is_notified)
Enum attendance_status: PRESENT, ABSENT, LATE, HALF_DAY, EXCUSED, HOLIDAY
"""

from __future__ import annotations
from src.tools.fee_tools import _run_query


async def query_attendance(
    tenant_id: str,
    grade_id: str | None = None,
    section_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Get attendance summary with optional filters."""
    conditions = ["ar.tenant_id = %s"]
    params: list = [tenant_id]

    if grade_id:
        conditions.append("s.grade_id = %s")
        params.append(grade_id)
    if section_id:
        conditions.append("ar.section_id = %s")
        params.append(section_id)
    if start_date:
        conditions.append("ar.date >= %s::date")
        params.append(start_date)
    if end_date:
        conditions.append("ar.date <= %s::date")
        params.append(end_date)

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            g.name AS grade_name, sec.name AS section_name,
            COUNT(*) AS total_records,
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT') AS present,
            COUNT(*) FILTER (WHERE ar.status = 'ABSENT') AS absent,
            COUNT(*) FILTER (WHERE ar.status = 'LATE') AS late,
            COUNT(*) FILTER (WHERE ar.status = 'HALF_DAY') AS half_day,
            COUNT(*) FILTER (WHERE ar.status = 'EXCUSED') AS excused,
            CASE WHEN COUNT(*) > 0
                THEN ROUND(
                    COUNT(*) FILTER (WHERE ar.status = 'PRESENT') * 100.0 / COUNT(*), 2
                ) ELSE 0 END AS attendance_rate
        FROM attendance_records ar
        JOIN students s ON ar.student_id = s.id
        JOIN grades g ON s.grade_id = g.id
        JOIN sections sec ON ar.section_id = sec.id
        WHERE {where}
        GROUP BY g.name, sec.name, g.display_order
        ORDER BY g.display_order, sec.name
    """
    try:
        rows = await _run_query(query, params)
        return {"sections": rows, "total_sections": len(rows)}
    except Exception as e:
        return {"error": str(e), "sections": []}


async def flag_anomalies(
    tenant_id: str,
    threshold_percent: float = 85.0,
    days: int = 30,
) -> dict:
    """Identify students with attendance below threshold in recent N days."""
    query = """
        SELECT
            s.id AS student_id,
            s.first_name || ' ' || s.last_name AS student_name,
            s.admission_number,
            g.name AS grade_name, sec.name AS section_name,
            COUNT(*) AS total_days,
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT') AS present_days,
            COUNT(*) FILTER (WHERE ar.status = 'ABSENT') AS absent_days,
            ROUND(
                COUNT(*) FILTER (WHERE ar.status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0), 2
            ) AS attendance_rate,
            gd.first_name || ' ' || gd.last_name AS guardian_name,
            gd.phone AS guardian_phone
        FROM attendance_records ar
        JOIN students s ON ar.student_id = s.id
        JOIN grades g ON s.grade_id = g.id
        JOIN sections sec ON s.section_id = sec.id
        LEFT JOIN guardians gd ON gd.student_id = s.id AND gd.is_primary = true
        WHERE ar.tenant_id = %s
          AND ar.date >= CURRENT_DATE - INTERVAL '%s days'
          AND s.status = 'ACTIVE'
        GROUP BY s.id, s.first_name, s.last_name, s.admission_number,
                 g.name, sec.name, gd.first_name, gd.last_name, gd.phone
        HAVING ROUND(
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0), 2
        ) < %s
        ORDER BY attendance_rate ASC
    """
    try:
        rows = await _run_query(query, [tenant_id, days, threshold_percent])
        return {
            "flagged_count": len(rows),
            "threshold": threshold_percent,
            "period_days": days,
            "students": rows,
        }
    except Exception as e:
        return {"error": str(e), "students": []}


async def get_student_attendance(
    tenant_id: str,
    student_id: str,
    days: int = 90,
) -> dict:
    """Get detailed attendance history for a specific student."""
    summary_query = """
        SELECT
            COUNT(*) AS total_days,
            COUNT(*) FILTER (WHERE status = 'PRESENT') AS present,
            COUNT(*) FILTER (WHERE status = 'ABSENT') AS absent,
            COUNT(*) FILTER (WHERE status = 'LATE') AS late,
            COUNT(*) FILTER (WHERE status = 'EXCUSED') AS excused,
            ROUND(COUNT(*) FILTER (WHERE status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0), 2) AS rate
        FROM attendance_records
        WHERE student_id = %s AND tenant_id = %s
          AND date >= CURRENT_DATE - INTERVAL '%s days'
    """
    summary = await _run_query(summary_query, [student_id, tenant_id, days])

    # Recent absences
    absences_query = """
        SELECT date, status, remarks
        FROM attendance_records
        WHERE student_id = %s AND tenant_id = %s
          AND status IN ('ABSENT', 'LATE')
          AND date >= CURRENT_DATE - INTERVAL '%s days'
        ORDER BY date DESC LIMIT 20
    """
    absences = await _run_query(absences_query, [student_id, tenant_id, days])

    # Consecutive absence detection
    consec_query = """
        WITH ranked AS (
            SELECT date, status,
                   date - ROW_NUMBER() OVER (ORDER BY date)::int AS grp
            FROM attendance_records
            WHERE student_id = %s AND tenant_id = %s AND status = 'ABSENT'
              AND date >= CURRENT_DATE - INTERVAL '%s days'
        )
        SELECT MIN(date) AS streak_start, MAX(date) AS streak_end,
               COUNT(*) AS consecutive_days
        FROM ranked GROUP BY grp
        HAVING COUNT(*) >= 3
        ORDER BY streak_start DESC
    """
    streaks = await _run_query(consec_query, [student_id, tenant_id, days])

    return {
        "summary": summary[0] if summary else {},
        "recent_absences": absences,
        "consecutive_absence_streaks": streaks,
    }


async def get_daily_report(
    tenant_id: str,
    date: str | None = None,
) -> dict:
    """Get attendance report for a specific date (defaults to today)."""
    date_param = date or "CURRENT_DATE"
    date_clause = "ar.date = %s::date" if date else "ar.date = CURRENT_DATE"
    params = [tenant_id, date] if date else [tenant_id]

    query = f"""
        SELECT
            g.name AS grade_name, sec.name AS section_name,
            COUNT(DISTINCT ar.student_id) AS total_students,
            COUNT(*) FILTER (WHERE ar.status = 'PRESENT') AS present,
            COUNT(*) FILTER (WHERE ar.status = 'ABSENT') AS absent,
            COUNT(*) FILTER (WHERE ar.status = 'LATE') AS late,
            ROUND(
                COUNT(*) FILTER (WHERE ar.status = 'PRESENT') * 100.0 / NULLIF(COUNT(*), 0), 2
            ) AS rate
        FROM attendance_records ar
        JOIN sections sec ON ar.section_id = sec.id
        JOIN grades g ON sec.grade_id = g.id
        WHERE ar.tenant_id = %s AND {date_clause}
        GROUP BY g.name, sec.name, g.display_order
        ORDER BY g.display_order, sec.name
    """
    try:
        rows = await _run_query(query, params)
        total_present = sum(r.get("present", 0) for r in rows)
        total_students = sum(r.get("total_students", 0) for r in rows)
        return {
            "date": date or "today",
            "sections": rows,
            "school_wide_rate": round(total_present / total_students * 100, 2) if total_students > 0 else 0,
        }
    except Exception as e:
        return {"error": str(e)}

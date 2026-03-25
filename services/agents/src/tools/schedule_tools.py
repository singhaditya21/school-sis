"""Schedule/Timetable-domain tool implementations.

Schema: timetable_entries, periods, sections, substitutions
"""

from __future__ import annotations
from src.tools.fee_tools import _run_query


async def get_timetable(
    tenant_id: str,
    section_id: str | None = None,
    teacher_id: str | None = None,
    day: str | None = None,
) -> dict:
    """Get timetable entries with optional section, teacher, or day filter."""
    conditions = ["te.tenant_id = %s"]
    params: list = [tenant_id]
    if section_id:
        conditions.append("te.section_id = %s")
        params.append(section_id)
    if teacher_id:
        conditions.append("te.teacher_id = %s")
        params.append(teacher_id)
    if day:
        conditions.append("te.day_of_week = %s")
        params.append(day)

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            te.day_of_week, p.name AS period_name,
            p.start_time, p.end_time, p.is_break,
            g.name AS grade_name, sec.name AS section_name,
            sub.name AS subject_name,
            u.first_name || ' ' || u.last_name AS teacher_name,
            te.room_number
        FROM timetable_entries te
        JOIN periods p ON te.period_id = p.id
        JOIN sections sec ON te.section_id = sec.id
        JOIN grades g ON sec.grade_id = g.id
        JOIN subjects sub ON te.subject_id = sub.id
        JOIN users u ON te.teacher_id = u.id
        WHERE {where}
        ORDER BY CASE te.day_of_week
            WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3
            WHEN 'THURSDAY' THEN 4 WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6
        END, p.display_order
    """
    try:
        rows = await _run_query(query, params)
        return {"entries": rows, "total": len(rows)}
    except Exception as e:
        return {"error": str(e), "entries": []}


async def check_conflicts(
    tenant_id: str,
) -> dict:
    """Detect timetable conflicts — teacher double-bookings, room clashes."""
    teacher_conflicts = """
        SELECT
            u.first_name || ' ' || u.last_name AS teacher_name,
            te1.day_of_week, p.name AS period_name,
            COUNT(*) AS bookings,
            array_agg(g.name || ' ' || sec.name) AS sections
        FROM timetable_entries te1
        JOIN timetable_entries te2 ON te1.teacher_id = te2.teacher_id
            AND te1.day_of_week = te2.day_of_week
            AND te1.period_id = te2.period_id
            AND te1.id < te2.id
        JOIN users u ON te1.teacher_id = u.id
        JOIN periods p ON te1.period_id = p.id
        JOIN sections sec ON te1.section_id = sec.id
        JOIN grades g ON sec.grade_id = g.id
        WHERE te1.tenant_id = %s
        GROUP BY u.first_name, u.last_name, te1.day_of_week, p.name
    """

    room_conflicts = """
        SELECT
            te1.room_number, te1.day_of_week,
            p.name AS period_name,
            COUNT(*) AS bookings,
            array_agg(g.name || ' ' || sec.name) AS sections
        FROM timetable_entries te1
        JOIN timetable_entries te2 ON te1.room_number = te2.room_number
            AND te1.day_of_week = te2.day_of_week
            AND te1.period_id = te2.period_id
            AND te1.id < te2.id
        JOIN periods p ON te1.period_id = p.id
        JOIN sections sec ON te1.section_id = sec.id
        JOIN grades g ON sec.grade_id = g.id
        WHERE te1.tenant_id = %s AND te1.room_number IS NOT NULL
        GROUP BY te1.room_number, te1.day_of_week, p.name
    """
    try:
        teachers = await _run_query(teacher_conflicts, [tenant_id])
        rooms = await _run_query(room_conflicts, [tenant_id])
        return {
            "teacher_conflicts": teachers,
            "room_conflicts": rooms,
            "total_conflicts": len(teachers) + len(rooms),
        }
    except Exception as e:
        return {"error": str(e)}


async def get_teacher_workload(
    tenant_id: str,
    teacher_id: str | None = None,
) -> dict:
    """Get periods per week per teacher (workload analysis)."""
    teacher_filter = ""
    params = [tenant_id]
    if teacher_id:
        teacher_filter = "AND te.teacher_id = %s"
        params.append(teacher_id)

    query = f"""
        SELECT
            u.id AS teacher_id,
            u.first_name || ' ' || u.last_name AS teacher_name,
            COUNT(*) AS total_periods,
            COUNT(DISTINCT te.section_id) AS sections_taught,
            COUNT(DISTINCT te.subject_id) AS subjects_taught,
            COUNT(DISTINCT te.day_of_week) AS working_days,
            json_object_agg(
                te.day_of_week,
                day_counts.count
            ) AS day_breakdown
        FROM timetable_entries te
        JOIN users u ON te.teacher_id = u.id
        LEFT JOIN LATERAL (
            SELECT COUNT(*) AS count
            FROM timetable_entries te2
            WHERE te2.teacher_id = te.teacher_id AND te2.day_of_week = te.day_of_week
        ) day_counts ON true
        WHERE te.tenant_id = %s {teacher_filter}
        GROUP BY u.id, u.first_name, u.last_name
        ORDER BY total_periods DESC
    """
    try:
        rows = await _run_query(query, params)
        avg_load = round(sum(r.get("total_periods", 0) for r in rows) / len(rows), 1) if rows else 0
        overloaded = [r for r in rows if r.get("total_periods", 0) > avg_load * 1.3]
        return {
            "teachers": rows,
            "average_periods_per_week": avg_load,
            "overloaded_count": len(overloaded),
        }
    except Exception as e:
        return {"error": str(e), "teachers": []}


async def get_substitutions(
    tenant_id: str,
    date: str | None = None,
    days: int = 7,
) -> dict:
    """Get recent substitution assignments."""
    if date:
        date_clause = "AND sub.date = %s"
        params = [tenant_id, date]
    else:
        date_clause = "AND sub.date >= (CURRENT_DATE - INTERVAL '%s days')::text"
        params = [tenant_id, days]

    query = f"""
        SELECT
            sub.date,
            orig.first_name || ' ' || orig.last_name AS original_teacher,
            subs.first_name || ' ' || subs.last_name AS substitute_teacher,
            subj.name AS subject_name,
            g.name || ' ' || sec.name AS class_section,
            p.name AS period_name, p.start_time, p.end_time,
            sub.reason
        FROM substitutions sub
        JOIN timetable_entries te ON sub.timetable_entry_id = te.id
        JOIN users orig ON sub.original_teacher_id = orig.id
        JOIN users subs ON sub.substitute_teacher_id = subs.id
        JOIN subjects subj ON te.subject_id = subj.id
        JOIN sections sec ON te.section_id = sec.id
        JOIN grades g ON sec.grade_id = g.id
        JOIN periods p ON te.period_id = p.id
        WHERE sub.tenant_id = %s {date_clause}
        ORDER BY sub.date DESC, p.display_order
    """
    try:
        rows = await _run_query(query, params)
        return {"substitutions": rows, "total": len(rows)}
    except Exception as e:
        return {"error": str(e), "substitutions": []}

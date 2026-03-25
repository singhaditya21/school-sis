"""Academic-domain tool implementations.

Schema: exams, exam_schedules, student_results, subjects, grade_subjects
"""

from __future__ import annotations
from src.tools.fee_tools import _run_query


async def query_results(
    tenant_id: str,
    exam_id: str | None = None,
    grade_id: str | None = None,
    subject_id: str | None = None,
) -> dict:
    """Get exam results with optional filters."""
    conditions = ["sr.tenant_id = %s"]
    params: list = [tenant_id]

    if exam_id:
        conditions.append("e.id = %s")
        params.append(exam_id)
    if grade_id:
        conditions.append("es.grade_id = %s")
        params.append(grade_id)
    if subject_id:
        conditions.append("es.subject_id = %s")
        params.append(subject_id)

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            e.name AS exam_name, e.type AS exam_type,
            sub.name AS subject_name, g.name AS grade_name,
            COUNT(*) AS total_students,
            COUNT(*) FILTER (WHERE sr.is_absent = false
                AND sr.marks_obtained >= es.passing_marks) AS passed,
            COUNT(*) FILTER (WHERE sr.is_absent = false
                AND sr.marks_obtained < es.passing_marks) AS failed,
            COUNT(*) FILTER (WHERE sr.is_absent = true) AS absent,
            ROUND(AVG(sr.marks_obtained) FILTER (WHERE sr.is_absent = false), 2) AS avg_marks,
            MAX(sr.marks_obtained) FILTER (WHERE sr.is_absent = false) AS highest,
            MIN(sr.marks_obtained) FILTER (WHERE sr.is_absent = false) AS lowest,
            es.max_marks, es.passing_marks,
            ROUND(
                COUNT(*) FILTER (WHERE sr.marks_obtained >= es.passing_marks AND sr.is_absent = false)
                * 100.0 / NULLIF(COUNT(*) FILTER (WHERE sr.is_absent = false), 0), 2
            ) AS pass_rate
        FROM student_results sr
        JOIN exam_schedules es ON sr.exam_schedule_id = es.id
        JOIN exams e ON es.exam_id = e.id
        JOIN subjects sub ON es.subject_id = sub.id
        JOIN grades g ON es.grade_id = g.id
        WHERE {where}
        GROUP BY e.name, e.type, sub.name, g.name, es.max_marks, es.passing_marks, g.display_order
        ORDER BY g.display_order, sub.name
    """
    try:
        rows = await _run_query(query, params)
        return {"results": rows, "total_records": len(rows)}
    except Exception as e:
        return {"error": str(e), "results": []}


async def get_student_academics(
    tenant_id: str,
    student_id: str,
) -> dict:
    """Get complete academic profile for a student across all exams."""
    query = """
        SELECT
            e.name AS exam_name, e.type AS exam_type,
            sub.name AS subject_name,
            sr.marks_obtained, es.max_marks, es.passing_marks,
            sr.grade AS letter_grade, sr.is_absent, sr.remarks,
            ROUND(sr.marks_obtained * 100.0 / NULLIF(es.max_marks, 0), 2) AS percentage
        FROM student_results sr
        JOIN exam_schedules es ON sr.exam_schedule_id = es.id
        JOIN exams e ON es.exam_id = e.id
        JOIN subjects sub ON es.subject_id = sub.id
        WHERE sr.student_id = %s AND sr.tenant_id = %s
        ORDER BY e.start_date DESC, sub.name
    """
    rows = await _run_query(query, [student_id, tenant_id])

    # Subject-wise aggregation
    subject_map: dict = {}
    for r in rows:
        subj = r.get("subject_name", "")
        if subj not in subject_map:
            subject_map[subj] = []
        subject_map[subj].append(r)

    subject_averages = {}
    for subj, results in subject_map.items():
        valid = [r["percentage"] for r in results if r.get("percentage") and not r.get("is_absent")]
        subject_averages[subj] = round(sum(valid) / len(valid), 2) if valid else 0

    return {
        "exam_results": rows,
        "total_exams": len(set(r.get("exam_name") for r in rows)),
        "subject_averages": subject_averages,
    }


async def compare_performance(
    tenant_id: str,
    grade_id: str,
    exam_id: str | None = None,
) -> dict:
    """Compare student performance across subjects within a grade."""
    exam_filter = ""
    params = [tenant_id, grade_id]
    if exam_id:
        exam_filter = "AND e.id = %s"
        params.append(exam_id)

    query = f"""
        SELECT
            sub.name AS subject_name,
            ROUND(AVG(sr.marks_obtained) FILTER (WHERE sr.is_absent = false), 2) AS avg_marks,
            ROUND(AVG(sr.marks_obtained * 100.0 / NULLIF(es.max_marks, 0))
                  FILTER (WHERE sr.is_absent = false), 2) AS avg_percentage,
            COUNT(*) FILTER (WHERE sr.marks_obtained >= es.passing_marks
                AND sr.is_absent = false) AS passed,
            COUNT(*) FILTER (WHERE sr.marks_obtained < es.passing_marks
                AND sr.is_absent = false) AS failed,
            COUNT(DISTINCT sr.student_id) AS total_students
        FROM student_results sr
        JOIN exam_schedules es ON sr.exam_schedule_id = es.id
        JOIN exams e ON es.exam_id = e.id
        JOIN subjects sub ON es.subject_id = sub.id
        WHERE sr.tenant_id = %s AND es.grade_id = %s {exam_filter}
        GROUP BY sub.name
        ORDER BY avg_percentage DESC
    """
    try:
        rows = await _run_query(query, params)
        weakest = min(rows, key=lambda r: r.get("avg_percentage", 100)) if rows else None
        strongest = max(rows, key=lambda r: r.get("avg_percentage", 0)) if rows else None
        return {
            "subjects": rows,
            "weakest_subject": weakest.get("subject_name") if weakest else None,
            "strongest_subject": strongest.get("subject_name") if strongest else None,
        }
    except Exception as e:
        return {"error": str(e), "subjects": []}


async def get_at_risk_students(
    tenant_id: str,
    grade_id: str | None = None,
    fail_threshold: int = 2,
) -> dict:
    """Find students failing in multiple subjects."""
    grade_filter = ""
    params = [tenant_id]
    if grade_id:
        grade_filter = "AND es.grade_id = %s"
        params.append(grade_id)

    query = f"""
        SELECT
            s.id AS student_id,
            s.first_name || ' ' || s.last_name AS student_name,
            s.admission_number,
            g.name AS grade_name,
            COUNT(DISTINCT sub.id) FILTER (
                WHERE sr.marks_obtained < es.passing_marks AND sr.is_absent = false
            ) AS failing_subjects,
            array_agg(DISTINCT sub.name) FILTER (
                WHERE sr.marks_obtained < es.passing_marks AND sr.is_absent = false
            ) AS weak_subjects,
            ROUND(AVG(sr.marks_obtained * 100.0 / NULLIF(es.max_marks, 0))
                  FILTER (WHERE sr.is_absent = false), 2) AS overall_percentage
        FROM student_results sr
        JOIN exam_schedules es ON sr.exam_schedule_id = es.id
        JOIN exams e ON es.exam_id = e.id
        JOIN subjects sub ON es.subject_id = sub.id
        JOIN students s ON sr.student_id = s.id
        JOIN grades g ON s.grade_id = g.id
        WHERE sr.tenant_id = %s {grade_filter}
          AND e.start_date >= CURRENT_DATE - INTERVAL '180 days'
        GROUP BY s.id, s.first_name, s.last_name, s.admission_number, g.name
        HAVING COUNT(DISTINCT sub.id) FILTER (
            WHERE sr.marks_obtained < es.passing_marks AND sr.is_absent = false
        ) >= %s
        ORDER BY failing_subjects DESC
    """
    params.append(fail_threshold)
    try:
        rows = await _run_query(query, params)
        return {"at_risk_count": len(rows), "students": rows}
    except Exception as e:
        return {"error": str(e), "students": []}

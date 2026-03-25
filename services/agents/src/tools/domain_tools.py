"""Domain tools — SQL queries for Wave 2-4 agents.

Each function serves as the tool backend for a specific agent.
All queries are parameterized and tenant-scoped.
"""

from __future__ import annotations
from src.tools.db import _run_query


# ═══════════════════════════════════════════════════════════
# CollectionsAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_defaulters_aging(tenant_id: str) -> dict:
    query = """
        SELECT s.first_name || ' ' || s.last_name AS student_name, s.admission_number,
               g.name AS grade,
               SUM(CASE WHEN i.due_date >= CURRENT_DATE - 30 THEN i.total_amount - i.paid_amount ELSE 0 END) AS due_0_30,
               SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 60 AND CURRENT_DATE - 31 THEN i.total_amount - i.paid_amount ELSE 0 END) AS due_31_60,
               SUM(CASE WHEN i.due_date BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 61 THEN i.total_amount - i.paid_amount ELSE 0 END) AS due_61_90,
               SUM(CASE WHEN i.due_date < CURRENT_DATE - 90 THEN i.total_amount - i.paid_amount ELSE 0 END) AS due_90_plus,
               SUM(i.total_amount - i.paid_amount) AS total_due
        FROM invoices i JOIN students s ON s.id = i.student_id
        LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE i.tenant_id = %s AND i.status = 'OVERDUE'
        GROUP BY s.first_name, s.last_name, s.admission_number, g.name
        HAVING SUM(i.total_amount - i.paid_amount) > 0
        ORDER BY total_due DESC LIMIT 50
    """
    try:
        rows = await _run_query(query, [tenant_id])
        return {"defaulters": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}


async def get_collection_trends(tenant_id: str, months: int = 6) -> dict:
    query = """
        SELECT DATE_TRUNC('month', p.paid_at) AS month, SUM(p.amount) AS collected,
               COUNT(p.id) AS payment_count
        FROM payments p WHERE p.tenant_id = %s AND p.status = 'COMPLETED'
               AND p.paid_at >= NOW() - INTERVAL '%s months'
        GROUP BY DATE_TRUNC('month', p.paid_at) ORDER BY month DESC
    """
    try:
        rows = await _run_query(query, [tenant_id, months])
        return {"trends": rows, "months": len(rows)}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# WorkforceAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_staff_attendance(tenant_id: str, month: str = None) -> dict:
    month_clause = f"AND DATE_TRUNC('month', sa.date) = '{month}-01'::date" if month else "AND sa.date >= DATE_TRUNC('month', CURRENT_DATE)"
    query = f"""
        SELECT u.first_name || ' ' || u.last_name AS staff_name, u.role,
               COUNT(*) FILTER (WHERE sa.status = 'PRESENT') AS present_days,
               COUNT(*) FILTER (WHERE sa.status = 'ABSENT') AS absent_days,
               COUNT(*) FILTER (WHERE sa.status = 'ON_LEAVE') AS leave_days
        FROM users u LEFT JOIN staff_attendance sa ON sa.user_id = u.id {month_clause}
        WHERE u.tenant_id = %s AND u.role IN ('TEACHER', 'ACCOUNTANT', 'TRANSPORT_MANAGER') AND u.is_active = true
        GROUP BY u.first_name, u.last_name, u.role ORDER BY u.first_name
    """
    try:
        rows = await _run_query(query, [tenant_id])
        return {"staff": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}


async def get_leave_analysis(tenant_id: str) -> dict:
    query = """
        SELECT u.first_name || ' ' || u.last_name AS staff_name, lr.leave_type,
               COUNT(*) AS total_requests,
               COUNT(*) FILTER (WHERE lr.status = 'APPROVED') AS approved,
               COUNT(*) FILTER (WHERE lr.status = 'REJECTED') AS rejected,
               SUM(lr.days) AS total_days
        FROM leave_requests lr JOIN users u ON u.id = lr.user_id
        WHERE lr.tenant_id = %s AND lr.created_at >= DATE_TRUNC('year', CURRENT_DATE)
        GROUP BY u.first_name, u.last_name, lr.leave_type ORDER BY total_days DESC LIMIT 50
    """
    try:
        rows = await _run_query(query, [tenant_id])
        return {"leave_data": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# CampusAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_facility_utilization(tenant_id: str) -> dict:
    query = """
        SELECT te.room, COUNT(*) AS periods_per_week,
               COUNT(DISTINCT te.subject_id) AS subjects,
               COUNT(DISTINCT te.teacher_id) AS teachers
        FROM timetable_entries te WHERE te.tenant_id = %s
        GROUP BY te.room ORDER BY periods_per_week DESC LIMIT 30
    """
    try:
        rows = await _run_query(query, [tenant_id])
        return {"rooms": rows, "total_rooms": len(rows)}
    except Exception as e:
        return {"error": str(e)}


async def get_visitor_stats(tenant_id: str, days: int = 30) -> dict:
    query = """
        SELECT DATE(v.check_in_time) AS visit_date, COUNT(*) AS visitors,
               v.purpose, COUNT(*) AS count
        FROM visitors v WHERE v.tenant_id = %s AND v.check_in_time >= NOW() - INTERVAL '%s days'
        GROUP BY DATE(v.check_in_time), v.purpose ORDER BY visit_date DESC
    """
    try:
        rows = await _run_query(query, [tenant_id, days])
        return {"visits": rows, "total": len(rows)}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# PlacementAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_exam_readiness(tenant_id: str, exam_type: str) -> dict:
    subject_map = {
        "JEE": ["Physics", "Chemistry", "Mathematics"],
        "NEET": ["Physics", "Chemistry", "Biology"],
        "CUET": ["English", "General Knowledge"],
    }
    subjects = subject_map.get(exam_type, ["English", "Mathematics"])
    placeholders = ", ".join(["%s"] * len(subjects))
    query = f"""
        SELECT s.first_name || ' ' || s.last_name AS student_name, sub.name AS subject,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS avg_pct,
               COUNT(er.id) AS exams_taken
        FROM students s
        JOIN exam_results er ON er.student_id = s.id
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN subjects sub ON sub.id = es.subject_id
        WHERE s.tenant_id = %s AND sub.name IN ({placeholders}) AND s.status = 'ACTIVE'
        GROUP BY s.first_name, s.last_name, sub.name
        ORDER BY avg_pct DESC LIMIT 50
    """
    try:
        rows = await _run_query(query, [tenant_id] + subjects)
        return {"exam_type": exam_type, "students": rows, "subjects_analyzed": subjects}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# CrisisAgent Tools
# ═══════════════════════════════════════════════════════════

async def draft_emergency_broadcast(tenant_id: str, severity: str, message: str) -> dict:
    """Draft only — requires human approval before sending."""
    query = """
        SELECT COUNT(DISTINCT u.id) AS total_recipients, u.role,
               COUNT(DISTINCT u.id) FILTER (WHERE u.phone IS NOT NULL) AS with_phone,
               COUNT(DISTINCT u.id) FILTER (WHERE u.email IS NOT NULL) AS with_email
        FROM users u WHERE u.tenant_id = %s AND u.is_active = true
        GROUP BY u.role
    """
    try:
        rows = await _run_query(query, [tenant_id])
        total = sum(r.get('total_recipients', 0) for r in rows)
        return {
            "status": "DRAFT — REQUIRES HUMAN APPROVAL",
            "severity": severity,
            "message": message,
            "recipients_by_role": rows,
            "total_recipients": total,
            "approval_required": True,
            "warning": "This broadcast will NOT be sent until approved by a school administrator.",
        }
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# HealthAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_health_alerts(tenant_id: str) -> dict:
    query = """
        SELECT s.first_name || ' ' || s.last_name AS student_name, s.admission_number,
               g.name AS grade, hr.blood_group, hr.allergies, hr.medications, hr.conditions
        FROM health_records hr
        JOIN students s ON s.id = hr.student_id AND s.tenant_id = %s
        LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE hr.tenant_id = %s AND (hr.allergies IS NOT NULL OR hr.medications IS NOT NULL OR hr.conditions IS NOT NULL)
        ORDER BY g.display_order, s.first_name LIMIT 50
    """
    try:
        rows = await _run_query(query, [tenant_id, tenant_id])
        return {"students_with_alerts": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# AlumniAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_alumni_stats(tenant_id: str) -> dict:
    query = """
        SELECT COUNT(*) AS total_alumni,
               COUNT(*) FILTER (WHERE a.is_active = true) AS active,
               SUM(COALESCE(a.donation_amount, 0)) AS total_donations,
               a.graduation_year, COUNT(*) AS grads_per_year
        FROM alumni a WHERE a.tenant_id = %s
        GROUP BY a.graduation_year ORDER BY a.graduation_year DESC LIMIT 20
    """
    try:
        rows = await _run_query(query, [tenant_id])
        return {"yearly_stats": rows, "years": len(rows)}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# AccredAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_compliance_status(tenant_id: str, board: str) -> dict:
    query = """
        SELECT t.name AS school_name, t.affiliation_board, t.affiliation_number, t.udise_code,
               (SELECT COUNT(*) FROM users WHERE tenant_id = %s AND role = 'TEACHER' AND is_active = true) AS total_teachers,
               (SELECT COUNT(*) FROM students WHERE tenant_id = %s AND status = 'ACTIVE') AS total_students
        FROM tenants t WHERE t.id = %s
    """
    try:
        rows = await _run_query(query, [tenant_id, tenant_id, tenant_id])
        if rows:
            r = rows[0]
            ratio = round(r['total_students'] / max(r['total_teachers'], 1), 1)
            max_ratio = {"CBSE": 40, "ICSE": 30, "STATE": 45}.get(board, 40)
            return {
                "school": r['school_name'],
                "board": board,
                "affiliation_number": r['affiliation_number'],
                "udise_code": r['udise_code'],
                "student_teacher_ratio": ratio,
                "max_allowed_ratio": max_ratio,
                "ratio_compliant": ratio <= max_ratio,
                "total_teachers": r['total_teachers'],
                "total_students": r['total_students'],
            }
        return {"error": "School data not found"}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# IntlAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_intl_students(tenant_id: str) -> dict:
    query = """
        SELECT s.first_name || ' ' || s.last_name AS student_name, s.admission_number,
               s.nationality, g.name AS grade, s.status
        FROM students s
        LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE s.tenant_id = %s AND s.nationality IS NOT NULL AND s.nationality != 'Indian'
        ORDER BY s.nationality, s.first_name
    """
    try:
        rows = await _run_query(query, [tenant_id])
        return {"international_students": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# SafeguardAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_safeguarding_alerts(tenant_id: str) -> dict:
    """Cross-signal analysis: attendance drops + academic drops = risk flag."""
    query = """
        WITH attendance_flags AS (
            SELECT student_id,
                   COUNT(*) FILTER (WHERE status = 'ABSENT') AS absent_count,
                   COUNT(*) AS total_days
            FROM attendance_records
            WHERE tenant_id = %s AND date >= CURRENT_DATE - 30
            GROUP BY student_id
            HAVING COUNT(*) FILTER (WHERE status = 'ABSENT')::numeric / NULLIF(COUNT(*), 0) > 0.3
        ),
        academic_flags AS (
            SELECT er.student_id,
                   AVG(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100) AS avg_pct
            FROM exam_results er
            JOIN exam_subjects es ON es.id = er.exam_subject_id
            JOIN exams e ON e.id = es.exam_id AND e.tenant_id = %s
            GROUP BY er.student_id
            HAVING AVG(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100) < 40
        )
        SELECT s.first_name || ' ' || s.last_name AS student_name, s.admission_number,
               g.name AS grade,
               af.absent_count, af.total_days,
               ROUND(acf.avg_pct, 1) AS avg_academic_pct,
               CASE
                   WHEN af.student_id IS NOT NULL AND acf.student_id IS NOT NULL THEN 'HIGH'
                   WHEN af.student_id IS NOT NULL OR acf.student_id IS NOT NULL THEN 'MEDIUM'
                   ELSE 'LOW'
               END AS risk_level
        FROM students s
        LEFT JOIN attendance_flags af ON af.student_id = s.id
        LEFT JOIN academic_flags acf ON acf.student_id = s.id
        LEFT JOIN sections sec ON sec.id = s.section_id LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE s.tenant_id = %s AND s.status = 'ACTIVE'
              AND (af.student_id IS NOT NULL OR acf.student_id IS NOT NULL)
        ORDER BY risk_level ASC, af.absent_count DESC NULLS LAST
        LIMIT 30
    """
    try:
        rows = await _run_query(query, [tenant_id, tenant_id, tenant_id])
        high = sum(1 for r in rows if r.get('risk_level') == 'HIGH')
        return {"alerts": rows, "total": len(rows), "high_risk": high}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# AdvisorAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_student_profile_analysis(tenant_id: str, student_id: str) -> dict:
    query = """
        SELECT sub.name AS subject,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS avg_pct,
               COUNT(er.id) AS exams,
               MAX(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100) AS best_pct,
               MIN(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100) AS worst_pct
        FROM exam_results er
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN subjects sub ON sub.id = es.subject_id
        WHERE er.student_id = %s
        GROUP BY sub.name ORDER BY avg_pct DESC
    """
    try:
        rows = await _run_query(query, [student_id])
        strengths = [r['subject'] for r in rows if float(r.get('avg_pct', 0)) >= 75]
        weaknesses = [r['subject'] for r in rows if float(r.get('avg_pct', 0)) < 50]
        return {"subjects": rows, "strengths": strengths, "weaknesses": weaknesses}
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# NeuroAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_learning_patterns(tenant_id: str, student_id: str) -> dict:
    query = """
        SELECT sub.name AS subject,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS avg_pct,
               ROUND(STDDEV(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS consistency,
               COUNT(er.id) AS data_points
        FROM exam_results er
        JOIN exam_subjects es ON es.id = er.exam_subject_id
        JOIN subjects sub ON sub.id = es.subject_id
        WHERE er.student_id = %s
        GROUP BY sub.name HAVING COUNT(er.id) >= 3
        ORDER BY consistency DESC
    """
    try:
        rows = await _run_query(query, [student_id])
        inconsistent = [r['subject'] for r in rows if float(r.get('consistency', 0)) > 15]
        return {
            "patterns": rows,
            "inconsistent_subjects": inconsistent,
            "note": "High stddev may indicate variable engagement, test anxiety, or learning style mismatch.",
        }
    except Exception as e:
        return {"error": str(e)}


# ═══════════════════════════════════════════════════════════
# ResearchAgent Tools
# ═══════════════════════════════════════════════════════════

async def get_teaching_effectiveness(tenant_id: str) -> dict:
    query = """
        SELECT u.first_name || ' ' || u.last_name AS teacher_name, sub.name AS subject,
               COUNT(DISTINCT er.student_id) AS students_taught,
               ROUND(AVG(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS avg_student_pct,
               ROUND(STDDEV(er.marks_obtained::numeric / NULLIF(er.total_marks, 0) * 100), 1) AS result_spread
        FROM timetable_entries te
        JOIN users u ON u.id = te.teacher_id
        JOIN subjects sub ON sub.id = te.subject_id
        JOIN sections sec ON sec.id = te.section_id
        JOIN students s ON s.section_id = sec.id AND s.status = 'ACTIVE'
        JOIN exam_results er ON er.student_id = s.id
        JOIN exam_subjects es ON es.id = er.exam_subject_id AND es.subject_id = sub.id
        WHERE te.tenant_id = %s
        GROUP BY u.first_name, u.last_name, sub.name
        HAVING COUNT(DISTINCT er.student_id) >= 5
        ORDER BY avg_student_pct DESC
    """
    try:
        rows = await _run_query(query, [tenant_id])
        return {"teachers": rows, "count": len(rows)}
    except Exception as e:
        return {"error": str(e)}

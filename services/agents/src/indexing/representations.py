"""Text representation builders for embedding indexing.

Each entity type gets a builder that converts raw database rows
into semantically rich natural language text. This text is what
gets embedded in pgvector — not raw JSON or column values.
"""

from __future__ import annotations

from decimal import Decimal
from datetime import date, datetime


def build_student_representation(student: dict) -> str:
    """Build a rich text representation of a student for embedding."""
    parts = [
        f"{student.get('first_name', '')} {student.get('last_name', '')}, "
        f"Admission No: {student.get('admission_number', 'N/A')}."
    ]

    if student.get("grade_name"):
        section = f" Section {student['section_name']}" if student.get("section_name") else ""
        parts.append(f"Grade: {student['grade_name']}{section}.")

    if student.get("gender"):
        parts.append(f"Gender: {student['gender']}.")

    if student.get("date_of_birth"):
        parts.append(f"Date of Birth: {student['date_of_birth']}.")

    if student.get("status"):
        parts.append(f"Status: {student['status']}.")

    if student.get("guardian_name"):
        guardian_info = f"Guardian: {student['guardian_name']} ({student.get('guardian_relation', 'Guardian')})"
        if student.get("guardian_phone"):
            guardian_info += f", Phone: {student['guardian_phone']}"
        parts.append(guardian_info + ".")

    if student.get("total_due") is not None:
        parts.append(f"Fee Status: ₹{student['total_due']:,.2f} outstanding.")

    if student.get("attendance_rate") is not None:
        rate = student["attendance_rate"]
        flag = " (below threshold)" if rate < 85 else ""
        parts.append(f"Attendance: {rate:.1f}%{flag}.")

    if student.get("medical_notes"):
        parts.append(f"Medical: {student['medical_notes']}.")

    return " ".join(parts)


def build_invoice_representation(invoice: dict) -> str:
    """Build a rich text representation of an invoice for embedding."""
    total = invoice.get("total_amount", 0)
    paid = invoice.get("paid_amount", 0)
    outstanding = total - paid

    parts = [
        f"Invoice {invoice.get('invoice_number', 'N/A')} for "
        f"{invoice.get('student_name', 'Unknown Student')}."
    ]

    if invoice.get("grade_name"):
        parts.append(f"Grade: {invoice['grade_name']}.")

    parts.append(
        f"Amount: ₹{total:,.2f}, Paid: ₹{paid:,.2f}, "
        f"Outstanding: ₹{outstanding:,.2f}."
    )

    parts.append(f"Status: {invoice.get('status', 'UNKNOWN')}.")

    if invoice.get("due_date"):
        parts.append(f"Due: {invoice['due_date']}.")

    if invoice.get("days_overdue") and invoice["days_overdue"] > 0:
        parts.append(f"Overdue by {invoice['days_overdue']} days.")

    if invoice.get("fee_plan_name"):
        parts.append(f"Fee Plan: {invoice['fee_plan_name']}.")

    if invoice.get("description"):
        parts.append(f"Description: {invoice['description']}.")

    return " ".join(parts)


def build_attendance_summary_representation(summary: dict) -> str:
    """Build representation for a student's attendance summary."""
    parts = [
        f"Attendance for {summary.get('student_name', 'Unknown')} "
        f"({summary.get('grade_name', '')})."
    ]

    total = summary.get("total_days", 0)
    present = summary.get("present_days", 0)
    absent = summary.get("absent_days", 0)

    if total > 0:
        rate = (present / total) * 100
        parts.append(
            f"Total days: {total}, Present: {present}, Absent: {absent}. "
            f"Attendance rate: {rate:.1f}%."
        )
        if rate < 75:
            parts.append("CRITICAL: Attendance below 75% threshold.")
        elif rate < 85:
            parts.append("WARNING: Attendance below 85% threshold.")

    if summary.get("consecutive_absences") and summary["consecutive_absences"] >= 3:
        parts.append(
            f"ALERT: {summary['consecutive_absences']} consecutive absences detected."
        )

    return " ".join(parts)


def build_grade_collection_representation(grade: dict) -> str:
    """Build representation for a grade's fee collection status."""
    parts = [
        f"Grade {grade.get('grade_name', 'Unknown')}: "
        f"{grade.get('student_count', 0)} students, "
        f"{grade.get('invoice_count', 0)} invoices."
    ]

    billed = grade.get("total_billed", 0)
    collected = grade.get("total_collected", 0)
    rate = grade.get("collection_rate_percent", 0)

    parts.append(
        f"Billed: ₹{billed:,.2f}, Collected: ₹{collected:,.2f}, "
        f"Collection Rate: {rate}%."
    )

    overdue = grade.get("overdue_count", 0)
    if overdue > 0:
        parts.append(f"{overdue} overdue invoices.")

    return " ".join(parts)

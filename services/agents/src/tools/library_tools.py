"""Library tools — Book and circulation queries for LibraryAgent."""

from __future__ import annotations
from src.tools.db import _run_query


async def get_overdue_books(tenant_id: str) -> dict:
    """List all overdue book issues with student and guardian details."""
    query = """
        SELECT
            bi.id AS issue_id,
            b.title, b.author, b.isbn,
            bi.issued_at, bi.due_date,
            (CURRENT_DATE - bi.due_date::date) AS days_overdue,
            s.first_name || ' ' || s.last_name AS student_name,
            s.admission_number,
            g.name AS grade
        FROM book_issues bi
        JOIN books b ON b.id = bi.book_id
        JOIN students s ON s.id = bi.student_id
        LEFT JOIN sections sec ON sec.id = s.section_id
        LEFT JOIN grades g ON g.id = sec.grade_id
        WHERE bi.tenant_id = %s
          AND bi.returned_at IS NULL
          AND bi.due_date < CURRENT_DATE
        ORDER BY days_overdue DESC
        LIMIT 50
    """

    try:
        rows = await _run_query(query, [tenant_id])
        return {"overdue_count": len(rows), "books": rows}
    except Exception as e:
        return {"error": str(e), "books": []}


async def search_catalog(tenant_id: str, query: str) -> dict:
    """Search books by title, author, or ISBN."""
    search_term = f"%{query}%"
    sql = """
        SELECT
            b.id, b.title, b.author, b.isbn, b.category,
            b.total_copies,
            b.total_copies - COALESCE(
                (SELECT COUNT(*) FROM book_issues bi WHERE bi.book_id = b.id AND bi.returned_at IS NULL),
                0
            ) AS available_copies
        FROM books b
        WHERE b.tenant_id = %s
          AND (b.title ILIKE %s OR b.author ILIKE %s OR b.isbn ILIKE %s)
        ORDER BY b.title ASC
        LIMIT 20
    """

    try:
        rows = await _run_query(sql, [tenant_id, search_term, search_term, search_term])
        return {"results": len(rows), "books": rows}
    except Exception as e:
        return {"error": str(e), "books": []}

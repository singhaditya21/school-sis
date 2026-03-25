"""Admission-domain tool implementations.

Schema: admission_leads, admission_applications, admission_documents
"""

from __future__ import annotations
from src.tools.fee_tools import _run_query


async def get_pipeline_overview(
    tenant_id: str,
) -> dict:
    """Get admission pipeline overview — count of leads at each stage."""
    query = """
        SELECT
            stage, COUNT(*) AS count,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') AS new_this_week,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') AS new_this_month
        FROM admission_leads
        WHERE tenant_id = %s
        GROUP BY stage
        ORDER BY CASE stage
            WHEN 'NEW' THEN 1 WHEN 'CONTACTED' THEN 2
            WHEN 'FORM_SUBMITTED' THEN 3 WHEN 'DOCUMENTS_PENDING' THEN 4
            WHEN 'INTERVIEW_SCHEDULED' THEN 5 WHEN 'INTERVIEW_DONE' THEN 6
            WHEN 'OFFERED' THEN 7 WHEN 'ACCEPTED' THEN 8
            WHEN 'ENROLLED' THEN 9 WHEN 'REJECTED' THEN 10
            WHEN 'WITHDRAWN' THEN 11
        END
    """
    try:
        rows = await _run_query(query, [tenant_id])
        total = sum(r.get("count", 0) for r in rows)
        enrolled = sum(r.get("count", 0) for r in rows if r.get("stage") == "ENROLLED")
        return {
            "stages": rows,
            "total_leads": total,
            "enrolled": enrolled,
            "conversion_rate": round(enrolled / total * 100, 2) if total > 0 else 0,
        }
    except Exception as e:
        return {"error": str(e), "stages": []}


async def query_leads(
    tenant_id: str,
    stage: str | None = None,
    source: str | None = None,
    grade: str | None = None,
) -> dict:
    """Query admission leads with optional pipeline stage, source, or grade filter."""
    conditions = ["al.tenant_id = %s"]
    params: list = [tenant_id]

    if stage:
        conditions.append("al.stage = %s")
        params.append(stage)
    if source:
        conditions.append("al.source = %s")
        params.append(source)
    if grade:
        conditions.append("al.applying_for_grade = %s")
        params.append(grade)

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            al.id AS lead_id,
            al.child_first_name || ' ' || al.child_last_name AS child_name,
            al.applying_for_grade, al.stage, al.source,
            al.parent_name, al.parent_email, al.parent_phone,
            al.previous_school, al.notes,
            al.created_at, al.updated_at,
            u.first_name || ' ' || u.last_name AS assigned_to_name
        FROM admission_leads al
        LEFT JOIN users u ON al.assigned_to = u.id
        WHERE {where}
        ORDER BY al.updated_at DESC
        LIMIT 50
    """
    try:
        rows = await _run_query(query, params)
        return {"leads": rows, "total": len(rows)}
    except Exception as e:
        return {"error": str(e), "leads": []}


async def check_documents(
    tenant_id: str,
    application_id: str | None = None,
) -> dict:
    """Check document completeness for applications."""
    if application_id:
        query = """
            SELECT
                aa.application_number,
                al.child_first_name || ' ' || al.child_last_name AS child_name,
                COUNT(ad.id) AS total_documents,
                COUNT(ad.is_verified) FILTER (WHERE ad.is_verified IS NOT NULL) AS verified,
                COUNT(ad.is_verified) FILTER (WHERE ad.is_verified IS NULL) AS pending_verification,
                array_agg(json_build_object(
                    'type', ad.document_type, 'name', ad.file_name,
                    'verified', ad.is_verified IS NOT NULL
                )) AS documents
            FROM admission_applications aa
            JOIN admission_leads al ON aa.lead_id = al.id
            LEFT JOIN admission_documents ad ON ad.application_id = aa.id
            WHERE aa.id = %s AND aa.tenant_id = %s
            GROUP BY aa.application_number, al.child_first_name, al.child_last_name
        """
        rows = await _run_query(query, [application_id, tenant_id])
    else:
        query = """
            SELECT
                al.stage,
                COUNT(DISTINCT aa.id) AS applications,
                COUNT(ad.id) AS total_documents,
                COUNT(ad.is_verified) FILTER (WHERE ad.is_verified IS NOT NULL) AS verified,
                COUNT(ad.is_verified) FILTER (WHERE ad.is_verified IS NULL) AS pending
            FROM admission_applications aa
            JOIN admission_leads al ON aa.lead_id = al.id
            LEFT JOIN admission_documents ad ON ad.application_id = aa.id
            WHERE aa.tenant_id = %s AND al.stage = 'DOCUMENTS_PENDING'
            GROUP BY al.stage
        """
        rows = await _run_query(query, [tenant_id])

    return {"document_status": rows}


async def get_source_analysis(
    tenant_id: str,
) -> dict:
    """Analyse lead sources and their conversion rates."""
    query = """
        SELECT
            source,
            COUNT(*) AS total_leads,
            COUNT(*) FILTER (WHERE stage = 'ENROLLED') AS enrolled,
            COUNT(*) FILTER (WHERE stage IN ('REJECTED', 'WITHDRAWN')) AS lost,
            COUNT(*) FILTER (WHERE stage NOT IN ('ENROLLED', 'REJECTED', 'WITHDRAWN')) AS active,
            ROUND(
                COUNT(*) FILTER (WHERE stage = 'ENROLLED') * 100.0 / NULLIF(COUNT(*), 0), 2
            ) AS conversion_rate
        FROM admission_leads
        WHERE tenant_id = %s
        GROUP BY source
        ORDER BY total_leads DESC
    """
    try:
        rows = await _run_query(query, [tenant_id])
        best_source = max(rows, key=lambda r: r.get("conversion_rate", 0)) if rows else None
        return {
            "sources": rows,
            "best_converting_source": best_source.get("source") if best_source else None,
        }
    except Exception as e:
        return {"error": str(e), "sources": []}

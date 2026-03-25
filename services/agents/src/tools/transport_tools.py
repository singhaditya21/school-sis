"""Transport-domain tool implementations.

Schema: vehicles, routes, stops, student_transport
"""

from __future__ import annotations
from src.tools.fee_tools import _run_query


async def get_route_overview(
    tenant_id: str,
) -> dict:
    """Get overview of all transport routes with vehicle and student counts."""
    query = """
        SELECT
            r.id AS route_id, r.name AS route_name, r.description,
            r.morning_departure_time, r.afternoon_departure_time,
            r.monthly_fee,
            v.vehicle_number, v.type AS vehicle_type, v.capacity,
            v.driver_name, v.driver_phone,
            COUNT(DISTINCT st.student_id) AS assigned_students,
            COUNT(DISTINCT stops.id) AS total_stops,
            CASE WHEN v.capacity > 0
                THEN ROUND(COUNT(DISTINCT st.student_id) * 100.0 / v.capacity, 1)
                ELSE 0 END AS utilisation_percent
        FROM routes r
        JOIN vehicles v ON r.vehicle_id = v.id
        LEFT JOIN stops ON stops.route_id = r.id
        LEFT JOIN student_transport st ON st.route_id = r.id
            AND (st.end_date IS NULL OR st.end_date >= CURRENT_DATE::text)
        WHERE r.tenant_id = %s
        GROUP BY r.id, r.name, r.description, r.morning_departure_time,
                 r.afternoon_departure_time, r.monthly_fee,
                 v.vehicle_number, v.type, v.capacity, v.driver_name, v.driver_phone
        ORDER BY r.name
    """
    try:
        rows = await _run_query(query, [tenant_id])
        overloaded = [r for r in rows if r.get("utilisation_percent", 0) > 100]
        return {
            "routes": rows,
            "total_routes": len(rows),
            "overloaded_routes": len(overloaded),
        }
    except Exception as e:
        return {"error": str(e), "routes": []}


async def get_vehicle_compliance(
    tenant_id: str,
) -> dict:
    """Check vehicle compliance — insurance, fitness certificate expiry."""
    query = """
        SELECT
            v.vehicle_number, v.type, v.driver_name, v.driver_phone,
            v.driver_license, v.insurance_expiry, v.fitness_expiry,
            v.gps_device_id,
            CASE WHEN v.insurance_expiry IS NOT NULL
                 AND v.insurance_expiry::date < CURRENT_DATE
                 THEN true ELSE false END AS insurance_expired,
            CASE WHEN v.fitness_expiry IS NOT NULL
                 AND v.fitness_expiry::date < CURRENT_DATE
                 THEN true ELSE false END AS fitness_expired,
            CASE WHEN v.insurance_expiry IS NOT NULL
                 AND v.insurance_expiry::date < CURRENT_DATE + INTERVAL '30 days'
                 THEN true ELSE false END AS insurance_expiring_soon,
            r.name AS route_name
        FROM vehicles v
        LEFT JOIN routes r ON r.vehicle_id = v.id
        WHERE v.tenant_id = %s
        ORDER BY v.vehicle_number
    """
    try:
        rows = await _run_query(query, [tenant_id])
        expired = [r for r in rows if r.get("insurance_expired") or r.get("fitness_expired")]
        expiring = [r for r in rows if r.get("insurance_expiring_soon") and not r.get("insurance_expired")]
        no_gps = [r for r in rows if not r.get("gps_device_id")]
        return {
            "vehicles": rows,
            "total": len(rows),
            "compliance_issues": len(expired),
            "expiring_soon": len(expiring),
            "no_gps_tracking": len(no_gps),
        }
    except Exception as e:
        return {"error": str(e), "vehicles": []}


async def get_student_transport_info(
    tenant_id: str,
    student_id: str | None = None,
    route_id: str | None = None,
) -> dict:
    """Get transport assignments — which student is on which route/stop."""
    conditions = ["st.tenant_id = %s"]
    params: list = [tenant_id]
    if student_id:
        conditions.append("st.student_id = %s")
        params.append(student_id)
    if route_id:
        conditions.append("st.route_id = %s")
        params.append(route_id)

    where = " AND ".join(conditions)

    query = f"""
        SELECT
            s.first_name || ' ' || s.last_name AS student_name,
            s.admission_number,
            g.name AS grade_name,
            r.name AS route_name,
            stops.name AS stop_name, stops.pickup_time, stops.drop_time,
            v.vehicle_number, v.driver_name, v.driver_phone,
            st.start_date, st.end_date
        FROM student_transport st
        JOIN students s ON st.student_id = s.id
        JOIN grades g ON s.grade_id = g.id
        JOIN routes r ON st.route_id = r.id
        JOIN stops ON st.stop_id = stops.id
        JOIN vehicles v ON r.vehicle_id = v.id
        WHERE {where}
          AND (st.end_date IS NULL OR st.end_date >= CURRENT_DATE::text)
        ORDER BY r.name, stops.display_order
    """
    try:
        rows = await _run_query(query, params)
        return {"assignments": rows, "total": len(rows)}
    except Exception as e:
        return {"error": str(e), "assignments": []}

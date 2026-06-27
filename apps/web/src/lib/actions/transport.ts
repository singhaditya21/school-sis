'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export interface VehicleItem {
    id: string;
    vehicleNumber: string;
    type: string;
    capacity: number;
    driverName: string;
    driverPhone: string;
    routeCount: number;
}

export interface RouteItem {
    id: string;
    name: string;
    vehicleNumber: string;
    morningDepartureTime: string | null;
    afternoonDepartureTime: string | null;
    monthlyFee: string | null;
    stopCount: number;
    studentCount: number;
}

export interface RouteDetail {
    route: RouteItem;
    stops: StopItem[];
}

export interface StopItem {
    id: string;
    name: string;
    address: string | null;
    latitude: string | null;
    longitude: string | null;
    pickupTime: string | null;
    dropTime: string | null;
    displayOrder: number;
}

export async function getVehicles(): Promise<VehicleItem[]> {
    const { tenantId } = await requireAuth('transport:read');

    const { rows: vehiclesRows } = await pool.query(`
        SELECT id, vehicle_number AS "vehicleNumber", type, capacity, driver_name AS "driverName", driver_phone AS "driverPhone"
        FROM vehicles
        WHERE tenant_id = $1
    `, [tenantId]);

    const result: VehicleItem[] = [];
    for (const v of vehiclesRows) {
        const { rows: countRows } = await pool.query(`
            SELECT count(*)
            FROM routes
            WHERE vehicle_id = $1
        `, [v.id]);

        result.push({ ...v, routeCount: Number(countRows[0].count) });
    }

    return result;
}

export async function getRoutes(): Promise<RouteItem[]> {
    const { tenantId } = await requireAuth('transport:read');

    const { rows: routeRows } = await pool.query(`
        SELECT r.id, r.name, v.vehicle_number AS "vehicleNumber",
               r.morning_departure_time AS "morningDepartureTime",
               r.afternoon_departure_time AS "afternoonDepartureTime",
               r.monthly_fee AS "monthlyFee"
        FROM routes r
        INNER JOIN vehicles v ON r.vehicle_id = v.id
        WHERE r.tenant_id = $1
    `, [tenantId]);

    const result: RouteItem[] = [];
    for (const r of routeRows) {
        const { rows: stopCountRows } = await pool.query(`
            SELECT count(*)
            FROM stops
            WHERE route_id = $1
        `, [r.id]);

        const { rows: studentCountRows } = await pool.query(`
            SELECT count(*)
            FROM student_transport
            WHERE route_id = $1
        `, [r.id]);

        result.push({
            ...r,
            stopCount: Number(stopCountRows[0].count),
            studentCount: Number(studentCountRows[0].count),
        });
    }

    return result;
}

export async function getRouteDetail(routeId: string): Promise<RouteDetail | null> {
    const { tenantId } = await requireAuth('transport:read');

    const { rows: routeRows } = await pool.query(`
        SELECT r.id, r.name, v.vehicle_number AS "vehicleNumber",
               r.morning_departure_time AS "morningDepartureTime",
               r.afternoon_departure_time AS "afternoonDepartureTime",
               r.monthly_fee AS "monthlyFee"
        FROM routes r
        INNER JOIN vehicles v ON r.vehicle_id = v.id
        WHERE r.id = $1 AND r.tenant_id = $2
    `, [routeId, tenantId]);

    if (routeRows.length === 0) return null;

    const { rows: stopRows } = await pool.query(`
        SELECT id, name, address, latitude, longitude,
               pickup_time AS "pickupTime", drop_time AS "dropTime",
               display_order AS "displayOrder"
        FROM stops
        WHERE route_id = $1
        ORDER BY display_order ASC
    `, [routeId]);

    const { rows: stopCountRows } = await pool.query(`
        SELECT count(*)
        FROM stops
        WHERE route_id = $1
    `, [routeId]);

    const { rows: studentCountRows } = await pool.query(`
        SELECT count(*)
        FROM student_transport
        WHERE route_id = $1
    `, [routeId]);

    return {
        route: {
            ...routeRows[0],
            stopCount: Number(stopCountRows[0].count),
            studentCount: Number(studentCountRows[0].count),
        },
        stops: stopRows,
    };
}

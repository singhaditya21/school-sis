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

export async function getParentRoutes(): Promise<RouteItem[]> {
    const { tenantId, userId } = await requireAuth('transport:read:own');

    // Get routes assigned to students belonging to the logged-in parent
    const { rows: routeRows } = await pool.query(`
        SELECT DISTINCT r.id, r.name, v.vehicle_number AS "vehicleNumber",
               r.morning_departure_time AS "morningDepartureTime",
               r.afternoon_departure_time AS "afternoonDepartureTime",
               r.monthly_fee AS "monthlyFee"
        FROM student_transport st
        INNER JOIN routes r ON st.route_id = r.id
        INNER JOIN vehicles v ON r.vehicle_id = v.id
        INNER JOIN guardians g ON g.student_id = st.student_id
        WHERE st.tenant_id = $1 AND g.user_id = $2
    `, [tenantId, userId]);

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

export async function createRouteAction(data: {
    name: string;
    routeNumber: string;
    startPoint: string;
    endPoint: string;
    vehicleNumber: string;
    driverName: string;
    driverPhone: string;
    monthlyFee?: string;
}) {
    const { tenantId } = await requireAuth('transport:write');

    // 1. Basic validation
    if (!data.name || !data.routeNumber || !data.startPoint || !data.endPoint || !data.vehicleNumber || !data.driverName || !data.driverPhone) {
        throw new Error('All fields are required');
    }

    // 2. Validate phone number format (only digits, +, -, spaces)
    const phoneRegex = /^[0-9+\-\s]+$/;
    if (!phoneRegex.test(data.driverPhone)) {
        throw new Error('Invalid phone format');
    }

    // 3. Find or create vehicle
    let vehicleId: string;
    const { rows: vehicleRows } = await pool.query(
        `SELECT id FROM vehicles WHERE vehicle_number = $1 AND tenant_id = $2 LIMIT 1`,
        [data.vehicleNumber, tenantId]
    );

    if (vehicleRows.length > 0) {
        vehicleId = vehicleRows[0].id;
    } else {
        const { rows: newVehicleRows } = await pool.query(
            `INSERT INTO vehicles (tenant_id, vehicle_number, type, capacity, driver_name, driver_phone)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [tenantId, data.vehicleNumber, 'Bus', 40, data.driverName, data.driverPhone]
        );
        vehicleId = newVehicleRows[0].id;
    }

    // 4. Insert route
    const monthlyFee = data.monthlyFee ? parseFloat(data.monthlyFee) : 0;
    const { rows: routeRows } = await pool.query(
        `INSERT INTO routes (tenant_id, vehicle_id, name, description, monthly_fee, morning_departure_time, afternoon_departure_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [tenantId, vehicleId, data.name, `Route Number: ${data.routeNumber}`, monthlyFee, '07:00', '15:00']
    );
    const routeId = routeRows[0].id;

    // 5. Insert stops
    await pool.query(
        `INSERT INTO stops (route_id, name, display_order)
         VALUES ($1, $2, $3)`,
        [routeId, data.startPoint, 1]
    );

    await pool.query(
        `INSERT INTO stops (route_id, name, display_order)
         VALUES ($1, $2, $3)`,
        [routeId, data.endPoint, 2]
    );

    return { success: true, routeId };
}

export async function assignStudentToRoute(data: {
    studentId: string;
    routeId: string;
    stopId: string;
    startDate: string;
    endDate?: string;
}) {
    const { tenantId } = await requireAuth('transport:write');

    // 1. Check if route exists
    const routeRes = await pool.query(
        `SELECT id, monthly_fee FROM routes WHERE id = $1 AND tenant_id = $2`,
        [data.routeId, tenantId]
    );
    const route = routeRes.rows[0];
    if (!route) {
        throw new Error('Route not found');
    }

    // 2. Insert into student_transport
    const { rows: stRows } = await pool.query(
        `INSERT INTO student_transport (tenant_id, student_id, route_id, stop_id, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [tenantId, data.studentId, data.routeId, data.stopId, data.startDate, data.endDate || null]
    );

    // 3. E2E-COM-302: Student Transport route assignment integrates transport fee.
    // Fetch the first active fee plan for the tenant
    const fpRes = await pool.query(
        `SELECT id FROM fee_plans WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
    );
    const feePlanId = fpRes.rows[0]?.id;

    if (feePlanId && route.monthly_fee) {
        const monthlyFee = parseFloat(route.monthly_fee);
        if (monthlyFee > 0) {
            const invoiceNo = `INV-TR-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
            await pool.query(
                `INSERT INTO invoices (tenant_id, student_id, fee_plan_id, invoice_number, total_amount, paid_amount, due_date, status, description)
                 VALUES ($1, $2, $3, $4, $5, '0', $6, 'PENDING', $7)`,
                [tenantId, data.studentId, feePlanId, invoiceNo, monthlyFee, '2026-07-01', 'Transport Fee']
            );
        }
    }

    return { success: true, studentTransportId: stRows[0].id };
}


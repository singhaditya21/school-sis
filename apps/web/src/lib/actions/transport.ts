'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

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

export async function getRoutes(): Promise<RouteItem[]> {
    const { tenantId } = await requireAuth('transport:read');

    const routeRows = await sql<{
        id: string;
        name: string;
        vehicleNumber: string;
        morningDepartureTime: string | null;
        afternoonDepartureTime: string | null;
        monthlyFee: string | null;
    }>`
        SELECT r.id, r.name, v.vehicle_number AS "vehicleNumber",
               r.morning_departure_time AS "morningDepartureTime",
               r.afternoon_departure_time AS "afternoonDepartureTime",
               r.monthly_fee AS "monthlyFee"
        FROM routes r
        INNER JOIN vehicles v ON r.vehicle_id = v.id
        WHERE r.tenant_id = ${tenantId}
    `;

    const result: RouteItem[] = [];
    for (const r of routeRows) {
        const [stopCountRow, studentCountRow] = await Promise.all([
            sql<{ count: string }>`SELECT count(*) FROM stops WHERE route_id = ${r.id}`.one(),
            sql<{ count: string }>`SELECT count(*) FROM student_transport WHERE route_id = ${r.id}`.one(),
        ]);

        result.push({
            ...r,
            stopCount: Number(stopCountRow.count),
            studentCount: Number(studentCountRow.count),
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

    if (!data.name || !data.routeNumber || !data.startPoint || !data.endPoint || !data.vehicleNumber || !data.driverName || !data.driverPhone) {
        throw new Error('All fields are required');
    }

    const phoneRegex = /^[0-9+\-\s]+$/;
    if (!phoneRegex.test(data.driverPhone)) {
        throw new Error('Invalid phone format');
    }

    const existingVehicle = await sql<{ id: string }>`
        SELECT id FROM vehicles WHERE vehicle_number = ${data.vehicleNumber} AND tenant_id = ${tenantId} LIMIT 1
    `.maybeOne();

    let vehicleId: string;
    if (existingVehicle) {
        vehicleId = existingVehicle.id;
    } else {
        const newVehicle = await sql<{ id: string }>`
            INSERT INTO vehicles (tenant_id, vehicle_number, type, capacity, driver_name, driver_phone)
            VALUES (${tenantId}, ${data.vehicleNumber}, 'Bus', ${40}, ${data.driverName}, ${data.driverPhone})
            RETURNING id
        `.one();
        vehicleId = newVehicle.id;
    }

    const monthlyFee = data.monthlyFee ? parseFloat(data.monthlyFee) : 0;
    const description = `Route Number: ${data.routeNumber}`;
    const createdRoute = await sql<{ id: string }>`
        INSERT INTO routes (tenant_id, vehicle_id, name, description, monthly_fee, morning_departure_time, afternoon_departure_time)
        VALUES (${tenantId}, ${vehicleId}, ${data.name}, ${description}, ${monthlyFee}, '07:00', '15:00')
        RETURNING id
    `.one();
    const routeId = createdRoute.id;

    await sql`
        INSERT INTO stops (route_id, name, display_order)
        VALUES (${routeId}, ${data.startPoint}, ${1})
    `.execute();

    await sql`
        INSERT INTO stops (route_id, name, display_order)
        VALUES (${routeId}, ${data.endPoint}, ${2})
    `.execute();

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

    const route = await sql<{ id: string; monthly_fee: string | null }>`
        SELECT id, monthly_fee FROM routes WHERE id = ${data.routeId} AND tenant_id = ${tenantId}
    `.maybeOne();
    if (!route) {
        throw new Error('Route not found');
    }

    const stRow = await sql<{ id: string }>`
        INSERT INTO student_transport (tenant_id, student_id, route_id, stop_id, start_date, end_date)
        VALUES (${tenantId}, ${data.studentId}, ${data.routeId}, ${data.stopId}, ${data.startDate}, ${data.endDate || null})
        RETURNING id
    `.one();

    // E2E-COM-302: Student Transport route assignment integrates transport fee.
    const feePlan = await sql<{ id: string }>`
        SELECT id FROM fee_plans WHERE tenant_id = ${tenantId} LIMIT 1
    `.maybeOne();

    if (feePlan?.id && route.monthly_fee) {
        const monthlyFee = parseFloat(route.monthly_fee);
        if (monthlyFee > 0) {
            const invoiceNo = `INV-TR-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 100)}`;
            await sql`
                INSERT INTO invoices (tenant_id, student_id, fee_plan_id, invoice_number, total_amount, paid_amount, due_date, status, description)
                VALUES (${tenantId}, ${data.studentId}, ${feePlan.id}, ${invoiceNo}, ${monthlyFee}, '0', '2026-07-01', 'PENDING', 'Transport Fee')
            `.execute();
        }
    }

    return { success: true, studentTransportId: stRow.id };
}


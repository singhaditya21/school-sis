'use server';

import { db } from '@/lib/db';
import { vehicles, routes, stops, studentTransport, students, grades, sections } from '@/lib/db/schema';
import { eq, and, count, asc } from 'drizzle-orm';
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

    const rows = await db
        .select({
            id: vehicles.id,
            vehicleNumber: vehicles.vehicleNumber,
            type: vehicles.type,
            capacity: vehicles.capacity,
            driverName: vehicles.driverName,
            driverPhone: vehicles.driverPhone,
        })
        .from(vehicles)
        .where(eq(vehicles.tenantId, tenantId));

    const result: VehicleItem[] = [];
    for (const v of rows) {
        const [routeCount] = await db
            .select({ count: count() })
            .from(routes)
            .where(eq(routes.vehicleId, v.id));

        result.push({ ...v, routeCount: routeCount.count });
    }

    return result;
}

export async function getRoutes(): Promise<RouteItem[]> {
    const { tenantId } = await requireAuth('transport:read');

    const rows = await db
        .select({
            id: routes.id,
            name: routes.name,
            vehicleNumber: vehicles.vehicleNumber,
            morningDepartureTime: routes.morningDepartureTime,
            afternoonDepartureTime: routes.afternoonDepartureTime,
            monthlyFee: routes.monthlyFee,
        })
        .from(routes)
        .innerJoin(vehicles, eq(routes.vehicleId, vehicles.id))
        .where(eq(routes.tenantId, tenantId));

    const result: RouteItem[] = [];
    for (const r of rows) {
        const [stopCount] = await db
            .select({ count: count() })
            .from(stops)
            .where(eq(stops.routeId, r.id));

        const [studentCount] = await db
            .select({ count: count() })
            .from(studentTransport)
            .where(eq(studentTransport.routeId, r.id));

        result.push({
            ...r,
            stopCount: stopCount.count,
            studentCount: studentCount.count,
        });
    }

    return result;
}

export async function getRouteDetail(routeId: string): Promise<RouteDetail | null> {
    const { tenantId } = await requireAuth('transport:read');

    const routeRows = await db
        .select({
            id: routes.id,
            name: routes.name,
            vehicleNumber: vehicles.vehicleNumber,
            morningDepartureTime: routes.morningDepartureTime,
            afternoonDepartureTime: routes.afternoonDepartureTime,
            monthlyFee: routes.monthlyFee,
        })
        .from(routes)
        .innerJoin(vehicles, eq(routes.vehicleId, vehicles.id))
        .where(and(eq(routes.id, routeId), eq(routes.tenantId, tenantId)));

    if (routeRows.length === 0) return null;

    const stopRows = await db
        .select({
            id: stops.id,
            name: stops.name,
            address: stops.address,
            latitude: stops.latitude,
            longitude: stops.longitude,
            pickupTime: stops.pickupTime,
            dropTime: stops.dropTime,
            displayOrder: stops.displayOrder,
        })
        .from(stops)
        .where(eq(stops.routeId, routeId))
        .orderBy(asc(stops.displayOrder));

    const [stopCount] = await db
        .select({ count: count() })
        .from(stops)
        .where(eq(stops.routeId, routeId));

    const [studentCount] = await db
        .select({ count: count() })
        .from(studentTransport)
        .where(eq(studentTransport.routeId, routeId));

    return {
        route: {
            ...routeRows[0],
            stopCount: stopCount.count,
            studentCount: studentCount.count,
        },
        stops: stopRows,
    };
}

'use server';

import { db } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { routes, vehicles, liveGpsPings } from '@/lib/db/schema/transport';

export async function getRoutes(tenantId: string) {
    const list = await db.select({
        id: routes.id,
        name: routes.name,
        description: routes.description,
        morningDepartureTime: routes.morningDepartureTime,
        afternoonDepartureTime: routes.afternoonDepartureTime,
        monthlyFee: routes.monthlyFee,
        vehicleNumber: vehicles.vehicleNumber,
        driverName: vehicles.driverName,
        driverPhone: vehicles.driverPhone,
    })
    .from(routes)
    .leftJoin(vehicles, eq(routes.vehicleId, vehicles.id))
    .where(eq(routes.tenantId, tenantId))
    .execute();
    return list;
}

export async function createRoute(tenantId: string, data: any) {
    let vehicleId = data.vehicleId;
    if (!vehicleId) {
        const existingVehicles = await db.select().from(vehicles).where(eq(vehicles.tenantId, tenantId)).limit(1).execute();
        if (existingVehicles.length > 0) {
            vehicleId = existingVehicles[0].id;
        } else {
            const [newVehicle] = await db.insert(vehicles).values({
                tenantId,
                vehicleNumber: 'KA-01-MC-1234',
                type: 'Bus',
                capacity: 40,
                driverName: 'John Doe',
                driverPhone: '9876543210',
            }).returning().execute();
            vehicleId = newVehicle.id;
        }
    }

    const [newRoute] = await db.insert(routes).values({
        tenantId,
        vehicleId,
        name: data.name,
        description: data.description,
        morningDepartureTime: data.morningDepartureTime || '07:30',
        afternoonDepartureTime: data.afternoonDepartureTime || '15:30',
        monthlyFee: data.monthlyFee ? String(data.monthlyFee) : '0',
    }).returning().execute();

    return newRoute;
}

let gpsSimCounter = 0;

export async function getGPSPing(tenantId: string, vehicleId: string) {
    const pings = await db.select()
        .from(liveGpsPings)
        .where(and(eq(liveGpsPings.tenantId, tenantId), eq(liveGpsPings.vehicleId, vehicleId)))
        .orderBy(desc(liveGpsPings.pingTime))
        .limit(1)
        .execute();

    if (pings.length > 0) {
        return {
            latitude: Number(pings[0].latitude),
            longitude: Number(pings[0].longitude),
            speedKmh: pings[0].speedKmh ? Number(pings[0].speedKmh) : null,
            pingTime: pings[0].pingTime,
        };
    }

    const baseLat = 12.9716;
    const baseLng = 77.5946;
    gpsSimCounter++;
    
    const latOffset = 0.001 * Math.sin(gpsSimCounter * 0.5);
    const lngOffset = 0.001 * Math.cos(gpsSimCounter * 0.5);

    return {
        latitude: baseLat + latOffset,
        longitude: baseLng + lngOffset,
        speedKmh: 45.0,
        pingTime: new Date(),
    };
}

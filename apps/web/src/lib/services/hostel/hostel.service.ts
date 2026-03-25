// Hostel Management Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface Hostel { id: string; name: string; type: 'boys'|'girls'; warden: string; totalRooms: number; occupiedRooms: number; capacity: number; currentOccupancy: number; }
export interface HostelRoom { id: string; hostelId: string; roomNumber: string; floor: number; capacity: number; occupants: number; type: 'single'|'double'|'dormitory'; status: 'available'|'occupied'|'maintenance'; }

export const HostelService = {
    async getHostels(tenantId: string): Promise<Hostel[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT h.id,h.name,h.type,u.first_name||' '||u.last_name AS warden,(SELECT COUNT(*) FROM hostel_rooms WHERE hostel_id=h.id) AS "totalRooms",(SELECT COUNT(*) FROM hostel_rooms WHERE hostel_id=h.id AND status='occupied') AS "occupiedRooms",h.capacity,(SELECT COUNT(*) FROM hostel_allocations WHERE hostel_id=h.id AND is_active=true) AS "currentOccupancy" FROM hostels h LEFT JOIN users u ON u.id=h.warden_id WHERE h.tenant_id=${tenantId} ORDER BY h.name`);
        return rows as Hostel[];
    },
    async getRooms(tenantId: string, hostelId: string): Promise<HostelRoom[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT hr.id,hr.hostel_id AS "hostelId",hr.room_number AS "roomNumber",hr.floor,hr.capacity,(SELECT COUNT(*) FROM hostel_allocations WHERE room_id=hr.id AND is_active=true) AS occupants,hr.type,hr.status FROM hostel_rooms hr WHERE hr.hostel_id=${hostelId} AND hr.tenant_id=${tenantId} ORDER BY hr.floor,hr.room_number`);
        return rows as HostelRoom[];
    },
    async getStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT (SELECT COUNT(*) FROM hostels WHERE tenant_id=${tenantId}) AS "totalHostels",(SELECT COUNT(*) FROM hostel_rooms WHERE tenant_id=${tenantId}) AS "totalRooms",(SELECT COUNT(*) FROM hostel_allocations WHERE tenant_id=${tenantId} AND is_active=true) AS "totalOccupants",(SELECT COUNT(*) FROM hostel_rooms WHERE tenant_id=${tenantId} AND status='maintenance') AS "underMaintenance"`) as any[];
        return { totalHostels: Number(s?.totalHostels||0), totalRooms: Number(s?.totalRooms||0), totalOccupants: Number(s?.totalOccupants||0), underMaintenance: Number(s?.underMaintenance||0) };
    },
};

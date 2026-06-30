import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface Alumni { 
    id: string; 
    name: string; 
    graduationYear: number | null; 
    email: string; 
    phone: string | null; 
    currentOrg: string | null; 
    designation: string | null; 
    city: string | null; 
    isActive: boolean; 
    donationAmount: number; 
}

export const AlumniService = {
    async getAlumni(tenantId: string, filters?: { year?: number; search?: string }): Promise<Alumni[]> {
        const rows = await db.execute(sql`
            SELECT 
                id, 
                name, 
                graduation_year AS "graduationYear", 
                email, 
                phone, 
                current_company AS "currentOrg", 
                designation, 
                location AS "city", 
                is_verified AS "isActive",
                0 AS "donationAmount"
            FROM alumni_profiles 
            WHERE tenant_id = ${tenantId} 
            ${filters?.year ? sql`AND graduation_year = ${filters.year}` : sql``} 
            ${filters?.search ? sql`AND name ILIKE ${'%' + filters.search + '%'}` : sql``} 
            ORDER BY graduation_year DESC, name LIMIT 200
        `);
        return rows as unknown as Alumni[];
    },

    async getStats(tenantId: string) {
        const [s] = await db.execute(sql`
            SELECT 
                COUNT(*) AS total, 
                COUNT(*) FILTER(WHERE is_verified = true) AS active, 
                0 AS "totalDonations", 
                COUNT(DISTINCT graduation_year) AS batches 
            FROM alumni_profiles 
            WHERE tenant_id = ${tenantId}
        `) as any[];
        return { 
            totalAlumni: Number(s?.total || 0), 
            activeAlumni: Number(s?.active || 0), 
            totalDonations: Number(s?.totalDonations || 0), 
            batches: Number(s?.batches || 0) 
        };
    },
};

// Alumni Management Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface Alumni { id: string; name: string; graduationYear: number; email: string; phone: string; currentOrg: string; designation: string; city: string; isActive: boolean; donationAmount: number; }

export const AlumniService = {
    async getAlumni(tenantId: string, filters?: { year?: number; search?: string }): Promise<Alumni[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT a.id,a.first_name||' '||a.last_name AS name,a.graduation_year AS "graduationYear",a.email,a.phone,a.current_org AS "currentOrg",a.designation,a.city,a.is_active AS "isActive",COALESCE(a.donation_amount,0) AS "donationAmount" FROM alumni a WHERE a.tenant_id=${tenantId} ${filters?.year?sql`AND a.graduation_year=${filters.year}`:sql``} ${filters?.search?sql`AND (a.first_name||' '||a.last_name) ILIKE ${'%'+filters.search+'%'}`:sql``} ORDER BY a.graduation_year DESC,a.first_name LIMIT 200`);
        return rows as Alumni[];
    },
    async getStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE is_active=true) AS active,SUM(COALESCE(donation_amount,0)) AS "totalDonations",COUNT(DISTINCT graduation_year) AS batches FROM alumni WHERE tenant_id=${tenantId}`) as any[];
        return { totalAlumni: Number(s?.total||0), activeAlumni: Number(s?.active||0), totalDonations: Number(s?.totalDonations||0), batches: Number(s?.batches||0) };
    },
};

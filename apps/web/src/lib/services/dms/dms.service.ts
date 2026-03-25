// Document Management Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface Document { id: string; name: string; type: string; category: string; size: number; uploadedBy: string; uploadedAt: string; tags: string[]; url: string; }

export const DMSService = {
    async getDocuments(tenantId: string, filters?: { category?: string; search?: string }): Promise<Document[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT d.id,d.name,d.mime_type AS type,d.category,d.size,u.first_name||' '||u.last_name AS "uploadedBy",d.created_at AS "uploadedAt",d.tags,d.url FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.tenant_id=${tenantId} ${filters?.category?sql`AND d.category=${filters.category}`:sql``} ${filters?.search?sql`AND d.name ILIKE ${'%'+filters.search+'%'}`:sql``} ORDER BY d.created_at DESC LIMIT 100`);
        return rows as Document[];
    },
    async getStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT COUNT(*) AS total,SUM(size) AS "totalSize",COUNT(DISTINCT category) AS categories FROM documents WHERE tenant_id=${tenantId}`) as any[];
        return { totalDocuments: Number(s?.total||0), totalSize: Number(s?.totalSize||0), categories: Number(s?.categories||0) };
    },
    getCategories(): string[] { return ['Academic','Administrative','Financial','HR','Compliance','Student Records','Circulars','Reports']; },
};

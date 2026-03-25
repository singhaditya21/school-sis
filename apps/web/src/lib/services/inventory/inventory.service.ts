// Inventory Management Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export interface InventoryItem { id: string; name: string; category: string; quantity: number; unit: string; minStock: number; location: string; lastRestocked: string; status: 'in_stock'|'low_stock'|'out_of_stock'; unitPrice: number; }

export const InventoryService = {
    async getItems(tenantId: string, filters?: { category?: string; status?: string }): Promise<InventoryItem[]> {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT id,name,category,quantity,unit,min_stock AS "minStock",location,last_restocked AS "lastRestocked",CASE WHEN quantity=0 THEN 'out_of_stock' WHEN quantity<=min_stock THEN 'low_stock' ELSE 'in_stock' END AS status,unit_price AS "unitPrice" FROM inventory_items WHERE tenant_id=${tenantId} ${filters?.category?sql`AND category=${filters.category}`:sql``} ${filters?.status==='low_stock'?sql`AND quantity<=min_stock AND quantity>0`:sql``} ${filters?.status==='out_of_stock'?sql`AND quantity=0`:sql``} ORDER BY name LIMIT 200`);
        return rows as InventoryItem[];
    },
    async getStats(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE quantity<=min_stock AND quantity>0) AS "lowStock",COUNT(*) FILTER(WHERE quantity=0) AS "outOfStock",SUM(quantity*unit_price) AS "totalValue" FROM inventory_items WHERE tenant_id=${tenantId}`) as any[];
        return { totalItems: Number(s?.total||0), lowStock: Number(s?.lowStock||0), outOfStock: Number(s?.outOfStock||0), totalValue: Number(s?.totalValue||0) };
    },
    getCategories(): string[] { return ['Stationery','Cleaning','Sports','Lab Equipment','Furniture','Electronics','Books','Kitchen','Maintenance']; },
};

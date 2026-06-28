import { db } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { assets, consumables, stockAlerts } from '@/lib/db/schema/inventory';

export interface InventoryItem { 
    id: string; 
    name: string; 
    category: string; 
    quantity: number; 
    unit: string; 
    minStock: number; 
    location: string; 
    lastRestocked: string; 
    status: 'in_stock' | 'low_stock' | 'out_of_stock'; 
    unitPrice: number; 
}

export async function getAssets(tenantId: string) {
    const rows = await db.select().from(assets).where(eq(assets.tenantId, tenantId)).execute();
    return rows.map(r => ({
        ...r,
        purchasePrice: r.purchasePrice ? Number(r.purchasePrice) : 0,
    }));
}

export async function getConsumables(tenantId: string) {
    const rows = await db.select().from(consumables).where(eq(consumables.tenantId, tenantId)).execute();
    return rows.map(r => ({
        ...r,
        unitPrice: r.unitPrice ? Number(r.unitPrice) : 0,
    }));
}

export async function getStockAlerts(tenantId: string) {
    return await db.select().from(stockAlerts).where(eq(stockAlerts.tenantId, tenantId)).execute();
}

export const InventoryService = {
    async getItems(tenantId: string, filters?: { category?: string; status?: string }): Promise<InventoryItem[]> {
        const rows = await getConsumables(tenantId);
        return rows.map(r => {
            let status: 'in_stock' | 'low_stock' | 'out_of_stock' = 'in_stock';
            if (r.currentStock === 0) {
                status = 'out_of_stock';
            } else if (r.currentStock <= r.minimumStock) {
                status = 'low_stock';
            }
            return {
                id: r.id,
                name: r.name,
                category: r.category,
                quantity: r.currentStock,
                unit: r.unit,
                minStock: r.minimumStock,
                location: '',
                lastRestocked: r.lastRestockDate || '',
                status,
                unitPrice: r.unitPrice,
            };
        });
    },
    async getStats(tenantId: string) {
        const rows = await getConsumables(tenantId);
        const total = rows.length;
        const lowStock = rows.filter(r => r.currentStock <= r.minimumStock && r.currentStock > 0).length;
        const outOfStock = rows.filter(r => r.currentStock === 0).length;
        const totalValue = rows.reduce((sum, r) => sum + r.currentStock * r.unitPrice, 0);
        return {
            totalItems: total,
            lowStock,
            outOfStock,
            totalValue,
        };
    },
    getCategories(): string[] { 
        return ['STATIONERY', 'CLEANING', 'SPORTS', 'LAB_SUPPLIES', 'FIRST_AID', 'OFFICE', 'FURNITURE', 'IT_EQUIPMENT', 'LAB_EQUIPMENT', 'AUDIO_VISUAL', 'OTHER']; 
    },
};

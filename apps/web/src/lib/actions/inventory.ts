'use server';

import { db } from '@/lib/db';
import { assets, consumables, stockAlerts } from '@/lib/db/schema';
import { eq, and, count, sql, asc, desc, lte } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Assets ──────────────────────────────────────────────

export async function getAssets(category?: string) {
    const { tenantId } = await requireAuth('inventory:read');

    const conditions = [eq(assets.tenantId, tenantId)];
    if (category) conditions.push(eq(assets.category, category as any));

    return db.select().from(assets).where(and(...conditions)).orderBy(asc(assets.name));
}

// ─── Add Asset ───────────────────────────────────────────────

export async function addAsset(data: {
    name: string;
    category: string;
    serialNumber?: string;
    purchaseDate?: string;
    purchasePrice?: string;
    vendor?: string;
    location?: string;
    condition?: string;
    warrantyExpiry?: string;
}) {
    const { tenantId } = await requireAuth('inventory:write');

    const [asset] = await db.insert(assets).values({
        tenantId,
        name: data.name,
        category: data.category as any,
        serialNumber: data.serialNumber,
        purchaseDate: data.purchaseDate,
        purchasePrice: data.purchasePrice,
        vendor: data.vendor,
        location: data.location,
        condition: (data.condition || 'GOOD') as any,
        warrantyExpiry: data.warrantyExpiry,
    }).returning();

    return { success: true, asset };
}

// ─── Get Consumables ─────────────────────────────────────────

export async function getConsumables(category?: string) {
    const { tenantId } = await requireAuth('inventory:read');

    const conditions = [eq(consumables.tenantId, tenantId)];
    if (category) conditions.push(eq(consumables.category, category as any));

    return db.select().from(consumables).where(and(...conditions)).orderBy(asc(consumables.name));
}

// ─── Add Consumable ──────────────────────────────────────────

export async function addConsumable(data: {
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    minimumStock: number;
    reorderLevel: number;
    unitPrice?: string;
    supplier?: string;
}) {
    const { tenantId } = await requireAuth('inventory:write');

    const [item] = await db.insert(consumables).values({
        tenantId,
        name: data.name,
        category: data.category as any,
        unit: data.unit,
        currentStock: data.currentStock,
        minimumStock: data.minimumStock,
        reorderLevel: data.reorderLevel,
        unitPrice: data.unitPrice,
        supplier: data.supplier,
    }).returning();

    return { success: true, item };
}

// ─── Restock Consumable ──────────────────────────────────────

export async function restockConsumable(consumableId: string, quantity: number) {
    const { tenantId } = await requireAuth('inventory:write');

    await db.update(consumables)
        .set({
            currentStock: sql`${consumables.currentStock} + ${quantity}`,
            lastRestockDate: new Date().toISOString().split('T')[0],
            updatedAt: new Date(),
        })
        .where(and(eq(consumables.id, consumableId), eq(consumables.tenantId, tenantId)));

    // Resolve any low-stock alerts for this item
    await db.update(stockAlerts)
        .set({ isResolved: true, resolvedAt: new Date() })
        .where(and(
            eq(stockAlerts.itemId, consumableId),
            eq(stockAlerts.tenantId, tenantId),
            eq(stockAlerts.isResolved, false),
        ));

    return { success: true };
}

// ─── Get Stock Alerts ────────────────────────────────────────

export async function getStockAlerts(resolved?: boolean) {
    const { tenantId } = await requireAuth('inventory:read');

    const conditions = [eq(stockAlerts.tenantId, tenantId)];
    if (resolved !== undefined) conditions.push(eq(stockAlerts.isResolved, resolved));

    return db.select().from(stockAlerts).where(and(...conditions)).orderBy(desc(stockAlerts.createdAt));
}

// ─── Generate Stock Alerts ───────────────────────────────────

export async function generateStockAlerts() {
    const { tenantId } = await requireAuth('inventory:write');

    const items = await db.select().from(consumables).where(eq(consumables.tenantId, tenantId));

    const alerts: { itemId: string; alertType: string; severity: string; message: string }[] = [];

    for (const item of items) {
        if (item.currentStock === 0) {
            alerts.push({
                itemId: item.id,
                alertType: 'OUT_OF_STOCK',
                severity: 'CRITICAL',
                message: `${item.name} is out of stock!`,
            });
        } else if (item.currentStock <= item.minimumStock) {
            alerts.push({
                itemId: item.id,
                alertType: 'LOW_STOCK',
                severity: 'WARNING',
                message: `${item.name} is low (${item.currentStock} ${item.unit} remaining, minimum: ${item.minimumStock})`,
            });
        }
    }

    // Insert new alerts (skip if already exists and unresolved)
    for (const alert of alerts) {
        const existing = await db.select().from(stockAlerts)
            .where(and(
                eq(stockAlerts.itemId, alert.itemId),
                eq(stockAlerts.tenantId, tenantId),
                eq(stockAlerts.isResolved, false),
            )).limit(1);

        if (existing.length === 0) {
            await db.insert(stockAlerts).values({
                tenantId,
                itemId: alert.itemId,
                itemType: 'CONSUMABLE',
                alertType: alert.alertType as any,
                severity: alert.severity as any,
                message: alert.message,
            });
        }
    }

    return { success: true, alertsGenerated: alerts.length };
}

// ─── Get Inventory Stats ─────────────────────────────────────

export async function getInventoryStats() {
    const { tenantId } = await requireAuth('inventory:read');

    const assetList = await db.select().from(assets).where(eq(assets.tenantId, tenantId));
    const consumableList = await db.select().from(consumables).where(eq(consumables.tenantId, tenantId));
    const unresolvedAlerts = await db.select({ c: count() }).from(stockAlerts)
        .where(and(eq(stockAlerts.tenantId, tenantId), eq(stockAlerts.isResolved, false)));

    const totalAssetValue = assetList.reduce((sum, a) => sum + Number(a.purchasePrice || 0), 0);

    return {
        totalAssets: assetList.length,
        totalConsumables: consumableList.length,
        totalAssetValue,
        assetsNeedingRepair: assetList.filter(a => a.condition === 'NEEDS_REPAIR').length,
        lowStockItems: consumableList.filter(c => c.currentStock <= c.minimumStock).length,
        outOfStockItems: consumableList.filter(c => c.currentStock === 0).length,
        activeAlerts: unresolvedAlerts[0]?.c || 0,
    };
}

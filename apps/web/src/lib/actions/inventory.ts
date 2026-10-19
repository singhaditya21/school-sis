'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Assets ──────────────────────────────────────────────

export async function getAssets(category?: string) {
    const { tenantId } = await requireAuth('inventory:read');
    const categoryClause = category ? sql`AND category = ${category}` : sql``;

    return sql`
        SELECT 
            id, tenant_id AS "tenantId", name, category, serial_number AS "serialNumber",
            purchase_date AS "purchaseDate", purchase_price AS "purchasePrice", vendor,
            location, condition, warranty_expiry AS "warrantyExpiry",
            created_at AS "createdAt", updated_at AS "updatedAt"
        FROM assets
        WHERE tenant_id = ${tenantId}
          ${categoryClause}
        ORDER BY name ASC
    `;
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

    const asset = await sql`
        INSERT INTO assets (
            tenant_id, name, category, serial_number, purchase_date,
            purchase_price, vendor, location, condition, warranty_expiry
        ) VALUES (
            ${tenantId},
            ${data.name},
            ${data.category},
            ${data.serialNumber || null},
            ${data.purchaseDate || null},
            ${data.purchasePrice || null},
            ${data.vendor || null},
            ${data.location || null},
            ${data.condition || 'GOOD'},
            ${data.warrantyExpiry || null}
        ) RETURNING 
            id, tenant_id AS "tenantId", name, category, serial_number AS "serialNumber",
            purchase_date AS "purchaseDate", purchase_price AS "purchasePrice", vendor,
            location, condition, warranty_expiry AS "warrantyExpiry",
            created_at AS "createdAt", updated_at AS "updatedAt"
    `.one();

    return { success: true, asset };
}

// ─── Get Consumables ─────────────────────────────────────────

export async function getConsumables(category?: string) {
    const { tenantId } = await requireAuth('inventory:read');
    const categoryClause = category ? sql`AND category = ${category}` : sql``;

    return sql`
        SELECT 
            id, tenant_id AS "tenantId", name, category, unit,
            current_stock AS "currentStock", minimum_stock AS "minimumStock",
            reorder_level AS "reorderLevel", unit_price AS "unitPrice", supplier,
            last_restock_date AS "lastRestockDate",
            created_at AS "createdAt", updated_at AS "updatedAt"
        FROM consumables
        WHERE tenant_id = ${tenantId}
          ${categoryClause}
        ORDER BY name ASC
    `;
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

    const item = await sql`
        INSERT INTO consumables (
            tenant_id, name, category, unit, current_stock,
            minimum_stock, reorder_level, unit_price, supplier
        ) VALUES (
            ${tenantId},
            ${data.name},
            ${data.category},
            ${data.unit},
            ${data.currentStock},
            ${data.minimumStock},
            ${data.reorderLevel},
            ${data.unitPrice || null},
            ${data.supplier || null}
        ) RETURNING 
            id, tenant_id AS "tenantId", name, category, unit,
            current_stock AS "currentStock", minimum_stock AS "minimumStock",
            reorder_level AS "reorderLevel", unit_price AS "unitPrice", supplier,
            last_restock_date AS "lastRestockDate",
            created_at AS "createdAt", updated_at AS "updatedAt"
    `.one();

    return { success: true, item };
}

// ─── Restock Consumable ──────────────────────────────────────

export async function restockConsumable(consumableId: string, quantity: number) {
    const { tenantId } = await requireAuth('inventory:write');
    const lastRestockDate = new Date().toISOString().split('T')[0];

    await sql`
        UPDATE consumables
        SET 
            current_stock = current_stock + ${quantity},
            last_restock_date = ${lastRestockDate},
            updated_at = NOW()
        WHERE id = ${consumableId} AND tenant_id = ${tenantId}
    `.execute();

    await sql`
        UPDATE stock_alerts
        SET is_resolved = true, resolved_at = NOW()
        WHERE item_id = ${consumableId} AND tenant_id = ${tenantId} AND is_resolved = false
    `.execute();

    return { success: true };
}

// ─── Generate Stock Alerts ───────────────────────────────────

export async function generateStockAlerts() {
    const { tenantId } = await requireAuth('inventory:write');

    const items = await sql<{
        id: string;
        name: string;
        currentStock: number;
        minimumStock: number;
        unit: string;
    }>`
        SELECT 
            id, name, current_stock AS "currentStock", minimum_stock AS "minimumStock", unit
        FROM consumables
        WHERE tenant_id = ${tenantId}
    `;

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

    for (const alert of alerts) {
        const existing = await sql<{ id: string }>`
            SELECT id FROM stock_alerts 
            WHERE item_id = ${alert.itemId} AND tenant_id = ${tenantId} AND is_resolved = false 
            LIMIT 1
        `.maybeOne();

        if (!existing) {
            await sql`
                INSERT INTO stock_alerts (
                    tenant_id, item_id, item_type, alert_type, severity, message
                ) VALUES (
                    ${tenantId}, ${alert.itemId}, 'CONSUMABLE', ${alert.alertType}, ${alert.severity}, ${alert.message}
                )
            `.execute();
        }
    }

    return { success: true, alertsGenerated: alerts.length };
}

// ─── Get Inventory Stats ─────────────────────────────────────

export async function getInventoryStats() {
    const { tenantId } = await requireAuth('inventory:read');

    const [assetList, consumableList, unresolvedAlerts] = await Promise.all([
        sql<{ purchasePrice: string | number | null; condition: string }>`
            SELECT purchase_price AS "purchasePrice", condition
            FROM assets
            WHERE tenant_id = ${tenantId}
        `,
        sql<{ currentStock: number; minimumStock: number }>`
            SELECT current_stock AS "currentStock", minimum_stock AS "minimumStock"
            FROM consumables
            WHERE tenant_id = ${tenantId}
        `,
        sql<{ c: string | number }>`
            SELECT COUNT(*) AS c
            FROM stock_alerts
            WHERE tenant_id = ${tenantId} AND is_resolved = false
        `.one(),
    ]);

    const totalAssetValue = assetList.reduce((sum, a) => sum + Number(a.purchasePrice || 0), 0);

    return {
        totalAssets: assetList.length,
        totalConsumables: consumableList.length,
        totalAssetValue,
        assetsNeedingRepair: assetList.filter(a => a.condition === 'NEEDS_REPAIR').length,
        lowStockItems: consumableList.filter(c => c.currentStock <= c.minimumStock).length,
        outOfStockItems: consumableList.filter(c => c.currentStock === 0).length,
        activeAlerts: Number(unresolvedAlerts?.c || 0),
    };
}

// ─── Update Asset Condition ─────────────────────────────────

export async function updateAssetCondition(assetId: string, condition: string) {
    const { tenantId } = await requireAuth('inventory:write');

    const updated = await sql<{ name: string }>`
        UPDATE assets
        SET condition = ${condition}, updated_at = NOW()
        WHERE id = ${assetId} AND tenant_id = ${tenantId}
        RETURNING name
    `.maybeOne();

    if (!updated) {
        throw new Error('Asset not found or unauthorized');
    }
    const assetName = updated.name;

    if (condition === 'NEEDS_REPAIR') {
        const existingAlert = await sql<{ id: string }>`
            SELECT id FROM stock_alerts
            WHERE item_id = ${assetId} AND tenant_id = ${tenantId} AND item_type = 'ASSET' AND is_resolved = false
            LIMIT 1
        `.maybeOne();

        if (!existingAlert) {
            await sql`
                INSERT INTO stock_alerts (
                    tenant_id, item_id, item_type, alert_type, severity, message, is_resolved
                ) VALUES (
                    ${tenantId}, ${assetId}, 'ASSET', 'MAINTENANCE_DUE', 'WARNING', ${`Asset ${assetName} needs repair!`}, false
                )
            `.execute();
        }
    } else {
        await sql`
            UPDATE stock_alerts
            SET is_resolved = true, resolved_at = NOW()
            WHERE item_id = ${assetId} AND tenant_id = ${tenantId} AND item_type = 'ASSET' AND is_resolved = false
        `.execute();
    }

    return { success: true };
}

export async function updateAssetConditionForm(formData: FormData) {
    const assetId = formData.get('assetId') as string;
    const condition = formData.get('condition') as string;
    await updateAssetCondition(assetId, condition);
    const { revalidatePath } = require('next/cache');
    revalidatePath('/inventory');
    revalidatePath('/inventory/alerts');
}

export async function restockConsumableForm(formData: FormData) {
    const consumableId = formData.get('consumableId') as string;
    const quantity = Number(formData.get('quantity'));
    await restockConsumable(consumableId, quantity);
    const { revalidatePath } = require('next/cache');
    revalidatePath('/inventory');
    revalidatePath('/inventory/alerts');
}


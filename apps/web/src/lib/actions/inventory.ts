'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

// ─── Get Assets ──────────────────────────────────────────────

export async function getAssets(category?: string) {
    const { tenantId } = await requireAuth('inventory:read');

    let query = `
        SELECT 
            id, tenant_id AS "tenantId", name, category, serial_number AS "serialNumber",
            purchase_date AS "purchaseDate", purchase_price AS "purchasePrice", vendor,
            location, condition, warranty_expiry AS "warrantyExpiry",
            created_at AS "createdAt", updated_at AS "updatedAt"
        FROM assets
        WHERE tenant_id = $1
    `;
    const params: string[] = [tenantId];
    let paramIndex = 2;

    if (category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(category);
    }

    query += ` ORDER BY name ASC`;

    const { rows } = await pool.query(query, params);
    return rows;
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

    const query = `
        INSERT INTO assets (
            tenant_id, name, category, serial_number, purchase_date,
            purchase_price, vendor, location, condition, warranty_expiry
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        ) RETURNING 
            id, tenant_id AS "tenantId", name, category, serial_number AS "serialNumber",
            purchase_date AS "purchaseDate", purchase_price AS "purchasePrice", vendor,
            location, condition, warranty_expiry AS "warrantyExpiry",
            created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const params = [
        tenantId, data.name, data.category, data.serialNumber || null,
        data.purchaseDate || null, data.purchasePrice || null, data.vendor || null,
        data.location || null, data.condition || 'GOOD', data.warrantyExpiry || null
    ];

    const { rows } = await pool.query(query, params);
    return { success: true, asset: rows[0] };
}

// ─── Get Consumables ─────────────────────────────────────────

export async function getConsumables(category?: string) {
    const { tenantId } = await requireAuth('inventory:read');

    let query = `
        SELECT 
            id, tenant_id AS "tenantId", name, category, unit,
            current_stock AS "currentStock", minimum_stock AS "minimumStock",
            reorder_level AS "reorderLevel", unit_price AS "unitPrice", supplier,
            last_restock_date AS "lastRestockDate",
            created_at AS "createdAt", updated_at AS "updatedAt"
        FROM consumables
        WHERE tenant_id = $1
    `;
    const params: string[] = [tenantId];
    let paramIndex = 2;

    if (category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(category);
    }

    query += ` ORDER BY name ASC`;

    const { rows } = await pool.query(query, params);
    return rows;
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

    const query = `
        INSERT INTO consumables (
            tenant_id, name, category, unit, current_stock,
            minimum_stock, reorder_level, unit_price, supplier
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9
        ) RETURNING 
            id, tenant_id AS "tenantId", name, category, unit,
            current_stock AS "currentStock", minimum_stock AS "minimumStock",
            reorder_level AS "reorderLevel", unit_price AS "unitPrice", supplier,
            last_restock_date AS "lastRestockDate",
            created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const params = [
        tenantId, data.name, data.category, data.unit, data.currentStock,
        data.minimumStock, data.reorderLevel, data.unitPrice || null, data.supplier || null
    ];

    const { rows } = await pool.query(query, params);
    return { success: true, item: rows[0] };
}

// ─── Restock Consumable ──────────────────────────────────────

export async function restockConsumable(consumableId: string, quantity: number) {
    const { tenantId } = await requireAuth('inventory:write');

    const updateQuery = `
        UPDATE consumables
        SET 
            current_stock = current_stock + $1,
            last_restock_date = $2,
            updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4
    `;
    const lastRestockDate = new Date().toISOString().split('T')[0];
    await pool.query(updateQuery, [quantity, lastRestockDate, consumableId, tenantId]);

    const alertUpdateQuery = `
        UPDATE stock_alerts
        SET is_resolved = true, resolved_at = NOW()
        WHERE item_id = $1 AND tenant_id = $2 AND is_resolved = false
    `;
    await pool.query(alertUpdateQuery, [consumableId, tenantId]);

    return { success: true };
}

// ─── Get Stock Alerts ────────────────────────────────────────

export async function getStockAlerts(resolved?: boolean) {
    const { tenantId } = await requireAuth('inventory:read');

    let query = `
        SELECT 
            id, tenant_id AS "tenantId", item_id AS "itemId", item_type AS "itemType",
            alert_type AS "alertType", severity, message, is_resolved AS "isResolved",
            resolved_at AS "resolvedAt", created_at AS "createdAt"
        FROM stock_alerts
        WHERE tenant_id = $1
    `;
    const params: (string | boolean)[] = [tenantId];
    let paramIndex = 2;

    if (resolved !== undefined) {
        query += ` AND is_resolved = $${paramIndex++}`;
        params.push(resolved);
    }

    query += ` ORDER BY created_at DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
}

// ─── Generate Stock Alerts ───────────────────────────────────

export async function generateStockAlerts() {
    const { tenantId } = await requireAuth('inventory:write');

    const { rows: items } = await pool.query(`
        SELECT 
            id, name, current_stock AS "currentStock", minimum_stock AS "minimumStock", unit
        FROM consumables
        WHERE tenant_id = $1
    `, [tenantId]);

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
        const checkQuery = `
            SELECT id FROM stock_alerts 
            WHERE item_id = $1 AND tenant_id = $2 AND is_resolved = false 
            LIMIT 1
        `;
        const { rows: existing } = await pool.query(checkQuery, [alert.itemId, tenantId]);

        if (existing.length === 0) {
            const insertQuery = `
                INSERT INTO stock_alerts (
                    tenant_id, item_id, item_type, alert_type, severity, message
                ) VALUES (
                    $1, $2, $3, $4, $5, $6
                )
            `;
            await pool.query(insertQuery, [
                tenantId, alert.itemId, 'CONSUMABLE', alert.alertType, alert.severity, alert.message
            ]);
        }
    }

    return { success: true, alertsGenerated: alerts.length };
}

// ─── Get Inventory Stats ─────────────────────────────────────

export async function getInventoryStats() {
    const { tenantId } = await requireAuth('inventory:read');

    const { rows: assetList } = await pool.query(`
        SELECT purchase_price AS "purchasePrice", condition
        FROM assets
        WHERE tenant_id = $1
    `, [tenantId]);

    const { rows: consumableList } = await pool.query(`
        SELECT current_stock AS "currentStock", minimum_stock AS "minimumStock"
        FROM consumables
        WHERE tenant_id = $1
    `, [tenantId]);

    const { rows: unresolvedAlerts } = await pool.query(`
        SELECT COUNT(*) AS c
        FROM stock_alerts
        WHERE tenant_id = $1 AND is_resolved = false
    `, [tenantId]);

    const totalAssetValue = assetList.reduce((sum, a) => sum + Number(a.purchasePrice || 0), 0);

    return {
        totalAssets: assetList.length,
        totalConsumables: consumableList.length,
        totalAssetValue,
        assetsNeedingRepair: assetList.filter(a => a.condition === 'NEEDS_REPAIR').length,
        lowStockItems: consumableList.filter(c => c.currentStock <= c.minimumStock).length,
        outOfStockItems: consumableList.filter(c => c.currentStock === 0).length,
        activeAlerts: Number(unresolvedAlerts[0]?.c || 0),
    };
}

// ─── Update Asset Condition ─────────────────────────────────

export async function updateAssetCondition(assetId: string, condition: string) {
    const { tenantId } = await requireAuth('inventory:write');

    const updateQuery = `
        UPDATE assets
        SET condition = $1, updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
        RETURNING name
    `;
    const { rows } = await pool.query(updateQuery, [condition, assetId, tenantId]);
    if (rows.length === 0) {
        throw new Error('Asset not found or unauthorized');
    }
    const assetName = rows[0].name;

    if (condition === 'NEEDS_REPAIR') {
        const checkAlertQuery = `
            SELECT id FROM stock_alerts
            WHERE item_id = $1 AND tenant_id = $2 AND item_type = 'ASSET' AND is_resolved = false
            LIMIT 1
        `;
        const { rows: existingAlerts } = await pool.query(checkAlertQuery, [assetId, tenantId]);
        if (existingAlerts.length === 0) {
            const insertAlertQuery = `
                INSERT INTO stock_alerts (
                    tenant_id, item_id, item_type, alert_type, severity, message, is_resolved
                ) VALUES (
                    $1, $2, 'ASSET', 'MAINTENANCE_DUE', 'WARNING', $3, false
                )
            `;
            await pool.query(insertAlertQuery, [
                tenantId, assetId, `Asset ${assetName} needs repair!`
            ]);
        }
    } else {
        const resolveAlertQuery = `
            UPDATE stock_alerts
            SET is_resolved = true, resolved_at = NOW()
            WHERE item_id = $1 AND tenant_id = $2 AND item_type = 'ASSET' AND is_resolved = false
        `;
        await pool.query(resolveAlertQuery, [assetId, tenantId]);
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


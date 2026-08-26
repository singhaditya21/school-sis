'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/middleware';
import { addAsset, addConsumable, generateStockAlerts } from '@/lib/actions/inventory';

/** Mirrors the `asset_category` enum in the database. */
const ASSET_CATEGORIES = ['FURNITURE', 'IT_EQUIPMENT', 'SPORTS', 'LAB_EQUIPMENT', 'AUDIO_VISUAL', 'OTHER'] as const;
/** Mirrors the `asset_condition` enum in the database. */
const ASSET_CONDITIONS = ['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DISPOSED'] as const;
/** Mirrors the `consumable_category` enum in the database. */
const CONSUMABLE_CATEGORIES = ['STATIONERY', 'CLEANING', 'SPORTS', 'LAB_SUPPLIES', 'FIRST_AID', 'OFFICE'] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];
export type AssetCondition = (typeof ASSET_CONDITIONS)[number];
export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];

export type InventoryActionResult = {
    success: boolean;
    error?: string;
};

export type RescanResult = InventoryActionResult & {
    /**
     * Consumables currently at or below their minimum stock. The shared
     * `generateStockAlerts` helper returns this count, not the number of rows it
     * inserted — items that already had an open alert are counted but not
     * re-raised, so this is a "flagged" count, never "newly created".
     */
    itemsBelowMinimum?: number;
};

function isMember(list: readonly string[], value: string): boolean {
    return list.includes(value);
}

function parseAmount(value: string | undefined): { ok: true; value: string | undefined } | { ok: false } {
    if (!value || !value.trim()) return { ok: true, value: undefined };
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return { ok: false };
    return { ok: true, value: parsed.toFixed(2) };
}

/** Register a fixed asset. Rupee amounts, stored as-is on `assets.purchase_price`. */
export async function createAsset(input: {
    name: string;
    category: string;
    serialNumber?: string;
    purchaseDate?: string;
    purchasePrice?: string;
    vendor?: string;
    location?: string;
    condition?: string;
    warrantyExpiry?: string;
}): Promise<InventoryActionResult> {
    await requireAuth('inventory:write');

    const name = input.name?.trim();
    if (!name) return { success: false, error: 'Give the asset a name.' };
    if (!isMember(ASSET_CATEGORIES, input.category)) {
        return { success: false, error: 'Choose a valid asset category.' };
    }

    const condition = input.condition?.trim() || 'GOOD';
    if (!isMember(ASSET_CONDITIONS, condition)) {
        return { success: false, error: 'Choose a valid asset condition.' };
    }

    const price = parseAmount(input.purchasePrice);
    if (!price.ok) return { success: false, error: 'Purchase price must be a positive amount in rupees.' };

    await addAsset({
        name,
        category: input.category,
        serialNumber: input.serialNumber?.trim() || undefined,
        purchaseDate: input.purchaseDate || undefined,
        purchasePrice: price.value,
        vendor: input.vendor?.trim() || undefined,
        location: input.location?.trim() || undefined,
        condition,
        warrantyExpiry: input.warrantyExpiry || undefined,
    });

    revalidatePath('/inventory');
    return { success: true };
}

/** Register a stocked consumable. */
export async function createConsumable(input: {
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    minimumStock: number;
    reorderLevel: number;
    unitPrice?: string;
    supplier?: string;
}): Promise<InventoryActionResult> {
    await requireAuth('inventory:write');

    const name = input.name?.trim();
    const unit = input.unit?.trim();

    if (!name) return { success: false, error: 'Give the item a name.' };
    if (!unit) return { success: false, error: 'Give the item a unit (box, ream, litre…).' };
    if (!isMember(CONSUMABLE_CATEGORIES, input.category)) {
        return { success: false, error: 'Choose a valid consumable category.' };
    }

    const counts = [input.currentStock, input.minimumStock, input.reorderLevel];
    if (counts.some((n) => !Number.isInteger(n) || n < 0)) {
        return { success: false, error: 'Stock, minimum and reorder level must be whole numbers of zero or more.' };
    }

    const price = parseAmount(input.unitPrice);
    if (!price.ok) return { success: false, error: 'Unit price must be a positive amount in rupees.' };

    await addConsumable({
        name,
        category: input.category,
        unit,
        currentStock: input.currentStock,
        minimumStock: input.minimumStock,
        reorderLevel: input.reorderLevel,
        unitPrice: price.value,
        supplier: input.supplier?.trim() || undefined,
    });

    revalidatePath('/inventory');
    revalidatePath('/inventory/alerts');
    return { success: true };
}

/** Re-evaluate every consumable against its minimum and raise missing alerts. */
export async function rescanStockAlerts(): Promise<RescanResult> {
    await requireAuth('inventory:write');

    const result = await generateStockAlerts();

    revalidatePath('/inventory');
    revalidatePath('/inventory/alerts');

    return { success: true, itemsBelowMinimum: result.alertsGenerated };
}

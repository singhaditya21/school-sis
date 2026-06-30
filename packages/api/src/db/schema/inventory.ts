import { pgTable, uuid, varchar, text, timestamp, integer, numeric, pgEnum, date, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const assetCategoryEnum = pgEnum('asset_category', ['FURNITURE', 'IT_EQUIPMENT', 'SPORTS', 'LAB_EQUIPMENT', 'AUDIO_VISUAL', 'OTHER']);
export const assetConditionEnum = pgEnum('asset_condition', ['EXCELLENT', 'GOOD', 'FAIR', 'NEEDS_REPAIR', 'DISPOSED']);
export const consumableCategoryEnum = pgEnum('consumable_category', ['STATIONERY', 'CLEANING', 'SPORTS', 'LAB_SUPPLIES', 'FIRST_AID', 'OFFICE']);
export const stockAlertTypeEnum = pgEnum('stock_alert_type', ['LOW_STOCK', 'OUT_OF_STOCK', 'EXPIRING_SOON', 'MAINTENANCE_DUE']);
export const alertSeverityEnum = pgEnum('alert_severity', ['CRITICAL', 'WARNING', 'INFO']);

// ─── Assets ──────────────────────────────────────────────────

export const assets = pgTable('assets', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    category: assetCategoryEnum('category').notNull(),
    serialNumber: varchar('serial_number', { length: 100 }),
    purchaseDate: date('purchase_date'),
    purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }),
    vendor: varchar('vendor', { length: 255 }),
    location: varchar('location', { length: 255 }),
    assignedTo: varchar('assigned_to', { length: 255 }),
    condition: assetConditionEnum('condition').default('GOOD').notNull(),
    lastMaintenanceDate: date('last_maintenance_date'),
    warrantyExpiry: date('warranty_expiry'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Consumables ─────────────────────────────────────────────

export const consumables = pgTable('consumables', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    category: consumableCategoryEnum('category').notNull(),
    unit: varchar('unit', { length: 50 }).notNull(),
    currentStock: integer('current_stock').default(0).notNull(),
    minimumStock: integer('minimum_stock').default(0).notNull(),
    reorderLevel: integer('reorder_level').default(0).notNull(),
    unitPrice: numeric('unit_price', { precision: 10, scale: 2 }),
    lastRestockDate: date('last_restock_date'),
    supplier: varchar('supplier', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Stock Alerts ────────────────────────────────────────────

export const stockAlerts = pgTable('stock_alerts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    itemId: uuid('item_id').notNull(),
    itemType: varchar('item_type', { length: 20 }).notNull(), // 'ASSET' or 'CONSUMABLE'
    alertType: stockAlertTypeEnum('alert_type').notNull(),
    severity: alertSeverityEnum('severity').notNull(),
    message: text('message').notNull(),
    isResolved: boolean('is_resolved').default(false).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const assetsRelations = relations(assets, ({ one }) => ({
    tenant: one(tenants, { fields: [assets.tenantId], references: [tenants.id] }),
}));

export const consumablesRelations = relations(consumables, ({ one }) => ({
    tenant: one(tenants, { fields: [consumables.tenantId], references: [tenants.id] }),
}));

export const stockAlertsRelations = relations(stockAlerts, ({ one }) => ({
    tenant: one(tenants, { fields: [stockAlerts.tenantId], references: [tenants.id] }),
}));

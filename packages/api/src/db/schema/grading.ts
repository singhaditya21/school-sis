import { pgTable, uuid, varchar, text, timestamp, numeric, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { tenants } from './core';

export const gradingScales = pgTable('grading_scales', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    description: text('description'),
    isDefault: boolean('is_default').default(false).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantActiveIdx: index('idx_grading_scales_tenant_active').on(table.tenantId, table.isActive),
    tenantDefaultIdx: uniqueIndex('uq_grading_scales_tenant_default')
        .on(table.tenantId)
        .where(sql`${table.isDefault} = true`),
}));

export const gradingRubrics = pgTable('grading_rubrics', {
    id: uuid('id').primaryKey().defaultRandom(),
    scaleId: uuid('scale_id').references(() => gradingScales.id, { onDelete: 'cascade' }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    minScore: numeric('min_score'),
    maxScore: numeric('max_score'),
    gpaValue: numeric('gpa_value'),
    remark: text('remark'),
    displayOrder: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    scaleOrderIdx: index('idx_grading_rubrics_scale_order').on(table.scaleId, table.displayOrder),
}));

export const gradingScalesRelations = relations(gradingScales, ({ one, many }) => ({
    tenant: one(tenants, { fields: [gradingScales.tenantId], references: [tenants.id] }),
    rubrics: many(gradingRubrics),
}));

export const gradingRubricsRelations = relations(gradingRubrics, ({ one }) => ({
    scale: one(gradingScales, { fields: [gradingRubrics.scaleId], references: [gradingScales.id] }),
}));

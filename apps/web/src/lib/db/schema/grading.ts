import { pgTable, uuid, varchar, timestamp, numeric } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './core';

export const gradingScales = pgTable('grading_scales', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: varchar('type', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const gradingRubrics = pgTable('grading_rubrics', {
    id: uuid('id').primaryKey().defaultRandom(),
    scaleId: uuid('scale_id').references(() => gradingScales.id, { onDelete: 'cascade' }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    minScore: numeric('min_score'),
    maxScore: numeric('max_score'),
    gpaValue: numeric('gpa_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const gradingScalesRelations = relations(gradingScales, ({ one, many }) => ({
    tenant: one(tenants, { fields: [gradingScales.tenantId], references: [tenants.id] }),
    rubrics: many(gradingRubrics),
}));

export const gradingRubricsRelations = relations(gradingRubrics, ({ one }) => ({
    scale: one(gradingScales, { fields: [gradingRubrics.scaleId], references: [gradingScales.id] }),
}));

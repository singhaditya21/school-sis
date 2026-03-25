import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { tenants } from './core';

export const hqGroups = pgTable('hq_groups', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    headquartersCity: varchar('hq_city', { length: 100 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const multiCampusHierarchy = pgTable('multi_campus_hierarchy', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').references(() => hqGroups.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    region: varchar('region', { length: 100 }).notNull(),
    campusType: varchar('campus_type', { length: 50 }).notNull(), // K-12, Coaching, Uni
});

export const groupPolicies = pgTable('group_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id').references(() => hqGroups.id, { onDelete: 'cascade' }).notNull(),
    policyName: varchar('policy_name', { length: 255 }).notNull(),
    documentUrl: varchar('document_url', { length: 500 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

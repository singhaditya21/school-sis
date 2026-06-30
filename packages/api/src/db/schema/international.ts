import { pgTable, uuid, varchar, timestamp, date } from 'drizzle-orm/pg-core';
import { tenants } from './core';
import { students } from './students';

export const studentVisas = pgTable('student_visas', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    visaType: varchar('visa_type', { length: 50 }).notNull(), // F-1, Tier 4
    countryOfOrigin: varchar('country_of_origin', { length: 100 }).notNull(),
    passportNumber: varchar('passport_number', { length: 100 }).notNull(),
    issueDate: date('issue_date').notNull(),
    expirationDate: date('expiration_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const hostFamilies = pgTable('host_families', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    familyName: varchar('family_name', { length: 255 }).notNull(),
    address: varchar('address', { length: 500 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    backgroundChecked: date('background_checked'),
});

export const internationalPlacements = pgTable('international_placements', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    hostFamilyId: uuid('host_family_id').references(() => hostFamilies.id, { onDelete: 'set null' }),
    placementYear: varchar('placement_year', { length: 10 }).notNull(),
});

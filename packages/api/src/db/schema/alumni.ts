import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, boolean, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const alumniEventTypeEnum = pgEnum('alumni_event_type', ['REUNION', 'NETWORKING', 'CAREER_TALK', 'WORKSHOP', 'FUNDRAISER']);
export const alumniEventStatusEnum = pgEnum('alumni_event_status', ['UPCOMING', 'ONGOING', 'COMPLETED']);

// ─── Alumni Profiles ────────────────────────────────────────

export const alumniProfiles = pgTable('alumni_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    batch: varchar('batch', { length: 10 }).notNull(),
    graduationYear: integer('graduation_year'),
    currentCompany: varchar('current_company', { length: 255 }),
    designation: varchar('designation', { length: 200 }),
    location: varchar('location', { length: 200 }),
    linkedIn: varchar('linkedin', { length: 500 }),
    photo: text('photo'),
    isVerified: boolean('is_verified').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Alumni Events ──────────────────────────────────────────

export const alumniEvents = pgTable('alumni_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    date: date('date').notNull(),
    time: varchar('time', { length: 20 }),
    venue: varchar('venue', { length: 255 }),
    type: alumniEventTypeEnum('type').notNull(),
    organizerId: uuid('organizer_id').references(() => users.id),
    maxCapacity: integer('max_capacity'),
    status: alumniEventStatusEnum('status').default('UPCOMING').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Alumni Registrations ───────────────────────────────────

export const alumniRegistrations = pgTable('alumni_registrations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    eventId: uuid('event_id').references(() => alumniEvents.id, { onDelete: 'cascade' }).notNull(),
    alumniId: uuid('alumni_id').references(() => alumniProfiles.id, { onDelete: 'cascade' }).notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const alumniProfilesRelations = relations(alumniProfiles, ({ one }) => ({
    tenant: one(tenants, { fields: [alumniProfiles.tenantId], references: [tenants.id] }),
}));

export const alumniEventsRelations = relations(alumniEvents, ({ one, many }) => ({
    tenant: one(tenants, { fields: [alumniEvents.tenantId], references: [tenants.id] }),
    organizer: one(users, { fields: [alumniEvents.organizerId], references: [users.id] }),
    registrations: many(alumniRegistrations),
}));

export const alumniRegistrationsRelations = relations(alumniRegistrations, ({ one }) => ({
    tenant: one(tenants, { fields: [alumniRegistrations.tenantId], references: [tenants.id] }),
    event: one(alumniEvents, { fields: [alumniRegistrations.eventId], references: [alumniEvents.id] }),
    alumni: one(alumniProfiles, { fields: [alumniRegistrations.alumniId], references: [alumniProfiles.id] }),
}));

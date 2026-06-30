import { pgTable, uuid, varchar, text, timestamp, pgEnum, date, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const eventTypeEnum = pgEnum('event_type', ['HOLIDAY', 'EXAM', 'PTM', 'SPORTS_DAY', 'CULTURAL', 'ACADEMIC', 'OTHER']);
export const audienceTypeEnum = pgEnum('audience_type', ['ALL', 'STUDENTS', 'STAFF', 'PARENTS']);

// ─── Academic Events ─────────────────────────────────────────

export const academicEvents = pgTable('academic_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    eventType: eventTypeEnum('event_type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    isAllDay: boolean('is_all_day').default(true).notNull(),
    startTime: varchar('start_time', { length: 10 }),
    endTime: varchar('end_time', { length: 10 }),
    venue: varchar('venue', { length: 255 }),
    audienceType: audienceTypeEnum('audience_type').default('ALL').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    isRecurring: boolean('is_recurring').default(false).notNull(),
    color: varchar('color', { length: 7 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Note: academicYears table lives in academic.ts — reuse that

// ─── Relations ───────────────────────────────────────────────

export const academicEventsRelations = relations(academicEvents, ({ one }) => ({
    tenant: one(tenants, { fields: [academicEvents.tenantId], references: [tenants.id] }),
    creator: one(users, { fields: [academicEvents.createdBy], references: [users.id] }),
}));

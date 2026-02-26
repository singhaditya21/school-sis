import { pgTable, uuid, varchar, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { sections, subjects } from './academic';

// ─── Enums ───────────────────────────────────────────────────

export const dayOfWeekEnum = pgEnum('day_of_week', ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']);

// ─── Periods ─────────────────────────────────────────────────

export const periods = pgTable('periods', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 50 }).notNull(), // Period 1, Lunch, Assembly
    startTime: varchar('start_time', { length: 5 }).notNull(), // "08:30"
    endTime: varchar('end_time', { length: 5 }).notNull(), // "09:15"
    displayOrder: integer('display_order').notNull(),
    isBreak: integer('is_break').default(0).notNull(), // 0=class, 1=break
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Timetable Entries ───────────────────────────────────────

export const timetableEntries = pgTable('timetable_entries', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'cascade' }).notNull(),
    periodId: uuid('period_id').references(() => periods.id).notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id).notNull(),
    teacherId: uuid('teacher_id').references(() => users.id).notNull(),
    dayOfWeek: dayOfWeekEnum('day_of_week').notNull(),
    roomNumber: varchar('room_number', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Substitutions ───────────────────────────────────────────

export const substitutions = pgTable('substitutions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    timetableEntryId: uuid('timetable_entry_id').references(() => timetableEntries.id).notNull(),
    originalTeacherId: uuid('original_teacher_id').references(() => users.id).notNull(),
    substituteTeacherId: uuid('substitute_teacher_id').references(() => users.id).notNull(),
    date: varchar('date', { length: 10 }).notNull(), // "2026-02-26"
    reason: varchar('reason', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const periodsRelations = relations(periods, ({ one }) => ({
    tenant: one(tenants, { fields: [periods.tenantId], references: [tenants.id] }),
}));

export const timetableEntriesRelations = relations(timetableEntries, ({ one }) => ({
    tenant: one(tenants, { fields: [timetableEntries.tenantId], references: [tenants.id] }),
    section: one(sections, { fields: [timetableEntries.sectionId], references: [sections.id] }),
    period: one(periods, { fields: [timetableEntries.periodId], references: [periods.id] }),
    subject: one(subjects, { fields: [timetableEntries.subjectId], references: [subjects.id] }),
    teacher: one(users, { fields: [timetableEntries.teacherId], references: [users.id] }),
}));

export const substitutionsRelations = relations(substitutions, ({ one }) => ({
    tenant: one(tenants, { fields: [substitutions.tenantId], references: [tenants.id] }),
    timetableEntry: one(timetableEntries, { fields: [substitutions.timetableEntryId], references: [timetableEntries.id] }),
    originalTeacher: one(users, { fields: [substitutions.originalTeacherId], references: [users.id] }),
    substituteTeacher: one(users, { fields: [substitutions.substituteTeacherId], references: [users.id] }),
}));

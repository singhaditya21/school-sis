import { pgTable, uuid, varchar, integer, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

export const degreeTypeEnum = pgEnum('degree_type', ['BACHELOR', 'MASTER', 'PHD', 'DIPLOMA']);

export const universityPrograms = pgTable('university_programs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    degreeType: degreeTypeEnum('degree_type').notNull(),
    durationYears: integer('duration_years').notNull(),
    totalCredits: integer('total_credits').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const universityCourses = pgTable('university_courses', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    programId: uuid('program_id').references(() => universityPrograms.id, { onDelete: 'cascade' }).notNull(),
    code: varchar('code', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    credits: integer('credits').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const facultyWorkload = pgTable('faculty_workload', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    facultyId: uuid('faculty_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    courseId: uuid('course_id').references(() => universityCourses.id, { onDelete: 'cascade' }).notNull(),
    semester: varchar('semester', { length: 50 }).notNull(),
    assignedHours: integer('assigned_hours').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

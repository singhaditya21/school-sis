import { pgTable, uuid, varchar, text, timestamp, boolean, integer, date, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const termTypeEnum = pgEnum('term_type', ['TERM_1', 'TERM_2', 'TERM_3', 'ANNUAL']);

// ─── Academic Years ──────────────────────────────────────────

export const academicYears = pgTable('academic_years', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 50 }).notNull(), // e.g., "2025-2026"
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isCurrent: boolean('is_current').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Terms ───────────────────────────────────────────────────

export const terms = pgTable('terms', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    type: termTypeEnum('type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Grades ──────────────────────────────────────────────────

export const grades = pgTable('grades', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 50 }).notNull(), // e.g., "Grade 1", "Pre-Primary"
    numericValue: integer('numeric_value'), // 1, 2, ... 12
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Sections ────────────────────────────────────────────────

export const sections = pgTable('sections', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    gradeId: uuid('grade_id').references(() => grades.id, { onDelete: 'cascade' }).notNull(),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 10 }).notNull(), // A, B, C...
    capacity: integer('capacity').default(60),
    classTeacherId: uuid('class_teacher_id'), // FK to users, set later
    roomNumber: varchar('room_number', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Subjects ────────────────────────────────────────────────

export const subjects = pgTable('subjects', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    description: text('description'),
    isElective: boolean('is_elective').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Grade-Subject Mapping ───────────────────────────────────

export const gradeSubjects = pgTable('grade_subjects', {
    id: uuid('id').primaryKey().defaultRandom(),
    gradeId: uuid('grade_id').references(() => grades.id, { onDelete: 'cascade' }).notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }).notNull(),
    periodsPerWeek: integer('periods_per_week').default(5),
});

// ─── Relations ───────────────────────────────────────────────

export const academicYearsRelations = relations(academicYears, ({ one, many }) => ({
    tenant: one(tenants, { fields: [academicYears.tenantId], references: [tenants.id] }),
    terms: many(terms),
    sections: many(sections),
}));

export const termsRelations = relations(terms, ({ one }) => ({
    tenant: one(tenants, { fields: [terms.tenantId], references: [tenants.id] }),
    academicYear: one(academicYears, { fields: [terms.academicYearId], references: [academicYears.id] }),
}));

export const gradesRelations = relations(grades, ({ one, many }) => ({
    tenant: one(tenants, { fields: [grades.tenantId], references: [tenants.id] }),
    sections: many(sections),
    gradeSubjects: many(gradeSubjects),
}));

export const sectionsRelations = relations(sections, ({ one }) => ({
    tenant: one(tenants, { fields: [sections.tenantId], references: [tenants.id] }),
    grade: one(grades, { fields: [sections.gradeId], references: [grades.id] }),
    academicYear: one(academicYears, { fields: [sections.academicYearId], references: [academicYears.id] }),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
    tenant: one(tenants, { fields: [subjects.tenantId], references: [tenants.id] }),
    gradeSubjects: many(gradeSubjects),
}));

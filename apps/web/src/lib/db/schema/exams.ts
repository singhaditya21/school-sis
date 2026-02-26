import { pgTable, uuid, varchar, text, timestamp, numeric, integer, date, pgEnum, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { academicYears, grades, sections, subjects } from './academic';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const examTypeEnum = pgEnum('exam_type', ['UNIT_TEST', 'MID_TERM', 'FINAL', 'PRACTICE', 'BOARD_PREP']);

// ─── Exams ───────────────────────────────────────────────────

export const exams = pgTable('exams', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    type: examTypeEnum('type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Exam Schedules ──────────────────────────────────────────

export const examSchedules = pgTable('exam_schedules', {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id').references(() => exams.id, { onDelete: 'cascade' }).notNull(),
    gradeId: uuid('grade_id').references(() => grades.id).notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id).notNull(),
    examDate: date('exam_date').notNull(),
    startTime: varchar('start_time', { length: 5 }).notNull(),
    endTime: varchar('end_time', { length: 5 }).notNull(),
    maxMarks: numeric('max_marks', { precision: 6, scale: 2 }).notNull(),
    passingMarks: numeric('passing_marks', { precision: 6, scale: 2 }).notNull(),
    roomNumber: varchar('room_number', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Student Results ─────────────────────────────────────────

export const studentResults = pgTable('student_results', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    examScheduleId: uuid('exam_schedule_id').references(() => examSchedules.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    marksObtained: numeric('marks_obtained', { precision: 6, scale: 2 }),
    grade: varchar('grade', { length: 5 }), // A+, A, B+, etc.
    remarks: text('remarks'),
    isAbsent: boolean('is_absent').default(false).notNull(),
    enteredBy: uuid('entered_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const examsRelations = relations(exams, ({ one, many }) => ({
    tenant: one(tenants, { fields: [exams.tenantId], references: [tenants.id] }),
    academicYear: one(academicYears, { fields: [exams.academicYearId], references: [academicYears.id] }),
    schedules: many(examSchedules),
}));

export const examSchedulesRelations = relations(examSchedules, ({ one, many }) => ({
    exam: one(exams, { fields: [examSchedules.examId], references: [exams.id] }),
    grade: one(grades, { fields: [examSchedules.gradeId], references: [grades.id] }),
    subject: one(subjects, { fields: [examSchedules.subjectId], references: [subjects.id] }),
    results: many(studentResults),
}));

export const studentResultsRelations = relations(studentResults, ({ one }) => ({
    tenant: one(tenants, { fields: [studentResults.tenantId], references: [tenants.id] }),
    examSchedule: one(examSchedules, { fields: [studentResults.examScheduleId], references: [examSchedules.id] }),
    student: one(students, { fields: [studentResults.studentId], references: [students.id] }),
    enteredByUser: one(users, { fields: [studentResults.enteredBy], references: [users.id] }),
}));

import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';
import { grades, sections, subjects } from './academic';

// ─── Homework Assignments ────────────────────────────────────

export const homeworkAssignments = pgTable('homework_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id),
    gradeId: uuid('grade_id').references(() => grades.id),
    sectionId: uuid('section_id').references(() => sections.id),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    dueDate: date('due_date').notNull(),
    assignedBy: uuid('assigned_by').references(() => users.id),
    attachments: jsonb('attachments').$type<string[]>().default([]),
    maxMarks: integer('max_marks'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Homework Submissions ────────────────────────────────────

export const homeworkSubmissions = pgTable('homework_submissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    assignmentId: uuid('assignment_id').references(() => homeworkAssignments.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    content: text('content'),
    attachments: jsonb('attachments').$type<string[]>().default([]),
    marks: integer('marks'),
    feedback: text('feedback'),
    gradedBy: uuid('graded_by').references(() => users.id),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
});

// ─── Relations ───────────────────────────────────────────────

export const homeworkAssignmentsRelations = relations(homeworkAssignments, ({ one, many }) => ({
    tenant: one(tenants, { fields: [homeworkAssignments.tenantId], references: [tenants.id] }),
    teacher: one(users, { fields: [homeworkAssignments.assignedBy], references: [users.id] }),
    submissions: many(homeworkSubmissions),
}));

export const homeworkSubmissionsRelations = relations(homeworkSubmissions, ({ one }) => ({
    tenant: one(tenants, { fields: [homeworkSubmissions.tenantId], references: [tenants.id] }),
    assignment: one(homeworkAssignments, { fields: [homeworkSubmissions.assignmentId], references: [homeworkAssignments.id] }),
    student: one(students, { fields: [homeworkSubmissions.studentId], references: [students.id] }),
    grader: one(users, { fields: [homeworkSubmissions.gradedBy], references: [users.id] }),
}));

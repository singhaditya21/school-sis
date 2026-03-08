import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';
import { grades, sections, subjects } from './academic';

// ─── Enums ───────────────────────────────────────────────────

export const questionTypeEnum = pgEnum('question_type', ['MCQ', 'TRUE_FALSE', 'SHORT_ANSWER']);
export const quizStatusEnum = pgEnum('quiz_status', ['DRAFT', 'PUBLISHED', 'CLOSED']);
export const attemptStatusEnum = pgEnum('attempt_status', ['IN_PROGRESS', 'SUBMITTED', 'GRADED']);

// ─── Quizzes ─────────────────────────────────────────────────

export const quizzes = pgTable('quizzes', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id),
    gradeId: uuid('grade_id').references(() => grades.id),
    sectionId: uuid('section_id').references(() => sections.id),
    createdBy: uuid('created_by').references(() => users.id),
    duration: integer('duration').notNull(), // minutes
    totalMarks: integer('total_marks').notNull(),
    status: quizStatusEnum('status').default('DRAFT').notNull(),
    startTime: timestamp('start_time', { withTimezone: true }),
    endTime: timestamp('end_time', { withTimezone: true }),
    instructions: text('instructions'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Quiz Questions ──────────────────────────────────────────

export const quizQuestions = pgTable('quiz_questions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'cascade' }).notNull(),
    text: text('text').notNull(),
    type: questionTypeEnum('type').notNull(),
    options: jsonb('options').$type<string[]>().default([]),
    correctAnswer: text('correct_answer').notNull(),
    marks: integer('marks').notNull(),
    ordering: integer('ordering').default(0).notNull(),
});

// ─── Quiz Attempts ───────────────────────────────────────────

export const quizAttempts = pgTable('quiz_attempts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    quizId: uuid('quiz_id').references(() => quizzes.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    answers: jsonb('answers').$type<Record<string, string | number>>().default({}),
    score: integer('score'),
    totalMarks: integer('total_marks'),
    percentage: integer('percentage'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    status: attemptStatusEnum('status').default('IN_PROGRESS').notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
    tenant: one(tenants, { fields: [quizzes.tenantId], references: [tenants.id] }),
    creator: one(users, { fields: [quizzes.createdBy], references: [users.id] }),
    questions: many(quizQuestions),
    attempts: many(quizAttempts),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
    tenant: one(tenants, { fields: [quizQuestions.tenantId], references: [tenants.id] }),
    quiz: one(quizzes, { fields: [quizQuestions.quizId], references: [quizzes.id] }),
}));

export const quizAttemptsRelations = relations(quizAttempts, ({ one }) => ({
    tenant: one(tenants, { fields: [quizAttempts.tenantId], references: [tenants.id] }),
    quiz: one(quizzes, { fields: [quizAttempts.quizId], references: [quizzes.id] }),
    student: one(students, { fields: [quizAttempts.studentId], references: [students.id] }),
}));

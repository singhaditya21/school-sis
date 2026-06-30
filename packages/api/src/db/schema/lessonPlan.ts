import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { grades, subjects } from './academic';

// ─── Enums ───────────────────────────────────────────────────

export const lessonPlanStatusEnum = pgEnum('lesson_plan_status', ['DRAFT', 'SUBMITTED', 'APPROVED', 'COMPLETED']);

// ─── Lesson Plans ────────────────────────────────────────────

export const lessonPlans = pgTable('lesson_plans', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    subjectId: uuid('subject_id').references(() => subjects.id),
    gradeId: uuid('grade_id').references(() => grades.id),
    teacherId: uuid('teacher_id').references(() => users.id),
    topic: varchar('topic', { length: 255 }).notNull(),
    objectives: text('objectives'),
    activities: text('activities'),
    resources: text('resources'),
    assessmentPlan: text('assessment_plan'),
    duration: integer('duration'), // minutes
    weekNumber: integer('week_number'),
    status: lessonPlanStatusEnum('status').default('DRAFT').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const lessonPlansRelations = relations(lessonPlans, ({ one }) => ({
    tenant: one(tenants, { fields: [lessonPlans.tenantId], references: [tenants.id] }),
    teacher: one(users, { fields: [lessonPlans.teacherId], references: [users.id] }),
    approver: one(users, { fields: [lessonPlans.approvedBy], references: [users.id] }),
}));

import { pgTable, uuid, varchar, timestamp, boolean, date, integer } from 'drizzle-orm/pg-core';
import { tenants } from './core';
import { students } from './students';

export const coachingBatches = pgTable('coaching_batches', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    targetExam: varchar('target_exam', { length: 100 }).notNull(), // e.g., JEE, NEET, UPSC
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const testSeries = pgTable('test_series', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    batchId: uuid('batch_id').references(() => coachingBatches.id, { onDelete: 'cascade' }).notNull(),
    testName: varchar('test_name', { length: 255 }).notNull(),
    totalMarks: integer('total_marks').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
});

export const testSeriesResults = pgTable('test_series_results', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    testId: uuid('test_id').references(() => testSeries.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    marksObtained: integer('marks_obtained').notNull(),
    rank: integer('rank'),
});

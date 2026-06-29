import { pgTable, uuid, varchar, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { grades, sections, subjects } from './academic';

export const diaryEntries = pgTable('diary_entries', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    content: text('content').notNull(),
    date: varchar('date', { length: 10 }).notNull(),
    gradeId: uuid('grade_id').references(() => grades.id, { onDelete: 'set null' }),
    sectionId: uuid('section_id').references(() => sections.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 50 }),
    fileAttachments: text('file_attachments'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const appointments = pgTable('appointments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    date: varchar('date', { length: 10 }).notNull(),
    time: varchar('time', { length: 10 }).notNull(),
    duration: integer('duration').notNull(),
    withUserId: uuid('with_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 50 }).default('scheduled'),
    type: varchar('type', { length: 50 }),
});

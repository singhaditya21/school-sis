import { pgTable, uuid, varchar, timestamp, date, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { sections } from './academic';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const attendanceStatusEnum = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED', 'HOLIDAY']);

// ─── Attendance Records ──────────────────────────────────────

export const attendanceRecords = pgTable('attendance_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    sectionId: uuid('section_id').references(() => sections.id).notNull(),
    date: date('date').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    markedBy: uuid('marked_by').references(() => users.id).notNull(),
    remarks: varchar('remarks', { length: 500 }),
    isNotified: boolean('is_notified').default(false).notNull(), // parent notified?
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
    tenant: one(tenants, { fields: [attendanceRecords.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [attendanceRecords.studentId], references: [students.id] }),
    section: one(sections, { fields: [attendanceRecords.sectionId], references: [sections.id] }),
    marker: one(users, { fields: [attendanceRecords.markedBy], references: [users.id] }),
}));

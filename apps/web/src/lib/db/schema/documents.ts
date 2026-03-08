import { pgTable, uuid, varchar, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';

// ─── Student Documents ──────────────────────────────────────

export const studentDocuments = pgTable('student_documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    documentType: varchar('document_type', { length: 100 }).notNull(),
    fileName: varchar('file_name', { length: 500 }).notNull(),
    fileUrl: text('file_url'),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    isVerified: boolean('is_verified').default(false).notNull(),
    verifiedBy: uuid('verified_by').references(() => users.id),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const studentDocumentsRelations = relations(studentDocuments, ({ one }) => ({
    tenant: one(tenants, { fields: [studentDocuments.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [studentDocuments.studentId], references: [students.id] }),
    uploader: one(users, { fields: [studentDocuments.uploadedBy], references: [users.id] }),
}));

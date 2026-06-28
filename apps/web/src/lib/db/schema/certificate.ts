import { pgTable, uuid, varchar, text, timestamp, pgEnum, jsonb, boolean, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const certificateTypeEnum = pgEnum('certificate_type', ['TRANSFER', 'CHARACTER', 'BONAFIDE', 'MIGRATION', 'REPORT_CARD', 'MARKSHEET', 'CUSTOM']);
export const certificateStatusEnum = pgEnum('certificate_status', ['DRAFT', 'ISSUED', 'REVOKED']);
export const idCardStatusEnum = pgEnum('id_card_status', ['PENDING', 'PRINTED', 'ISSUED']);
export const digilockerSyncStatusEnum = pgEnum('digilocker_sync_status', ['PENDING', 'SUCCESS', 'FAILED']);

// ─── Certificate Templates ──────────────────────────────────

export const certificateTemplates = pgTable('certificate_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    type: certificateTypeEnum('type').notNull(),
    htmlTemplate: text('html_template'),
    variables: jsonb('variables').$type<string[]>().default([]),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Issued Certificates ────────────────────────────────────

export const issuedCertificates = pgTable('issued_certificates', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    templateId: uuid('template_id').references(() => certificateTemplates.id).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    certificateNumber: varchar('certificate_number', { length: 100 }).notNull(),
    issuedDate: date('issued_date').notNull(),
    issuedBy: uuid('issued_by').references(() => users.id),
    data: jsonb('data').$type<Record<string, string>>().default({}),
    status: certificateStatusEnum('status').default('DRAFT').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokeReason: text('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── ID Cards ────────────────────────────────────────────────

export const idCards = pgTable('id_cards', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    personId: uuid('person_id').notNull(), // student or staff ID
    personType: varchar('person_type', { length: 10 }).notNull(), // 'STUDENT' or 'STAFF'
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to').notNull(),
    qrCode: varchar('qr_code', { length: 100 }),
    templateName: varchar('template_name', { length: 100 }),
    status: idCardStatusEnum('status').default('PENDING').notNull(),
    printedAt: timestamp('printed_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── DigiLocker Sync Logs ────────────────────────────────────

export const digilockerSyncLogs = pgTable('digilocker_sync_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    documentType: varchar('document_type', { length: 50 }).notNull(), // 'ID_CARD', 'CERTIFICATE', 'MARKSHEET'
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    referenceId: uuid('reference_id'), // ID of the issued certificate or ID card
    xmlPayload: text('xml_payload').notNull(),
    responseHash: text('response_hash'),
    status: digilockerSyncStatusEnum('status').default('PENDING').notNull(),
    syncAttemptedAt: timestamp('sync_attempted_at', { withTimezone: true }).defaultNow().notNull(),
    errorMessage: text('error_message'),
});

// ─── Relations ───────────────────────────────────────────────

export const certificateTemplatesRelations = relations(certificateTemplates, ({ one, many }) => ({
    tenant: one(tenants, { fields: [certificateTemplates.tenantId], references: [tenants.id] }),
    issuedCertificates: many(issuedCertificates),
}));

export const issuedCertificatesRelations = relations(issuedCertificates, ({ one }) => ({
    tenant: one(tenants, { fields: [issuedCertificates.tenantId], references: [tenants.id] }),
    template: one(certificateTemplates, { fields: [issuedCertificates.templateId], references: [certificateTemplates.id] }),
    student: one(students, { fields: [issuedCertificates.studentId], references: [students.id] }),
    issuer: one(users, { fields: [issuedCertificates.issuedBy], references: [users.id] }),
}));

export const idCardsRelations = relations(idCards, ({ one }) => ({
    tenant: one(tenants, { fields: [idCards.tenantId], references: [tenants.id] }),
}));

export const digilockerSyncLogsRelations = relations(digilockerSyncLogs, ({ one }) => ({
    tenant: one(tenants, { fields: [digilockerSyncLogs.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [digilockerSyncLogs.studentId], references: [students.id] }),
}));

import { pgTable, uuid, varchar, text, timestamp, date, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const leadSourceEnum = pgEnum('lead_source', ['WEBSITE', 'REFERRAL', 'WALK_IN', 'ADVERTISEMENT', 'SOCIAL_MEDIA', 'OTHER']);
export const pipelineStageEnum = pgEnum('pipeline_stage', ['NEW', 'CONTACTED', 'FORM_SUBMITTED', 'DOCUMENTS_PENDING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFERED', 'ACCEPTED', 'ENROLLED', 'REJECTED', 'WITHDRAWN']);

// ─── Admission Leads ─────────────────────────────────────────

export const admissionLeads = pgTable('admission_leads', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    childFirstName: varchar('child_first_name', { length: 100 }).notNull(),
    childLastName: varchar('child_last_name', { length: 100 }).notNull(),
    childDob: date('child_dob'),
    applyingForGrade: varchar('applying_for_grade', { length: 50 }).notNull(),
    parentName: varchar('parent_name', { length: 200 }).notNull(),
    parentEmail: varchar('parent_email', { length: 255 }).notNull(),
    parentPhone: varchar('parent_phone', { length: 20 }).notNull(),
    source: leadSourceEnum('source').default('WEBSITE').notNull(),
    stage: pipelineStageEnum('stage').default('NEW').notNull(),
    assignedTo: uuid('assigned_to').references(() => users.id),
    notes: text('notes'),
    previousSchool: varchar('previous_school', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Admission Applications ──────────────────────────────────

export const admissionApplications = pgTable('admission_applications', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    leadId: uuid('lead_id').references(() => admissionLeads.id).notNull(),
    applicationNumber: varchar('application_number', { length: 50 }).notNull(),
    formData: jsonb('form_data'), // flexible application form responses
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Admission Documents ─────────────────────────────────────

export const admissionDocuments = pgTable('admission_documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    applicationId: uuid('application_id').references(() => admissionApplications.id, { onDelete: 'cascade' }).notNull(),
    documentType: varchar('document_type', { length: 100 }).notNull(), // Birth Certificate, Transfer Certificate, etc.
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileUrl: text('file_url').notNull(),
    fileSize: varchar('file_size', { length: 20 }),
    isVerified: timestamp('is_verified', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const admissionLeadsRelations = relations(admissionLeads, ({ one, many }) => ({
    tenant: one(tenants, { fields: [admissionLeads.tenantId], references: [tenants.id] }),
    assignedUser: one(users, { fields: [admissionLeads.assignedTo], references: [users.id] }),
    applications: many(admissionApplications),
}));

export const admissionApplicationsRelations = relations(admissionApplications, ({ one, many }) => ({
    tenant: one(tenants, { fields: [admissionApplications.tenantId], references: [tenants.id] }),
    lead: one(admissionLeads, { fields: [admissionApplications.leadId], references: [admissionLeads.id] }),
    documents: many(admissionDocuments),
}));

export const admissionDocumentsRelations = relations(admissionDocuments, ({ one }) => ({
    tenant: one(tenants, { fields: [admissionDocuments.tenantId], references: [tenants.id] }),
    application: one(admissionApplications, { fields: [admissionDocuments.applicationId], references: [admissionApplications.id] }),
    verifier: one(users, { fields: [admissionDocuments.verifiedBy], references: [users.id] }),
}));

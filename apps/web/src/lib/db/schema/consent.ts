import { pgTable, uuid, varchar, text, timestamp, pgEnum, date, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const consentResponseEnum = pgEnum('consent_response', ['ACCEPTED', 'DECLINED']);

// ─── Consent Forms ──────────────────────────────────────────

export const consentForms = pgTable('consent_forms', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    formType: varchar('form_type', { length: 100 }).notNull(),
    audience: varchar('audience', { length: 50 }).default('ALL').notNull(),
    dueDate: date('due_date'),
    createdBy: uuid('created_by').references(() => users.id),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Consent Responses ──────────────────────────────────────

export const consentResponses = pgTable('consent_responses', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    formId: uuid('form_id').references(() => consentForms.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    respondentName: varchar('respondent_name', { length: 200 }),
    response: consentResponseEnum('response').notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }).defaultNow().notNull(),
    notes: text('notes'),
});

// ─── Relations ───────────────────────────────────────────────

export const consentFormsRelations = relations(consentForms, ({ one, many }) => ({
    tenant: one(tenants, { fields: [consentForms.tenantId], references: [tenants.id] }),
    creator: one(users, { fields: [consentForms.createdBy], references: [users.id] }),
    responses: many(consentResponses),
}));

export const consentResponsesRelations = relations(consentResponses, ({ one }) => ({
    tenant: one(tenants, { fields: [consentResponses.tenantId], references: [tenants.id] }),
    form: one(consentForms, { fields: [consentResponses.formId], references: [consentForms.id] }),
    student: one(students, { fields: [consentResponses.studentId], references: [students.id] }),
}));

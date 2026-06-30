import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, jsonb, date, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const healthIncidentTypeEnum = pgEnum('health_incident_type', ['INJURY', 'ILLNESS', 'ALLERGY', 'EMERGENCY', 'OTHER']);

// ─── Health Records ──────────────────────────────────────────

export const healthRecords = pgTable('health_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    bloodGroup: varchar('blood_group', { length: 5 }),
    height: varchar('height', { length: 10 }),
    weight: varchar('weight', { length: 10 }),
    allergies: jsonb('allergies').$type<string[]>().default([]),
    conditions: jsonb('conditions').$type<string[]>().default([]),
    medications: jsonb('medications').$type<string[]>().default([]),
    emergencyContact: varchar('emergency_contact', { length: 200 }),
    emergencyPhone: varchar('emergency_phone', { length: 20 }),
    doctorName: varchar('doctor_name', { length: 200 }),
    doctorPhone: varchar('doctor_phone', { length: 20 }),
    insuranceId: varchar('insurance_id', { length: 100 }),
    insuranceProvider: varchar('insurance_provider', { length: 200 }),
    notes: text('notes'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Health Incidents ────────────────────────────────────────

export const healthIncidents = pgTable('health_incidents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    incidentDate: timestamp('incident_date', { withTimezone: true }).defaultNow().notNull(),
    type: healthIncidentTypeEnum('type').notNull(),
    description: text('description').notNull(),
    actionTaken: text('action_taken'),
    reportedBy: uuid('reported_by').references(() => users.id),
    parentNotified: boolean('parent_notified').default(false).notNull(),
    parentNotifiedAt: timestamp('parent_notified_at', { withTimezone: true }),
    followUpRequired: boolean('follow_up_required').default(false).notNull(),
    followUpNotes: text('follow_up_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Immunizations ───────────────────────────────────────────

export const immunizations = pgTable('immunizations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    vaccineName: varchar('vaccine_name', { length: 200 }).notNull(),
    doseNumber: integer('dose_number').default(1).notNull(),
    dateGiven: date('date_given').notNull(),
    nextDueDate: date('next_due_date'),
    administeredBy: varchar('administered_by', { length: 200 }),
    batchNumber: varchar('batch_number', { length: 100 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Nurse Visit Logs ────────────────────────────────────────

export const nurseVisitLogs = pgTable('nurse_visit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    visitDate: timestamp('visit_date', { withTimezone: true }).defaultNow().notNull(),
    symptoms: text('symptoms').notNull(),
    treatmentProvided: text('treatment_provided').notNull(),
    temperature: varchar('temperature', { length: 10 }),
    bloodPressure: varchar('blood_pressure', { length: 20 }),
    sentHome: boolean('sent_home').default(false).notNull(),
    nurseId: uuid('nurse_id').references(() => users.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Medication Schedules ────────────────────────────────────

export const medicationSchedules = pgTable('medication_schedules', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    medicationName: varchar('medication_name', { length: 255 }).notNull(),
    dosage: varchar('dosage', { length: 100 }).notNull(),
    timesPerDay: integer('times_per_day').notNull(),
    timeSlots: jsonb('time_slots').$type<string[]>().notNull(), // e.g., ["09:00", "14:00"]
    instructionNotes: text('instruction_notes'),
    prescribedBy: varchar('prescribed_by', { length: 255 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const healthRecordsRelations = relations(healthRecords, ({ one }) => ({
    tenant: one(tenants, { fields: [healthRecords.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [healthRecords.studentId], references: [students.id] }),
}));

export const healthIncidentsRelations = relations(healthIncidents, ({ one }) => ({
    tenant: one(tenants, { fields: [healthIncidents.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [healthIncidents.studentId], references: [students.id] }),
    reporter: one(users, { fields: [healthIncidents.reportedBy], references: [users.id] }),
}));

export const immunizationsRelations = relations(immunizations, ({ one }) => ({
    tenant: one(tenants, { fields: [immunizations.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [immunizations.studentId], references: [students.id] }),
}));

export const nurseVisitLogsRelations = relations(nurseVisitLogs, ({ one }) => ({
    tenant: one(tenants, { fields: [nurseVisitLogs.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [nurseVisitLogs.studentId], references: [students.id] }),
    nurse: one(users, { fields: [nurseVisitLogs.nurseId], references: [users.id] }),
}));

export const medicationSchedulesRelations = relations(medicationSchedules, ({ one }) => ({
    tenant: one(tenants, { fields: [medicationSchedules.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [medicationSchedules.studentId], references: [students.id] }),
}));

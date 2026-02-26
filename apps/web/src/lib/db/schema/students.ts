import { pgTable, uuid, varchar, text, timestamp, boolean, integer, date, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
import { grades, sections } from './academic';

// ─── Enums ───────────────────────────────────────────────────

export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER']);
export const bloodGroupEnum = pgEnum('blood_group', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
export const studentStatusEnum = pgEnum('student_status', ['ACTIVE', 'INACTIVE', 'ALUMNI', 'TRANSFERRED', 'SUSPENDED']);
export const guardianRelationEnum = pgEnum('guardian_relation', ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']);

// ─── Students ────────────────────────────────────────────────

export const students = pgTable('students', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id), // optional link to user account
    admissionNumber: varchar('admission_number', { length: 50 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    dateOfBirth: date('date_of_birth').notNull(),
    gender: genderEnum('gender').notNull(),
    bloodGroup: bloodGroupEnum('blood_group'),
    nationality: varchar('nationality', { length: 50 }).default('Indian'),
    religion: varchar('religion', { length: 50 }),
    category: varchar('category', { length: 50 }), // General, SC, ST, OBC
    aadhaarNumber: varchar('aadhaar_number', { length: 12 }), // encrypted at app level
    apaarId: varchar('apaar_id', { length: 20 }), // National Academic Depository
    address: text('address'),
    city: varchar('city', { length: 100 }),
    state: varchar('state', { length: 100 }),
    pincode: varchar('pincode', { length: 10 }),
    photoUrl: text('photo_url'),
    gradeId: uuid('grade_id').references(() => grades.id).notNull(),
    sectionId: uuid('section_id').references(() => sections.id).notNull(),
    rollNumber: integer('roll_number'),
    admissionDate: date('admission_date').notNull(),
    status: studentStatusEnum('status').default('ACTIVE').notNull(),
    previousSchool: varchar('previous_school', { length: 255 }),
    medicalNotes: text('medical_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Guardians ───────────────────────────────────────────────

export const guardians = pgTable('guardians', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id), // link to parent user account
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    relation: guardianRelationEnum('relation').notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }), // encrypted at app level
    phone: varchar('phone', { length: 20 }), // encrypted at app level
    alternatePhone: varchar('alternate_phone', { length: 20 }),
    occupation: varchar('occupation', { length: 100 }),
    annualIncome: varchar('annual_income', { length: 50 }),
    address: text('address'),
    isEmergencyContact: boolean('is_emergency_contact').default(false).notNull(),
    isPrimary: boolean('is_primary').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const studentsRelations = relations(students, ({ one, many }) => ({
    tenant: one(tenants, { fields: [students.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [students.userId], references: [users.id] }),
    grade: one(grades, { fields: [students.gradeId], references: [grades.id] }),
    section: one(sections, { fields: [students.sectionId], references: [sections.id] }),
    guardians: many(guardians),
}));

export const guardiansRelations = relations(guardians, ({ one }) => ({
    tenant: one(tenants, { fields: [guardians.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [guardians.userId], references: [users.id] }),
    student: one(students, { fields: [guardians.studentId], references: [students.id] }),
}));

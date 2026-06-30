import { pgTable, uuid, varchar, text, timestamp, integer, numeric, boolean, date, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const staffStatusEnum = pgEnum('staff_status', ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED', 'PROBATION']);
export const employmentTypeEnum = pgEnum('employment_type', ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'VISITING']);
export const leaveTypeEnum = pgEnum('leave_type', ['CL', 'SL', 'EL', 'ML', 'PL', 'COMP_OFF', 'LWP']);
export const leaveStatusEnum = pgEnum('leave_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);

// ─── Staff Departments ───────────────────────────────────────

export const staffDepartments = pgTable('staff_departments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    headOfDeptId: uuid('head_of_dept_id').references(() => users.id),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Designations ────────────────────────────────────────────

export const designations = pgTable('designations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    grade: varchar('grade', { length: 10 }),
    departmentId: uuid('department_id').references(() => staffDepartments.id),
    displayOrder: integer('display_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Staff Profiles ──────────────────────────────────────────

export const staffProfiles = pgTable('staff_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    employeeId: varchar('employee_id', { length: 20 }).notNull(),
    departmentId: uuid('department_id').references(() => staffDepartments.id),
    designationId: uuid('designation_id').references(() => designations.id),
    employmentType: employmentTypeEnum('employment_type').default('FULL_TIME').notNull(),
    status: staffStatusEnum('status').default('ACTIVE').notNull(),
    joiningDate: date('joining_date').notNull(),
    confirmationDate: date('confirmation_date'),
    resignationDate: date('resignation_date'),
    dateOfBirth: date('date_of_birth'),
    qualification: varchar('qualification', { length: 255 }),
    experience: integer('experience_years').default(0),
    specialization: varchar('specialization', { length: 255 }),
    // Salary components
    salaryBasic: numeric('salary_basic', { precision: 12, scale: 2 }).default('0'),
    salaryHra: numeric('salary_hra', { precision: 12, scale: 2 }).default('0'),
    salaryDa: numeric('salary_da', { precision: 12, scale: 2 }).default('0'),
    salaryPf: numeric('salary_pf', { precision: 12, scale: 2 }).default('0'),
    salaryTax: numeric('salary_tax', { precision: 12, scale: 2 }).default('0'),
    salaryGross: numeric('salary_gross', { precision: 12, scale: 2 }).default('0'),
    salaryNet: numeric('salary_net', { precision: 12, scale: 2 }).default('0'),
    // Documents
    panNumber: varchar('pan_number', { length: 20 }),
    aadhaarNumber: varchar('aadhaar_number', { length: 20 }),
    bankAccount: varchar('bank_account', { length: 30 }),
    bankName: varchar('bank_name', { length: 100 }),
    bankIfsc: varchar('bank_ifsc', { length: 15 }),
    address: text('address'),
    emergencyContact: varchar('emergency_contact', { length: 20 }),
    emergencyContactName: varchar('emergency_contact_name', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Leave Policies ──────────────────────────────────────────

export const leavePolicies = pgTable('leave_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    leaveType: leaveTypeEnum('leave_type').notNull(),
    maxDaysPerYear: integer('max_days_per_year').notNull(),
    carryForwardMax: integer('carry_forward_max').default(0).notNull(),
    minServiceDays: integer('min_service_days').default(0), // eligible after N days
    isHalfDayAllowed: boolean('is_half_day_allowed').default(true).notNull(),
    isPaidLeave: boolean('is_paid_leave').default(true).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Leave Requests ──────────────────────────────────────────

export const leaveRequests = pgTable('leave_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    staffId: uuid('staff_id').references(() => staffProfiles.id, { onDelete: 'cascade' }).notNull(),
    leaveType: leaveTypeEnum('leave_type').notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    totalDays: numeric('total_days', { precision: 4, scale: 1 }).notNull(),
    reason: text('reason').notNull(),
    status: leaveStatusEnum('status').default('PENDING').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const staffDepartmentsRelations = relations(staffDepartments, ({ one, many }) => ({
    tenant: one(tenants, { fields: [staffDepartments.tenantId], references: [tenants.id] }),
    headOfDept: one(users, { fields: [staffDepartments.headOfDeptId], references: [users.id] }),
    designations: many(designations),
    staffProfiles: many(staffProfiles),
}));

export const designationsRelations = relations(designations, ({ one }) => ({
    tenant: one(tenants, { fields: [designations.tenantId], references: [tenants.id] }),
    department: one(staffDepartments, { fields: [designations.departmentId], references: [staffDepartments.id] }),
}));

export const staffProfilesRelations = relations(staffProfiles, ({ one, many }) => ({
    tenant: one(tenants, { fields: [staffProfiles.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [staffProfiles.userId], references: [users.id] }),
    department: one(staffDepartments, { fields: [staffProfiles.departmentId], references: [staffDepartments.id] }),
    designation: one(designations, { fields: [staffProfiles.designationId], references: [designations.id] }),
    leaveRequests: many(leaveRequests),
}));

export const leavePoliciesRelations = relations(leavePolicies, ({ one }) => ({
    tenant: one(tenants, { fields: [leavePolicies.tenantId], references: [tenants.id] }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
    tenant: one(tenants, { fields: [leaveRequests.tenantId], references: [tenants.id] }),
    staff: one(staffProfiles, { fields: [leaveRequests.staffId], references: [staffProfiles.id] }),
    approver: one(users, { fields: [leaveRequests.approvedBy], references: [users.id] }),
}));

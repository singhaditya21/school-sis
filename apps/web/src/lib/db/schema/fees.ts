import { pgTable, uuid, varchar, text, timestamp, boolean, integer, numeric, date, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './core';
import { academicYears } from './academic';
import { students } from './students';

// ─── Enums ───────────────────────────────────────────────────

export const feeFrequencyEnum = pgEnum('fee_frequency', ['MONTHLY', 'QUARTERLY', 'TERM_WISE', 'ANNUAL', 'ONE_TIME']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['DRAFT', 'PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED', 'WAIVED']);
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE']);
export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']);
export const concessionTypeEnum = pgEnum('concession_type', ['PERCENTAGE', 'FIXED', 'SIBLING', 'MERIT', 'STAFF_CHILD', 'CUSTOM']);

// ─── Fee Plans ───────────────────────────────────────────────

export const feePlans = pgTable('fee_plans', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Fee Components ──────────────────────────────────────────

export const feeComponents = pgTable('fee_components', {
    id: uuid('id').primaryKey().defaultRandom(),
    feePlanId: uuid('fee_plan_id').references(() => feePlans.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(), // Tuition, Transport, Library, Lab
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    frequency: feeFrequencyEnum('frequency').notNull(),
    isOptional: boolean('is_optional').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Invoices ────────────────────────────────────────────────

export const invoices = pgTable('invoices', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    feePlanId: uuid('fee_plan_id').references(() => feePlans.id).notNull(),
    invoiceNumber: varchar('invoice_number', { length: 50 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    paidAmount: numeric('paid_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    dueDate: date('due_date').notNull(),
    status: invoiceStatusEnum('status').default('PENDING').notNull(),
    description: text('description'),
    lineItems: text('line_items'), // JSON string of fee components breakdown
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Payments ────────────────────────────────────────────────

export const payments = pgTable('payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    status: paymentStatusEnum('status').default('COMPLETED').notNull(),
    transactionId: varchar('transaction_id', { length: 255 }), // gateway ref
    razorpayPaymentId: varchar('razorpay_payment_id', { length: 255 }),
    chequeNumber: varchar('cheque_number', { length: 50 }),
    bankName: varchar('bank_name', { length: 100 }),
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Receipts ────────────────────────────────────────────────

export const receipts = pgTable('receipts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    paymentId: uuid('payment_id').references(() => payments.id).notNull(),
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull(),
    pdfUrl: text('pdf_url'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Concessions ─────────────────────────────────────────────

export const concessions = pgTable('concessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }).notNull(),
    feePlanId: uuid('fee_plan_id').references(() => feePlans.id).notNull(),
    type: concessionTypeEnum('type').notNull(),
    value: numeric('value', { precision: 12, scale: 2 }).notNull(), // percentage or fixed amount
    reason: text('reason'),
    approvedBy: uuid('approved_by').references(() => tenants.id), // FK to users
    isActive: boolean('is_active').default(true).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Fine Rules ──────────────────────────────────────────────

export const fineRules = pgTable('fine_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    feePlanId: uuid('fee_plan_id').references(() => feePlans.id).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    daysAfterDue: integer('days_after_due').notNull(),
    fineAmount: numeric('fine_amount', { precision: 12, scale: 2 }).notNull(),
    isPercentage: boolean('is_percentage').default(false).notNull(),
    maxFine: numeric('max_fine', { precision: 12, scale: 2 }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const feePlansRelations = relations(feePlans, ({ one, many }) => ({
    tenant: one(tenants, { fields: [feePlans.tenantId], references: [tenants.id] }),
    academicYear: one(academicYears, { fields: [feePlans.academicYearId], references: [academicYears.id] }),
    components: many(feeComponents),
    invoices: many(invoices),
    concessions: many(concessions),
    fineRules: many(fineRules),
}));

export const feeComponentsRelations = relations(feeComponents, ({ one }) => ({
    feePlan: one(feePlans, { fields: [feeComponents.feePlanId], references: [feePlans.id] }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
    tenant: one(tenants, { fields: [invoices.tenantId], references: [tenants.id] }),
    student: one(students, { fields: [invoices.studentId], references: [students.id] }),
    feePlan: one(feePlans, { fields: [invoices.feePlanId], references: [feePlans.id] }),
    payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
    tenant: one(tenants, { fields: [payments.tenantId], references: [tenants.id] }),
    invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
    student: one(students, { fields: [payments.studentId], references: [students.id] }),
    receipts: many(receipts),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
    tenant: one(tenants, { fields: [receipts.tenantId], references: [tenants.id] }),
    payment: one(payments, { fields: [receipts.paymentId], references: [payments.id] }),
}));

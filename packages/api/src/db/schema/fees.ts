import { pgTable, uuid, varchar, text, timestamp, boolean, integer, numeric, date, pgEnum, customType, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';
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
    embedding: customType<{ data: number[]; driverData: string }>({
        dataType() {
            return 'text';
        },
    })('embedding'),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    customDataIdx: index('idx_invoices_custom_data').using('gin', table.customData),
    tenantStatusDueIdx: index('idx_invoices_tenant_status_due').on(table.tenantId, table.status, table.dueDate),
    tenantStudentStatusIdx: index('idx_invoices_tenant_student_status').on(table.tenantId, table.studentId, table.status),
    tenantDueIdx: index('idx_invoices_tenant_due').on(table.tenantId, table.dueDate),
}));

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
}, (table) => ({
    tenantStatusPaidIdx: index('idx_payments_tenant_status_paid').on(table.tenantId, table.status, table.paidAt),
    tenantInvoiceIdx: index('idx_payments_tenant_invoice').on(table.tenantId, table.invoiceId),
    tenantStudentPaidIdx: index('idx_payments_tenant_student_paid').on(table.tenantId, table.studentId, table.paidAt),
}));

// ─── Payment Provider Orders ────────────────────────────────

export const paymentOrders = pgTable('payment_orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
    studentId: uuid('student_id').references(() => students.id).notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    providerOrderId: varchar('provider_order_id', { length: 255 }),
    providerPaymentId: varchar('provider_payment_id', { length: 255 }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    status: varchar('status', { length: 32 }).default('CREATED').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantInvoiceIdx: index('idx_payment_orders_tenant_invoice').on(table.tenantId, table.invoiceId),
    providerOrderIdx: uniqueIndex('uq_payment_orders_provider_order').on(table.provider, table.providerOrderId),
    idempotencyIdx: uniqueIndex('uq_payment_orders_tenant_idempotency').on(table.tenantId, table.idempotencyKey),
}));

// ─── Payment Provider Webhook Events ────────────────────────

export const paymentProviderEvents = pgTable('payment_provider_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    eventId: varchar('event_id', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 255 }).notNull(),
    status: varchar('status', { length: 32 }).default('PROCESSING').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
    error: text('error'),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
}, (table) => ({
    providerEventIdx: uniqueIndex('uq_payment_provider_events_provider_event').on(table.provider, table.eventId),
    tenantIdx: index('idx_payment_provider_events_tenant').on(table.tenantId),
}));

// ─── Payment Audit Trail ────────────────────────────────────

export const paymentAuditLogs = pgTable('payment_audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    paymentOrderId: uuid('payment_order_id').references(() => paymentOrders.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    providerEventId: uuid('provider_event_id').references(() => paymentProviderEvents.id, { onDelete: 'set null' }),
    provider: varchar('provider', { length: 32 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    currency: varchar('currency', { length: 3 }).default('INR').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantCreatedIdx: index('idx_payment_audit_logs_tenant_created').on(table.tenantId, table.createdAt),
    invoiceIdx: index('idx_payment_audit_logs_invoice').on(table.invoiceId),
}));

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

export const paymentOrdersRelations = relations(paymentOrders, ({ one }) => ({
    tenant: one(tenants, { fields: [paymentOrders.tenantId], references: [tenants.id] }),
    invoice: one(invoices, { fields: [paymentOrders.invoiceId], references: [invoices.id] }),
    student: one(students, { fields: [paymentOrders.studentId], references: [students.id] }),
    createdByUser: one(users, { fields: [paymentOrders.createdBy], references: [users.id] }),
}));

export const paymentProviderEventsRelations = relations(paymentProviderEvents, ({ one }) => ({
    tenant: one(tenants, { fields: [paymentProviderEvents.tenantId], references: [tenants.id] }),
}));

export const paymentAuditLogsRelations = relations(paymentAuditLogs, ({ one }) => ({
    tenant: one(tenants, { fields: [paymentAuditLogs.tenantId], references: [tenants.id] }),
    invoice: one(invoices, { fields: [paymentAuditLogs.invoiceId], references: [invoices.id] }),
    payment: one(payments, { fields: [paymentAuditLogs.paymentId], references: [payments.id] }),
    paymentOrder: one(paymentOrders, { fields: [paymentAuditLogs.paymentOrderId], references: [paymentOrders.id] }),
    actor: one(users, { fields: [paymentAuditLogs.actorUserId], references: [users.id] }),
    providerEvent: one(paymentProviderEvents, { fields: [paymentAuditLogs.providerEventId], references: [paymentProviderEvents.id] }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
    tenant: one(tenants, { fields: [receipts.tenantId], references: [tenants.id] }),
    payment: one(payments, { fields: [receipts.paymentId], references: [payments.id] }),
}));

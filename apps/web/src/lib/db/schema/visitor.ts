import { pgTable, uuid, varchar, text, timestamp, pgEnum, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const visitPurposeEnum = pgEnum('visit_purpose', ['MEETING', 'ADMISSION', 'DELIVERY', 'INTERVIEW', 'PARENT_VISIT', 'VENDOR', 'OTHER']);
export const visitorStatusEnum = pgEnum('visitor_status', ['CHECKED_IN', 'CHECKED_OUT', 'PRE_APPROVED']);

// ─── Visitors ────────────────────────────────────────────────

export const visitors = pgTable('visitors', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 255 }),
    company: varchar('company', { length: 255 }),
    purpose: visitPurposeEnum('purpose').notNull(),
    purposeDetails: text('purpose_details'),
    hostName: varchar('host_name', { length: 200 }).notNull(),
    hostDepartment: varchar('host_department', { length: 100 }).notNull(),
    photo: text('photo'),
    idProof: varchar('id_proof', { length: 100 }).notNull(),
    idNumber: varchar('id_number', { length: 100 }).notNull(),
    vehicleNumber: varchar('vehicle_number', { length: 20 }),
    checkInTime: timestamp('check_in_time', { withTimezone: true }).defaultNow().notNull(),
    checkOutTime: timestamp('check_out_time', { withTimezone: true }),
    status: visitorStatusEnum('status').default('CHECKED_IN').notNull(),
    visitorPass: varchar('visitor_pass', { length: 20 }),
    preApprovedBy: uuid('pre_approved_by').references(() => users.id),
    preApprovedDate: timestamp('pre_approved_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const visitorsRelations = relations(visitors, ({ one }) => ({
    tenant: one(tenants, { fields: [visitors.tenantId], references: [tenants.id] }),
    approver: one(users, { fields: [visitors.preApprovedBy], references: [users.id] }),
}));

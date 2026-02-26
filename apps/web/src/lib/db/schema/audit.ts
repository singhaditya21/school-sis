import { pgTable, uuid, varchar, text, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Audit Log ───────────────────────────────────────────────

export const auditActionEnum = pgEnum('audit_action', ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'EXPORT', 'PAYMENT', 'ROLE_CHANGE']);

export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id),
    action: auditActionEnum('action').notNull(),
    entityType: varchar('entity_type', { length: 100 }).notNull(), // 'student', 'invoice', etc.
    entityId: uuid('entity_id'),
    description: text('description'),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

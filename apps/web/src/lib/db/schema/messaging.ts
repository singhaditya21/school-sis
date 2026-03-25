import { pgTable, uuid, varchar, text, timestamp, integer, pgEnum, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const msgTemplateChannelEnum = pgEnum('msg_template_channel', ['SMS', 'WHATSAPP', 'EMAIL']);
export const msgTemplateStatusEnum = pgEnum('msg_template_status', ['QUEUED', 'SENT', 'DELIVERED', 'FAILED']);

// ─── Message Templates ──────────────────────────────────────

export const messageTemplates = pgTable('message_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    channel: msgTemplateChannelEnum('channel').notNull(),
    subject: varchar('subject', { length: 500 }),
    body: text('body').notNull(),
    variables: jsonb('variables').$type<string[]>().default([]),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Message Logs ────────────────────────────────────────────

export const messageLogs = pgTable('message_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    templateId: uuid('template_id').references(() => messageTemplates.id),
    channel: msgTemplateChannelEnum('channel').notNull(),
    recipients: jsonb('recipients').$type<string[]>().default([]),
    message: text('message').notNull(),
    subject: varchar('subject', { length: 500 }),
    sentBy: uuid('sent_by').references(() => users.id),
    sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    status: msgTemplateStatusEnum('status').default('QUEUED').notNull(),
    deliveryCount: integer('delivery_count').default(0),
    failureCount: integer('failure_count').default(0),
});

// ─── Relations ───────────────────────────────────────────────

export const messageTemplatesRelations = relations(messageTemplates, ({ one }) => ({
    tenant: one(tenants, { fields: [messageTemplates.tenantId], references: [tenants.id] }),
}));

export const messageLogsRelations = relations(messageLogs, ({ one }) => ({
    tenant: one(tenants, { fields: [messageLogs.tenantId], references: [tenants.id] }),
    template: one(messageTemplates, { fields: [messageLogs.templateId], references: [messageTemplates.id] }),
    sender: one(users, { fields: [messageLogs.sentBy], references: [users.id] }),
}));

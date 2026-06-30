import { pgTable, uuid, varchar, text, timestamp, boolean, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants, users } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const messageChannelEnum = pgEnum('message_channel', ['SMS', 'WHATSAPP', 'EMAIL', 'IN_APP', 'PUSH']);
export const messageStatusEnum = pgEnum('message_status', ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ']);
export const consentChannelEnum = pgEnum('consent_channel', ['SMS', 'WHATSAPP', 'EMAIL']);

// ─── Messages ────────────────────────────────────────────────

export const messages = pgTable('messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    channel: messageChannelEnum('channel').notNull(),
    recipientId: uuid('recipient_id').references(() => users.id),
    recipientPhone: varchar('recipient_phone', { length: 20 }),
    recipientEmail: varchar('recipient_email', { length: 255 }),
    subject: varchar('subject', { length: 500 }),
    body: text('body').notNull(),
    templateId: varchar('template_id', { length: 100 }), // DLT template ID
    status: messageStatusEnum('status').default('QUEUED').notNull(),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    errorMessage: text('error_message'),
    metadata: jsonb('metadata'), // provider-specific data
    sentBy: uuid('sent_by').references(() => users.id),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Communication Consents ──────────────────────────────────

export const consents = pgTable('consents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    channel: consentChannelEnum('channel').notNull(),
    isOptedIn: boolean('is_opted_in').default(true).notNull(),
    optInAt: timestamp('opt_in_at', { withTimezone: true }),
    optOutAt: timestamp('opt_out_at', { withTimezone: true }),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const messagesRelations = relations(messages, ({ one }) => ({
    tenant: one(tenants, { fields: [messages.tenantId], references: [tenants.id] }),
    recipient: one(users, { fields: [messages.recipientId], references: [users.id] }),
    sender: one(users, { fields: [messages.sentBy], references: [users.id] }),
}));

export const consentsRelations = relations(consents, ({ one }) => ({
    tenant: one(tenants, { fields: [consents.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [consents.userId], references: [users.id] }),
}));

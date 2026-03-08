import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './core';

// ─── Enums ───────────────────────────────────────────────────

export const webhookStatusEnum = pgEnum('webhook_status', ['ACTIVE', 'INACTIVE', 'PAUSED']);
export const deliveryStatusEnum = pgEnum('delivery_status', ['PENDING', 'SUCCESS', 'FAILED', 'RETRYING']);

// ─── Webhook Subscriptions ───────────────────────────────────

export const webhookSubscriptions = pgTable('webhook_subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    url: text('url').notNull(),
    secret: varchar('secret', { length: 255 }).notNull(),
    events: jsonb('events').notNull(), // ['student.created', 'fee.paid', ...]
    status: webhookStatusEnum('status').default('ACTIVE').notNull(),
    headers: jsonb('headers'), // custom HTTP headers
    retryCount: integer('retry_count').default(3).notNull(),
    timeoutMs: integer('timeout_ms').default(5000).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Webhook Deliveries ──────────────────────────────────────

export const webhookDeliveries = pgTable('webhook_deliveries', {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id').references(() => webhookSubscriptions.id, { onDelete: 'cascade' }).notNull(),
    event: varchar('event', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: deliveryStatusEnum('status').default('PENDING').notNull(),
    responseCode: integer('response_code'),
    responseBody: text('response_body'),
    attempts: integer('attempts').default(0).notNull(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── Relations ───────────────────────────────────────────────

export const webhookSubscriptionsRelations = relations(webhookSubscriptions, ({ one, many }) => ({
    tenant: one(tenants, { fields: [webhookSubscriptions.tenantId], references: [tenants.id] }),
    deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
    subscription: one(webhookSubscriptions, { fields: [webhookDeliveries.subscriptionId], references: [webhookSubscriptions.id] }),
}));

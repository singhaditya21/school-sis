import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, boolean, pgEnum, index, unique } from 'drizzle-orm/pg-core';
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

export const webhookDeliveries = pgTable(
    'webhook_deliveries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
        subscriptionId: uuid('subscription_id').references(() => webhookSubscriptions.id, { onDelete: 'cascade' }).notNull(),
        event: varchar('event', { length: 100 }).notNull(),
        eventId: uuid('event_id').defaultRandom().notNull(),
        idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
        payload: jsonb('payload').notNull(),
        requestHeaders: jsonb('request_headers'),
        signature: varchar('signature', { length: 128 }),
        status: deliveryStatusEnum('status').default('PENDING').notNull(),
        responseCode: integer('response_code'),
        responseBody: text('response_body'),
        attempts: integer('attempts').default(0).notNull(),
        lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
        nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
        error: text('error'),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        tenantCreatedIdx: index('idx_webhook_deliveries_tenant_created').on(table.tenantId, table.createdAt),
        retryIdx: index('idx_webhook_deliveries_retry').on(table.status, table.nextRetryAt),
        idempotencyUnique: unique('webhook_deliveries_subscription_id_idempotency_key_key').on(
            table.subscriptionId,
            table.idempotencyKey,
        ),
    }),
);

// ─── Relations ───────────────────────────────────────────────

export const webhookSubscriptionsRelations = relations(webhookSubscriptions, ({ one, many }) => ({
    tenant: one(tenants, { fields: [webhookSubscriptions.tenantId], references: [tenants.id] }),
    deliveries: many(webhookDeliveries),
}));

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
    tenant: one(tenants, { fields: [webhookDeliveries.tenantId], references: [tenants.id] }),
    subscription: one(webhookSubscriptions, { fields: [webhookDeliveries.subscriptionId], references: [webhookSubscriptions.id] }),
}));

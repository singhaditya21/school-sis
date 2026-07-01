import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './core';
import { messageTemplates } from './messaging';

export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    queue: varchar('queue', { length: 80 }).default('default').notNull(),
    taskName: varchar('task_name', { length: 120 }).notNull(),
    status: varchar('status', { length: 30 }).default('QUEUED').notNull(),
    priority: integer('priority').default(0).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow().notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 120 }),
    lastError: text('last_error'),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantStatusAvailableIdx: index('idx_background_jobs_tenant_status_available').on(
      table.tenantId,
      table.status,
      table.availableAt,
    ),
    queueStatusAvailableIdx: index('idx_background_jobs_queue_status_available').on(
      table.queue,
      table.status,
      table.availableAt,
    ),
    taskStatusIdx: index('idx_background_jobs_task_status').on(table.taskName, table.status),
    tenantIdempotencyUnique: uniqueIndex('background_jobs_tenant_idempotency_key').on(
      table.tenantId,
      table.idempotencyKey,
    ).where(sql`${table.tenantId} IS NOT NULL AND ${table.idempotencyKey} IS NOT NULL`),
    platformIdempotencyUnique: uniqueIndex('background_jobs_platform_idempotency_key').on(
      table.idempotencyKey,
    ).where(sql`${table.tenantId} IS NULL AND ${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const backgroundJobAttempts = pgTable(
  'background_job_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull().references(() => backgroundJobs.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    attemptNumber: integer('attempt_number').notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    workerId: varchar('worker_id', { length: 120 }),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    result: jsonb('result').$type<Record<string, unknown> | null>(),
  },
  (table) => ({
    jobAttemptIdx: index('idx_background_job_attempts_job_attempt').on(table.jobId, table.attemptNumber),
    tenantStartedIdx: index('idx_background_job_attempts_tenant_started').on(table.tenantId, table.startedAt),
  }),
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => backgroundJobs.id, { onDelete: 'set null' }),
    channel: varchar('channel', { length: 20 }).notNull(),
    status: varchar('status', { length: 30 }).default('PENDING').notNull(),
    provider: varchar('provider', { length: 40 }).default('mock').notNull(),
    recipient: varchar('recipient', { length: 320 }).notNull(),
    recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 500 }),
    body: text('body').notNull(),
    templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'set null' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).defaultNow().notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    lastError: text('last_error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => ({
    tenantStatusNextAttemptIdx: index('idx_notification_outbox_tenant_status_next').on(
      table.tenantId,
      table.status,
      table.nextAttemptAt,
    ),
    jobIdx: index('idx_notification_outbox_job').on(table.jobId),
    recipientIdx: index('idx_notification_outbox_recipient').on(table.tenantId, table.recipient),
    tenantIdempotencyUnique: uniqueIndex('notification_outbox_tenant_idempotency_key').on(
      table.tenantId,
      table.idempotencyKey,
    ).where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const notificationDeliveryEvents = pgTable(
  'notification_delivery_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    notificationId: uuid('notification_id').notNull().references(() => notificationOutbox.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => backgroundJobs.id, { onDelete: 'set null' }),
    status: varchar('status', { length: 30 }).notNull(),
    provider: varchar('provider', { length: 40 }).default('mock').notNull(),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    error: text('error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    notificationCreatedIdx: index('idx_notification_events_notification_created').on(
      table.notificationId,
      table.createdAt,
    ),
    tenantCreatedIdx: index('idx_notification_events_tenant_created').on(table.tenantId, table.createdAt),
  }),
);

export const backgroundJobsRelations = relations(backgroundJobs, ({ one, many }) => ({
  tenant: one(tenants, { fields: [backgroundJobs.tenantId], references: [tenants.id] }),
  creator: one(users, { fields: [backgroundJobs.createdBy], references: [users.id] }),
  attempts: many(backgroundJobAttempts),
  notifications: many(notificationOutbox),
}));

export const backgroundJobAttemptsRelations = relations(backgroundJobAttempts, ({ one }) => ({
  job: one(backgroundJobs, { fields: [backgroundJobAttempts.jobId], references: [backgroundJobs.id] }),
  tenant: one(tenants, { fields: [backgroundJobAttempts.tenantId], references: [tenants.id] }),
}));

export const notificationOutboxRelations = relations(notificationOutbox, ({ one, many }) => ({
  tenant: one(tenants, { fields: [notificationOutbox.tenantId], references: [tenants.id] }),
  job: one(backgroundJobs, { fields: [notificationOutbox.jobId], references: [backgroundJobs.id] }),
  recipientUser: one(users, { fields: [notificationOutbox.recipientUserId], references: [users.id] }),
  creator: one(users, { fields: [notificationOutbox.createdBy], references: [users.id] }),
  template: one(messageTemplates, { fields: [notificationOutbox.templateId], references: [messageTemplates.id] }),
  events: many(notificationDeliveryEvents),
}));

export const notificationDeliveryEventsRelations = relations(notificationDeliveryEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [notificationDeliveryEvents.tenantId], references: [tenants.id] }),
  notification: one(notificationOutbox, {
    fields: [notificationDeliveryEvents.notificationId],
    references: [notificationOutbox.id],
  }),
  job: one(backgroundJobs, { fields: [notificationDeliveryEvents.jobId], references: [backgroundJobs.id] }),
}));

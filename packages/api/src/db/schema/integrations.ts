import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

export const integrationApiKeys = pgTable(
  'integration_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    provider: varchar('provider', { length: 40 }).default('PLATFORM').notNull(),
    keyPrefix: varchar('key_prefix', { length: 32 }).notNull(),
    keyHash: varchar('key_hash', { length: 128 }).notNull(),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    keyHashUnique: unique('integration_api_keys_key_hash_key').on(table.keyHash),
    tenantProviderIdx: index('idx_integration_api_keys_tenant_provider').on(table.tenantId, table.provider),
    tenantStatusIdx: index('idx_integration_api_keys_tenant_status').on(table.tenantId, table.status),
  }),
);

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    mode: varchar('mode', { length: 20 }).default('MOCK').notNull(),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    config: jsonb('config').$type<Record<string, unknown>>().default({}).notNull(),
    scopes: jsonb('scopes').$type<string[]>().default([]).notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantProviderUnique: unique('integration_connections_tenant_provider_key').on(table.tenantId, table.provider),
    tenantStatusIdx: index('idx_integration_connections_tenant_status').on(table.tenantId, table.status),
  }),
);

export const integrationAuditLogs = pgTable(
  'integration_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull(),
    action: varchar('action', { length: 120 }).notNull(),
    direction: varchar('direction', { length: 20 }).default('INBOUND').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    apiKeyId: uuid('api_key_id').references(() => integrationApiKeys.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    requestId: varchar('request_id', { length: 80 }),
    idempotencyKey: varchar('idempotency_key', { length: 120 }),
    httpMethod: varchar('http_method', { length: 12 }),
    path: text('path'),
    statusCode: integer('status_code'),
    durationMs: integer('duration_ms'),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantProviderCreatedIdx: index('idx_integration_audit_tenant_provider_created').on(
      table.tenantId,
      table.provider,
      table.createdAt,
    ),
    requestIdx: index('idx_integration_audit_request').on(table.requestId),
  }),
);

export const integrationApiKeysRelations = relations(integrationApiKeys, ({ one, many }) => ({
  tenant: one(tenants, { fields: [integrationApiKeys.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [integrationApiKeys.createdBy], references: [users.id] }),
  revokedByUser: one(users, { fields: [integrationApiKeys.revokedBy], references: [users.id] }),
  auditLogs: many(integrationAuditLogs),
}));

export const integrationConnectionsRelations = relations(integrationConnections, ({ one }) => ({
  tenant: one(tenants, { fields: [integrationConnections.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [integrationConnections.createdBy], references: [users.id] }),
  updatedByUser: one(users, { fields: [integrationConnections.updatedBy], references: [users.id] }),
}));

export const integrationAuditLogsRelations = relations(integrationAuditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [integrationAuditLogs.tenantId], references: [tenants.id] }),
  apiKey: one(integrationApiKeys, { fields: [integrationAuditLogs.apiKeyId], references: [integrationApiKeys.id] }),
  actorUser: one(users, { fields: [integrationAuditLogs.actorUserId], references: [users.id] }),
}));

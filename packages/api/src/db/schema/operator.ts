import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

export const operatorConsoleSnapshots = pgTable(
  'operator_console_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    status: varchar('status', { length: 20 }).default('HEALTHY').notNull(),
    healthScore: integer('health_score').default(100).notNull(),
    generatedBy: uuid('generated_by').references(() => users.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    metrics: jsonb('metrics').$type<Record<string, unknown>>().default({}).notNull(),
    signals: jsonb('signals').$type<Array<Record<string, unknown>>>().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantGeneratedIdx: index('idx_operator_snapshots_tenant_generated').on(table.tenantId, table.generatedAt),
    scopeStatusIdx: index('idx_operator_snapshots_scope_status').on(table.scope, table.status, table.generatedAt),
  }),
);

export const operatorConsoleRunbooks = pgTable(
  'operator_console_runbooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('PLATFORM').notNull(),
    code: varchar('code', { length: 160 }).notNull(),
    domain: varchar('domain', { length: 60 }).notNull(),
    title: varchar('title', { length: 240 }).notNull(),
    severity: varchar('severity', { length: 20 }).default('WARNING').notNull(),
    ownerRole: varchar('owner_role', { length: 80 }).notNull(),
    summary: text('summary').notNull(),
    steps: jsonb('steps').$type<string[]>().default([]).notNull(),
    escalation: text('escalation'),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    codeUnique: unique('operator_console_runbooks_code_key').on(table.code),
    tenantDomainIdx: index('idx_operator_runbooks_tenant_domain').on(table.tenantId, table.domain),
    statusIdx: index('idx_operator_runbooks_status').on(table.status),
  }),
);

export const operatorConsoleActionLogs = pgTable(
  'operator_console_action_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    domain: varchar('domain', { length: 60 }).notNull(),
    actionType: varchar('action_type', { length: 80 }).notNull(),
    auditAction: varchar('audit_action', { length: 160 }).notNull(),
    targetType: varchar('target_type', { length: 80 }),
    targetId: varchar('target_id', { length: 160 }),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    status: varchar('status', { length: 30 }).default('REQUESTED').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: varchar('actor_role', { length: 80 }).notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantActionCreatedIdx: index('idx_operator_actions_tenant_action_created').on(
      table.tenantId,
      table.actionType,
      table.createdAt,
    ),
    statusIdx: index('idx_operator_actions_status').on(table.status, table.createdAt),
    targetIdx: index('idx_operator_actions_target').on(table.targetType, table.targetId),
    tenantIdempotencyUnique: uniqueIndex('operator_actions_tenant_idempotency_key').on(
      table.tenantId,
      table.idempotencyKey,
    ).where(sql`${table.tenantId} IS NOT NULL AND ${table.idempotencyKey} IS NOT NULL`),
    platformIdempotencyUnique: uniqueIndex('operator_actions_platform_idempotency_key').on(
      table.idempotencyKey,
    ).where(sql`${table.tenantId} IS NULL AND ${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const operatorConsoleSnapshotsRelations = relations(operatorConsoleSnapshots, ({ one }) => ({
  tenant: one(tenants, { fields: [operatorConsoleSnapshots.tenantId], references: [tenants.id] }),
  generatedByUser: one(users, { fields: [operatorConsoleSnapshots.generatedBy], references: [users.id] }),
}));

export const operatorConsoleRunbooksRelations = relations(operatorConsoleRunbooks, ({ one }) => ({
  tenant: one(tenants, { fields: [operatorConsoleRunbooks.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [operatorConsoleRunbooks.createdBy], references: [users.id] }),
  updatedByUser: one(users, { fields: [operatorConsoleRunbooks.updatedBy], references: [users.id] }),
}));

export const operatorConsoleActionLogsRelations = relations(operatorConsoleActionLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [operatorConsoleActionLogs.tenantId], references: [tenants.id] }),
  actor: one(users, { fields: [operatorConsoleActionLogs.actorUserId], references: [users.id] }),
}));

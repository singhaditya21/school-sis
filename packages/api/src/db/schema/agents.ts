import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, index, uniqueIndex, vector } from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

export const embeddings = pgTable('embeddings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    collection: varchar('collection', { length: 50 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    textContent: text('text_content').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    indexedAt: timestamp('indexed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantCollectionIdx: index('idx_embeddings_tenant_collection').on(table.tenantId, table.collection),
    entityUniqueIdx: uniqueIndex('uq_embeddings_tenant_collection_entity').on(table.tenantId, table.collection, table.entityId),
    vectorIdx: index('idx_embeddings_vector').using('hnsw', table.embedding.op('vector_cosine_ops')),
}));

export const agentAuditLogs = pgTable('agent_audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    agentName: varchar('agent_name', { length: 50 }).notNull(),
    query: text('query'),
    prompt: text('prompt'),
    response: text('response'),
    toolCalls: jsonb('tool_calls').$type<Record<string, unknown>[]>().default([]),
    toolResults: jsonb('tool_results').$type<Record<string, unknown>[]>().default([]),
    tokensUsed: integer('tokens_used').default(0).notNull(),
    latencyMs: integer('latency_ms').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantCreatedIdx: index('idx_agent_audit_tenant').on(table.tenantId, table.createdAt),
    agentCreatedIdx: index('idx_agent_audit_agent').on(table.agentName, table.createdAt),
}));

export const agentApprovals = pgTable('agent_approvals', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    agentName: varchar('agent_name', { length: 50 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    proposedAction: jsonb('proposed_action').$type<Record<string, unknown>>().notNull(),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(),
    priority: varchar('priority', { length: 20 }).default('NORMAL').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tenantStatusIdx: index('idx_agent_approvals_tenant_status').on(table.tenantId, table.status, table.createdAt),
}));

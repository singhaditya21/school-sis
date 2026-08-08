import {
    bigint,
    boolean,
    date,
    index,
    integer,
    numeric,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { companies, tenants, users } from './core';

// ─── Platform Audit Logs (Stage 2) ──────────────────────────

export const platformAuditLogs = pgTable('platform_audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    targetCompanyId: uuid('target_company_id').references(() => companies.id, { onDelete: 'cascade' }),
    targetTenantId: uuid('target_tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    actionType: varchar('action_type', { length: 255 }).notNull(), // e.g. 'IMPERSONATE', 'TOGGLE_TIER', 'SUSPEND'
    metadata: text('metadata'), // JSON block of parameters
    ipAddress: varchar('ip_address', { length: 50 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── AI Token Economy Logs (Stage 1) ─────────────────────────

export const aiTokenLogs = pgTable('ai_token_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }).notNull(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    requestId: uuid('request_id'),
    agentType: varchar('agent_type', { length: 150 }).notNull(), // e.g., 'FEE_INTELLIGENCE'
    provider: varchar('provider', { length: 100 }),
    model: varchar('model', { length: 100 }).notNull(), // 'gpt-4o', 'qwen-7b'
    tokensUsed: integer('tokens_used').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    computeCostMs: integer('compute_cost_ms').notNull(),
    queryCostUsd: numeric('query_cost_usd', { precision: 12, scale: 6 }).default('0').notNull(),
    requestStatus: varchar('request_status', { length: 24 }).default('COMPLETED').notNull(),
    failureReason: varchar('failure_reason', { length: 160 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Atomic monthly budget counters. `scope_id` is the tenant id for TENANT rows
 * and the user id for USER rows. Keeping both scopes in one table lets a single
 * tenant-scoped transaction reserve both ceilings before a provider is called.
 */
export const aiBudgetUsage = pgTable('ai_budget_usage', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
    scopeKind: varchar('scope_kind', { length: 16 }).notNull(),
    scopeId: uuid('scope_id').notNull(),
    periodStart: date('period_start').notNull(),
    reservedTokens: bigint('reserved_tokens', { mode: 'number' }).default(0).notNull(),
    usedTokens: bigint('used_tokens', { mode: 'number' }).default(0).notNull(),
    reservedCostMicrousd: bigint('reserved_cost_microusd', { mode: 'number' }).default(0).notNull(),
    usedCostMicrousd: bigint('used_cost_microusd', { mode: 'number' }).default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    scopePeriodUnique: unique('ai_budget_usage_scope_period_key').on(
        table.scopeKind,
        table.scopeId,
        table.periodStart,
    ),
    tenantPeriodIdx: index('idx_ai_budget_usage_tenant_period').on(table.tenantId, table.periodStart),
}));

// ─── Platform Broadcasts (Stage 5) ───────────────────────────

export const platformBroadcasts = pgTable('platform_broadcasts', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    targetTiers: text('target_tiers').array(), // nullable = ALL, or ['CORE', 'AI_PRO']
    targetModules: text('target_modules').array(), // constraint flag mapping
    isActive: boolean('is_active').default(true).notNull(),
    type: varchar('type', { length: 50 }).default('INFO').notNull(), // INFO, WARNING, MAINTENANCE, CRITICAL
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
});

// ─── Relations ───────────────────────────────────────────────

export const platformAuditLogsRelations = relations(platformAuditLogs, ({ one }) => ({
    actor: one(users, { fields: [platformAuditLogs.actorId], references: [users.id] }),
    targetCompany: one(companies, { fields: [platformAuditLogs.targetCompanyId], references: [companies.id] }),
    targetTenant: one(tenants, { fields: [platformAuditLogs.targetTenantId], references: [tenants.id] }),
}));

export const aiTokenLogsRelations = relations(aiTokenLogs, ({ one }) => ({
    company: one(companies, { fields: [aiTokenLogs.companyId], references: [companies.id] }),
    tenant: one(tenants, { fields: [aiTokenLogs.tenantId], references: [tenants.id] }),
    user: one(users, { fields: [aiTokenLogs.userId], references: [users.id] }),
}));

export const aiBudgetUsageRelations = relations(aiBudgetUsage, ({ one }) => ({
    tenant: one(tenants, { fields: [aiBudgetUsage.tenantId], references: [tenants.id] }),
}));

export const platformBroadcastsRelations = relations(platformBroadcasts, ({ one }) => ({
    creator: one(users, { fields: [platformBroadcasts.createdBy], references: [users.id] }),
}));

// ─── Marketing Lead Engine (Stage 6) ───────────────────────────

export const marketingLeads = pgTable('marketing_leads', {
    id: uuid('id').primaryKey().defaultRandom(),
    contactName: varchar('contact_name', { length: 255 }).notNull(),
    contactEmail: varchar('contact_email', { length: 255 }).notNull(),
    schoolName: varchar('school_name', { length: 255 }).notNull(),
    studentCapacity: integer('student_capacity').notNull(),
    painPoints: text('pain_points'),
    status: varchar('status', { length: 20 }).default('NEW').notNull(), // 'NEW', 'CONTACTED', 'CLOSED'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

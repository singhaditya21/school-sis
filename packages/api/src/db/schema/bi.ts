import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  boolean,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

export const biDatasets = pgTable(
  'bi_datasets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    datasetKey: varchar('dataset_key', { length: 160 }).notNull(),
    domain: varchar('domain', { length: 60 }).notNull(),
    label: varchar('label', { length: 240 }).notNull(),
    description: text('description').notNull(),
    grain: varchar('grain', { length: 80 }).notNull(),
    sourceTables: text('source_tables').array().default([]).notNull(),
    tenantColumn: varchar('tenant_column', { length: 160 }),
    defaultDateField: varchar('default_date_field', { length: 160 }),
    refreshStrategy: varchar('refresh_strategy', { length: 40 }).default('LIVE_QUERY').notNull(),
    dimensions: jsonb('dimensions').$type<Array<Record<string, unknown>>>().default([]).notNull(),
    metricIds: text('metric_ids').array().default([]).notNull(),
    requiredPermission: varchar('required_permission', { length: 120 }).notNull(),
    requiredScope: varchar('required_scope', { length: 40 }).default('tenant').notNull(),
    classifications: text('classifications').array().default([]).notNull(),
    exportable: boolean('exportable').default(false).notNull(),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantDomainIdx: index('idx_bi_datasets_tenant_domain').on(table.tenantId, table.domain),
    statusIdx: index('idx_bi_datasets_status').on(table.status),
    tenantDatasetUnique: uniqueIndex('bi_datasets_tenant_dataset_key').on(
      table.tenantId,
      table.datasetKey,
    ).where(sql`${table.tenantId} IS NOT NULL`),
    platformDatasetUnique: uniqueIndex('bi_datasets_platform_dataset_key').on(
      table.datasetKey,
    ).where(sql`${table.tenantId} IS NULL`),
  }),
);

export const biDashboards = pgTable(
  'bi_dashboards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    dashboardKey: varchar('dashboard_key', { length: 160 }).notNull(),
    domain: varchar('domain', { length: 60 }).notNull(),
    title: varchar('title', { length: 240 }).notNull(),
    description: text('description').notNull(),
    route: varchar('route', { length: 240 }).notNull(),
    personaRoles: text('persona_roles').array().default([]).notNull(),
    requiredPermission: varchar('required_permission', { length: 120 }).notNull(),
    requiredScope: varchar('required_scope', { length: 40 }).default('tenant').notNull(),
    defaultFilters: text('default_filters').array().default([]).notNull(),
    tiles: jsonb('tiles').$type<Array<Record<string, unknown>>>().default([]).notNull(),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantDomainIdx: index('idx_bi_dashboards_tenant_domain').on(table.tenantId, table.domain),
    statusIdx: index('idx_bi_dashboards_status').on(table.status),
    tenantDashboardUnique: uniqueIndex('bi_dashboards_tenant_dashboard_key').on(
      table.tenantId,
      table.dashboardKey,
    ).where(sql`${table.tenantId} IS NOT NULL`),
    platformDashboardUnique: uniqueIndex('bi_dashboards_platform_dashboard_key').on(
      table.dashboardKey,
    ).where(sql`${table.tenantId} IS NULL`),
  }),
);

export const biReportDefinitions = pgTable(
  'bi_report_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    name: varchar('name', { length: 240 }).notNull(),
    datasetKey: varchar('dataset_key', { length: 160 }).notNull(),
    selectedMetrics: text('selected_metrics').array().default([]).notNull(),
    selectedDimensions: text('selected_dimensions').array().default([]).notNull(),
    filters: jsonb('filters').$type<Array<Record<string, unknown>>>().default([]).notNull(),
    dateRange: jsonb('date_range').$type<Record<string, unknown>>().default({}).notNull(),
    schedule: jsonb('schedule').$type<Record<string, unknown>>().default({}).notNull(),
    exportPolicyId: varchar('export_policy_id', { length: 160 }),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantDatasetIdx: index('idx_bi_report_defs_tenant_dataset').on(table.tenantId, table.datasetKey),
    tenantStatusIdx: index('idx_bi_report_defs_tenant_status').on(table.tenantId, table.status),
  }),
);

export const biReportRuns = pgTable(
  'bi_report_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    reportDefinitionId: uuid('report_definition_id').references(() => biReportDefinitions.id, { onDelete: 'set null' }),
    datasetKey: varchar('dataset_key', { length: 160 }).notNull(),
    status: varchar('status', { length: 30 }).default('QUEUED').notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    rowCount: integer('row_count').default(0).notNull(),
    exportObjectKey: text('export_object_key'),
    error: text('error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantStatusQueuedIdx: index('idx_bi_report_runs_tenant_status_queued').on(
      table.tenantId,
      table.status,
      table.queuedAt,
    ),
    definitionIdx: index('idx_bi_report_runs_definition').on(table.reportDefinitionId),
  }),
);

export const biMetricSnapshots = pgTable(
  'bi_metric_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('TENANT').notNull(),
    metricKey: varchar('metric_key', { length: 160 }).notNull(),
    datasetKey: varchar('dataset_key', { length: 160 }).notNull(),
    grain: varchar('grain', { length: 80 }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    value: numeric('value', { precision: 18, scale: 4 }).default('0').notNull(),
    dimensions: jsonb('dimensions').$type<Record<string, unknown>>().default({}).notNull(),
    sourceRunId: uuid('source_run_id').references(() => biReportRuns.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantMetricPeriodIdx: index('idx_bi_metric_snapshots_tenant_metric_period').on(
      table.tenantId,
      table.metricKey,
      table.periodEnd,
    ),
    datasetPeriodIdx: index('idx_bi_metric_snapshots_dataset_period').on(table.datasetKey, table.periodEnd),
  }),
);

export const biDatasetsRelations = relations(biDatasets, ({ one }) => ({
  tenant: one(tenants, { fields: [biDatasets.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [biDatasets.createdBy], references: [users.id] }),
  updatedByUser: one(users, { fields: [biDatasets.updatedBy], references: [users.id] }),
}));

export const biDashboardsRelations = relations(biDashboards, ({ one }) => ({
  tenant: one(tenants, { fields: [biDashboards.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [biDashboards.createdBy], references: [users.id] }),
  updatedByUser: one(users, { fields: [biDashboards.updatedBy], references: [users.id] }),
}));

export const biReportDefinitionsRelations = relations(biReportDefinitions, ({ one, many }) => ({
  tenant: one(tenants, { fields: [biReportDefinitions.tenantId], references: [tenants.id] }),
  createdByUser: one(users, { fields: [biReportDefinitions.createdBy], references: [users.id] }),
  updatedByUser: one(users, { fields: [biReportDefinitions.updatedBy], references: [users.id] }),
  runs: many(biReportRuns),
}));

export const biReportRunsRelations = relations(biReportRuns, ({ one, many }) => ({
  tenant: one(tenants, { fields: [biReportRuns.tenantId], references: [tenants.id] }),
  definition: one(biReportDefinitions, { fields: [biReportRuns.reportDefinitionId], references: [biReportDefinitions.id] }),
  requestedByUser: one(users, { fields: [biReportRuns.requestedBy], references: [users.id] }),
  metricSnapshots: many(biMetricSnapshots),
}));

export const biMetricSnapshotsRelations = relations(biMetricSnapshots, ({ one }) => ({
  tenant: one(tenants, { fields: [biMetricSnapshots.tenantId], references: [tenants.id] }),
  sourceRun: one(biReportRuns, { fields: [biMetricSnapshots.sourceRunId], references: [biReportRuns.id] }),
}));

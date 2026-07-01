import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
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

export const observabilityEvents = pgTable(
  'observability_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('PLATFORM').notNull(),
    severity: varchar('severity', { length: 20 }).default('INFO').notNull(),
    source: varchar('source', { length: 120 }).notNull(),
    eventType: varchar('event_type', { length: 120 }).notNull(),
    message: text('message').notNull(),
    requestId: varchar('request_id', { length: 120 }),
    traceId: varchar('trace_id', { length: 120 }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: varchar('entity_type', { length: 80 }),
    entityId: varchar('entity_id', { length: 120 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantSeverityCreatedIdx: index('idx_observability_events_tenant_severity_created').on(
      table.tenantId,
      table.severity,
      table.createdAt,
    ),
    sourceTypeCreatedIdx: index('idx_observability_events_source_type_created').on(
      table.source,
      table.eventType,
      table.createdAt,
    ),
    requestIdx: index('idx_observability_events_request').on(table.requestId),
  }),
);

export const sreIncidents = pgTable(
  'sre_incidents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('PLATFORM').notNull(),
    severity: varchar('severity', { length: 20 }).default('WARNING').notNull(),
    status: varchar('status', { length: 20 }).default('OPEN').notNull(),
    source: varchar('source', { length: 120 }).notNull(),
    fingerprint: varchar('fingerprint', { length: 160 }).notNull(),
    title: varchar('title', { length: 240 }).notNull(),
    description: text('description'),
    occurrenceCount: integer('occurrence_count').default(1).notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantStatusSeverityIdx: index('idx_sre_incidents_tenant_status_severity').on(
      table.tenantId,
      table.status,
      table.severity,
    ),
    lastSeenIdx: index('idx_sre_incidents_last_seen').on(table.lastSeenAt),
    tenantFingerprintUnique: uniqueIndex('sre_incidents_tenant_fingerprint_key').on(
      table.tenantId,
      table.fingerprint,
    ).where(sql`${table.tenantId} IS NOT NULL`),
    platformFingerprintUnique: uniqueIndex('sre_incidents_platform_fingerprint_key').on(
      table.fingerprint,
    ).where(sql`${table.tenantId} IS NULL`),
  }),
);

export const sloDefinitions = pgTable(
  'slo_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 20 }).default('PLATFORM').notNull(),
    service: varchar('service', { length: 120 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    indicator: varchar('indicator', { length: 80 }).notNull(),
    targetBps: integer('target_bps').notNull(),
    window: varchar('window', { length: 40 }).default('30d').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    serviceActiveIdx: index('idx_slo_definitions_service_active').on(table.service, table.isActive),
    tenantServiceIdx: index('idx_slo_definitions_tenant_service').on(table.tenantId, table.service),
  }),
);

export const sloMeasurements = pgTable(
  'slo_measurements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sloId: uuid('slo_id').notNull().references(() => sloDefinitions.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    service: varchar('service', { length: 120 }).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    goodEvents: integer('good_events').default(0).notNull(),
    totalEvents: integer('total_events').default(0).notNull(),
    valueBps: numeric('value_bps', { precision: 8, scale: 2 }).default('0').notNull(),
    status: varchar('status', { length: 20 }).default('UNKNOWN').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    sloWindowIdx: index('idx_slo_measurements_slo_window').on(table.sloId, table.windowEnd),
    tenantServiceWindowIdx: index('idx_slo_measurements_tenant_service_window').on(
      table.tenantId,
      table.service,
      table.windowEnd,
    ),
  }),
);

export const observabilityEventsRelations = relations(observabilityEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [observabilityEvents.tenantId], references: [tenants.id] }),
  actor: one(users, { fields: [observabilityEvents.actorUserId], references: [users.id] }),
}));

export const sreIncidentsRelations = relations(sreIncidents, ({ one }) => ({
  tenant: one(tenants, { fields: [sreIncidents.tenantId], references: [tenants.id] }),
  acknowledgedByUser: one(users, { fields: [sreIncidents.acknowledgedBy], references: [users.id] }),
  resolvedByUser: one(users, { fields: [sreIncidents.resolvedBy], references: [users.id] }),
}));

export const sloDefinitionsRelations = relations(sloDefinitions, ({ one, many }) => ({
  tenant: one(tenants, { fields: [sloDefinitions.tenantId], references: [tenants.id] }),
  creator: one(users, { fields: [sloDefinitions.createdBy], references: [users.id] }),
  measurements: many(sloMeasurements),
}));

export const sloMeasurementsRelations = relations(sloMeasurements, ({ one }) => ({
  slo: one(sloDefinitions, { fields: [sloMeasurements.sloId], references: [sloDefinitions.id] }),
  tenant: one(tenants, { fields: [sloMeasurements.tenantId], references: [tenants.id] }),
}));

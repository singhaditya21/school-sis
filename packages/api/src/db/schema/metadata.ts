import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './core';

export const metadataObjects = pgTable(
  'metadata_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    apiName: varchar('api_name', { length: 100 }).notNull(),
    tableName: varchar('table_name', { length: 100 }).notNull(),
    description: text('description'),
    isCustom: boolean('is_custom').default(false),
    status: varchar('status', { length: 24 }).default('PUBLISHED').notNull(),
    version: integer('version').default(1).notNull(),
    publishedVersion: integer('published_version').default(1).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantApiUnique: unique('metadata_objects_tenant_id_api_name_key').on(table.tenantId, table.apiName),
    tenantApiIdx: index('idx_meta_obj_api').on(table.tenantId, table.apiName),
    statusIdx: index('idx_metadata_objects_tenant_status').on(table.tenantId, table.status),
  }),
);

export const metadataFields = pgTable(
  'metadata_fields',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    objectId: uuid('object_id')
      .notNull()
      .references(() => metadataObjects.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 255 }).notNull(),
    apiName: varchar('api_name', { length: 255 }).notNull(),
    dataType: varchar('data_type', { length: 50 }).notNull(),
    isCustom: boolean('is_custom').default(false),
    isRequired: boolean('is_required').default(false),
    defaultValue: text('default_value'),
    picklistOptions: jsonb('picklist_options').$type<string[]>().default([]),
    validationRules: jsonb('validation_rules').$type<Record<string, unknown>>().default({}).notNull(),
    status: varchar('status', { length: 24 }).default('ACTIVE').notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    objectApiUnique: unique('metadata_fields_object_id_api_name_key').on(table.objectId, table.apiName),
    objectIdx: index('idx_meta_fld_obj').on(table.objectId),
    statusIdx: index('idx_metadata_fields_object_status').on(table.objectId, table.status),
  }),
);

export const metadataSchemaVersions = pgTable(
  'metadata_schema_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id')
      .notNull()
      .references(() => metadataObjects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: varchar('status', { length: 24 }).default('PUBLISHED').notNull(),
    schemaSnapshot: jsonb('schema_snapshot').$type<Record<string, unknown>>().notNull(),
    migrationPlan: jsonb('migration_plan').$type<Record<string, unknown>>().default({}).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (table) => ({
    objectVersionUnique: unique('metadata_schema_versions_object_id_version_key').on(table.objectId, table.version),
    tenantObjectStatusIdx: index('idx_metadata_schema_versions_tenant_object_status').on(
      table.tenantId,
      table.objectId,
      table.status,
    ),
  }),
);

export const metadataMigrationJobs = pgTable(
  'metadata_migration_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id')
      .notNull()
      .references(() => metadataObjects.id, { onDelete: 'cascade' }),
    schemaVersionId: uuid('schema_version_id').references(() => metadataSchemaVersions.id, { onDelete: 'set null' }),
    operation: varchar('operation', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).default('PENDING').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    error: text('error'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    tenantStatusIdx: index('idx_metadata_migration_jobs_tenant_status').on(table.tenantId, table.status, table.createdAt),
    objectIdx: index('idx_metadata_migration_jobs_object').on(table.objectId),
  }),
);

export const metadataLayouts = pgTable('metadata_layouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  objectId: uuid('object_id')
    .notNull()
    .references(() => metadataObjects.id, { onDelete: 'cascade' }),
  layoutType: varchar('layout_type', { length: 50 }).notNull(),
  schema: jsonb('schema').$type<Record<string, unknown>>().default({}).notNull(),
  isDefault: boolean('is_default').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const fieldPermissions = pgTable(
  'field_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fieldId: uuid('field_id')
      .notNull()
      .references(() => metadataFields.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 50 }).notNull(),
    canRead: boolean('can_read').default(true),
    canWrite: boolean('can_write').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    fieldRoleUnique: unique('field_permissions_field_id_role_key').on(table.fieldId, table.role),
  }),
);

export const metadataRecords = pgTable('metadata_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  objectId: uuid('object_id')
    .notNull()
    .references(() => metadataObjects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const metadataValues = pgTable('metadata_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordId: uuid('record_id')
    .notNull()
    .references(() => metadataRecords.id, { onDelete: 'cascade' }),
  fieldId: uuid('field_id')
    .notNull()
    .references(() => metadataFields.id, { onDelete: 'cascade' }),
  valueString: text('value_string'),
  valueNumber: numeric('value_number'),
  valueBoolean: boolean('value_boolean'),
  valueDate: date('value_date'),
});

export const metadataObjectsRelations = relations(metadataObjects, ({ one, many }) => ({
  tenant: one(tenants, { fields: [metadataObjects.tenantId], references: [tenants.id] }),
  fields: many(metadataFields),
  layouts: many(metadataLayouts),
  records: many(metadataRecords),
  schemaVersions: many(metadataSchemaVersions),
  migrationJobs: many(metadataMigrationJobs),
}));

export const metadataFieldsRelations = relations(metadataFields, ({ one, many }) => ({
  object: one(metadataObjects, { fields: [metadataFields.objectId], references: [metadataObjects.id] }),
  permissions: many(fieldPermissions),
  values: many(metadataValues),
}));

export const metadataSchemaVersionsRelations = relations(metadataSchemaVersions, ({ one }) => ({
  tenant: one(tenants, { fields: [metadataSchemaVersions.tenantId], references: [tenants.id] }),
  object: one(metadataObjects, { fields: [metadataSchemaVersions.objectId], references: [metadataObjects.id] }),
  createdByUser: one(users, { fields: [metadataSchemaVersions.createdBy], references: [users.id] }),
  publishedByUser: one(users, { fields: [metadataSchemaVersions.publishedBy], references: [users.id] }),
}));

export const metadataMigrationJobsRelations = relations(metadataMigrationJobs, ({ one }) => ({
  tenant: one(tenants, { fields: [metadataMigrationJobs.tenantId], references: [tenants.id] }),
  object: one(metadataObjects, { fields: [metadataMigrationJobs.objectId], references: [metadataObjects.id] }),
  schemaVersion: one(metadataSchemaVersions, {
    fields: [metadataMigrationJobs.schemaVersionId],
    references: [metadataSchemaVersions.id],
  }),
  requestedByUser: one(users, { fields: [metadataMigrationJobs.requestedBy], references: [users.id] }),
}));

export const metadataLayoutsRelations = relations(metadataLayouts, ({ one }) => ({
  object: one(metadataObjects, { fields: [metadataLayouts.objectId], references: [metadataObjects.id] }),
}));

export const fieldPermissionsRelations = relations(fieldPermissions, ({ one }) => ({
  field: one(metadataFields, { fields: [fieldPermissions.fieldId], references: [metadataFields.id] }),
}));

export const metadataRecordsRelations = relations(metadataRecords, ({ one, many }) => ({
  tenant: one(tenants, { fields: [metadataRecords.tenantId], references: [tenants.id] }),
  object: one(metadataObjects, { fields: [metadataRecords.objectId], references: [metadataObjects.id] }),
  values: many(metadataValues),
}));

export const metadataValuesRelations = relations(metadataValues, ({ one }) => ({
  record: one(metadataRecords, { fields: [metadataValues.recordId], references: [metadataRecords.id] }),
  field: one(metadataFields, { fields: [metadataValues.fieldId], references: [metadataFields.id] }),
}));

import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenants } from './core';

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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tenantApiUnique: unique('metadata_objects_tenant_id_api_name_key').on(table.tenantId, table.apiName),
    tenantApiIdx: index('idx_meta_obj_api').on(table.tenantId, table.apiName),
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    objectApiUnique: unique('metadata_fields_object_id_api_name_key').on(table.objectId, table.apiName),
    objectIdx: index('idx_meta_fld_obj').on(table.objectId),
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
}));

export const metadataFieldsRelations = relations(metadataFields, ({ one, many }) => ({
  object: one(metadataObjects, { fields: [metadataFields.objectId], references: [metadataObjects.id] }),
  permissions: many(fieldPermissions),
  values: many(metadataValues),
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

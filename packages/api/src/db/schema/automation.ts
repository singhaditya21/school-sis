import { pgTable, text, timestamp, boolean, jsonb, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './core';

export const metadataWorkflows = pgTable('metadata_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  objectName: text('object_name').notNull(), // e.g. "student", "invoice"
  triggerEvent: text('trigger_event').notNull(), // e.g. "object.record.upserted"
  conditions: jsonb('conditions').default('[]').notNull(), // e.g. [{ field: "status", operator: "equals", value: "overdue" }]
  actionType: text('action_type').notNull(), // e.g. "SEND_EMAIL", "WEBHOOK", "CREATE_RECORD"
  actionPayload: jsonb('action_payload').default('{}').notNull(), // e.g. { template: "welcome", to: "email" }
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

import { relations, sql } from 'drizzle-orm';
import {
  boolean,
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

export const workflowApprovalRequests = pgTable(
  'workflow_approval_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    policyId: varchar('policy_id', { length: 120 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 30 }).default('PENDING').notNull(),
    priority: varchar('priority', { length: 20 }).default('NORMAL').notNull(),
    resourceType: varchar('resource_type', { length: 100 }).notNull(),
    resourceId: varchar('resource_id', { length: 160 }),
    actionPermission: varchar('action_permission', { length: 120 }).notNull(),
    auditAction: varchar('audit_action', { length: 160 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().default({}).notNull(),
    requiredApproverRoles: text('required_approver_roles').array().notNull(),
    minApprovals: integer('min_approvals').default(1).notNull(),
    approvalsReceived: integer('approvals_received').default(0).notNull(),
    rejectionsReceived: integer('rejections_received').default(0).notNull(),
    allowRequesterApproval: boolean('allow_requester_approval').default(false).notNull(),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    requestedByRole: varchar('requested_by_role', { length: 50 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 160 }),
    escalationLevel: integer('escalation_level').default(0).notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tenantStatusDueIdx: index('idx_workflow_approvals_tenant_status_due').on(
      table.tenantId,
      table.status,
      table.dueAt,
    ),
    tenantPolicyStatusIdx: index('idx_workflow_approvals_tenant_policy_status').on(
      table.tenantId,
      table.policyId,
      table.status,
    ),
    resourceIdx: index('idx_workflow_approvals_resource').on(table.tenantId, table.resourceType, table.resourceId),
    idempotencyUnique: uniqueIndex('workflow_approvals_tenant_idempotency_key').on(
      table.tenantId,
      table.idempotencyKey,
    ).where(sql`${table.idempotencyKey} IS NOT NULL`),
  }),
);

export const workflowApprovalReviews = pgTable(
  'workflow_approval_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    approvalRequestId: uuid('approval_request_id')
      .notNull()
      .references(() => workflowApprovalRequests.id, { onDelete: 'cascade' }),
    reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
    reviewerRole: varchar('reviewer_role', { length: 50 }).notNull(),
    decision: varchar('decision', { length: 20 }).notNull(),
    reason: text('reason'),
    delegatedFromUserId: uuid('delegated_from_user_id').references(() => users.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    requestCreatedIdx: index('idx_workflow_approval_reviews_request_created').on(
      table.approvalRequestId,
      table.createdAt,
    ),
    tenantReviewerIdx: index('idx_workflow_approval_reviews_tenant_reviewer').on(
      table.tenantId,
      table.reviewerUserId,
    ),
    reviewerUnique: uniqueIndex('workflow_approval_reviews_request_reviewer_key').on(
      table.approvalRequestId,
      table.reviewerUserId,
    ).where(sql`${table.reviewerUserId} IS NOT NULL`),
  }),
);

export const workflowApprovalEvents = pgTable(
  'workflow_approval_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    approvalRequestId: uuid('approval_request_id')
      .notNull()
      .references(() => workflowApprovalRequests.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    fromStatus: varchar('from_status', { length: 30 }),
    toStatus: varchar('to_status', { length: 30 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: varchar('actor_role', { length: 50 }),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    requestCreatedIdx: index('idx_workflow_approval_events_request_created').on(
      table.approvalRequestId,
      table.createdAt,
    ),
    tenantTypeCreatedIdx: index('idx_workflow_approval_events_tenant_type_created').on(
      table.tenantId,
      table.eventType,
      table.createdAt,
    ),
  }),
);

export const workflowApprovalDelegations = pgTable(
  'workflow_approval_delegations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    policyId: varchar('policy_id', { length: 120 }),
    fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fromRole: varchar('from_role', { length: 50 }).notNull(),
    toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    toRole: varchar('to_role', { length: 50 }).notNull(),
    reason: text('reason'),
    isActive: boolean('is_active').default(true).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tenantToUserActiveIdx: index('idx_workflow_approval_delegations_tenant_to_active').on(
      table.tenantId,
      table.toUserId,
      table.isActive,
    ),
    tenantFromUserIdx: index('idx_workflow_approval_delegations_tenant_from').on(
      table.tenantId,
      table.fromUserId,
    ),
  }),
);

export const workflowApprovalRequestsRelations = relations(workflowApprovalRequests, ({ one, many }) => ({
  tenant: one(tenants, { fields: [workflowApprovalRequests.tenantId], references: [tenants.id] }),
  requester: one(users, { fields: [workflowApprovalRequests.requestedByUserId], references: [users.id] }),
  reviews: many(workflowApprovalReviews),
  events: many(workflowApprovalEvents),
}));

export const workflowApprovalReviewsRelations = relations(workflowApprovalReviews, ({ one }) => ({
  tenant: one(tenants, { fields: [workflowApprovalReviews.tenantId], references: [tenants.id] }),
  request: one(workflowApprovalRequests, {
    fields: [workflowApprovalReviews.approvalRequestId],
    references: [workflowApprovalRequests.id],
  }),
  reviewer: one(users, { fields: [workflowApprovalReviews.reviewerUserId], references: [users.id] }),
  delegatedFrom: one(users, { fields: [workflowApprovalReviews.delegatedFromUserId], references: [users.id] }),
}));

export const workflowApprovalEventsRelations = relations(workflowApprovalEvents, ({ one }) => ({
  tenant: one(tenants, { fields: [workflowApprovalEvents.tenantId], references: [tenants.id] }),
  request: one(workflowApprovalRequests, {
    fields: [workflowApprovalEvents.approvalRequestId],
    references: [workflowApprovalRequests.id],
  }),
  actor: one(users, { fields: [workflowApprovalEvents.actorUserId], references: [users.id] }),
}));

export const workflowApprovalDelegationsRelations = relations(workflowApprovalDelegations, ({ one }) => ({
  tenant: one(tenants, { fields: [workflowApprovalDelegations.tenantId], references: [tenants.id] }),
  fromUser: one(users, { fields: [workflowApprovalDelegations.fromUserId], references: [users.id] }),
  toUser: one(users, { fields: [workflowApprovalDelegations.toUserId], references: [users.id] }),
  creator: one(users, { fields: [workflowApprovalDelegations.createdBy], references: [users.id] }),
}));

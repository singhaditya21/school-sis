import crypto from 'crypto';
import { evaluateAccess, isAuthorizationRole, type AuthorizationRole } from '../../authorization';
import { pool, runWithTenantContext, sql, sqlFor } from '../../db';
import {
    countApprovals,
    countRejections,
    createWorkflowApprovalRequest,
    reviewWorkflowApprovalRequest,
    toWorkflowApprovalQueueItem,
} from './engine';
import { getApprovalWorkflowPolicy } from './policy';
import type {
    CreateWorkflowApprovalInput,
    WorkflowApprovalActor,
    WorkflowApprovalDecision,
    WorkflowApprovalPriority,
    WorkflowApprovalQueueItem,
    WorkflowApprovalRequest,
    WorkflowApprovalResource,
    WorkflowApprovalStatus,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERNAL_PAYLOAD_HASH_KEY = '__approvalPayloadHash';

interface WorkflowApprovalRequestRow {
    id: string;
    tenant_id: string;
    policy_id: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    resource_type: string;
    resource_id: string | null;
    payload: Record<string, unknown> | null;
    requested_by_user_id: string | null;
    requested_by_role: string;
    required_approver_roles: string[] | null;
    min_approvals: number | string;
    allow_requester_approval: boolean;
    escalation_level: number | string | null;
    due_at: Date | string;
    expires_at: Date | string;
    completed_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string;
}

interface WorkflowApprovalReviewRow {
    id: string;
    reviewer_user_id: string | null;
    reviewer_role: string;
    decision: string;
    reason: string | null;
    delegated_from_user_id: string | null;
    created_at: Date | string;
}

interface WorkflowApprovalEventRow {
    id: string;
    event_type: WorkflowApprovalRequest['events'][number]['eventType'];
    from_status: WorkflowApprovalStatus | null;
    to_status: WorkflowApprovalStatus;
    actor_user_id: string | null;
    actor_role: AuthorizationRole | null;
    reason: string | null;
    metadata: Record<string, unknown> | null;
    created_at: Date | string;
}

type SqlTag = typeof sql;

export class WorkflowApprovalError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
        this.name = 'WorkflowApprovalError';
    }
}

export interface PersistWorkflowApprovalInput extends Omit<CreateWorkflowApprovalInput, 'id'> {
    reason?: string;
    idempotencyKey?: string;
}

export interface WorkflowApprovalListInput {
    tenantId: string;
    status?: WorkflowApprovalStatus;
    policyId?: string;
    resourceType?: string;
    resourceId?: string;
    viewer?: WorkflowApprovalActor;
    limit?: number;
}

export interface WorkflowApprovalReviewInput {
    tenantId: string;
    approvalRequestId: string;
    actor: WorkflowApprovalActor;
    decision: WorkflowApprovalDecision;
    reason?: string;
    now?: Date;
}

export interface WorkflowApprovalGateInput extends PersistWorkflowApprovalInput {
    approvalRequestId?: string;
}

export type WorkflowApprovalGateResult =
    | { approved: true; request: WorkflowApprovalRequest }
    | { approved: false; request: WorkflowApprovalRequest };

export type WorkflowApprovalSummary = WorkflowApprovalQueueItem & {
    requestedByRole: AuthorizationRole;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export async function createPersistedWorkflowApprovalRequest(
    input: PersistWorkflowApprovalInput,
): Promise<WorkflowApprovalRequest> {
    const workflowPolicy = assertWorkflowPolicy(input.policyId);
    assertActorCanRequestPolicy(input.requestedBy, input.tenantId, workflowPolicy.policy.permission);
    assertRequiredReason(input.policyId, input.reason);

    return runWithTenantContext(input.tenantId, async () => {
        const payload = withPayloadHash(input.payload ?? {});
        const idempotencyKey = input.idempotencyKey ?? createApprovalIdempotencyKey({
            policyId: input.policyId,
            resource: input.resource,
            payload,
        });
        const existing = await fetchWorkflowApprovalByIdempotency(input.tenantId, idempotencyKey);
        if (existing) return existing;

        const request = createWorkflowApprovalRequest({
            ...input,
            payload,
        });

        const client = await pool.connect();
        const q = sqlFor(client);
        try {
            await q`BEGIN`;

            const duplicate = await fetchWorkflowApprovalByIdempotency(input.tenantId, idempotencyKey, q);
            if (duplicate) {
                await q`COMMIT`;
                return duplicate;
            }

            const rows = await q<{ id: string }>`
                INSERT INTO workflow_approval_requests (
                    tenant_id, policy_id, title, description, status, priority,
                    resource_type, resource_id, action_permission, audit_action, payload,
                    required_approver_roles, min_approvals, approvals_received, rejections_received,
                    allow_requester_approval, requested_by_user_id, requested_by_role, idempotency_key,
                    escalation_level, due_at, expires_at, created_at, updated_at
                )
                VALUES (
                    ${request.tenantId},
                    ${request.policyId},
                    ${request.title},
                    ${request.description},
                    ${request.status},
                    ${request.priority},
                    ${request.resource.type},
                    ${request.resource.id ?? null},
                    ${request.policy.permission},
                    ${request.policy.auditAction},
                    ${JSON.stringify(request.payload)}::jsonb,
                    ${[...request.requiredApproverRoles]}::text[],
                    ${request.minApprovals},
                    ${0},
                    ${0},
                    ${request.allowRequesterApproval},
                    ${nullableUuid(request.requestedByUserId)},
                    ${request.requestedByRole},
                    ${idempotencyKey},
                    ${request.escalationLevel},
                    ${new Date(request.dueAt)},
                    ${new Date(request.expiresAt)},
                    ${new Date(request.createdAt)},
                    ${new Date(request.updatedAt)}
                )
                RETURNING *
            `;

            for (const event of request.events) {
                await insertWorkflowApprovalEvent(q, request.tenantId, rows[0].id, event);
            }

            await q`COMMIT`;
            return (await fetchWorkflowApprovalRequestById(input.tenantId, rows[0].id))!;
        } catch (error: unknown) {
            await q`ROLLBACK`;
            if ((error as { code?: unknown })?.code === '23505') {
                const duplicate = await fetchWorkflowApprovalByIdempotency(input.tenantId, idempotencyKey);
                if (duplicate) return duplicate;
            }
            throw error;
        } finally {
            client.release();
        }
    });
}

export async function fetchWorkflowApprovalRequestById(
    tenantId: string,
    approvalRequestId: string,
): Promise<WorkflowApprovalRequest | null> {
    return runWithTenantContext(tenantId, async () => fetchWorkflowApprovalById(tenantId, approvalRequestId));
}

export async function listWorkflowApprovalRequests(
    input: WorkflowApprovalListInput,
): Promise<readonly WorkflowApprovalRequest[]> {
    return runWithTenantContext(input.tenantId, async () => {
        const statusFilter = input.status ? sql`AND status = ${input.status}` : sql``;
        const policyFilter = input.policyId ? sql`AND policy_id = ${input.policyId}` : sql``;
        const resourceTypeFilter = input.resourceType ? sql`AND resource_type = ${input.resourceType}` : sql``;
        const resourceIdFilter = input.resourceId ? sql`AND resource_id = ${input.resourceId}` : sql``;
        const viewerFilter = input.viewer
            ? sql`AND (requested_by_user_id = ${nullableUuid(input.viewer.userId)} OR ${input.viewer.role} = ANY(required_approver_roles))`
            : sql``;
        const limit = normalizeLimit(input.limit);

        const rows = await sql<{ id: string }>`
            SELECT *
            FROM workflow_approval_requests
            WHERE tenant_id = ${input.tenantId}
              ${statusFilter}
              ${policyFilter}
              ${resourceTypeFilter}
              ${resourceIdFilter}
              ${viewerFilter}
            ORDER BY created_at DESC
            LIMIT ${limit}
        `;

        const requests: WorkflowApprovalRequest[] = [];
        for (const row of rows) {
            const request = await fetchWorkflowApprovalById(input.tenantId, row.id);
            if (request) requests.push(request);
        }
        return requests;
    });
}

export async function reviewPersistedWorkflowApprovalRequest(
    input: WorkflowApprovalReviewInput,
): Promise<WorkflowApprovalRequest> {
    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        const q = sqlFor(client);
        try {
            await q`BEGIN`;
            const existing = await fetchWorkflowApprovalById(input.tenantId, input.approvalRequestId, q, true);
            if (!existing) {
                throw new WorkflowApprovalError('Approval request not found.', 404);
            }

            const reviewed = reviewWorkflowApprovalRequest(existing, {
                actor: input.actor,
                decision: input.decision,
                reason: input.reason,
                now: input.now,
            });
            const newReview = reviewed.reviews[reviewed.reviews.length - 1];
            const newEvent = reviewed.events[reviewed.events.length - 1];

            await q`
                INSERT INTO workflow_approval_reviews (
                    tenant_id, approval_request_id, reviewer_user_id, reviewer_role,
                    decision, reason, delegated_from_user_id, metadata, created_at
                )
                VALUES (
                    ${reviewed.tenantId},
                    ${reviewed.id},
                    ${nullableUuid(newReview.actorUserId)},
                    ${newReview.actorRole},
                    ${newReview.decision},
                    ${newReview.reason ?? null},
                    ${nullableUuid(newReview.delegatedFromUserId)},
                    '{}'::jsonb,
                    ${new Date(newReview.createdAt)}
                )
            `;

            await q`
                UPDATE workflow_approval_requests
                SET status = ${reviewed.status},
                    approvals_received = ${countApprovals(reviewed.reviews)},
                    rejections_received = ${countRejections(reviewed.reviews)},
                    completed_at = ${reviewed.completedAt ? new Date(reviewed.completedAt) : null},
                    updated_at = ${new Date(reviewed.updatedAt)}
                WHERE tenant_id = ${reviewed.tenantId} AND id = ${reviewed.id}
            `;

            await insertWorkflowApprovalEvent(q, reviewed.tenantId, reviewed.id, newEvent);
            await q`COMMIT`;
            return (await fetchWorkflowApprovalRequestById(input.tenantId, input.approvalRequestId))!;
        } catch (error) {
            await q`ROLLBACK`;
            throw error;
        } finally {
            client.release();
        }
    });
}

export async function requireApprovedWorkflowApprovalOrRequest(
    input: WorkflowApprovalGateInput,
): Promise<WorkflowApprovalGateResult> {
    if (input.approvalRequestId) {
        const existing = await fetchWorkflowApprovalRequestById(input.tenantId, input.approvalRequestId);
        if (!existing) {
            throw new WorkflowApprovalError('Approval request not found.', 404);
        }
        assertApprovalMatchesAction(existing, input);
        return existing.status === 'APPROVED'
            ? { approved: true, request: existing }
            : { approved: false, request: existing };
    }

    const request = await createPersistedWorkflowApprovalRequest(input);
    return request.status === 'APPROVED'
        ? { approved: true, request }
        : { approved: false, request };
}

export function assertApprovalMatchesAction(
    approval: WorkflowApprovalRequest,
    input: Pick<WorkflowApprovalGateInput, 'tenantId' | 'policyId' | 'resource' | 'payload'>,
): void {
    if (approval.tenantId !== input.tenantId) {
        throw new WorkflowApprovalError('Approval request tenant does not match this action.', 403);
    }
    if (approval.policyId !== input.policyId) {
        throw new WorkflowApprovalError('Approval request policy does not match this action.', 403);
    }
    if (approval.resource.type !== input.resource.type) {
        throw new WorkflowApprovalError('Approval request resource type does not match this action.', 403);
    }
    if ((approval.resource.id ?? null) !== (input.resource.id ?? null)) {
        throw new WorkflowApprovalError('Approval request resource does not match this action.', 403);
    }

    const expectedHash = approval.payload[INTERNAL_PAYLOAD_HASH_KEY];
    if (typeof expectedHash === 'string' && expectedHash !== hashApprovalPayload(input.payload ?? {})) {
        throw new WorkflowApprovalError('Approval request payload does not match this action.', 403);
    }
}

export function toWorkflowApprovalSummary(request: WorkflowApprovalRequest): WorkflowApprovalSummary {
    return {
        ...toWorkflowApprovalQueueItem(request),
        requestedByRole: request.requestedByRole,
        completedAt: request.completedAt,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
    };
}

export function createApprovalIdempotencyKey(input: {
    policyId: string;
    resource: WorkflowApprovalResource;
    payload?: Record<string, unknown>;
}): string {
    const parts = [
        input.policyId,
        input.resource.tenantId,
        input.resource.type,
        input.resource.id ?? 'none',
        hashApprovalPayload(input.payload ?? {}),
    ];
    return parts.join(':').slice(0, 160);
}

function assertWorkflowPolicy(policyId: string) {
    const workflowPolicy = getApprovalWorkflowPolicy(policyId);
    if (!workflowPolicy) {
        throw new WorkflowApprovalError(`Unknown approval workflow policy: ${policyId}`, 400);
    }
    return workflowPolicy;
}

function assertActorCanRequestPolicy(
    actor: WorkflowApprovalActor,
    tenantId: string,
    permission: string,
): void {
    if (!isAuthorizationRole(actor.role)) {
        throw new WorkflowApprovalError(`Unknown role: ${actor.role}`, 403);
    }
    const decision = evaluateAccess(
        { role: actor.role, tenantId: actor.tenantId, userId: actor.userId },
        {
            permission,
            requiredScope: 'tenant',
            resourceTenantId: tenantId,
            operation: operationFromPermission(permission),
        },
    );
    if (!decision.allowed) {
        throw new WorkflowApprovalError(decision.reason ?? 'Actor is not allowed to request this approval.', 403);
    }
}

function assertRequiredReason(policyId: string, reason: string | undefined): void {
    const workflowPolicy = assertWorkflowPolicy(policyId);
    if (workflowPolicy.policy.requiresReason && !reason?.trim()) {
        throw new WorkflowApprovalError(`Approval policy ${policyId} requires an audit reason.`, 400);
    }
}

async function fetchWorkflowApprovalByIdempotency(
    tenantId: string,
    idempotencyKey: string,
    q: SqlTag = sql,
): Promise<WorkflowApprovalRequest | null> {
    const rows = await q<{ id: string }>`
        SELECT *
        FROM workflow_approval_requests
        WHERE tenant_id = ${tenantId} AND idempotency_key = ${idempotencyKey}
        LIMIT 1
    `;
    if (rows.length === 0) return null;
    return fetchWorkflowApprovalById(tenantId, String(rows[0].id), q);
}

async function fetchWorkflowApprovalById(
    tenantId: string,
    approvalRequestId: string,
    q: SqlTag = sql,
    forUpdate = false,
): Promise<WorkflowApprovalRequest | null> {
    const lockClause = forUpdate ? sql`FOR UPDATE` : sql``;
    const rows = await q<WorkflowApprovalRequestRow>`
        SELECT *
        FROM workflow_approval_requests
        WHERE tenant_id = ${tenantId} AND id = ${approvalRequestId}
        LIMIT 1
        ${lockClause}
    `;
    if (rows.length === 0) return null;

    const [reviews, events] = await Promise.all([
        q<WorkflowApprovalReviewRow>`
            SELECT *
            FROM workflow_approval_reviews
            WHERE tenant_id = ${tenantId} AND approval_request_id = ${approvalRequestId}
            ORDER BY created_at ASC
        `.rows(),
        q<WorkflowApprovalEventRow>`
            SELECT *
            FROM workflow_approval_events
            WHERE tenant_id = ${tenantId} AND approval_request_id = ${approvalRequestId}
            ORDER BY created_at ASC
        `.rows(),
    ]);

    return mapWorkflowApprovalRow(rows[0], reviews, events);
}

async function insertWorkflowApprovalEvent(
    q: SqlTag,
    tenantId: string,
    approvalRequestId: string,
    event: WorkflowApprovalRequest['events'][number],
): Promise<void> {
    await q`
        INSERT INTO workflow_approval_events (
            tenant_id, approval_request_id, event_type, from_status, to_status,
            actor_user_id, actor_role, reason, metadata, created_at
        )
        VALUES (
            ${tenantId},
            ${approvalRequestId},
            ${event.eventType},
            ${event.fromStatus ?? null},
            ${event.toStatus},
            ${nullableUuid(event.actorUserId)},
            ${event.actorRole ?? null},
            ${event.reason ?? null},
            ${JSON.stringify(event.metadata ?? {})}::jsonb,
            ${new Date(event.createdAt)}
        )
    `;
}

function mapWorkflowApprovalRow(
    row: WorkflowApprovalRequestRow,
    reviews: readonly WorkflowApprovalReviewRow[],
    events: readonly WorkflowApprovalEventRow[],
): WorkflowApprovalRequest {
    const workflowPolicy = assertWorkflowPolicy(row.policy_id);

    return {
        id: row.id,
        tenantId: row.tenant_id,
        policyId: row.policy_id,
        policy: workflowPolicy.policy,
        title: row.title,
        description: row.description,
        priority: row.priority as WorkflowApprovalPriority,
        status: row.status as WorkflowApprovalStatus,
        resource: {
            type: row.resource_type,
            id: row.resource_id ?? undefined,
            tenantId: row.tenant_id,
        },
        payload: row.payload ?? {},
        requestedByUserId: row.requested_by_user_id ?? '',
        requestedByRole: row.requested_by_role as AuthorizationRole,
        requiredApproverRoles: (row.required_approver_roles ?? []) as AuthorizationRole[],
        minApprovals: Number(row.min_approvals),
        allowRequesterApproval: Boolean(row.allow_requester_approval),
        escalationLevel: Number(row.escalation_level ?? 0),
        dueAt: toIso(row.due_at),
        expiresAt: toIso(row.expires_at),
        completedAt: row.completed_at ? toIso(row.completed_at) : undefined,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
        reviews: reviews.map((review) => ({
            id: review.id,
            actorUserId: review.reviewer_user_id ?? '',
            actorRole: review.reviewer_role as AuthorizationRole,
            decision: review.decision as WorkflowApprovalDecision,
            reason: review.reason ?? undefined,
            delegatedFromUserId: review.delegated_from_user_id ?? undefined,
            createdAt: toIso(review.created_at),
        })),
        events: events.map((event) => ({
            id: event.id,
            eventType: event.event_type,
            fromStatus: event.from_status ?? undefined,
            toStatus: event.to_status,
            actorUserId: event.actor_user_id ?? undefined,
            actorRole: event.actor_role ?? undefined,
            reason: event.reason ?? undefined,
            metadata: event.metadata ?? {},
            createdAt: toIso(event.created_at),
        })),
    };
}

function withPayloadHash(payload: Record<string, unknown>): Record<string, unknown> {
    return {
        ...payload,
        [INTERNAL_PAYLOAD_HASH_KEY]: hashApprovalPayload(payload),
    };
}

function hashApprovalPayload(payload: Record<string, unknown>): string {
    return crypto
        .createHash('sha256')
        .update(stableStringify(stripInternalPayloadFields(payload)))
        .digest('hex');
}

function stripInternalPayloadFields(payload: Record<string, unknown>): Record<string, unknown> {
    const { [INTERNAL_PAYLOAD_HASH_KEY]: _hash, ...rest } = payload;
    return rest;
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

function operationFromPermission(permission: string): 'read' | 'create' | 'update' | 'delete' | 'export' {
    const action = permission.split(':')[1];
    if (action === 'export') return 'export';
    if (action === 'create') return 'create';
    if (action === 'delete' || action === 'archive') return 'delete';
    return 'update';
}

function nullableUuid(value: string | undefined): string | null {
    return value && UUID_RE.test(value) ? value : null;
}

function normalizeLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) return 50;
    return Math.max(1, Math.min(Math.floor(limit!), 100));
}

function toIso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

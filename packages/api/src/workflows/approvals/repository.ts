import crypto from 'crypto';
import { evaluateAccess, isAuthorizationRole, type AuthorizationRole } from '../../authorization';
import { pool, runWithTenantContext } from '../../db';
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

type Queryable = {
    query: (sql: string, params?: readonly unknown[]) => Promise<{ rows: any[] }>;
};

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
        try {
            await client.query('BEGIN');

            const duplicate = await fetchWorkflowApprovalByIdempotency(input.tenantId, idempotencyKey, client);
            if (duplicate) {
                await client.query('COMMIT');
                return duplicate;
            }

            const { rows } = await client.query(
                `INSERT INTO workflow_approval_requests (
                    tenant_id, policy_id, title, description, status, priority,
                    resource_type, resource_id, action_permission, audit_action, payload,
                    required_approver_roles, min_approvals, approvals_received, rejections_received,
                    allow_requester_approval, requested_by_user_id, requested_by_role, idempotency_key,
                    escalation_level, due_at, expires_at, created_at, updated_at
                 )
                 VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11::jsonb,
                    $12::text[], $13, $14, $15,
                    $16, $17, $18, $19,
                    $20, $21, $22, $23, $24
                 )
                 RETURNING *`,
                [
                    request.tenantId,
                    request.policyId,
                    request.title,
                    request.description,
                    request.status,
                    request.priority,
                    request.resource.type,
                    request.resource.id ?? null,
                    request.policy.permission,
                    request.policy.auditAction,
                    JSON.stringify(request.payload),
                    [...request.requiredApproverRoles],
                    request.minApprovals,
                    0,
                    0,
                    request.allowRequesterApproval,
                    nullableUuid(request.requestedByUserId),
                    request.requestedByRole,
                    idempotencyKey,
                    request.escalationLevel,
                    new Date(request.dueAt),
                    new Date(request.expiresAt),
                    new Date(request.createdAt),
                    new Date(request.updatedAt),
                ],
            );

            for (const event of request.events) {
                await insertWorkflowApprovalEvent(client, request.tenantId, rows[0].id, event);
            }

            await client.query('COMMIT');
            return (await fetchWorkflowApprovalRequestById(input.tenantId, rows[0].id))!;
        } catch (error: any) {
            await client.query('ROLLBACK');
            if (error?.code === '23505') {
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
        const values: unknown[] = [input.tenantId];
        const clauses = ['tenant_id = $1'];

        if (input.status) {
            values.push(input.status);
            clauses.push(`status = $${values.length}`);
        }
        if (input.policyId) {
            values.push(input.policyId);
            clauses.push(`policy_id = $${values.length}`);
        }
        if (input.resourceType) {
            values.push(input.resourceType);
            clauses.push(`resource_type = $${values.length}`);
        }
        if (input.resourceId) {
            values.push(input.resourceId);
            clauses.push(`resource_id = $${values.length}`);
        }
        if (input.viewer) {
            values.push(nullableUuid(input.viewer.userId), input.viewer.role);
            clauses.push(
                `(requested_by_user_id = $${values.length - 1} OR $${values.length} = ANY(required_approver_roles))`,
            );
        }

        values.push(normalizeLimit(input.limit));
        const { rows } = await pool.query(
            `SELECT *
             FROM workflow_approval_requests
             WHERE ${clauses.join(' AND ')}
             ORDER BY created_at DESC
             LIMIT $${values.length}`,
            values,
        );

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
        try {
            await client.query('BEGIN');
            const existing = await fetchWorkflowApprovalById(input.tenantId, input.approvalRequestId, client, true);
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

            await client.query(
                `INSERT INTO workflow_approval_reviews (
                    tenant_id, approval_request_id, reviewer_user_id, reviewer_role,
                    decision, reason, delegated_from_user_id, metadata, created_at
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, $8)`,
                [
                    reviewed.tenantId,
                    reviewed.id,
                    nullableUuid(newReview.actorUserId),
                    newReview.actorRole,
                    newReview.decision,
                    newReview.reason ?? null,
                    nullableUuid(newReview.delegatedFromUserId),
                    new Date(newReview.createdAt),
                ],
            );

            await client.query(
                `UPDATE workflow_approval_requests
                 SET status = $1,
                     approvals_received = $2,
                     rejections_received = $3,
                     completed_at = $4,
                     updated_at = $5
                 WHERE tenant_id = $6 AND id = $7`,
                [
                    reviewed.status,
                    countApprovals(reviewed.reviews),
                    countRejections(reviewed.reviews),
                    reviewed.completedAt ? new Date(reviewed.completedAt) : null,
                    new Date(reviewed.updatedAt),
                    reviewed.tenantId,
                    reviewed.id,
                ],
            );

            await insertWorkflowApprovalEvent(client, reviewed.tenantId, reviewed.id, newEvent);
            await client.query('COMMIT');
            return (await fetchWorkflowApprovalRequestById(input.tenantId, input.approvalRequestId))!;
        } catch (error) {
            await client.query('ROLLBACK');
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
    queryable: Queryable = pool,
): Promise<WorkflowApprovalRequest | null> {
    const { rows } = await queryable.query(
        `SELECT *
         FROM workflow_approval_requests
         WHERE tenant_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [tenantId, idempotencyKey],
    );
    if (rows.length === 0) return null;
    return fetchWorkflowApprovalById(tenantId, rows[0].id, queryable);
}

async function fetchWorkflowApprovalById(
    tenantId: string,
    approvalRequestId: string,
    queryable: Queryable = pool,
    forUpdate = false,
): Promise<WorkflowApprovalRequest | null> {
    const { rows } = await queryable.query(
        `SELECT *
         FROM workflow_approval_requests
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [tenantId, approvalRequestId],
    );
    if (rows.length === 0) return null;

    const [{ rows: reviews }, { rows: events }] = await Promise.all([
        queryable.query(
            `SELECT *
             FROM workflow_approval_reviews
             WHERE tenant_id = $1 AND approval_request_id = $2
             ORDER BY created_at ASC`,
            [tenantId, approvalRequestId],
        ),
        queryable.query(
            `SELECT *
             FROM workflow_approval_events
             WHERE tenant_id = $1 AND approval_request_id = $2
             ORDER BY created_at ASC`,
            [tenantId, approvalRequestId],
        ),
    ]);

    return mapWorkflowApprovalRow(rows[0], reviews, events);
}

async function insertWorkflowApprovalEvent(
    queryable: Queryable,
    tenantId: string,
    approvalRequestId: string,
    event: WorkflowApprovalRequest['events'][number],
): Promise<void> {
    await queryable.query(
        `INSERT INTO workflow_approval_events (
            tenant_id, approval_request_id, event_type, from_status, to_status,
            actor_user_id, actor_role, reason, metadata, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)`,
        [
            tenantId,
            approvalRequestId,
            event.eventType,
            event.fromStatus ?? null,
            event.toStatus,
            nullableUuid(event.actorUserId),
            event.actorRole ?? null,
            event.reason ?? null,
            JSON.stringify(event.metadata ?? {}),
            new Date(event.createdAt),
        ],
    );
}

function mapWorkflowApprovalRow(
    row: any,
    reviews: readonly any[],
    events: readonly any[],
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

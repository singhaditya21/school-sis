import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { pool, runWithTenantContext } from '@/lib/db';
import {
    AUTHORIZATION_ROLE_VALUES,
    assertApprovalMatchesAction,
    assertDomainTransition,
    isAuthorizationRole,
    requireApprovedWorkflowApprovalOrRequest,
    toWorkflowApprovalSummary,
    type AuthorizationRole,
    type WorkflowApprovalActor,
    type WorkflowApprovalRequest,
    type WorkflowApprovalSummary,
} from '@school-sis/api';

type Queryable = Pick<PoolClient, 'query'> | typeof pool;
type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'ALUMNI' | 'TRANSFERRED' | 'SUSPENDED';
type ExamStatus = 'DRAFT' | 'SCHEDULED' | 'MARKS_ENTRY' | 'RESULT_REVIEW' | 'PUBLISHED' | 'ARCHIVED' | 'CANCELLED';

export type UserSnapshot = {
    id: string;
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: AuthorizationRole;
    isActive: boolean;
};

export type StudentSnapshot = {
    id: string;
    tenantId: string;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    status: StudentStatus;
    gradeId: string;
    sectionId: string;
};

export type ExamSnapshot = {
    id: string;
    tenantId: string;
    name: string;
    status: ExamStatus;
    resultCount: number;
    lockedResultCount: number;
    scheduleCount: number;
    publishedAt: string | null;
};

export type WorkflowAdoptionExecutionResult =
    | {
        status: 'APPROVAL_REQUIRED';
        approval: WorkflowApprovalSummary;
    }
    | {
        status: 'EXECUTED';
        action: 'USER_ROLE_CHANGED' | 'STUDENT_TRANSFERRED' | 'STUDENT_ARCHIVED' | 'EXAM_RESULTS_PUBLISHED';
        approvalRequestId: string;
        resourceType: string;
        resourceId: string;
        metadata?: Record<string, unknown>;
    };

export type RoleChangeInput = {
    tenantId: string;
    userId: string;
    targetRole: string;
    reason: string;
    approvalRequestId?: string;
    actor: WorkflowApprovalActor;
};

export type StudentLifecycleInput = {
    tenantId: string;
    studentId: string;
    reason: string;
    approvalRequestId?: string;
    actor: WorkflowApprovalActor;
    details?: StudentLifecycleDetails;
};

export type StudentLifecycleDetails = {
    effectiveDate?: string;
    destination?: string;
    note?: string;
};

export type ExamPublishInput = {
    tenantId: string;
    examId: string;
    reason?: string;
    approvalRequestId?: string;
    actor: WorkflowApprovalActor;
};

export class WorkflowAdoptionExecutionError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
        this.name = 'WorkflowAdoptionExecutionError';
    }
}

export const WORKFLOW_ADOPTION_POLICIES = {
    roleChange: 'users.role_change',
    studentTransfer: 'students.transfer',
    studentArchive: 'students.archive',
    examPublish: 'exams.results.publish',
} as const;

const ROLE_VALUES = new Set<string>(AUTHORIZATION_ROLE_VALUES);

export function workflowAdoptionHttpStatus(result: WorkflowAdoptionExecutionResult): number {
    if (result.status === 'EXECUTED') return 200;
    if (result.approval.status === 'PENDING' || result.approval.status === 'ESCALATED') return 202;
    return 409;
}

export function buildRoleChangeApprovalPayload(
    user: UserSnapshot,
    targetRole: AuthorizationRole,
    reason: string,
): Record<string, unknown> {
    return {
        action: 'CHANGE_USER_ROLE',
        userId: user.id,
        email: user.email,
        currentRole: user.role,
        targetRole,
        isActive: user.isActive,
        reason,
    };
}

export function buildStudentLifecycleApprovalPayload(
    action: 'TRANSFER_STUDENT' | 'ARCHIVE_STUDENT',
    student: StudentSnapshot,
    targetStatus: StudentStatus,
    reason: string,
    details: StudentLifecycleDetails = {},
): Record<string, unknown> {
    return {
        action,
        studentId: student.id,
        admissionNumber: student.admissionNumber,
        currentStatus: student.status,
        targetStatus,
        gradeId: student.gradeId,
        sectionId: student.sectionId,
        reason,
        effectiveDate: details.effectiveDate ?? null,
        destination: details.destination ?? null,
        note: details.note ?? null,
    };
}

export function buildExamPublishApprovalPayload(
    exam: ExamSnapshot,
    reason?: string,
): Record<string, unknown> {
    return {
        action: 'PUBLISH_EXAM_RESULTS',
        examId: exam.id,
        examName: exam.name,
        currentStatus: exam.status,
        resultCount: exam.resultCount,
        lockedResultCount: exam.lockedResultCount,
        scheduleCount: exam.scheduleCount,
        reason: normalizeOptionalReason(reason) ?? null,
    };
}

export async function changeUserRoleWithApproval(
    input: RoleChangeInput,
): Promise<WorkflowAdoptionExecutionResult> {
    const reason = normalizeRequiredReason(input.reason);
    const targetRole = normalizeTargetRole(input.targetRole);
    const user = await runWithTenantContext(
        input.tenantId,
        () => fetchUserSnapshot(input.tenantId, input.userId),
    );
    assertRoleChangeAllowed(user, targetRole, input.actor);

    const payload = buildRoleChangeApprovalPayload(user, targetRole, reason);
    const gate = await requireApprovedWorkflowApprovalOrRequest({
        tenantId: input.tenantId,
        policyId: WORKFLOW_ADOPTION_POLICIES.roleChange,
        title: `Change role for ${user.email}`,
        description: `Change ${user.email} from ${user.role} to ${targetRole}. Reason: ${reason}`,
        priority: 'HIGH',
        resource: {
            type: 'identity.user',
            id: input.userId,
            label: user.email,
            tenantId: input.tenantId,
        },
        payload,
        reason,
        approvalRequestId: input.approvalRequestId,
        requestedBy: input.actor,
    });
    if (!gate.approved) return { status: 'APPROVAL_REQUIRED', approval: toWorkflowApprovalSummary(gate.request) };

    return executeRoleChange({
        tenantId: input.tenantId,
        userId: input.userId,
        targetRole,
        reason,
        actor: input.actor,
        approvalRequest: gate.request,
    });
}

export async function transferStudentWithApproval(
    input: StudentLifecycleInput,
): Promise<WorkflowAdoptionExecutionResult> {
    return studentLifecycleWithApproval({
        ...input,
        action: 'TRANSFER_STUDENT',
        targetStatus: 'TRANSFERRED',
        policyId: WORKFLOW_ADOPTION_POLICIES.studentTransfer,
        resultAction: 'STUDENT_TRANSFERRED',
        titlePrefix: 'Transfer',
        resourceType: 'students.student',
    });
}

export async function archiveStudentWithApproval(
    input: StudentLifecycleInput,
): Promise<WorkflowAdoptionExecutionResult> {
    return studentLifecycleWithApproval({
        ...input,
        action: 'ARCHIVE_STUDENT',
        targetStatus: 'ALUMNI',
        policyId: WORKFLOW_ADOPTION_POLICIES.studentArchive,
        resultAction: 'STUDENT_ARCHIVED',
        titlePrefix: 'Archive',
        resourceType: 'students.student',
    });
}

export async function publishExamResultsWithApproval(
    input: ExamPublishInput,
): Promise<WorkflowAdoptionExecutionResult> {
    const reason = normalizeOptionalReason(input.reason);
    const exam = await runWithTenantContext(
        input.tenantId,
        () => fetchExamSnapshot(input.tenantId, input.examId),
    );
    assertExamPublishable(exam);

    const payload = buildExamPublishApprovalPayload(exam, reason);
    const gate = await requireApprovedWorkflowApprovalOrRequest({
        tenantId: input.tenantId,
        policyId: WORKFLOW_ADOPTION_POLICIES.examPublish,
        title: `Publish results for ${exam.name}`,
        description: `Publish ${exam.resultCount} result records for ${exam.name}.`,
        priority: 'HIGH',
        resource: {
            type: 'exams.exam',
            id: input.examId,
            label: exam.name,
            tenantId: input.tenantId,
        },
        payload,
        reason,
        approvalRequestId: input.approvalRequestId,
        requestedBy: input.actor,
    });
    if (!gate.approved) return { status: 'APPROVAL_REQUIRED', approval: toWorkflowApprovalSummary(gate.request) };

    return executeExamPublication({
        tenantId: input.tenantId,
        examId: input.examId,
        reason,
        actor: input.actor,
        approvalRequest: gate.request,
    });
}

async function studentLifecycleWithApproval(input: StudentLifecycleInput & {
    action: 'TRANSFER_STUDENT' | 'ARCHIVE_STUDENT';
    targetStatus: StudentStatus;
    policyId: string;
    resultAction: 'STUDENT_TRANSFERRED' | 'STUDENT_ARCHIVED';
    titlePrefix: string;
    resourceType: string;
}): Promise<WorkflowAdoptionExecutionResult> {
    const reason = normalizeRequiredReason(input.reason);
    const details = normalizeStudentLifecycleDetails(input.details);
    const student = await runWithTenantContext(
        input.tenantId,
        () => fetchStudentSnapshot(input.tenantId, input.studentId),
    );
    assertStudentTransition(student.status, input.targetStatus);

    const payload = buildStudentLifecycleApprovalPayload(input.action, student, input.targetStatus, reason, details);
    const gate = await requireApprovedWorkflowApprovalOrRequest({
        tenantId: input.tenantId,
        policyId: input.policyId,
        title: `${input.titlePrefix} student ${student.admissionNumber}`,
        description: `${input.titlePrefix} ${student.firstName} ${student.lastName} (${student.admissionNumber}). Reason: ${reason}`,
        priority: 'HIGH',
        resource: {
            type: input.resourceType,
            id: input.studentId,
            label: student.admissionNumber,
            tenantId: input.tenantId,
        },
        payload,
        reason,
        approvalRequestId: input.approvalRequestId,
        requestedBy: input.actor,
    });
    if (!gate.approved) return { status: 'APPROVAL_REQUIRED', approval: toWorkflowApprovalSummary(gate.request) };

    return executeStudentLifecycle({
        tenantId: input.tenantId,
        studentId: input.studentId,
        targetStatus: input.targetStatus,
        reason,
        details,
        action: input.action,
        resultAction: input.resultAction,
        policyId: input.policyId,
        actor: input.actor,
        approvalRequest: gate.request,
    });
}

async function executeRoleChange(input: {
    tenantId: string;
    userId: string;
    targetRole: AuthorizationRole;
    reason: string;
    actor: WorkflowApprovalActor;
    approvalRequest: WorkflowApprovalRequest;
}): Promise<WorkflowAdoptionExecutionResult> {
    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const user = await fetchUserSnapshot(input.tenantId, input.userId, client, true);
            assertRoleChangeAllowed(user, input.targetRole, input.actor);
            const payload = buildRoleChangeApprovalPayload(user, input.targetRole, input.reason);
            assertApprovalMatchesAction(input.approvalRequest, {
                tenantId: input.tenantId,
                policyId: WORKFLOW_ADOPTION_POLICIES.roleChange,
                resource: {
                    type: 'identity.user',
                    id: input.userId,
                    tenantId: input.tenantId,
                },
                payload,
            });

            await client.query(
                `UPDATE users
                 SET role = $1,
                     updated_at = NOW()
                 WHERE tenant_id = $2 AND id = $3`,
                [input.targetRole, input.tenantId, input.userId],
            );

            await insertAuditLog(client, {
                tenantId: input.tenantId,
                actorUserId: input.actor.userId,
                action: 'ROLE_CHANGE',
                entityType: 'users',
                entityId: input.userId,
                description: `Changed user role from ${user.role} to ${input.targetRole}.`,
                beforeState: { role: user.role },
                afterState: {
                    role: input.targetRole,
                    approvalRequestId: input.approvalRequest.id,
                    reason: input.reason,
                },
            });

            await client.query('COMMIT');
            return {
                status: 'EXECUTED',
                action: 'USER_ROLE_CHANGED',
                approvalRequestId: input.approvalRequest.id,
                resourceType: 'identity.user',
                resourceId: input.userId,
                metadata: {
                    previousRole: user.role,
                    newRole: input.targetRole,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function executeStudentLifecycle(input: {
    tenantId: string;
    studentId: string;
    targetStatus: StudentStatus;
    reason: string;
    details: StudentLifecycleDetails;
    action: 'TRANSFER_STUDENT' | 'ARCHIVE_STUDENT';
    resultAction: 'STUDENT_TRANSFERRED' | 'STUDENT_ARCHIVED';
    policyId: string;
    actor: WorkflowApprovalActor;
    approvalRequest: WorkflowApprovalRequest;
}): Promise<WorkflowAdoptionExecutionResult> {
    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const student = await fetchStudentSnapshot(input.tenantId, input.studentId, client, true);
            assertStudentTransition(student.status, input.targetStatus);
            const payload = buildStudentLifecycleApprovalPayload(
                input.action,
                student,
                input.targetStatus,
                input.reason,
                input.details,
            );
            assertApprovalMatchesAction(input.approvalRequest, {
                tenantId: input.tenantId,
                policyId: input.policyId,
                resource: {
                    type: 'students.student',
                    id: input.studentId,
                    tenantId: input.tenantId,
                },
                payload,
            });

            await client.query(
                `UPDATE students
                 SET status = $1,
                     custom_data = COALESCE(custom_data, '{}'::jsonb) || $2::jsonb,
                     updated_at = NOW()
                 WHERE tenant_id = $3 AND id = $4`,
                [
                    input.targetStatus,
                    JSON.stringify({
                        lastLifecycleAction: {
                            action: input.action,
                            previousStatus: student.status,
                            newStatus: input.targetStatus,
                            approvalRequestId: input.approvalRequest.id,
                            reason: input.reason,
                            ...input.details,
                        },
                    }),
                    input.tenantId,
                    input.studentId,
                ],
            );

            await insertAuditLog(client, {
                tenantId: input.tenantId,
                actorUserId: input.actor.userId,
                action: 'UPDATE',
                entityType: 'students',
                entityId: input.studentId,
                description: `${input.action} changed student status from ${student.status} to ${input.targetStatus}.`,
                beforeState: { status: student.status },
                afterState: {
                    status: input.targetStatus,
                    approvalRequestId: input.approvalRequest.id,
                    reason: input.reason,
                    ...input.details,
                },
            });

            await client.query('COMMIT');
            return {
                status: 'EXECUTED',
                action: input.resultAction,
                approvalRequestId: input.approvalRequest.id,
                resourceType: 'students.student',
                resourceId: input.studentId,
                metadata: {
                    previousStatus: student.status,
                    newStatus: input.targetStatus,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function executeExamPublication(input: {
    tenantId: string;
    examId: string;
    reason?: string;
    actor: WorkflowApprovalActor;
    approvalRequest: WorkflowApprovalRequest;
}): Promise<WorkflowAdoptionExecutionResult> {
    return runWithTenantContext(input.tenantId, async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const exam = await fetchExamSnapshot(input.tenantId, input.examId, client, true);
            assertExamPublishable(exam);
            const payload = buildExamPublishApprovalPayload(exam, input.reason);
            assertApprovalMatchesAction(input.approvalRequest, {
                tenantId: input.tenantId,
                policyId: WORKFLOW_ADOPTION_POLICIES.examPublish,
                resource: {
                    type: 'exams.exam',
                    id: input.examId,
                    tenantId: input.tenantId,
                },
                payload,
            });

            const lockedCount = await lockMissingExamResultHashes(client, input.tenantId, input.examId, input.actor.userId);
            await client.query(
                `UPDATE exams
                 SET status = 'PUBLISHED',
                     published_at = NOW(),
                     published_by = $1,
                     updated_at = NOW()
                 WHERE tenant_id = $2 AND id = $3`,
                [input.actor.userId, input.tenantId, input.examId],
            );

            await insertAuditLog(client, {
                tenantId: input.tenantId,
                actorUserId: input.actor.userId,
                action: 'UPDATE',
                entityType: 'exams',
                entityId: input.examId,
                description: `Published exam results for ${exam.name}.`,
                beforeState: {
                    status: exam.status,
                    lockedResultCount: exam.lockedResultCount,
                    resultCount: exam.resultCount,
                },
                afterState: {
                    status: 'PUBLISHED',
                    approvalRequestId: input.approvalRequest.id,
                    newlyLockedResults: lockedCount,
                    reason: input.reason ?? null,
                },
            });

            await client.query('COMMIT');
            return {
                status: 'EXECUTED',
                action: 'EXAM_RESULTS_PUBLISHED',
                approvalRequestId: input.approvalRequest.id,
                resourceType: 'exams.exam',
                resourceId: input.examId,
                metadata: {
                    previousStatus: exam.status,
                    newStatus: 'PUBLISHED',
                    resultCount: exam.resultCount,
                    newlyLockedResults: lockedCount,
                },
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    });
}

async function fetchUserSnapshot(
    tenantId: string,
    userId: string,
    queryable: Queryable = pool,
    forUpdate = false,
): Promise<UserSnapshot> {
    const { rows } = await queryable.query(
        `SELECT
            id,
            tenant_id AS "tenantId",
            email,
            first_name AS "firstName",
            last_name AS "lastName",
            role,
            is_active AS "isActive"
         FROM users
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [tenantId, userId],
    );
    const user = rows[0] as UserSnapshot | undefined;
    if (!user) throw new WorkflowAdoptionExecutionError('User not found.', 404);
    if (!isAuthorizationRole(user.role)) {
        throw new WorkflowAdoptionExecutionError(`Unsupported current role: ${user.role}`, 409);
    }
    return user;
}

async function fetchStudentSnapshot(
    tenantId: string,
    studentId: string,
    queryable: Queryable = pool,
    forUpdate = false,
): Promise<StudentSnapshot> {
    const { rows } = await queryable.query(
        `SELECT
            id,
            tenant_id AS "tenantId",
            admission_number AS "admissionNumber",
            first_name AS "firstName",
            last_name AS "lastName",
            status,
            grade_id AS "gradeId",
            section_id AS "sectionId"
         FROM students
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [tenantId, studentId],
    );
    const student = rows[0] as StudentSnapshot | undefined;
    if (!student) throw new WorkflowAdoptionExecutionError('Student not found.', 404);
    return student;
}

async function fetchExamSnapshot(
    tenantId: string,
    examId: string,
    queryable: Queryable = pool,
    forUpdate = false,
): Promise<ExamSnapshot> {
    const { rows } = await queryable.query(
        `SELECT
            id,
            tenant_id AS "tenantId",
            name,
            status,
            published_at AS "publishedAt"
         FROM exams
         WHERE tenant_id = $1 AND id = $2
         LIMIT 1
         ${forUpdate ? 'FOR UPDATE' : ''}`,
        [tenantId, examId],
    );
    const exam = rows[0] as Pick<ExamSnapshot, 'id' | 'tenantId' | 'name' | 'status' | 'publishedAt'> | undefined;
    if (!exam) throw new WorkflowAdoptionExecutionError('Exam not found.', 404);

    const stats = await queryable.query(
        `SELECT
            COUNT(DISTINCT es.id)::int AS "scheduleCount",
            COUNT(sr.id)::int AS "resultCount",
            COUNT(erh.id)::int AS "lockedResultCount"
         FROM exam_schedules es
         LEFT JOIN student_results sr
            ON sr.exam_schedule_id = es.id
           AND sr.tenant_id = $1
         LEFT JOIN exam_result_hashes erh
            ON erh.result_id = sr.id
           AND erh.tenant_id = sr.tenant_id
         WHERE es.exam_id = $2`,
        [tenantId, examId],
    );

    return {
        ...exam,
        status: exam.status as ExamStatus,
        publishedAt: exam.publishedAt ? new Date(exam.publishedAt).toISOString() : null,
        scheduleCount: Number(stats.rows[0]?.scheduleCount ?? 0),
        resultCount: Number(stats.rows[0]?.resultCount ?? 0),
        lockedResultCount: Number(stats.rows[0]?.lockedResultCount ?? 0),
    };
}

async function lockMissingExamResultHashes(
    client: PoolClient,
    tenantId: string,
    examId: string,
    actorUserId: string,
): Promise<number> {
    const { rows } = await client.query(
        `SELECT
            sr.id,
            sr.student_id,
            sr.exam_schedule_id,
            sr.marks_obtained,
            sr.grade,
            sr.is_absent
         FROM student_results sr
         INNER JOIN exam_schedules es
            ON es.id = sr.exam_schedule_id
         LEFT JOIN exam_result_hashes erh
            ON erh.result_id = sr.id
           AND erh.tenant_id = sr.tenant_id
         WHERE sr.tenant_id = $1
           AND es.exam_id = $2
           AND erh.id IS NULL
         FOR UPDATE OF sr`,
        [tenantId, examId],
    );

    for (const result of rows) {
        await client.query(
            `INSERT INTO exam_result_hashes (tenant_id, result_id, hash, locked_at, locked_by)
             VALUES ($1, $2, $3, NOW(), $4)
             ON CONFLICT (result_id) DO NOTHING`,
            [tenantId, result.id, hashExamResult(result), actorUserId],
        );
    }

    return rows.length;
}

function hashExamResult(result: Record<string, unknown>): string {
    const payload = JSON.stringify({
        studentId: result.student_id,
        examScheduleId: result.exam_schedule_id,
        marksObtained: result.marks_obtained,
        grade: result.grade,
        isAbsent: result.is_absent,
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
}

async function insertAuditLog(
    client: PoolClient,
    input: {
        tenantId: string;
        actorUserId: string;
        action: 'ROLE_CHANGE' | 'UPDATE';
        entityType: string;
        entityId: string;
        description: string;
        beforeState: Record<string, unknown>;
        afterState: Record<string, unknown>;
    },
): Promise<void> {
    await client.query(
        `INSERT INTO audit_logs (
            tenant_id,
            user_id,
            action,
            entity_type,
            entity_id,
            description,
            before_state,
            after_state
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
            input.tenantId,
            input.actorUserId,
            input.action,
            input.entityType,
            input.entityId,
            input.description,
            JSON.stringify(input.beforeState),
            JSON.stringify(input.afterState),
        ],
    );
}

function normalizeTargetRole(value: string): AuthorizationRole {
    const normalized = value.trim().toUpperCase();
    if (!ROLE_VALUES.has(normalized) || !isAuthorizationRole(normalized)) {
        throw new WorkflowAdoptionExecutionError(`Unsupported target role: ${value}`, 400);
    }
    if (normalized === 'PLATFORM_ADMIN') {
        throw new WorkflowAdoptionExecutionError('Tenant role changes cannot assign PLATFORM_ADMIN.', 403);
    }
    return normalized;
}

function assertRoleChangeAllowed(user: UserSnapshot, targetRole: AuthorizationRole, actor: WorkflowApprovalActor): void {
    if (user.role === targetRole) {
        throw new WorkflowAdoptionExecutionError('User already has the requested role.', 409);
    }
    if (user.role === 'PLATFORM_ADMIN') {
        throw new WorkflowAdoptionExecutionError('Tenant role changes cannot modify PLATFORM_ADMIN users.', 403);
    }
    if (user.id === actor.userId) {
        throw new WorkflowAdoptionExecutionError('Users cannot change their own role through approval execution.', 403);
    }
}

function assertStudentTransition(from: StudentStatus, to: StudentStatus): void {
    try {
        assertDomainTransition('studentEnrollment', from, to);
    } catch (error) {
        throw new WorkflowAdoptionExecutionError(
            error instanceof Error ? error.message : `Invalid student transition: ${from} -> ${to}`,
            409,
        );
    }
}

function assertExamPublishable(exam: ExamSnapshot): void {
    if (exam.resultCount <= 0) {
        throw new WorkflowAdoptionExecutionError('Exam has no result records to publish.', 409);
    }
    if (exam.status === 'PUBLISHED') {
        throw new WorkflowAdoptionExecutionError('Exam results are already published.', 409);
    }
    try {
        assertDomainTransition('examLifecycle', exam.status, 'PUBLISHED');
    } catch (error) {
        throw new WorkflowAdoptionExecutionError(
            error instanceof Error ? error.message : `Invalid exam transition: ${exam.status} -> PUBLISHED`,
            409,
        );
    }
}

function normalizeRequiredReason(reason: string): string {
    const normalized = reason.trim();
    if (normalized.length < 3) {
        throw new WorkflowAdoptionExecutionError('An audit reason of at least 3 characters is required.', 400);
    }
    return normalized;
}

function normalizeOptionalReason(reason: string | undefined): string | undefined {
    const normalized = reason?.trim();
    return normalized || undefined;
}

function normalizeStudentLifecycleDetails(details: StudentLifecycleDetails | undefined): StudentLifecycleDetails {
    return {
        effectiveDate: normalizeOptionalReason(details?.effectiveDate),
        destination: normalizeOptionalReason(details?.destination),
        note: normalizeOptionalReason(details?.note),
    };
}

'use server';

import { createHash } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { runWithTenantContext, sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { hasPermission, isStaff, UserRole } from '@/lib/rbac/permissions';
import { assertSafeMetadataIdentifier } from '@/lib/metadata/platform';
import { getObjectMetadata, queryRecords } from '@/lib/actions/metadata-engine';
import {
    canAccessRecordUnderOwd,
    type ApprovalProcessStepDef,
    type ApprovalStepHistoryEntry,
    type DashboardWidgetConfig,
    type MetadataApprovalInstanceItem,
    type MetadataApprovalProcessItem,
    type MetadataDashboardItem,
    type MetadataRecordAttachmentItem,
    type MetadataSharingRuleItem,
    type MetadataValidationRuleItem,
    type OwdMode,
    type SharingCriteriaOperator,
} from '@/lib/metadata/lcnc-helpers';
import {
    checkRecordApprovalLockInternal,
    loadActiveRecordApprovalInstanceInternal,
    loadObjectApprovalProcessesInternal,
    loadObjectOwdAndSharingInternal,
    loadObjectValidationRulesInternal,
} from '@/lib/metadata/lcnc-tier2-db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ATTACHMENT_BYTES = 512 * 1024; // 512 KB inline ceiling
const ALLOWED_ATTACHMENT_MIMES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'text/csv',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// ============================================================================
// 1. OWD, Sharing Rules, Validation Rules & Approval Processes Studio Loader
// ============================================================================

export async function getObjectGovernanceConfigAction(objectApiName: string): Promise<{
    owdMode: OwdMode;
    sharingRules: MetadataSharingRuleItem[];
    validationRules: MetadataValidationRuleItem[];
    approvalProcesses: MetadataApprovalProcessItem[];
}> {
    const { tenantId } = await requireAuth('metadata:read');
    const cleanApi = (objectApiName || '').trim().toLowerCase();
    assertSafeMetadataIdentifier(cleanApi, 'object API name');

    const [owdAndSharing, validationRules, approvalProcesses] = await Promise.all([
        loadObjectOwdAndSharingInternal(tenantId, cleanApi),
        loadObjectValidationRulesInternal(tenantId, cleanApi),
        loadObjectApprovalProcessesInternal(tenantId, cleanApi),
    ]);

    return {
        owdMode: owdAndSharing.owdMode,
        sharingRules: owdAndSharing.sharingRules,
        validationRules,
        approvalProcesses,
    };
}

export async function updateObjectOwdModeAction(input: {
    objectApiName: string;
    owdMode: OwdMode;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const cleanApi = (input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');
        const validModes: OwdMode[] = ['PUBLIC_READ_WRITE', 'PUBLIC_READ_ONLY', 'PRIVATE'];
        const owdMode: OwdMode = validModes.includes(input.owdMode)
            ? input.owdMode
            : 'PUBLIC_READ_WRITE';

        await runWithTenantContext(tenantId, async () => {
            await sql`
                INSERT INTO tenant_object_settings (tenant_id, object_api_name, is_enabled, owd_mode, updated_by, updated_at)
                VALUES (${tenantId}, ${cleanApi}, true, ${owdMode}, ${UUID_RE.test(userId) ? userId : null}, NOW())
                ON CONFLICT (tenant_id, object_api_name)
                DO UPDATE SET
                    owd_mode = EXCLUDED.owd_mode,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
            `.execute();
        });

        revalidateTag('metadata', 'max');
        revalidatePath('/settings/objects');
        revalidatePath(`/app/${cleanApi}`);
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to update OWD mode.' };
    }
}

export async function saveMetadataSharingRuleAction(input: {
    id?: string;
    objectApiName: string;
    name: string;
    criteriaField?: string | null;
    criteriaOperator?: SharingCriteriaOperator;
    criteriaValue?: string | null;
    sharedWithRole: string;
    accessLevel: 'READ' | 'READ_WRITE';
    isActive?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const cleanApi = (input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');
        const name = (input.name || '').trim();
        if (name.length < 2) {
            return { success: false, error: 'Sharing rule name is required.' };
        }
        const sharedWithRole = (input.sharedWithRole || '').trim().toUpperCase();
        if (!sharedWithRole) {
            return { success: false, error: 'Target role is required.' };
        }
        const rawCriteriaField = input.criteriaField?.trim() || '';
        if (rawCriteriaField) {
            assertSafeMetadataIdentifier(rawCriteriaField, 'criteria field');
        }
        const criteriaField = rawCriteriaField || null;
        const validOps: SharingCriteriaOperator[] = ['eq', 'neq', 'contains', 'gt', 'lt'];
        const criteriaOperator: SharingCriteriaOperator =
            input.criteriaOperator && validOps.includes(input.criteriaOperator)
                ? input.criteriaOperator
                : 'eq';
        const criteriaValue = criteriaField ? (input.criteriaValue ?? '').trim() : null;
        const accessLevel = input.accessLevel === 'READ_WRITE' ? 'READ_WRITE' : 'READ';
        const isActive = input.isActive !== false;

        const savedId = await runWithTenantContext(tenantId, async () => {
            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE metadata_sharing_rules
                    SET name = ${name},
                        criteria_field = ${criteriaField},
                        criteria_operator = ${criteriaOperator},
                        criteria_value = ${criteriaValue},
                        shared_with_role = ${sharedWithRole},
                        access_level = ${accessLevel},
                        is_active = ${isActive}
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                    RETURNING id
                `;
                if (updated.length > 0) return updated[0].id;
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO metadata_sharing_rules (
                    tenant_id, object_api_name, name, criteria_field, criteria_operator,
                    criteria_value, shared_with_role, access_level, is_active, created_by
                )
                VALUES (
                    ${tenantId}, ${cleanApi}, ${name}, ${criteriaField}, ${criteriaOperator},
                    ${criteriaValue}, ${sharedWithRole}, ${accessLevel}, ${isActive},
                    ${UUID_RE.test(userId) ? userId : null}
                )
                RETURNING id
            `;
            return inserted[0]?.id;
        });

        revalidateTag('metadata', 'max');
        revalidatePath(`/app/${cleanApi}`);
        return { success: true, id: savedId };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to save sharing rule.' };
    }
}

export async function deleteMetadataSharingRuleAction(
    ruleId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId } = await requireAuth('metadata:publish');
        if (!UUID_RE.test(ruleId)) {
            return { success: false, error: 'Invalid sharing rule ID.' };
        }
        await runWithTenantContext(tenantId, async () => {
            await sql`
                DELETE FROM metadata_sharing_rules
                WHERE id = ${ruleId}
                  AND tenant_id = ${tenantId}
            `.execute();
        });
        revalidateTag('metadata', 'max');
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to delete sharing rule.' };
    }
}

// ============================================================================
// 2. Cross-Field Boolean Formula Validation Rules CRUD
// ============================================================================

export async function saveMetadataValidationRuleAction(input: {
    id?: string;
    objectApiName: string;
    name: string;
    description?: string | null;
    errorConditionFormula: string;
    errorMessage: string;
    errorField?: string | null;
    isActive?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const cleanApi = (input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');
        const name = (input.name || '').trim();
        const formula = (input.errorConditionFormula || '').trim();
        const errorMessage = (input.errorMessage || '').trim();

        if (name.length < 2) {
            return { success: false, error: 'Validation rule name is required.' };
        }
        if (!formula) {
            return { success: false, error: 'Error condition formula is required.' };
        }
        if (!errorMessage) {
            return { success: false, error: 'User-facing error message is required.' };
        }

        const rawErrorField = input.errorField?.trim() || '';
        if (rawErrorField) {
            assertSafeMetadataIdentifier(rawErrorField, 'error target field');
        }
        const errorField = rawErrorField || null;
        const description = input.description?.trim() || null;
        const isActive = input.isActive !== false;

        const savedId = await runWithTenantContext(tenantId, async () => {
            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE metadata_validation_rules
                    SET name = ${name},
                        description = ${description},
                        error_condition_formula = ${formula},
                        error_message = ${errorMessage},
                        error_field = ${errorField},
                        is_active = ${isActive}
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                    RETURNING id
                `;
                if (updated.length > 0) return updated[0].id;
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO metadata_validation_rules (
                    tenant_id, object_api_name, name, description,
                    error_condition_formula, error_message, error_field, is_active, created_by
                )
                VALUES (
                    ${tenantId}, ${cleanApi}, ${name}, ${description},
                    ${formula}, ${errorMessage}, ${errorField}, ${isActive},
                    ${UUID_RE.test(userId) ? userId : null}
                )
                RETURNING id
            `;
            return inserted[0]?.id;
        });

        revalidateTag('metadata', 'max');
        return { success: true, id: savedId };
    } catch (e: unknown) {
        return {
            success: false,
            error: (e as Error).message || 'Failed to save validation rule.',
        };
    }
}

export async function toggleMetadataValidationRuleAction(
    ruleId: string,
    isActive: boolean,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId } = await requireAuth('metadata:publish');
        if (!UUID_RE.test(ruleId)) {
            return { success: false, error: 'Invalid validation rule ID.' };
        }
        await runWithTenantContext(tenantId, async () => {
            await sql`
                UPDATE metadata_validation_rules
                SET is_active = ${Boolean(isActive)}
                WHERE id = ${ruleId}
                  AND tenant_id = ${tenantId}
            `.execute();
        });
        revalidateTag('metadata', 'max');
        return { success: true };
    } catch (e: unknown) {
        return {
            success: false,
            error: (e as Error).message || 'Failed to toggle validation rule.',
        };
    }
}

export async function deleteMetadataValidationRuleAction(
    ruleId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId } = await requireAuth('metadata:publish');
        if (!UUID_RE.test(ruleId)) {
            return { success: false, error: 'Invalid validation rule ID.' };
        }
        await runWithTenantContext(tenantId, async () => {
            await sql`
                DELETE FROM metadata_validation_rules
                WHERE id = ${ruleId}
                  AND tenant_id = ${tenantId}
            `.execute();
        });
        revalidateTag('metadata', 'max');
        return { success: true };
    } catch (e: unknown) {
        return {
            success: false,
            error: (e as Error).message || 'Failed to delete validation rule.',
        };
    }
}

// ============================================================================
// 3. Declarative Multi-Step Approval Processes CRUD & Queue Actions
// ============================================================================

export async function saveMetadataApprovalProcessAction(input: {
    id?: string;
    objectApiName: string;
    name: string;
    description?: string | null;
    entryCriteriaFormula?: string | null;
    steps: ApprovalProcessStepDef[];
    lockRecordOnSubmit?: boolean;
    fieldUpdatesOnApprove?: Record<string, string>;
    fieldUpdatesOnReject?: Record<string, string>;
    isActive?: boolean;
}): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const cleanApi = (input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');
        const name = (input.name || '').trim();
        if (name.length < 2) {
            return { success: false, error: 'Approval process name is required.' };
        }
        const rawSteps = Array.isArray(input.steps) ? input.steps : [];
        if (rawSteps.length === 0) {
            return { success: false, error: 'At least one approval step is required.' };
        }
        const normalizedSteps: ApprovalProcessStepDef[] = rawSteps.map((s, idx) => ({
            stepNumber: idx + 1,
            stepName: (s.stepName || `Step ${idx + 1}`).trim(),
            approverRole: (s.approverRole || 'PRINCIPAL').trim().toUpperCase(),
        }));

        const entryCriteria = input.entryCriteriaFormula?.trim() || null;
        const description = input.description?.trim() || null;
        const lockRecord = input.lockRecordOnSubmit !== false;
        const approveUpdates = input.fieldUpdatesOnApprove || {};
        const rejectUpdates = input.fieldUpdatesOnReject || {};
        const isActive = input.isActive !== false;

        const savedId = await runWithTenantContext(tenantId, async () => {
            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE metadata_approval_processes
                    SET name = ${name},
                        description = ${description},
                        entry_criteria_formula = ${entryCriteria},
                        steps = ${JSON.stringify(normalizedSteps)}::jsonb,
                        lock_record_on_submit = ${lockRecord},
                        field_updates_on_approve = ${JSON.stringify(approveUpdates)}::jsonb,
                        field_updates_on_reject = ${JSON.stringify(rejectUpdates)}::jsonb,
                        is_active = ${isActive}
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                    RETURNING id
                `;
                if (updated.length > 0) return updated[0].id;
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO metadata_approval_processes (
                    tenant_id, object_api_name, name, description, entry_criteria_formula,
                    steps, lock_record_on_submit, field_updates_on_approve,
                    field_updates_on_reject, is_active, created_by
                )
                VALUES (
                    ${tenantId}, ${cleanApi}, ${name}, ${description}, ${entryCriteria},
                    ${JSON.stringify(normalizedSteps)}::jsonb, ${lockRecord},
                    ${JSON.stringify(approveUpdates)}::jsonb,
                    ${JSON.stringify(rejectUpdates)}::jsonb, ${isActive},
                    ${UUID_RE.test(userId) ? userId : null}
                )
                RETURNING id
            `;
            return inserted[0]?.id;
        });

        revalidateTag('metadata', 'max');
        return { success: true, id: savedId };
    } catch (e: unknown) {
        return {
            success: false,
            error: (e as Error).message || 'Failed to save approval process.',
        };
    }
}

export async function deleteMetadataApprovalProcessAction(
    processId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId } = await requireAuth('metadata:publish');
        if (!UUID_RE.test(processId)) {
            return { success: false, error: 'Invalid approval process ID.' };
        }
        await runWithTenantContext(tenantId, async () => {
            await sql`
                DELETE FROM metadata_approval_processes
                WHERE id = ${processId}
                  AND tenant_id = ${tenantId}
            `.execute();
        });
        revalidateTag('metadata', 'max');
        return { success: true };
    } catch (e: unknown) {
        return {
            success: false,
            error: (e as Error).message || 'Failed to delete approval process.',
        };
    }
}

export async function getRecordApprovalStatusAction(
    objectApiName: string,
    recordId: string,
): Promise<{
    activeInstance: MetadataApprovalInstanceItem | null;
    hasConfiguredProcess: boolean;
}> {
    const { tenantId, session } = await requireAuth();
    if (!isStaff(session.role as UserRole)) {
        return { activeInstance: null, hasConfiguredProcess: false };
    }
    const cleanApi = (objectApiName || '').trim().toLowerCase();
    assertSafeMetadataIdentifier(cleanApi, 'object API name');
    const [activeInstance, processes] = await Promise.all([
        loadActiveRecordApprovalInstanceInternal(tenantId, cleanApi, recordId),
        loadObjectApprovalProcessesInternal(tenantId, cleanApi),
    ]);
    return {
        activeInstance,
        hasConfiguredProcess: processes.some(p => p.isActive),
    };
}

export async function listPendingMetadataApprovalInstancesAction(): Promise<
    MetadataApprovalInstanceItem[]
> {
    const { tenantId, session } = await requireAuth();
    if (!isStaff(session.role as UserRole)) return [];

    try {
        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                id: string;
                process_id: string;
                process_name: string;
                steps: ApprovalProcessStepDef[];
                object_api_name: string;
                record_id: string;
                status: string;
                current_step: number;
                submitted_by: string | null;
                submission_comment: string | null;
                step_history: ApprovalStepHistoryEntry[];
                is_locked: boolean;
                created_at: Date | string;
                updated_at: Date | string;
            }>`
                SELECT i.id, i.process_id, p.name AS process_name, p.steps,
                       i.object_api_name, i.record_id, i.status, i.current_step,
                       i.submitted_by, i.submission_comment, i.step_history, i.is_locked,
                       i.created_at, i.updated_at
                FROM metadata_approval_instances i
                JOIN metadata_approval_processes p
                  ON p.id = i.process_id AND p.tenant_id = ${tenantId}
                WHERE i.tenant_id = ${tenantId}
                ORDER BY CASE WHEN i.status = 'PENDING' THEN 0 ELSE 1 END, i.created_at DESC
                LIMIT 100
            `;

            return rows.map(row => {
                const steps = Array.isArray(row.steps) ? row.steps : [];
                const currentDef =
                    steps.find(s => s.stepNumber === row.current_step) ??
                    steps[row.current_step - 1];
                return {
                    id: row.id,
                    processId: row.process_id,
                    processName: row.process_name,
                    objectApiName: row.object_api_name,
                    recordId: row.record_id,
                    status: row.status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECALLED',
                    currentStep: Number(row.current_step || 1),
                    totalSteps: steps.length,
                    currentStepName: currentDef?.stepName,
                    currentApproverRole: currentDef?.approverRole,
                    submittedBy: row.submitted_by,
                    submissionComment: row.submission_comment,
                    stepHistory: Array.isArray(row.step_history) ? row.step_history : [],
                    isLocked: Boolean(row.is_locked),
                    createdAt:
                        row.created_at instanceof Date
                            ? row.created_at.toISOString()
                            : String(row.created_at),
                    updatedAt:
                        row.updated_at instanceof Date
                            ? row.updated_at.toISOString()
                            : String(row.updated_at),
                };
            });
        });
    } catch {
        return [];
    }
}

// ============================================================================
// 4. Role-Scoped Custom Dashboards Studio CRUD
// ============================================================================

export async function listMetadataDashboardsAction(): Promise<MetadataDashboardItem[]> {
    const { tenantId, session } = await requireAuth('reports:read');
    if (!UUID_RE.test(tenantId)) return [];

    const effUpper = (session.effectiveRoleCode || session.role || '').trim().toUpperCase();
    const baseUpper = (session.role || '').trim().toUpperCase();
    const isAdmin =
        baseUpper === 'PLATFORM_ADMIN' ||
        baseUpper === 'SUPER_ADMIN' ||
        baseUpper === 'SCHOOL_ADMIN';

    try {
        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                id: string;
                name: string;
                description: string | null;
                allowed_roles: string[];
                is_default: boolean;
                widgets: DashboardWidgetConfig[];
                created_at: Date | string;
                updated_at: Date | string;
            }>`
                SELECT id, name, description, allowed_roles, is_default, widgets, created_at, updated_at
                FROM metadata_dashboards
                WHERE tenant_id = ${tenantId}
                ORDER BY is_default DESC, name ASC
            `;

            return rows
                .filter(row => {
                    if (isAdmin) return true;
                    const roles = Array.isArray(row.allowed_roles)
                        ? row.allowed_roles.map(r => String(r).toUpperCase())
                        : [];
                    return roles.length === 0 || roles.includes(effUpper) || roles.includes(baseUpper);
                })
                .map(row => ({
                    id: row.id,
                    name: row.name,
                    description: row.description,
                    allowedRoles: Array.isArray(row.allowed_roles)
                        ? row.allowed_roles.map(String)
                        : [],
                    isDefault: Boolean(row.is_default),
                    widgets: Array.isArray(row.widgets) ? row.widgets : [],
                    createdAt:
                        row.created_at instanceof Date
                            ? row.created_at.toISOString()
                            : String(row.created_at),
                    updatedAt:
                        row.updated_at instanceof Date
                            ? row.updated_at.toISOString()
                            : String(row.updated_at),
                }));
        });
    } catch {
        return [];
    }
}

export async function saveMetadataDashboardAction(input: {
    id?: string;
    name: string;
    description?: string | null;
    allowedRoles?: string[];
    isDefault?: boolean;
    widgets: DashboardWidgetConfig[];
}): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        const { tenantId, userId, session } = await requireAuth('reports:read');
        const canManage =
            hasPermission(session.role as UserRole, 'settings:write') ||
            session.role === 'SCHOOL_ADMIN' ||
            session.role === 'SUPER_ADMIN' ||
            session.role === 'PLATFORM_ADMIN';
        if (!canManage) {
            return {
                success: false,
                error: 'Forbidden: Tenant Admin permission is required to save dashboards.',
            };
        }

        const name = (input.name || '').trim();
        if (name.length < 2) {
            return { success: false, error: 'Dashboard name is required.' };
        }
        const description = input.description?.trim() || null;
        const allowedRoles = Array.isArray(input.allowedRoles)
            ? input.allowedRoles.map(r => String(r).trim().toUpperCase()).filter(Boolean)
            : [];
        const isDefault = Boolean(input.isDefault);
        const widgets = (Array.isArray(input.widgets) ? input.widgets : []).slice(0, 16);

        const savedId = await runWithTenantContext(tenantId, async () => {
            if (isDefault) {
                await sql`
                    UPDATE metadata_dashboards
                    SET is_default = false
                    WHERE tenant_id = ${tenantId}
                `.execute();
            }

            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE metadata_dashboards
                    SET name = ${name},
                        description = ${description},
                        allowed_roles = ${JSON.stringify(allowedRoles)}::jsonb,
                        is_default = ${isDefault},
                        widgets = ${JSON.stringify(widgets)}::jsonb,
                        updated_at = NOW()
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                    RETURNING id
                `;
                if (updated.length > 0) return updated[0].id;
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO metadata_dashboards (
                    tenant_id, name, description, allowed_roles, is_default, widgets, created_by
                )
                VALUES (
                    ${tenantId}, ${name}, ${description},
                    ${JSON.stringify(allowedRoles)}::jsonb, ${isDefault},
                    ${JSON.stringify(widgets)}::jsonb,
                    ${UUID_RE.test(userId) ? userId : null}
                )
                RETURNING id
            `;
            return inserted[0]?.id;
        });

        revalidatePath('/reports');
        return { success: true, id: savedId };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to save dashboard.' };
    }
}

export async function deleteMetadataDashboardAction(
    dashboardId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId, session } = await requireAuth('reports:read');
        const canManage =
            hasPermission(session.role as UserRole, 'settings:write') ||
            session.role === 'SCHOOL_ADMIN' ||
            session.role === 'SUPER_ADMIN' ||
            session.role === 'PLATFORM_ADMIN';
        if (!canManage) {
            return { success: false, error: 'Forbidden.' };
        }
        if (!UUID_RE.test(dashboardId)) {
            return { success: false, error: 'Invalid dashboard ID.' };
        }
        await runWithTenantContext(tenantId, async () => {
            await sql`
                DELETE FROM metadata_dashboards
                WHERE id = ${dashboardId}
                  AND tenant_id = ${tenantId}
            `.execute();
        });
        revalidatePath('/reports');
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to delete dashboard.' };
    }
}

// ============================================================================
// 5. Unified 360° Record File Attachments CRUD (OWD + FLS + SHA-256 Verified)
// ============================================================================

export async function listRecordAttachmentsAction(
    objectApiName: string,
    recordId: string,
): Promise<MetadataRecordAttachmentItem[]> {
    if (!UUID_RE.test(recordId)) return [];
    const { tenantId, session } = await requireAuth();
    if (!isStaff(session.role as UserRole)) return [];

    // Enforces object activation + FLS read check + OWD read check via queryRecords
    await getObjectMetadata(objectApiName);
    const visibleRecords = await queryRecords(objectApiName, { id: recordId }, 1, 0);
    if (visibleRecords.length === 0) return [];

    const cleanApi = (objectApiName || '').trim().toLowerCase();
    assertSafeMetadataIdentifier(cleanApi, 'object API name');

    try {
        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                id: string;
                object_api_name: string;
                record_id: string;
                file_name: string;
                mime_type: string;
                size_bytes: number;
                sha256_checksum: string;
                description: string | null;
                uploaded_by: string | null;
                created_at: Date | string;
                has_inline: boolean;
            }>`
                SELECT id, object_api_name, record_id, file_name, mime_type, size_bytes,
                       sha256_checksum, description, uploaded_by, created_at,
                       (inline_base64 IS NOT NULL AND inline_base64 <> '') AS has_inline
                FROM metadata_record_attachments
                WHERE tenant_id = ${tenantId}
                  AND object_api_name = ${cleanApi}
                  AND record_id = ${recordId}
                ORDER BY created_at DESC
                LIMIT 50
            `;

            return rows.map(r => ({
                id: r.id,
                objectApiName: r.object_api_name,
                recordId: r.record_id,
                fileName: r.file_name,
                mimeType: r.mime_type,
                sizeBytes: Number(r.size_bytes || 0),
                sha256Checksum: r.sha256_checksum,
                description: r.description,
                uploadedBy: r.uploaded_by,
                createdAt:
                    r.created_at instanceof Date
                        ? r.created_at.toISOString()
                        : String(r.created_at),
                hasInlineContent: Boolean(r.has_inline),
            }));
        });
    } catch {
        return [];
    }
}

export async function uploadRecordAttachmentAction(input: {
    objectApiName: string;
    recordId: string;
    fileName: string;
    mimeType: string;
    base64Data: string;
    description?: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
        if (!UUID_RE.test(input.recordId)) {
            return { success: false, error: 'Invalid record ID.' };
        }
        const { tenantId, userId, session } = await requireAuth();
        if (!isStaff(session.role as UserRole)) {
            return { success: false, error: 'Forbidden: staff access is required.' };
        }

        const cleanApi = (input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');
        const { fields } = await getObjectMetadata(cleanApi);
        if (!fields.some(f => f.canWrite)) {
            return {
                success: false,
                error: 'Forbidden: you do not have write permission on this object.',
            };
        }

        const lockCheck = await checkRecordApprovalLockInternal(
            tenantId,
            cleanApi,
            input.recordId,
            session.role,
        );
        if (lockCheck.locked === true) {
            return { success: false, error: lockCheck.error };
        }

        const visibleRecords = await queryRecords(cleanApi, { id: input.recordId }, 1, 0);
        if (visibleRecords.length === 0) {
            return { success: false, error: 'Record not found or inaccessible.' };
        }

        const { owdMode, sharingRules } = await loadObjectOwdAndSharingInternal(tenantId, cleanApi);
        const canWriteOwd = canAccessRecordUnderOwd({
            owdMode,
            operation: 'WRITE',
            record: visibleRecords[0],
            callerUserId: session.userId || userId,
            effectiveRoleCode: session.effectiveRoleCode || session.role,
            baseRole: session.role,
            sharingRules,
        });
        if (!canWriteOwd) {
            return {
                success: false,
                error: 'Forbidden by Organization-Wide Defaults (OWD): you do not have write sharing access to this record.',
            };
        }

        const mimeType = (input.mimeType || '').trim().toLowerCase();
        if (!ALLOWED_ATTACHMENT_MIMES.has(mimeType)) {
            return {
                success: false,
                error: 'Unsupported file type. Allowed: PDF, PNG, JPEG, WEBP, CSV, TXT, DOCX, XLSX.',
            };
        }

        const cleanFileName = (input.fileName || '')
            .replace(/[^A-Za-z0-9._ -]/g, '_')
            .trim()
            .slice(0, 200);
        if (!cleanFileName) {
            return { success: false, error: 'Valid file name is required.' };
        }

        const strippedBase64 = (input.base64Data || '').replace(/^data:[^;]+;base64,/, '').trim();
        const bytes = Buffer.from(strippedBase64, 'base64');
        if (bytes.byteLength === 0) {
            return { success: false, error: 'Attachment file is empty.' };
        }
        if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
            return {
                success: false,
                error: 'Attachment exceeds the 512 KB inline document limit.',
            };
        }

        const sha256Checksum = createHash('sha256').update(bytes).digest('hex');
        const actorId = UUID_RE.test(session.userId || userId) ? session.userId || userId : null;

        const savedId = await runWithTenantContext(tenantId, async () => {
            const inserted = await sql<{ id: string }>`
                INSERT INTO metadata_record_attachments (
                    tenant_id, object_api_name, record_id, file_name, mime_type,
                    size_bytes, inline_base64, sha256_checksum, description, uploaded_by
                )
                VALUES (
                    ${tenantId}, ${cleanApi}, ${input.recordId}, ${cleanFileName}, ${mimeType},
                    ${bytes.byteLength}, ${strippedBase64}, ${sha256Checksum},
                    ${input.description?.trim() || null}, ${actorId}
                )
                RETURNING id
            `;

            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
                VALUES (
                    ${tenantId},
                    ${actorId},
                    'UPDATE',
                    ${cleanApi},
                    ${input.recordId},
                    ${JSON.stringify({
                        auditEvent: 'RECORD_FILE_ATTACHED',
                        fileName: cleanFileName,
                        mimeType,
                        sizeBytes: bytes.byteLength,
                        sha256: sha256Checksum.slice(0, 12),
                    })}::jsonb
                )
            `.execute();

            return inserted[0]?.id;
        });

        revalidateTag('metadata', 'max');
        revalidatePath(`/app/${cleanApi}/${input.recordId}`);
        return { success: true, id: savedId };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to upload attachment.' };
    }
}

export async function downloadRecordAttachmentAction(attachmentId: string): Promise<{
    success: boolean;
    fileName?: string;
    mimeType?: string;
    base64Data?: string;
    error?: string;
}> {
    try {
        if (!UUID_RE.test(attachmentId)) {
            return { success: false, error: 'Invalid attachment ID.' };
        }
        const { tenantId, session } = await requireAuth();
        if (!isStaff(session.role as UserRole)) {
            return { success: false, error: 'Forbidden.' };
        }

        const row = await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                object_api_name: string;
                record_id: string;
                file_name: string;
                mime_type: string;
                inline_base64: string | null;
            }>`
                SELECT object_api_name, record_id, file_name, mime_type, inline_base64
                FROM metadata_record_attachments
                WHERE id = ${attachmentId}
                  AND tenant_id = ${tenantId}
                LIMIT 1
            `;
            return rows[0] ?? null;
        });

        if (!row || !row.inline_base64) {
            return { success: false, error: 'Attachment not found.' };
        }

        const visible = await queryRecords(row.object_api_name, { id: row.record_id }, 1, 0);
        if (visible.length === 0) {
            return { success: false, error: 'Forbidden by record sharing policy.' };
        }

        return {
            success: true,
            fileName: row.file_name,
            mimeType: row.mime_type,
            base64Data: row.inline_base64,
        };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to download attachment.' };
    }
}

export async function deleteRecordAttachmentAction(
    attachmentId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(attachmentId)) {
            return { success: false, error: 'Invalid attachment ID.' };
        }
        const { tenantId, userId, session } = await requireAuth();
        if (!isStaff(session.role as UserRole)) {
            return { success: false, error: 'Forbidden.' };
        }

        const existing = await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                object_api_name: string;
                record_id: string;
                file_name: string;
            }>`
                SELECT object_api_name, record_id, file_name
                FROM metadata_record_attachments
                WHERE id = ${attachmentId}
                  AND tenant_id = ${tenantId}
                LIMIT 1
            `;
            return rows[0] ?? null;
        });

        if (!existing) {
            return { success: false, error: 'Attachment not found.' };
        }

        const visible = await queryRecords(
            existing.object_api_name,
            { id: existing.record_id },
            1,
            0,
        );
        if (visible.length === 0) {
            return { success: false, error: 'Forbidden.' };
        }

        const { owdMode, sharingRules } = await loadObjectOwdAndSharingInternal(
            tenantId,
            existing.object_api_name,
        );
        if (
            !canAccessRecordUnderOwd({
                owdMode,
                operation: 'WRITE',
                record: visible[0],
                callerUserId: session.userId || userId,
                effectiveRoleCode: session.effectiveRoleCode || session.role,
                baseRole: session.role,
                sharingRules,
            })
        ) {
            return { success: false, error: 'Forbidden by OWD record sharing policy.' };
        }

        const actorId = UUID_RE.test(session.userId || userId) ? session.userId || userId : null;
        await runWithTenantContext(tenantId, async () => {
            await sql`
                DELETE FROM metadata_record_attachments
                WHERE id = ${attachmentId}
                  AND tenant_id = ${tenantId}
            `.execute();

            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, after_state)
                VALUES (
                    ${tenantId},
                    ${actorId},
                    'UPDATE',
                    ${existing.object_api_name},
                    ${existing.record_id},
                    ${JSON.stringify({
                        auditEvent: 'RECORD_FILE_REMOVED',
                        fileName: existing.file_name,
                    })}::jsonb
                )
            `.execute();
        });

        revalidatePath(`/app/${existing.object_api_name}/${existing.record_id}`);
        return { success: true };
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message || 'Failed to delete attachment.' };
    }
}

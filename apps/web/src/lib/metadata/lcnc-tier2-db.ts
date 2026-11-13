import { runWithTenantContext, sql } from '@/lib/db';
import {
    evaluateRecordValidationRules,
    type ApprovalProcessStepDef,
    type ApprovalStepHistoryEntry,
    type MetadataApprovalInstanceItem,
    type MetadataApprovalProcessItem,
    type MetadataSharingRuleItem,
    type MetadataValidationRuleItem,
    type OwdMode,
    type SharingCriteriaOperator,
} from '@/lib/metadata/lcnc-helpers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadObjectOwdAndSharingInternal(
    tenantId: string,
    objectApiName: string,
): Promise<{ owdMode: OwdMode; sharingRules: MetadataSharingRuleItem[] }> {
    if (!UUID_RE.test(tenantId)) {
        return { owdMode: 'PUBLIC_READ_WRITE', sharingRules: [] };
    }

    try {
        return await runWithTenantContext(tenantId, async () => {
            const [owdRows, ruleRows] = await Promise.all([
                sql<{ owd_mode: string | null }>`
                    SELECT owd_mode
                    FROM tenant_object_settings
                    WHERE tenant_id = ${tenantId}
                      AND object_api_name = ${objectApiName}
                    LIMIT 1
                `,
                sql<{
                    id: string;
                    object_api_name: string;
                    name: string;
                    criteria_field: string | null;
                    criteria_operator: string;
                    criteria_value: string | null;
                    shared_with_role: string;
                    access_level: string;
                    is_active: boolean;
                    created_at: Date | string;
                }>`
                    SELECT id, object_api_name, name, criteria_field, criteria_operator,
                           criteria_value, shared_with_role, access_level, is_active, created_at
                    FROM metadata_sharing_rules
                    WHERE tenant_id = ${tenantId}
                      AND object_api_name = ${objectApiName}
                    ORDER BY created_at ASC
                `,
            ]);

            const rawOwd = String(owdRows[0]?.owd_mode || 'PUBLIC_READ_WRITE').toUpperCase();
            const owdMode: OwdMode =
                rawOwd === 'PRIVATE' || rawOwd === 'PUBLIC_READ_ONLY'
                    ? rawOwd
                    : 'PUBLIC_READ_WRITE';

            return {
                owdMode,
                sharingRules: ruleRows.map(r => ({
                    id: r.id,
                    objectApiName: r.object_api_name,
                    name: r.name,
                    criteriaField: r.criteria_field,
                    criteriaOperator: (r.criteria_operator || 'eq') as SharingCriteriaOperator,
                    criteriaValue: r.criteria_value,
                    sharedWithRole: r.shared_with_role,
                    accessLevel: r.access_level === 'READ_WRITE' ? 'READ_WRITE' : 'READ',
                    isActive: Boolean(r.is_active),
                    createdAt:
                        r.created_at instanceof Date
                            ? r.created_at.toISOString()
                            : String(r.created_at),
                })),
            };
        });
    } catch {
        return { owdMode: 'PUBLIC_READ_WRITE', sharingRules: [] };
    }
}

export async function loadObjectValidationRulesInternal(
    tenantId: string,
    objectApiName: string,
): Promise<MetadataValidationRuleItem[]> {
    if (!UUID_RE.test(tenantId)) return [];
    try {
        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                id: string;
                object_api_name: string;
                name: string;
                description: string | null;
                error_condition_formula: string;
                error_message: string;
                error_field: string | null;
                is_active: boolean;
                created_at: Date | string;
            }>`
                SELECT id, object_api_name, name, description, error_condition_formula,
                       error_message, error_field, is_active, created_at
                FROM metadata_validation_rules
                WHERE tenant_id = ${tenantId}
                  AND object_api_name = ${objectApiName}
                ORDER BY created_at ASC
            `;
            return rows.map(r => ({
                id: r.id,
                objectApiName: r.object_api_name,
                name: r.name,
                description: r.description,
                errorConditionFormula: r.error_condition_formula,
                errorMessage: r.error_message,
                errorField: r.error_field,
                isActive: Boolean(r.is_active),
                createdAt:
                    r.created_at instanceof Date
                        ? r.created_at.toISOString()
                        : String(r.created_at),
            }));
        });
    } catch {
        return [];
    }
}

export async function enforceObjectValidationRulesInternal(
    tenantId: string,
    objectApiName: string,
    candidateRecord: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const rules = await loadObjectValidationRulesInternal(tenantId, objectApiName);
    if (rules.length === 0) return { ok: true };

    const result = evaluateRecordValidationRules(rules, candidateRecord);
    if (result.valid) return { ok: true };

    const formatted = result.violations
        .map(v =>
            v.errorField
                ? `[${v.ruleName} -> ${v.errorField}] ${v.errorMessage}`
                : `[${v.ruleName}] ${v.errorMessage}`,
        )
        .join(' ');
    return { ok: false, error: formatted };
}

export async function loadObjectApprovalProcessesInternal(
    tenantId: string,
    objectApiName: string,
): Promise<MetadataApprovalProcessItem[]> {
    if (!UUID_RE.test(tenantId)) return [];
    try {
        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                id: string;
                object_api_name: string;
                name: string;
                description: string | null;
                entry_criteria_formula: string | null;
                steps: ApprovalProcessStepDef[];
                lock_record_on_submit: boolean;
                field_updates_on_approve: Record<string, string>;
                field_updates_on_reject: Record<string, string>;
                is_active: boolean;
                created_at: Date | string;
            }>`
                SELECT id, object_api_name, name, description, entry_criteria_formula,
                       steps, lock_record_on_submit, field_updates_on_approve,
                       field_updates_on_reject, is_active, created_at
                FROM metadata_approval_processes
                WHERE tenant_id = ${tenantId}
                  AND object_api_name = ${objectApiName}
                ORDER BY created_at ASC
            `;
            return rows.map(r => ({
                id: r.id,
                objectApiName: r.object_api_name,
                name: r.name,
                description: r.description,
                entryCriteriaFormula: r.entry_criteria_formula,
                steps: Array.isArray(r.steps) ? r.steps : [],
                lockRecordOnSubmit: Boolean(r.lock_record_on_submit),
                fieldUpdatesOnApprove:
                    r.field_updates_on_approve && typeof r.field_updates_on_approve === 'object'
                        ? r.field_updates_on_approve
                        : {},
                fieldUpdatesOnReject:
                    r.field_updates_on_reject && typeof r.field_updates_on_reject === 'object'
                        ? r.field_updates_on_reject
                        : {},
                isActive: Boolean(r.is_active),
                createdAt:
                    r.created_at instanceof Date
                        ? r.created_at.toISOString()
                        : String(r.created_at),
            }));
        });
    } catch {
        return [];
    }
}

export async function loadActiveRecordApprovalInstanceInternal(
    tenantId: string,
    objectApiName: string,
    recordId: string,
): Promise<MetadataApprovalInstanceItem | null> {
    if (!UUID_RE.test(tenantId) || !UUID_RE.test(recordId)) return null;
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
                  AND i.object_api_name = ${objectApiName}
                  AND i.record_id = ${recordId}
                ORDER BY CASE WHEN i.status = 'PENDING' THEN 0 ELSE 1 END, i.created_at DESC
                LIMIT 1
            `;
            if (rows.length === 0) return null;
            const row = rows[0];
            const steps = Array.isArray(row.steps) ? row.steps : [];
            const currentDef =
                steps.find(s => s.stepNumber === row.current_step) ?? steps[row.current_step - 1];

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
    } catch {
        return null;
    }
}

export async function checkRecordApprovalLockInternal(
    tenantId: string,
    objectApiName: string,
    recordId: string,
    callerRole: string,
): Promise<{ locked: false } | { locked: true; error: string }> {
    const upper = (callerRole || '').trim().toUpperCase();
    if (upper === 'PLATFORM_ADMIN' || upper === 'SUPER_ADMIN' || upper === 'SCHOOL_ADMIN') {
        return { locked: false };
    }

    const active = await loadActiveRecordApprovalInstanceInternal(
        tenantId,
        objectApiName,
        recordId,
    );
    if (active && active.status === 'PENDING' && active.isLocked) {
        return {
            locked: true,
            error: `Record is locked pending Step ${active.currentStep} approval${
                active.currentStepName ? ` ("${active.currentStepName}")` : ''
            }.`,
        };
    }
    return { locked: false };
}

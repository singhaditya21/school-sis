'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';
import { runSingleWorkflowAction, type WorkflowExecutionResult } from './metadata-engine';

export interface WorkflowCondition {
    field: string;
    operator: string;
    value: string;
}

export interface Workflow {
    id: string;
    tenantId: string;
    name: string;
    objectName: string;
    triggerEvent: string;
    conditions: WorkflowCondition[];
    actionType: string;
    actionPayload: Record<string, unknown>;
    isActive: boolean;
    createdAt: string;
}

export interface WorkflowExecutionLog {
    id: string;
    entityType: string;
    entityId: string;
    afterState: {
        workflowId?: string;
        workflowName?: string;
        triggerEvent?: string;
        actionType?: string;
        actionResult?: Record<string, unknown>;
        executedAt?: string;
    };
    createdAt: string;
}

export async function getWorkflows(): Promise<Workflow[]> {
    const { tenantId } = await requireAuth('settings:read');
    return sql<Workflow>`
        SELECT id, tenant_id as "tenantId", name, object_name as "objectName", trigger_event as "triggerEvent", conditions, action_type as "actionType", action_payload as "actionPayload", is_active as "isActive", created_at as "createdAt"
        FROM metadata_workflows
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
    `;
}

export async function getWorkflowExecutions(limit = 10): Promise<WorkflowExecutionLog[]> {
    const { tenantId } = await requireAuth('settings:read');
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
    return sql<WorkflowExecutionLog>`
        SELECT id,
               entity_type as "entityType",
               entity_id as "entityId",
               COALESCE(after_state, '{}'::jsonb) as "afterState",
               created_at as "createdAt"
        FROM audit_logs
        WHERE tenant_id = ${tenantId}
          AND action = 'WORKFLOW_EXECUTED'
        ORDER BY created_at DESC
        LIMIT ${safeLimit}
    `;
}

export async function triggerWorkflowTestRun(
    workflowId: string,
): Promise<{ success: boolean; result?: WorkflowExecutionResult; error?: string }> {
    try {
        const { tenantId } = await requireAuth('settings:write');
        const rows = await sql<Workflow>`
            SELECT id, tenant_id as "tenantId", name, object_name as "objectName",
                   trigger_event as "triggerEvent", conditions, action_type as "actionType",
                   action_payload as "actionPayload", is_active as "isActive", created_at as "createdAt"
            FROM metadata_workflows
            WHERE id = ${workflowId} AND tenant_id = ${tenantId}
            LIMIT 1
        `;
        if (rows.length === 0) {
            return { success: false, error: 'Workflow not found.' };
        }
        const wf = rows[0];
        const payload =
            wf.actionPayload && typeof wf.actionPayload === 'object' ? wf.actionPayload : {};

        const result = await runSingleWorkflowAction({
            tenantId,
            workflowId: wf.id,
            workflowName: wf.name,
            objectName: wf.objectName,
            triggerEvent: wf.triggerEvent,
            actionType: wf.actionType,
            actionPayload: payload,
            recordId: wf.id,
            recordData: { email: 'notifications@scholarmind.local', status: 'TEST_TRIGGER' },
        });
        revalidatePath('/settings/automation');
        return { success: true, result };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to test-run workflow.',
        };
    }
}

export async function toggleWorkflow(id: string, isActive: boolean) {
    const { tenantId } = await requireAuth('settings:write');
    await sql`
        UPDATE metadata_workflows SET is_active = ${isActive} WHERE id = ${id} AND tenant_id = ${tenantId}
    `;
    revalidatePath('/settings/automation');
    return { success: true };
}

export async function createWorkflow(data: Omit<Workflow, 'id' | 'tenantId' | 'createdAt'>) {
    const { tenantId } = await requireAuth('settings:write');
    await sql`
        INSERT INTO metadata_workflows (tenant_id, name, object_name, trigger_event, conditions, action_type, action_payload, is_active)
        VALUES (${tenantId}, ${data.name}, ${data.objectName}, ${data.triggerEvent}, ${JSON.stringify(data.conditions)}, ${data.actionType}, ${JSON.stringify(data.actionPayload)}, ${data.isActive})
    `;
    revalidatePath('/settings/automation');
    return { success: true };
}

export async function deleteWorkflow(id: string) {
    const { tenantId } = await requireAuth('settings:write');
    await sql`
        DELETE FROM metadata_workflows WHERE id = ${id} AND tenant_id = ${tenantId}
    `;
    revalidatePath('/settings/automation');
    return { success: true };
}

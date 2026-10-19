'use server';

import { sql } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

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

export async function getWorkflows(): Promise<Workflow[]> {
    const { tenantId } = await requireAuth('settings:read');
    return sql<Workflow>`
        SELECT id, tenant_id as "tenantId", name, object_name as "objectName", trigger_event as "triggerEvent", conditions, action_type as "actionType", action_payload as "actionPayload", is_active as "isActive", created_at as "createdAt"
        FROM metadata_workflows
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
    `;
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

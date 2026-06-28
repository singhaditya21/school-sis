'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

export interface Workflow {
    id: string;
    tenantId: string;
    name: string;
    objectName: string;
    triggerEvent: string;
    conditions: any;
    actionType: string;
    actionPayload: any;
    isActive: boolean;
    createdAt: string;
}

export async function getWorkflows(): Promise<Workflow[]> {
    const { tenantId } = await requireAuth();
    const { rows } = await pool.query(
        `SELECT id, tenant_id as "tenantId", name, object_name as "objectName", trigger_event as "triggerEvent", conditions, action_type as "actionType", action_payload as "actionPayload", is_active as "isActive", created_at as "createdAt"
         FROM metadata_workflows
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
    );
    return rows;
}

export async function toggleWorkflow(id: string, isActive: boolean) {
    const { tenantId } = await requireAuth();
    await pool.query(
        `UPDATE metadata_workflows SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
        [isActive, id, tenantId]
    );
    revalidatePath('/settings/automation');
    return { success: true };
}

export async function createWorkflow(data: Omit<Workflow, 'id' | 'tenantId' | 'createdAt'>) {
    const { tenantId } = await requireAuth();
    await pool.query(
        `INSERT INTO metadata_workflows (tenant_id, name, object_name, trigger_event, conditions, action_type, action_payload, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, data.name, data.objectName, data.triggerEvent, JSON.stringify(data.conditions), data.actionType, JSON.stringify(data.actionPayload), data.isActive]
    );
    revalidatePath('/settings/automation');
    return { success: true };
}

export async function deleteWorkflow(id: string) {
    const { tenantId } = await requireAuth();
    await pool.query(
        `DELETE FROM metadata_workflows WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
    );
    revalidatePath('/settings/automation');
    return { success: true };
}

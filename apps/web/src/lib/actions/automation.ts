'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

export interface Workflow {
    id: string;
    tenantId: string;
    name: string;
    triggerEvent: string;
    actionType: string;
    actionPayload: any;
    isActive: boolean;
    createdAt: string;
}

export async function getWorkflows(): Promise<Workflow[]> {
    const { tenantId } = await requireAuth();
    const { rows } = await pool.query(
        `SELECT id, tenant_id as "tenantId", name, trigger_event as "triggerEvent", action_type as "actionType", action_payload as "actionPayload", is_active as "isActive", created_at as "createdAt"
         FROM workflows
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
    );
    return rows;
}

export async function toggleWorkflow(id: string, isActive: boolean) {
    const { tenantId } = await requireAuth();
    await pool.query(
        `UPDATE workflows SET is_active = $1 WHERE id = $2 AND tenant_id = $3`,
        [isActive, id, tenantId]
    );
    revalidatePath('/automation');
    return { success: true };
}

export async function createWorkflow(data: Omit<Workflow, 'id' | 'tenantId' | 'createdAt'>) {
    const { tenantId } = await requireAuth();
    await pool.query(
        `INSERT INTO workflows (tenant_id, name, trigger_event, action_type, action_payload, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, data.name, data.triggerEvent, data.actionType, JSON.stringify(data.actionPayload), data.isActive]
    );
    revalidatePath('/automation');
    return { success: true };
}

export async function deleteWorkflow(id: string) {
    const { tenantId } = await requireAuth();
    await pool.query(
        `DELETE FROM workflows WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
    );
    revalidatePath('/automation');
    return { success: true };
}

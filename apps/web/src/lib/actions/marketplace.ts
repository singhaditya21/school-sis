'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { revalidatePath } from 'next/cache';

export async function getCompanyModules() {
    const { tenantId } = await requireAuth();

    // Find the company ID for this tenant
    const { rows: tenantRows } = await pool.query(
        `SELECT company_id FROM tenants WHERE id = $1 LIMIT 1`,
        [tenantId]
    );

    const companyId = tenantRows[0]?.company_id;
    if (!companyId) return [];

    const { rows } = await pool.query(
        `SELECT active_modules FROM companies WHERE id = $1 LIMIT 1`,
        [companyId]
    );

    return rows[0]?.active_modules || [];
}

export async function toggleModuleAction(moduleCode: string, isActive: boolean) {
    const { tenantId } = await requireAuth();

    const { rows: tenantRows } = await pool.query(
        `SELECT company_id FROM tenants WHERE id = $1 LIMIT 1`,
        [tenantId]
    );

    const companyId = tenantRows[0]?.company_id;
    if (!companyId) throw new Error("Company not found");

    if (isActive) {
        await pool.query(
            `UPDATE companies SET active_modules = array_append(active_modules, $1) WHERE id = $2 AND NOT ($1 = ANY(active_modules))`,
            [moduleCode, companyId]
        );
    } else {
        await pool.query(
            `UPDATE companies SET active_modules = array_remove(active_modules, $1) WHERE id = $2`,
            [moduleCode, companyId]
        );
    }

    revalidatePath('/marketplace');
    revalidatePath('/dashboard'); // re-render sidebar eventually
    return { success: true };
}

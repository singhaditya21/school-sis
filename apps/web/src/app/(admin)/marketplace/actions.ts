'use server';

import { revalidatePath } from 'next/cache';
import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { ALL_MODULE_CODES } from './catalogue';

/**
 * Module entitlement actions.
 *
 * Entitlements live on `companies.active_modules` (a `text[]`), not on the
 * tenant. A tenant whose `company_id` is NULL therefore has nowhere to store
 * them — the screen says so instead of pretending a toggle worked.
 */

export type ModuleEntitlements = {
    /** False when this tenant has no company row to hold entitlements. */
    linked: boolean;
    companyName: string | null;
    subscriptionTier: string | null;
    activeModules: string[];
    /** Codes stored on the company that this build does not recognise. */
    unknownModules: string[];
};

export type ToggleModuleResult = {
    success: boolean;
    error?: string;
    activeModules?: string[];
};

async function loadCompany(tenantId: string) {
    const { rows } = await pool.query(
        `SELECT c.id,
                c.name,
                c.subscription_tier AS "subscriptionTier",
                c.active_modules AS "activeModules"
           FROM tenants t
           JOIN companies c ON c.id = t.company_id
          WHERE t.id = $1
          LIMIT 1`,
        [tenantId],
    );

    return rows[0] as
        | {
              id: string;
              name: string;
              subscriptionTier: string | null;
              activeModules: string[] | null;
          }
        | undefined;
}

export async function getModuleEntitlements(): Promise<ModuleEntitlements> {
    const { tenantId } = await requireAuth('settings:read');
    const company = await loadCompany(tenantId);

    if (!company) {
        return {
            linked: false,
            companyName: null,
            subscriptionTier: null,
            activeModules: [],
            unknownModules: [],
        };
    }

    const activeModules = company.activeModules ?? [];

    return {
        linked: true,
        companyName: company.name,
        subscriptionTier: company.subscriptionTier,
        activeModules,
        unknownModules: activeModules.filter((code) => !ALL_MODULE_CODES.includes(code)),
    };
}

export async function setModuleActiveAction(
    moduleCode: string,
    isActive: boolean,
): Promise<ToggleModuleResult> {
    const { tenantId } = await requireAuth('settings:write');

    if (!ALL_MODULE_CODES.includes(moduleCode)) {
        return { success: false, error: `Unknown module code "${moduleCode}".` };
    }

    const company = await loadCompany(tenantId);
    if (!company) {
        return {
            success: false,
            error: 'This school is not linked to a company record, so module entitlements cannot be changed here.',
        };
    }

    const { rows } = await pool.query(
        isActive
            ? `UPDATE companies
                  SET active_modules = array_append(COALESCE(active_modules, ARRAY[]::text[]), $1),
                      updated_at = now()
                WHERE id = $2
                  AND NOT ($1 = ANY(COALESCE(active_modules, ARRAY[]::text[])))
                RETURNING active_modules AS "activeModules"`
            : `UPDATE companies
                  SET active_modules = array_remove(COALESCE(active_modules, ARRAY[]::text[]), $1),
                      updated_at = now()
                WHERE id = $2
                RETURNING active_modules AS "activeModules"`,
        [moduleCode, company.id],
    );

    // A no-op update (module already in the requested state) returns no rows.
    const activeModules: string[] =
        (rows[0]?.activeModules as string[] | undefined) ?? company.activeModules ?? [];

    revalidatePath('/marketplace');
    return { success: true, activeModules };
}

'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { identifier, pool, runWithTenantContext, sql, sqlFor } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { evictUserSessionCache } from '@/lib/auth/session-revocation';
import { hasPermission, isStaff, UserRole } from '@/lib/rbac/permissions';
import {
    RESERVED_SYSTEM_ROLE_CODES,
    evaluateEffectivePermission,
    resolveEffectiveUserRoleContext,
} from '@/lib/rbac/custom-roles';
import { assertSafeMetadataIdentifier, type RollupAggregateFunction } from '@/lib/metadata/platform';
import type {
    MetadataViewCategoryItem,
    ReportCategoryItem,
    SavedLcncReportItem,
    SavedObjectViewItem,
    SavedViewFilterRule,
} from '@/lib/metadata/lcnc-helpers';
import { METADATA_EAV_TABLE_NAME } from '@school-sis/api/src/metadata/runtime';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_CODE_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

export interface TenantCatalogObjectItem {
    id: string;
    name: string;
    apiName: string;
    tableName: string;
    description: string | null;
    isCustom: boolean;
    isTenantDefinedEav: boolean;
    isEnabled: boolean;
    totalFields: number;
    customFields: number;
    recordCount: number;
}

export interface TenantCustomRoleItem {
    id: string;
    code: string;
    name: string;
    description: string | null;
    baseRole: string;
    isActive: boolean;
    permissions: string[];
    assignedUserCount: number;
    createdAt: string;
}

// ============================================================================
// PILLAR 1: System Objects + Custom Objects Catalog & Per-Tenant Activation
// ============================================================================

export async function listTenantObjectCatalog(): Promise<{
    success: boolean;
    objects: TenantCatalogObjectItem[];
    error?: string;
}> {
    try {
        const { tenantId } = await requireAuth('metadata:read');

        return await runWithTenantContext(tenantId, async () => {
            const objRows = await sql<{
                id: string;
                name: string;
                api_name: string;
                table_name: string;
                description: string | null;
                is_custom: boolean | null;
            }>`
                SELECT id, name, api_name, table_name, description, is_custom
                FROM (
                    SELECT DISTINCT ON (api_name)
                           id, name, api_name, table_name, description, is_custom, tenant_id, created_at
                    FROM metadata_objects
                    WHERE status <> 'ARCHIVED'
                      AND (
                        tenant_id = ${tenantId}
                        OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
                      )
                    ORDER BY api_name, CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
                ) resolved_objects
                ORDER BY COALESCE(is_custom, false) ASC, name ASC
            `;

            const settingRows = await sql<{ object_api_name: string; is_enabled: boolean }>`
                SELECT object_api_name, is_enabled
                FROM tenant_object_settings
                WHERE tenant_id = ${tenantId}
            `;
            const enabledMap = new Map<string, boolean>(
                settingRows.map(r => [r.object_api_name, Boolean(r.is_enabled)]),
            );

            const fieldCountRows = await sql<{
                object_id: string;
                total: number;
                custom: number;
            }>`
                SELECT f.object_id,
                       COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE COALESCE(f.is_custom, false))::int AS custom
                FROM metadata_fields f
                JOIN metadata_objects o ON o.id = f.object_id
                WHERE f.status <> 'ARCHIVED'
                  AND o.status <> 'ARCHIVED'
                  AND (
                    o.tenant_id = ${tenantId}
                    OR (o.tenant_id IS NULL AND COALESCE(o.is_custom, false) = false)
                  )
                GROUP BY f.object_id
            `;
            const fieldMap = new Map(
                fieldCountRows.map(r => [r.object_id, { total: Number(r.total), custom: Number(r.custom) }]),
            );

            const eavCountRows = await sql<{ object_id: string; cnt: number }>`
                SELECT object_id, COUNT(*)::int AS cnt
                FROM metadata_records
                WHERE tenant_id = ${tenantId}
                GROUP BY object_id
            `;
            const eavCountMap = new Map(eavCountRows.map(r => [r.object_id, Number(r.cnt)]));

            const objects: TenantCatalogObjectItem[] = [];
            for (const row of objRows) {
                const isEav = row.table_name === METADATA_EAV_TABLE_NAME;
                let recordCount = isEav ? (eavCountMap.get(row.id) ?? 0) : 0;

                if (!isEav && row.table_name && row.table_name !== 'platform_audit_logs') {
                    try {
                        assertSafeMetadataIdentifier(row.table_name, 'system table');
                        const tblIdent = identifier(row.table_name);
                        const cntRows = await sql<{ cnt: number }>`
                            SELECT COUNT(*)::int AS cnt
                            FROM ${tblIdent}
                            WHERE tenant_id = ${tenantId}
                        `;
                        recordCount = Number(cntRows[0]?.cnt ?? 0);
                    } catch {
                        recordCount = 0;
                    }
                }

                const fld = fieldMap.get(row.id) ?? { total: 0, custom: 0 };
                objects.push({
                    id: row.id,
                    name: row.name,
                    apiName: row.api_name,
                    tableName: row.table_name,
                    description: row.description,
                    isCustom: Boolean(row.is_custom),
                    isTenantDefinedEav: isEav,
                    isEnabled: enabledMap.get(row.api_name) ?? true,
                    totalFields: fld.total,
                    customFields: fld.custom,
                    recordCount,
                });
            }

            return { success: true, objects };
        });
    } catch (error) {
        return {
            success: false,
            objects: [],
            error: error instanceof Error ? error.message : 'Failed to load object catalog.',
        };
    }
}

export async function toggleTenantObjectEnabled(
    objectApiName: string,
    isEnabled: boolean,
): Promise<{ success: boolean; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('metadata:publish');
        const cleanApi = objectApiName.trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');

        await runWithTenantContext(tenantId, async () => {
            await sql`
                INSERT INTO tenant_object_settings (tenant_id, object_api_name, is_enabled, updated_by, created_at, updated_at)
                VALUES (${tenantId}, ${cleanApi}, ${Boolean(isEnabled)}, ${userId}, NOW(), NOW())
                ON CONFLICT (tenant_id, object_api_name)
                DO UPDATE SET is_enabled = EXCLUDED.is_enabled,
                              updated_by = EXCLUDED.updated_by,
                              updated_at = NOW()
            `.execute();
        });

        revalidateTag('metadata', 'max');
        revalidatePath('/settings/objects');
        revalidatePath(`/app/${cleanApi}`);
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update object status.',
        };
    }
}

export async function listEnabledSidebarObjects(): Promise<{
    apiName: string;
    name: string;
    isCustom: boolean;
}[]> {
    try {
        const { tenantId, session } = await requireAuth('dashboard:read');
        if (!isStaff(session.role as UserRole)) return [];

        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                api_name: string;
                name: string;
                is_custom: boolean | null;
            }>`
                SELECT ro.api_name, ro.name, ro.is_custom
                FROM (
                    SELECT DISTINCT ON (api_name) api_name, name, is_custom, tenant_id, created_at
                    FROM metadata_objects
                    WHERE status = 'PUBLISHED'
                      AND (
                        tenant_id = ${tenantId}
                        OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
                      )
                    ORDER BY api_name, CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
                ) ro
                LEFT JOIN tenant_object_settings tos
                       ON tos.tenant_id = ${tenantId}
                      AND tos.object_api_name = ro.api_name
                WHERE COALESCE(tos.is_enabled, true) = true
                ORDER BY COALESCE(ro.is_custom, false) DESC, ro.name ASC
                LIMIT 24
            `;

            return rows.map(r => ({
                apiName: r.api_name,
                name: r.name,
                isCustom: Boolean(r.is_custom),
            }));
        });
    } catch {
        return [];
    }
}

// ============================================================================
// PILLAR 2: Custom Tenant Roles & Permission Matrix
// ============================================================================

export async function listTenantRolesWithPermissions(): Promise<{
    success: boolean;
    roles: TenantCustomRoleItem[];
    error?: string;
}> {
    try {
        const { tenantId } = await requireAuth('settings:read');

        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{
                id: string;
                code: string;
                name: string;
                description: string | null;
                base_role: string;
                is_active: boolean;
                created_at: Date | string;
                permissions: string[];
                assigned_count: number;
            }>`
                SELECT tr.id,
                       tr.code,
                       tr.name,
                       tr.description,
                       tr.base_role,
                       tr.is_active,
                       tr.created_at,
                       COALESCE(
                           jsonb_agg(DISTINCT trp.permission) FILTER (WHERE trp.permission IS NOT NULL),
                           '[]'::jsonb
                       ) AS permissions,
                       (
                           SELECT COUNT(*)::int
                           FROM users u
                           WHERE u.tenant_id = ${tenantId}
                             AND u.custom_role_id = tr.id
                       ) AS assigned_count
                FROM tenant_roles tr
                LEFT JOIN tenant_role_permissions trp
                       ON trp.role_id = tr.id
                      AND trp.tenant_id = ${tenantId}
                WHERE tr.tenant_id = ${tenantId}
                GROUP BY tr.id
                ORDER BY tr.name ASC
            `;

            return {
                success: true,
                roles: rows.map(r => ({
                    id: r.id,
                    code: r.code,
                    name: r.name,
                    description: r.description,
                    baseRole: r.base_role,
                    isActive: Boolean(r.is_active),
                    permissions: Array.isArray(r.permissions) ? r.permissions.map(String) : [],
                    assignedUserCount: Number(r.assigned_count ?? 0),
                    createdAt:
                        r.created_at instanceof Date
                            ? r.created_at.toISOString()
                            : String(r.created_at),
                })),
            };
        });
    } catch (error) {
        return {
            success: false,
            roles: [],
            error: error instanceof Error ? error.message : 'Failed to load custom roles.',
        };
    }
}

export async function upsertTenantRoleAction(input: {
    id?: string;
    code: string;
    name: string;
    description?: string;
    baseRole?: string;
    isActive?: boolean;
    permissions: string[];
}): Promise<{ success: boolean; roleId?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('settings:write');

        const name = (input.name || '').trim();
        if (!name || name.length > 120) {
            return { success: false, error: 'Role name is required (max 120 characters).' };
        }

        const code = (input.code || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '');
        if (!ROLE_CODE_RE.test(code)) {
            return {
                success: false,
                error: 'Role code must be 3–64 characters using uppercase letters, digits, and underscores.',
            };
        }
        if (RESERVED_SYSTEM_ROLE_CODES.has(code)) {
            return {
                success: false,
                error: `"${code}" is a reserved system role code. Choose a distinct custom role code.`,
            };
        }

        const allowedBaseRoles = new Set([
            'SCHOOL_ADMIN',
            'PRINCIPAL',
            'REGISTRAR',
            'FINANCE_LEAD',
            'ACCOUNTANT',
            'ADMISSION_COUNSELOR',
            'STUDENT_SUCCESS_COUNSELOR',
            'TEACHER',
            'TRANSPORT_MANAGER',
            'TRUST_OFFICER',
            'CREDENTIAL_OFFICER',
        ]);
        const baseRole = allowedBaseRoles.has((input.baseRole || '').toUpperCase())
            ? (input.baseRole || '').toUpperCase()
            : 'TEACHER';

        const cleanPerms = Array.from(
            new Set(
                (input.permissions || [])
                    .map(p => String(p).trim().toLowerCase())
                    .filter(p => Boolean(p) && !p.startsWith('platform:')),
            ),
        );

        return await runWithTenantContext(tenantId, async () => {
            const client = await pool.connect();
            const q = sqlFor(client);
            try {
                await q`BEGIN`.execute();

                let roleId = input.id && UUID_RE.test(input.id) ? input.id : '';
                if (roleId) {
                    const updated = await q<{ id: string }>`
                        UPDATE tenant_roles
                        SET name = ${name},
                            description = ${input.description?.trim() || null},
                            base_role = ${baseRole},
                            is_active = ${input.isActive ?? true},
                            updated_at = NOW()
                        WHERE id = ${roleId}
                          AND tenant_id = ${tenantId}
                        RETURNING id
                    `;
                    if (updated.length === 0) {
                        await q`ROLLBACK`.execute();
                        return { success: false, error: 'Custom role not found in this tenant.' };
                    }
                } else {
                    const inserted = await q<{ id: string }>`
                        INSERT INTO tenant_roles (
                            tenant_id, code, name, description, base_role, is_active, created_by, created_at, updated_at
                        )
                        VALUES (
                            ${tenantId},
                            ${code},
                            ${name},
                            ${input.description?.trim() || null},
                            ${baseRole},
                            ${input.isActive ?? true},
                            ${userId},
                            NOW(),
                            NOW()
                        )
                        ON CONFLICT (tenant_id, code)
                        DO UPDATE SET name = EXCLUDED.name,
                                      description = EXCLUDED.description,
                                      base_role = EXCLUDED.base_role,
                                      is_active = EXCLUDED.is_active,
                                      updated_at = NOW()
                        RETURNING id
                    `;
                    roleId = inserted[0].id;
                }

                await q`
                    DELETE FROM tenant_role_permissions
                    WHERE role_id = ${roleId}
                      AND tenant_id = ${tenantId}
                `.execute();

                for (const perm of cleanPerms) {
                    const parts = perm.split(':');
                    const resource = parts[0] || 'general';
                    const action = parts.slice(1).join(':') || 'read';
                    await q`
                        INSERT INTO tenant_role_permissions (
                            tenant_id, role_id, permission, resource, action, scope, created_at
                        )
                        VALUES (
                            ${tenantId}, ${roleId}, ${perm}, ${resource}, ${action}, 'tenant', NOW()
                        )
                        ON CONFLICT (role_id, permission) DO NOTHING
                    `.execute();
                }

                await q`
                    INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                    VALUES (
                        ${tenantId},
                        ${userId},
                        'UPDATE',
                        'tenant_role',
                        ${roleId},
                        ${`Saved custom role ${code} (${cleanPerms.length} permission grants)`}
                    )
                `.execute();

                await q`COMMIT`.execute();
                revalidatePath('/settings/roles');
                revalidatePath('/settings/users');
                return { success: true, roleId };
            } catch (err) {
                await q`ROLLBACK`.execute();
                throw err;
            } finally {
                client.release();
            }
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save custom role.',
        };
    }
}

export async function deleteTenantRoleAction(
    roleId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(roleId)) {
            return { success: false, error: 'Invalid role ID.' };
        }
        const { tenantId, userId } = await requireAuth('settings:write');

        await runWithTenantContext(tenantId, async () => {
            await sql`
                UPDATE users
                SET custom_role_id = NULL,
                    updated_at = NOW()
                WHERE tenant_id = ${tenantId}
                  AND custom_role_id = ${roleId}
            `.execute();

            await sql`
                DELETE FROM tenant_roles
                WHERE id = ${roleId}
                  AND tenant_id = ${tenantId}
            `.execute();

            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                VALUES (${tenantId}, ${userId}, 'DELETE', 'tenant_role', ${roleId}, 'Deleted custom tenant role')
            `.execute();
        });

        revalidatePath('/settings/roles');
        revalidatePath('/settings/users');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete custom role.',
        };
    }
}

export async function assignUserCustomRoleAction(
    targetUserId: string,
    customRoleId: string | null,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(targetUserId)) {
            return { success: false, error: 'Invalid user ID.' };
        }
        if (customRoleId !== null && customRoleId !== '' && !UUID_RE.test(customRoleId)) {
            return { success: false, error: 'Invalid custom role ID.' };
        }
        const { tenantId, userId, session } = await requireAuth('settings:write');
        const resolvedRoleId = customRoleId && customRoleId !== '' ? customRoleId : null;

        return await runWithTenantContext(tenantId, async () => {
            const targetRows = await sql<{ id: string; role: string }>`
                SELECT id, role
                FROM users
                WHERE id = ${targetUserId}
                  AND tenant_id = ${tenantId}
                LIMIT 1
            `;
            if (targetRows.length === 0) {
                return { success: false, error: 'User not found in this tenant.' };
            }
            const targetBaseRole = targetRows[0].role;
            if (targetBaseRole === 'PLATFORM_ADMIN') {
                return { success: false, error: 'Platform administrator accounts cannot be modified.' };
            }
            if (
                targetBaseRole === 'SUPER_ADMIN' &&
                session.role !== 'SUPER_ADMIN' &&
                session.role !== 'PLATFORM_ADMIN'
            ) {
                return { success: false, error: 'Only SUPER_ADMIN may modify a SUPER_ADMIN user.' };
            }

            if (resolvedRoleId) {
                const roleCheck = await sql<{ id: string }>`
                    SELECT id
                    FROM tenant_roles
                    WHERE id = ${resolvedRoleId}
                      AND tenant_id = ${tenantId}
                      AND is_active = true
                    LIMIT 1
                `;
                if (roleCheck.length === 0) {
                    return { success: false, error: 'Selected custom role is missing or inactive.' };
                }
            }

            await sql`
                UPDATE users
                SET custom_role_id = ${resolvedRoleId},
                    updated_at = NOW()
                WHERE id = ${targetUserId}
                  AND tenant_id = ${tenantId}
            `.execute();

            evictUserSessionCache(tenantId, targetUserId);

            await sql`
                INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, description)
                VALUES (
                    ${tenantId},
                    ${userId},
                    'UPDATE',
                    'user_custom_role',
                    ${targetUserId},
                    ${resolvedRoleId ? `Assigned custom role ${resolvedRoleId}` : 'Cleared custom role assignment'}
                )
            `.execute();

            revalidatePath('/settings/users');
            revalidatePath('/settings/roles');
            return { success: true };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to assign custom role.',
        };
    }
}

// ============================================================================
// PILLAR 3: Named Multi-Form / Role-Scoped Layout Cleanup
// ============================================================================

export async function deleteNamedObjectLayoutAction(
    objectId: string,
    layoutId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(objectId) || !UUID_RE.test(layoutId)) {
            return { success: false, error: 'Invalid identifier.' };
        }
        const { tenantId } = await requireAuth('metadata:publish');

        return await runWithTenantContext(tenantId, async () => {
            const rows = await sql<{ id: string; is_default: boolean }>`
                SELECT ml.id, COALESCE(ml.is_default, false) AS is_default
                FROM metadata_layouts ml
                JOIN metadata_objects mo ON mo.id = ml.object_id
                WHERE ml.id = ${layoutId}
                  AND ml.object_id = ${objectId}
                  AND mo.tenant_id = ${tenantId}
                LIMIT 1
            `;
            if (rows.length === 0) {
                return { success: false, error: 'Custom layout not found on this tenant object.' };
            }
            if (rows[0].is_default) {
                return { success: false, error: 'Cannot delete the default layout. Mark another layout as default first.' };
            }

            await sql`
                DELETE FROM metadata_layouts
                WHERE id = ${layoutId}
                  AND object_id = ${objectId}
            `.execute();

            revalidateTag('metadata', 'max');
            return { success: true };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete layout.',
        };
    }
}

// ============================================================================
// PILLAR 4: Persistent Views & View Categories
// ============================================================================

export async function listObjectViewsAndCategoriesAction(objectApiName: string): Promise<{
    categories: MetadataViewCategoryItem[];
    views: SavedObjectViewItem[];
}> {
    try {
        const { tenantId, userId, session } = await requireAuth('dashboard:read');
        const cleanApi = objectApiName.trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');

        const effRole = (session.effectiveRoleCode || session.role).toUpperCase();
        const baseRole = session.role.toUpperCase();
        const isAdmin =
            baseRole === 'PLATFORM_ADMIN' ||
            baseRole === 'SUPER_ADMIN' ||
            baseRole === 'SCHOOL_ADMIN';

        return await runWithTenantContext(tenantId, async () => {
            const catRows = await sql<{
                id: string;
                object_api_name: string | null;
                name: string;
                description: string | null;
                sort_order: number;
            }>`
                SELECT id, object_api_name, name, description, sort_order
                FROM metadata_view_categories
                WHERE tenant_id = ${tenantId}
                  AND (object_api_name IS NULL OR object_api_name = ${cleanApi})
                ORDER BY sort_order ASC, name ASC
            `;

            const viewRows = await sql<{
                id: string;
                object_api_name: string;
                category_id: string | null;
                category_name: string | null;
                name: string;
                columns: string[];
                filter_rules: SavedViewFilterRule[];
                sort_field: string | null;
                sort_direction: string;
                display_mode: string;
                kanban_group_field: string | null;
                is_default: boolean;
                visibility: string;
                allowed_roles: string[];
                created_by: string | null;
            }>`
                SELECT v.id,
                       v.object_api_name,
                       v.category_id,
                       vc.name AS category_name,
                       v.name,
                       v.columns,
                       v.filter_rules,
                       v.sort_field,
                       v.sort_direction,
                       v.display_mode,
                       v.kanban_group_field,
                       v.is_default,
                       v.visibility,
                       v.allowed_roles,
                       v.created_by
                FROM metadata_views v
                LEFT JOIN metadata_view_categories vc
                       ON vc.id = v.category_id
                      AND vc.tenant_id = ${tenantId}
                WHERE v.tenant_id = ${tenantId}
                  AND v.object_api_name = ${cleanApi}
                ORDER BY v.is_default DESC, v.name ASC
            `;

            const visibleViews = viewRows.filter(v => {
                if (isAdmin) return true;
                if (v.visibility === 'SHARED') return true;
                if (v.visibility === 'PRIVATE') return v.created_by === userId;
                const roles = Array.isArray(v.allowed_roles)
                    ? v.allowed_roles.map(r => String(r).toUpperCase())
                    : [];
                return roles.length === 0 || roles.includes(effRole) || roles.includes(baseRole);
            });

            return {
                categories: catRows.map(c => ({
                    id: c.id,
                    objectApiName: c.object_api_name,
                    name: c.name,
                    description: c.description,
                    sortOrder: Number(c.sort_order ?? 0),
                })),
                views: visibleViews.map(v => ({
                    id: v.id,
                    objectApiName: v.object_api_name,
                    categoryId: v.category_id,
                    categoryName: v.category_name,
                    name: v.name,
                    columns: Array.isArray(v.columns) ? v.columns.map(String) : [],
                    filterRules: Array.isArray(v.filter_rules) ? v.filter_rules : [],
                    sortField: v.sort_field,
                    sortDirection: v.sort_direction === 'ASC' ? 'ASC' : 'DESC',
                    displayMode: v.display_mode === 'KANBAN' ? 'KANBAN' : 'TABLE',
                    kanbanGroupField: v.kanban_group_field,
                    isDefault: Boolean(v.is_default),
                    visibility:
                        v.visibility === 'PRIVATE' || v.visibility === 'ROLES'
                            ? v.visibility
                            : 'SHARED',
                    allowedRoles: Array.isArray(v.allowed_roles) ? v.allowed_roles.map(String) : [],
                    createdBy: v.created_by,
                })),
            };
        });
    } catch {
        return { categories: [], views: [] };
    }
}

export async function upsertViewCategoryAction(input: {
    id?: string;
    objectApiName?: string | null;
    name: string;
    description?: string;
    sortOrder?: number;
}): Promise<{ success: boolean; categoryId?: string; error?: string }> {
    try {
        const { tenantId, userId } = await requireAuth('settings:write');
        const name = (input.name || '').trim();
        if (!name || name.length > 120) {
            return { success: false, error: 'Category name is required (max 120 characters).' };
        }
        const scopedObj = input.objectApiName ? input.objectApiName.trim().toLowerCase() : null;
        if (scopedObj) {
            assertSafeMetadataIdentifier(scopedObj, 'object API name');
        }

        return await runWithTenantContext(tenantId, async () => {
            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE metadata_view_categories
                    SET name = ${name},
                        description = ${input.description?.trim() || null},
                        object_api_name = ${scopedObj},
                        sort_order = ${input.sortOrder ?? 0}
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                    RETURNING id
                `;
                if (updated.length === 0) {
                    return { success: false, error: 'View category not found.' };
                }
                return { success: true, categoryId: updated[0].id };
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO metadata_view_categories (
                    tenant_id, object_api_name, name, description, sort_order, created_by, created_at
                )
                VALUES (
                    ${tenantId},
                    ${scopedObj},
                    ${name},
                    ${input.description?.trim() || null},
                    ${input.sortOrder ?? 0},
                    ${userId},
                    NOW()
                )
                RETURNING id
            `;
            return { success: true, categoryId: inserted[0]?.id };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save view category.',
        };
    }
}

export async function upsertObjectViewAction(input: {
    id?: string;
    objectApiName: string;
    categoryId?: string | null;
    name: string;
    columns: string[];
    filterRules: SavedViewFilterRule[];
    sortField?: string | null;
    sortDirection?: 'ASC' | 'DESC';
    displayMode?: 'TABLE' | 'KANBAN';
    kanbanGroupField?: string | null;
    isDefault?: boolean;
    visibility?: 'PRIVATE' | 'SHARED' | 'ROLES';
    allowedRoles?: string[];
}): Promise<{ success: boolean; viewId?: string; error?: string }> {
    try {
        const { tenantId, userId, session } = await requireAuth('dashboard:read');
        if (!isStaff(session.role as UserRole)) {
            return { success: false, error: 'Staff access is required to save views.' };
        }

        const cleanApi = (input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');

        const name = (input.name || '').trim();
        if (!name || name.length > 120) {
            return { success: false, error: 'View name is required (max 120 characters).' };
        }

        const roleCtx = await resolveEffectiveUserRoleContext(userId, tenantId, session.role);
        const canPublishShared =
            evaluateEffectivePermission(roleCtx, 'settings:write') ||
            evaluateEffectivePermission(roleCtx, 'metadata:publish');

        const visibility: 'PRIVATE' | 'SHARED' | 'ROLES' = canPublishShared
            ? input.visibility || 'SHARED'
            : 'PRIVATE';
        const makeDefault = canPublishShared && Boolean(input.isDefault);
        const categoryId =
            input.categoryId && UUID_RE.test(input.categoryId) ? input.categoryId : null;
        const allowedRoles =
            visibility === 'ROLES' && Array.isArray(input.allowedRoles)
                ? input.allowedRoles.map(r => String(r).trim().toUpperCase()).filter(Boolean)
                : [];

        return await runWithTenantContext(tenantId, async () => {
            if (makeDefault) {
                await sql`
                    UPDATE metadata_views
                    SET is_default = false
                    WHERE tenant_id = ${tenantId}
                      AND object_api_name = ${cleanApi}
                `.execute();
            }

            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE metadata_views
                    SET category_id = ${categoryId},
                        name = ${name},
                        columns = ${JSON.stringify(input.columns || [])}::jsonb,
                        filter_rules = ${JSON.stringify(input.filterRules || [])}::jsonb,
                        sort_field = ${input.sortField || null},
                        sort_direction = ${input.sortDirection === 'ASC' ? 'ASC' : 'DESC'},
                        display_mode = ${input.displayMode === 'KANBAN' ? 'KANBAN' : 'TABLE'},
                        kanban_group_field = ${input.kanbanGroupField || null},
                        is_default = ${makeDefault},
                        visibility = ${visibility},
                        allowed_roles = ${JSON.stringify(allowedRoles)}::jsonb,
                        updated_at = NOW()
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                      AND (${canPublishShared} OR created_by = ${userId})
                    RETURNING id
                `;
                if (updated.length === 0) {
                    return { success: false, error: 'View not found or unauthorized.' };
                }
                revalidatePath(`/app/${cleanApi}`);
                return { success: true, viewId: updated[0].id };
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO metadata_views (
                    tenant_id, object_api_name, category_id, name, columns, filter_rules,
                    sort_field, sort_direction, display_mode, kanban_group_field,
                    is_default, visibility, allowed_roles, created_by, created_at, updated_at
                )
                VALUES (
                    ${tenantId},
                    ${cleanApi},
                    ${categoryId},
                    ${name},
                    ${JSON.stringify(input.columns || [])}::jsonb,
                    ${JSON.stringify(input.filterRules || [])}::jsonb,
                    ${input.sortField || null},
                    ${input.sortDirection === 'ASC' ? 'ASC' : 'DESC'},
                    ${input.displayMode === 'KANBAN' ? 'KANBAN' : 'TABLE'},
                    ${input.kanbanGroupField || null},
                    ${makeDefault},
                    ${visibility},
                    ${JSON.stringify(allowedRoles)}::jsonb,
                    ${userId},
                    NOW(),
                    NOW()
                )
                RETURNING id
            `;
            revalidatePath(`/app/${cleanApi}`);
            return { success: true, viewId: inserted[0]?.id };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save view.',
        };
    }
}

export async function deleteObjectViewAction(
    viewId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(viewId)) {
            return { success: false, error: 'Invalid view ID.' };
        }
        const { tenantId, userId, session } = await requireAuth('dashboard:read');
        if (!isStaff(session.role as UserRole)) {
            return { success: false, error: 'Unauthorized.' };
        }
        const canManageAll = hasPermission(session.role as UserRole, 'settings:write');

        return await runWithTenantContext(tenantId, async () => {
            await sql`
                DELETE FROM metadata_views
                WHERE id = ${viewId}
                  AND tenant_id = ${tenantId}
                  AND (${canManageAll} OR created_by = ${userId})
            `.execute();
            return { success: true };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete view.',
        };
    }
}

// ============================================================================
// PILLAR 5: Report Categories & Persistent Object/BI Reports (`bi_report_definitions`)
// ============================================================================

export async function listReportCategoriesAndObjectReportsAction(
    objectApiName?: string,
): Promise<{
    categories: ReportCategoryItem[];
    reports: SavedLcncReportItem[];
}> {
    try {
        const { tenantId, session } = await requireAuth('reports:read');
        const effRole = (session.effectiveRoleCode || session.role).toUpperCase();
        const baseRole = session.role.toUpperCase();
        const isAdmin =
            baseRole === 'PLATFORM_ADMIN' ||
            baseRole === 'SUPER_ADMIN' ||
            baseRole === 'SCHOOL_ADMIN';
        const scopedObj = objectApiName ? objectApiName.trim().toLowerCase() : null;

        return await runWithTenantContext(tenantId, async () => {
            const catRows = await sql<{
                id: string;
                name: string;
                description: string | null;
                sort_order: number;
            }>`
                SELECT id, name, description, sort_order
                FROM report_categories
                WHERE tenant_id = ${tenantId}
                ORDER BY sort_order ASC, name ASC
            `;

            const repRows = await sql<{
                id: string;
                name: string;
                category_id: string | null;
                category_name: string | null;
                object_api_name: string | null;
                report_kind: string;
                dataset_key: string;
                selected_metrics: string[];
                selected_dimensions: string[];
                filters: SavedViewFilterRule[];
                chart_type: string;
                allowed_roles: string[];
                created_at: Date | string;
            }>`
                SELECT r.id,
                       r.name,
                       r.category_id,
                       rc.name AS category_name,
                       r.object_api_name,
                       r.report_kind,
                       r.dataset_key,
                       r.selected_metrics,
                       r.selected_dimensions,
                       r.filters,
                       r.chart_type,
                       r.allowed_roles,
                       r.created_at
                FROM bi_report_definitions r
                LEFT JOIN report_categories rc
                       ON rc.id = r.category_id
                      AND rc.tenant_id = ${tenantId}
                WHERE r.tenant_id = ${tenantId}
                  AND r.status = 'ACTIVE'
                  AND (${scopedObj}::varchar IS NULL OR r.object_api_name = ${scopedObj})
                ORDER BY r.created_at DESC
                LIMIT 100
            `;

            const visibleReports = repRows.filter(r => {
                if (isAdmin) return true;
                const roles = Array.isArray(r.allowed_roles)
                    ? r.allowed_roles.map(x => String(x).toUpperCase())
                    : [];
                return roles.length === 0 || roles.includes(effRole) || roles.includes(baseRole);
            });

            return {
                categories: catRows.map(c => ({
                    id: c.id,
                    name: c.name,
                    description: c.description,
                    sortOrder: Number(c.sort_order ?? 0),
                })),
                reports: visibleReports.map(r => {
                    const metricRaw = r.selected_metrics?.[0] || 'COUNT:';
                    const [aggPart, metricFldPart] = String(metricRaw).split(':');
                    const agg = (['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].includes(aggPart)
                        ? aggPart
                        : 'COUNT') as RollupAggregateFunction;

                    return {
                        id: r.id,
                        name: r.name,
                        categoryId: r.category_id,
                        categoryName: r.category_name,
                        objectApiName: r.object_api_name,
                        reportKind:
                            r.report_kind === 'OBJECT_REPORT' ? 'OBJECT_REPORT' : 'STANDARD_BI',
                        datasetKey: r.dataset_key,
                        groupByField: r.selected_dimensions?.[0] || '',
                        aggregateFunction: agg,
                        metricField: metricFldPart || null,
                        selectedColumns: (r.selected_dimensions || []).slice(1),
                        filterRules: Array.isArray(r.filters) ? r.filters : [],
                        chartType:
                            r.chart_type === 'BAR' || r.chart_type === 'KPI'
                                ? r.chart_type
                                : 'TABLE',
                        allowedRoles: Array.isArray(r.allowed_roles)
                            ? r.allowed_roles.map(String)
                            : [],
                        createdAt:
                            r.created_at instanceof Date
                                ? r.created_at.toISOString()
                                : String(r.created_at),
                    };
                }),
            };
        });
    } catch {
        return { categories: [], reports: [] };
    }
}

export async function upsertReportCategoryAction(input: {
    id?: string;
    name: string;
    description?: string;
    sortOrder?: number;
}): Promise<{ success: boolean; categoryId?: string; error?: string }> {
    try {
        const { tenantId, userId, session } = await requireAuth('reports:read');
        const roleCtx = await resolveEffectiveUserRoleContext(userId, tenantId, session.role);
        if (
            !evaluateEffectivePermission(roleCtx, 'settings:write') &&
            !evaluateEffectivePermission(roleCtx, 'metadata:publish')
        ) {
            return {
                success: false,
                error: 'Tenant admin permission is required to manage report categories.',
            };
        }

        const name = (input.name || '').trim();
        if (!name || name.length > 120) {
            return { success: false, error: 'Category name is required (max 120 characters).' };
        }

        return await runWithTenantContext(tenantId, async () => {
            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE report_categories
                    SET name = ${name},
                        description = ${input.description?.trim() || null},
                        sort_order = ${input.sortOrder ?? 0}
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                    RETURNING id
                `;
                if (updated.length === 0) {
                    return { success: false, error: 'Report category not found.' };
                }
                revalidatePath('/reports');
                return { success: true, categoryId: updated[0].id };
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO report_categories (
                    tenant_id, name, description, sort_order, created_by, created_at
                )
                VALUES (
                    ${tenantId},
                    ${name},
                    ${input.description?.trim() || null},
                    ${input.sortOrder ?? 0},
                    ${userId},
                    NOW()
                )
                RETURNING id
            `;
            revalidatePath('/reports');
            return { success: true, categoryId: inserted[0]?.id };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save report category.',
        };
    }
}

export async function saveLcncObjectReportAction(input: {
    id?: string;
    name: string;
    categoryId?: string | null;
    objectApiName: string;
    groupByField: string;
    aggregateFunction: RollupAggregateFunction;
    metricField?: string | null;
    filterRules?: SavedViewFilterRule[];
    chartType?: 'TABLE' | 'BAR' | 'KPI';
    allowedRoles?: string[];
}): Promise<{ success: boolean; reportId?: string; error?: string }> {
    try {
        const { tenantId, userId, session } = await requireAuth('reports:read');
        if (!isStaff(session.role as UserRole)) {
            return { success: false, error: 'Staff access is required to save reports.' };
        }

        const name = (input.name || '').trim();
        if (!name || name.length > 240) {
            return { success: false, error: 'Report name is required (max 240 characters).' };
        }
        const cleanApi = (input.objectApiName || '').trim().toLowerCase();
        assertSafeMetadataIdentifier(cleanApi, 'object API name');
        assertSafeMetadataIdentifier(input.groupByField, 'group-by field');

        const categoryId =
            input.categoryId && UUID_RE.test(input.categoryId) ? input.categoryId : null;
        const agg = input.aggregateFunction || 'COUNT';
        const encodedMetric = `${agg}:${input.metricField || ''}`;
        const dims = [input.groupByField];
        const allowedRoles = Array.isArray(input.allowedRoles)
            ? input.allowedRoles.map(r => String(r).trim().toUpperCase()).filter(Boolean)
            : [];

        return await runWithTenantContext(tenantId, async () => {
            if (input.id && UUID_RE.test(input.id)) {
                const updated = await sql<{ id: string }>`
                    UPDATE bi_report_definitions
                    SET name = ${name},
                        category_id = ${categoryId},
                        object_api_name = ${cleanApi},
                        dataset_key = ${`object:${cleanApi}`},
                        selected_metrics = ARRAY[${encodedMetric}]::text[],
                        selected_dimensions = ${dims}::text[],
                        filters = ${JSON.stringify(input.filterRules || [])}::jsonb,
                        chart_type = ${input.chartType || 'TABLE'},
                        allowed_roles = ${JSON.stringify(allowedRoles)}::jsonb,
                        updated_by = ${userId},
                        updated_at = NOW()
                    WHERE id = ${input.id}
                      AND tenant_id = ${tenantId}
                    RETURNING id
                `;
                revalidatePath('/reports');
                revalidatePath(`/app/${cleanApi}`);
                return { success: true, reportId: updated[0]?.id };
            }

            const inserted = await sql<{ id: string }>`
                INSERT INTO bi_report_definitions (
                    tenant_id, scope, name, category_id, object_api_name, report_kind,
                    dataset_key, selected_metrics, selected_dimensions, filters,
                    date_range, schedule, chart_type, allowed_roles, status,
                    created_by, updated_by, created_at, updated_at
                )
                VALUES (
                    ${tenantId},
                    'TENANT',
                    ${name},
                    ${categoryId},
                    ${cleanApi},
                    'OBJECT_REPORT',
                    ${`object:${cleanApi}`},
                    ARRAY[${encodedMetric}]::text[],
                    ${dims}::text[],
                    ${JSON.stringify(input.filterRules || [])}::jsonb,
                    '{}'::jsonb,
                    '{}'::jsonb,
                    ${input.chartType || 'TABLE'},
                    ${JSON.stringify(allowedRoles)}::jsonb,
                    'ACTIVE',
                    ${userId},
                    ${userId},
                    NOW(),
                    NOW()
                )
                RETURNING id
            `;

            revalidatePath('/reports');
            revalidatePath(`/app/${cleanApi}`);
            return { success: true, reportId: inserted[0]?.id };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save custom report.',
        };
    }
}

export async function deleteLcncReportAction(
    reportId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!UUID_RE.test(reportId)) {
            return { success: false, error: 'Invalid report ID.' };
        }
        const { tenantId, userId, session } = await requireAuth('reports:read');
        const canManageAll = hasPermission(session.role as UserRole, 'settings:write');

        return await runWithTenantContext(tenantId, async () => {
            await sql`
                UPDATE bi_report_definitions
                SET status = 'ARCHIVED',
                    updated_by = ${userId},
                    updated_at = NOW()
                WHERE id = ${reportId}
                  AND tenant_id = ${tenantId}
                  AND (${canManageAll} OR created_by = ${userId})
            `.execute();
            revalidatePath('/reports');
            return { success: true };
        });
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete report.',
        };
    }
}

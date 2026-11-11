import React from 'react';
import { runWithTenantContext, sql } from '@/lib/db';
import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth/middleware';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import { hasPermission, type UserRole } from '@/lib/rbac/permissions';
import { getObjectMetadata, queryRecords } from '@/lib/actions/metadata-engine';
import { logger } from '@/lib/observability/logger';
import DataStudioClient, { StudioField, StudioObject } from './data-studio-client';

export const dynamic = 'force-dynamic';

export default async function MetadataEnginePage({
    searchParams,
}: {
    searchParams?: Promise<{ object?: string }>;
}) {
    const { tenantId, session } = await requireAuth();

    if (
        !isTenantStaffRole(session.role) ||
        !hasPermission(session.role as UserRole, 'metadata:read')
    ) {
        redirect('/unauthorized');
    }

    const params = searchParams ? await searchParams : {};

    // Fetch all published objects for this school under tenant context
    let objects: StudioObject[] = [];
    try {
        objects = await runWithTenantContext(tenantId, async () =>
            sql<StudioObject>`
                SELECT id, api_name as name, name as label
                FROM (
                  SELECT DISTINCT ON (api_name) id, api_name, name, created_at, tenant_id
                  FROM metadata_objects
                  WHERE status = 'PUBLISHED'
                    AND (
                      tenant_id = ${tenantId}
                      OR (tenant_id IS NULL AND COALESCE(is_custom, false) = false)
                    )
                  ORDER BY api_name, CASE WHEN tenant_id = ${tenantId} THEN 0 ELSE 1 END, created_at DESC
                ) resolved_objects
                ORDER BY created_at ASC
            `.rows(),
        );
    } catch (error) {
        logger.error('data_studio.objects_load_failed', 'Failed to load published metadata objects', {
            tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
    }

    const activeObject =
        (params.object && objects.find(o => o.name === params.object)) ||
        objects[0] ||
        null;

    let fields: StudioField[] = [];
    let records: Record<string, unknown>[] = [];

    if (activeObject) {
        try {
            const meta = await getObjectMetadata(activeObject.name);
            fields = meta.fields.map(field => ({
                id: field.id,
                name: field.apiName,
                label: field.label,
                type: field.dataType,
            }));
            records = (await queryRecords(activeObject.name, {}, 200, 0)) as Record<string, unknown>[];
        } catch (error) {
            logger.error('data_studio.records_load_failed', 'Failed to load FLS-scoped Data Studio records', {
                tenantId,
                entityType: activeObject.name,
                metadata: { error: error instanceof Error ? error.message : String(error) },
            });
        }
    }

    return (
        <DataStudioClient
            key={activeObject?.id || 'empty'}
            objects={objects}
            activeObject={activeObject}
            initialFields={fields}
            initialRecords={records}
        />
    );
}

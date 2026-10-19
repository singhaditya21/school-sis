import React from 'react';
import { sql } from '@/lib/db';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isTenantStaffRole } from '@/lib/auth/page-access';
import DataStudioClient, { StudioField, StudioObject } from './data-studio-client';

export const dynamic = 'force-dynamic';

export default async function MetadataEnginePage({
    searchParams,
}: {
    searchParams?: Promise<{ object?: string }>;
}) {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (!isTenantStaffRole(session.role) || !session.tenantId) {
        redirect('/unauthorized');
    }

    const tenantId = session.tenantId;
    const params = searchParams ? await searchParams : {};

    // Fetch all published objects for this school
    let objects: StudioObject[] = [];
    try {
        objects = await sql<StudioObject>`
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
        `;
    } catch (error) {
        console.error('DB Error:', error);
    }

    const activeObject =
        (params.object && objects.find(o => o.name === params.object)) ||
        objects[0] ||
        null;

    let fields: StudioField[] = [];
    let records: Record<string, unknown>[] = [];

    if (activeObject) {
        fields = await sql<StudioField>`
            SELECT id, api_name as name, label, data_type as type
            FROM metadata_fields
            WHERE object_id = ${activeObject.id}
              AND status = 'ACTIVE'
            ORDER BY created_at ASC
        `;

        const recordRows = await sql<{
            record_id: string;
            field_name: string | null;
            value_string: string | null;
            value_number: number | null;
            value_boolean: boolean | null;
            value_date: string | null;
        }>`
            SELECT r.id as record_id, f.api_name as field_name, v.value_string, v.value_number, v.value_boolean, v.value_date
            FROM metadata_records r
            LEFT JOIN metadata_values v ON v.record_id = r.id
            LEFT JOIN metadata_fields f ON v.field_id = f.id
            WHERE r.object_id = ${activeObject.id}
              AND r.tenant_id = ${tenantId}
              AND (f.id IS NULL OR f.status = 'ACTIVE')
        `;

        const recordMap = new Map<string, Record<string, unknown>>();
        recordRows.forEach(row => {
            if (!recordMap.has(row.record_id)) {
                recordMap.set(row.record_id, { id: row.record_id });
            }
            const record = recordMap.get(row.record_id)!;
            if (row.field_name) {
                record[row.field_name] =
                    row.value_string ??
                    row.value_number ??
                    row.value_boolean ??
                    row.value_date ??
                    '';
            }
        });
        records = Array.from(recordMap.values());
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

'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { getObjectMetadata, getAllMetadataObjects } from './metadata-engine';

export async function getReportSources() {
    // Fetch all available objects dynamically from the metadata engine
    const objects = await getAllMetadataObjects();
    return objects;
}

export async function runDynamicReport(apiName: string): Promise<{ success: boolean; data?: any[]; error?: string; columns?: string[] }> {
    try {
        const { tenantId } = await requireAuth();

        // 1. Fetch object definition and fields
        const { objectDef, fields } = await getObjectMetadata(apiName);

        // 2. Construct dynamic SQL selecting standard columns and extracting JSONB custom fields
        const selectClauses: string[] = [];
        const columns: string[] = [];

        for (const field of fields) {
            columns.push(field.label);
            if (field.isCustom) {
                // Extract custom fields from the JSONB column
                selectClauses.push(`custom_data->>'${field.apiName}' as "${field.label}"`);
            } else {
                // Select standard fields natively
                selectClauses.push(`"${field.apiName}" as "${field.label}"`);
            }
        }

        if (selectClauses.length === 0) {
             return { success: false, error: 'No fields configured for this object.' };
        }

        // 3. Assemble and execute the query
        const query = `
            SELECT ${selectClauses.join(', ')}
            FROM ${objectDef.tableName}
            WHERE tenant_id = $1
            ORDER BY created_at DESC
            LIMIT 1000
        `;

        const { rows } = await pool.query(query, [tenantId]);

        return { success: true, data: rows, columns };
    } catch (error: any) {
        console.error('Report execution failed:', error);
        return { success: false, error: error.message || 'Failed to generate dynamic report' };
    }
}
